#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = [
#   "numpy>=2,<3",
#   "soundfile==0.13.*",
#   "mlx-audio==0.6.3; sys_platform == 'darwin' and platform_machine == 'arm64'",
#   "mlx-whisper==0.4.3; sys_platform == 'darwin' and platform_machine == 'arm64'",
#   "demucs-mlx==1.6.1; sys_platform == 'darwin' and platform_machine == 'arm64'",
# ]
# ///
"""The Booth: the half of Palmframe's dubbing stage that runs on your own Mac.

Episodes are too large for a web function, and Qwen speaks on your GPU, so the
film, its stems, every cloned voice and every take stay in one folder on this
computer. The page only ever talks to 127.0.0.1.

    uv run booth.py

Anything listening on localhost can be reached by every site you visit, so
requests must carry the pairing token, and a request from a browser must come
from an allowed origin to a loopback Host (which also stops DNS rebinding).
"""

from __future__ import annotations

import argparse
import contextlib
import json
import math
import os
import queue
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.parse
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = "1.0.0"
PORT = 7847
APP_URL = "https://www.palmframe.com"
ALLOWED_ORIGINS = {"https://www.palmframe.com", "https://palmframe.com"}
LOCAL_ORIGIN = re.compile(r"^http://(localhost|127\.0\.0\.1):\d+$")
ID = re.compile(r"^[a-f0-9]{12}$")
SAFE_FILE = re.compile(r"^[A-Za-z0-9._-]+$")
HOME = Path(os.environ.get("PALMFRAME_BOOTH_HOME") or Path.home() / "Movies" / "Palmframe Dubs")

MODELS = {
    "clone": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit",
    "stock": "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit",
    "design": "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit",
}
WHISPER = "mlx-community/whisper-large-v3-turbo"
STOCK_VOICES = ["Vivian", "Serena", "Ono_Anna", "Sohee", "Uncle_Fu", "Dylan", "Eric", "Ryan", "Aiden"]
LANGUAGES = {
    "en": "English", "fr": "French", "es": "Spanish", "de": "German", "it": "Italian",
    "ja": "Japanese", "ko": "Korean", "zh": "Chinese", "pt": "Portuguese", "ru": "Russian",
}
# ffprobe speaks ISO 639-2, subtitle authors speak whatever they like.
ISO3 = {
    "eng": "en", "fre": "fr", "fra": "fr", "spa": "es", "ger": "de", "deu": "de", "ita": "it",
    "jpn": "ja", "kor": "ko", "chi": "zh", "zho": "zh", "por": "pt", "rus": "ru",
}
TEXT_SUBS = {"ass", "ssa", "subrip", "srt", "webvtt", "mov_text", "text"}
COLORS = ["#ffb648", "#6fc3df", "#e8798a", "#8fd18a", "#c3a6ff", "#f2e27a", "#ff9270", "#7fdcc4"]
MAX_TEMPO, MIN_TEMPO = 1.32, 0.94
MAX_REF_SECONDS = 12.0
MAX_TAKES = 4
TARGET_RMS = 0.09


class Refuse(Exception):
    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status, self.code = status, code


# ---- Subtitles ---------------------------------------------------------------


def timecode(value: str) -> float:
    parts = value.strip().replace(",", ".").split(":")
    seconds = 0.0
    for part in parts:
        seconds = seconds * 60 + float(part)
    return seconds


def plain(text: str) -> str:
    text = re.sub(r"\{[^}]*\}", "", text)
    text = re.sub(r"</?[a-zA-Z][^>]*>", "", text)
    text = text.replace("\\N", " ").replace("\\n", " ").replace("\\h", " ")
    return re.sub(r"\s+", " ", text).strip()


def parse_srt(text: str) -> list[dict]:
    """SRT and WebVTT share their shape closely enough for one reader."""
    cues = []
    blocks = re.split(r"\n\s*\n", text.replace("\r\n", "\n").replace("\r", "\n").replace("\ufeff", ""))
    for block in blocks:
        lines = block.strip().split("\n")
        for i, line in enumerate(lines):
            m = re.match(r"\s*([\d:.,]+)\s*-->\s*([\d:.,]+)", line)
            if not m:
                continue
            body = plain(" ".join(lines[i + 1 :]))
            if body:
                cues.append({"start": timecode(m[1]), "end": timecode(m[2]), "text": body, "speaker": ""})
            break
    return cues


# Fansubs keep signs, karaoke and songs in the same file as the dialogue. None
# of those get spoken.
NOT_DIALOGUE_STYLE = re.compile(r"sign|song|lyric|karaoke|kfx|\bop\b|\bed\b|opening|ending|title|credit|note|^tl", re.I)
PLACED = re.compile(r"\\(pos|move|org|p[1-9]|clip|iclip|k[fo]?\d)")


def parse_ass(text: str) -> list[dict]:
    cues, fields = [], None
    section = ""
    for raw in text.replace("\ufeff", "").splitlines():
        line = raw.strip()
        if line.startswith("["):
            section = line.lower()
            continue
        if section != "[events]":
            continue
        if line.lower().startswith("format:"):
            fields = [f.strip().lower() for f in line[7:].split(",")]
            continue
        if not line.lower().startswith("dialogue:") or not fields:
            continue
        values = line[9:].split(",", len(fields) - 1)
        if len(values) < len(fields):
            continue
        row = dict(zip(fields, (v.strip() for v in values)))
        body = row.get("text", "")
        if NOT_DIALOGUE_STYLE.search(row.get("style", "")) or PLACED.search(body):
            continue
        spoken = plain(body)
        if spoken:
            cues.append({
                "start": timecode(row["start"]),
                "end": timecode(row["end"]),
                "text": spoken,
                "speaker": row.get("name", row.get("actor", "")),
            })
    return cues


def tidy_cues(cues: list[dict]) -> list[dict]:
    """Sorts cues, joins the duplicates that layered files carry, drops noise."""
    seen, out = set(), []
    for cue in sorted(cues, key=lambda c: (c["start"], c["end"])):
        key = (round(cue["start"], 2), cue["text"])
        if key in seen or cue["end"] <= cue["start"]:
            continue
        seen.add(key)
        if re.fullmatch(r"[\W_♪♫]*", cue["text"]) or re.fullmatch(r"[\[(（].*[\])）]", cue["text"]):
            continue
        cue["text"] = re.sub(r"^[-–—]\s*", "", cue["text"])
        if out and out[-1]["text"] == cue["text"] and cue["start"] - out[-1]["end"] < 0.25:
            out[-1]["end"] = cue["end"]
            continue
        out.append(cue)
    return out


def parse_subtitles(text: str, extension: str) -> list[dict]:
    if extension in (".ass", ".ssa") or "[Events]" in text[:200_000]:
        return tidy_cues(parse_ass(text))
    return tidy_cues(parse_srt(text))


# Containers want the three-letter code; MP4 drops a two-letter one silently.
ISO2 = {"en": "eng", "fr": "fra", "es": "spa", "de": "deu", "it": "ita", "ja": "jpn", "ko": "kor", "zh": "zho", "pt": "por", "ru": "rus"}


def language_of(code: str) -> str:
    code = (code or "").lower()
    return ISO3.get(code, code if code in LANGUAGES else "")


def subtitle_rank(track: dict, target: str) -> tuple:
    """Dialogue tracks first, the dub's own language best of all (nothing to
    translate), and forced or signs tracks last."""
    title = (track.get("title") or "").lower()
    partial = track.get("forced") or bool(re.search(r"sign|song|forced|commentary", title))
    return (not track["text"], partial, track.get("language") != target, track.get("language") != "en")


# ---- Fitting a take ----------------------------------------------------------


def fit_tempo(duration: float, slot: float) -> dict:
    """How fast a take must run to fit its slot, within what still sounds like
    speech. `over` is what's left when even the limit isn't enough."""
    if slot <= 0 or duration <= 0:
        return {"tempo": 1.0, "over": 0.0}
    tempo = min(MAX_TEMPO, max(1.0, duration / slot))
    # A short take may ease off a touch. A line can end early; drawl can't be unheard.
    if duration < slot * 0.7:
        tempo = max(MIN_TEMPO, duration / (slot * 0.8))
    return {"tempo": round(tempo, 3), "over": round(max(0.0, duration / tempo - slot), 3)}


def slot_of(lines: list[dict], index: int, duration: float) -> float:
    """A line may run on into the silence after it, never into the next line."""
    line = lines[index]
    following = lines[index + 1]["start"] if index + 1 < len(lines) else duration or line["end"] + 2
    return max(0.2, min(following - 0.05, line["end"] + 0.6) - line["start"])


def atempo_chain(tempo: float) -> str:
    return f"atempo={max(0.5, min(2.0, tempo)):.4f}"


# ---- Who is speaking ---------------------------------------------------------


def voiceprint(samples, rate: int):
    """A cheap fingerprint of a voice: its average mel spectrum and its pitch.
    Good enough to suggest a cast for a person to correct, which is all it does."""
    import numpy as np

    size, hop = 1024, 256
    if len(samples) < size * 2:
        return None
    frames = np.lib.stride_tricks.sliding_window_view(samples, size)[::hop] * np.hanning(size)
    power = np.abs(np.fft.rfft(frames, axis=1)) ** 2
    energy = power.sum(axis=1)
    loud = energy > np.percentile(energy, 40)
    if loud.sum() < 4:
        return None
    power = power[loud]
    edges = 700 * (10 ** (np.linspace(2595 * np.log10(1 + 80 / 700), 2595 * np.log10(1 + 7000 / 700), 34) / 2595) - 1)
    bins = np.clip((edges / rate * size).astype(int), 1, power.shape[1] - 1)
    bands = np.stack([power[:, a : max(a + 1, b)].mean(axis=1) for a, b in zip(bins[:-1], bins[1:])], axis=1)
    mel = np.log(bands + 1e-9)
    shape = mel.mean(axis=0) - mel.mean()
    spectrum = np.abs(np.fft.irfft(np.log(power + 1e-9), axis=1))
    low, high = int(rate / 500), int(rate / 70)
    pitch = rate / (low + np.median(np.argmax(spectrum[:, low:high], axis=1)))
    return np.concatenate([shape / (np.linalg.norm(shape) + 1e-9), [math.log(pitch) / 2.5]])


def cluster_voices(prints: list, threshold: float = 0.2, limit: int = 8) -> list[int]:
    """Greedy average-linkage clustering. Returns a group per print; a line too
    short to fingerprint (None) joins whoever spoke just before it."""
    import numpy as np

    groups: list[dict] = []
    labels: list[int] = []
    for p in prints:
        if p is None:
            labels.append(labels[-1] if labels else 0)
            continue
        best, distance = -1, 1e9
        for i, g in enumerate(groups):
            d = float(np.linalg.norm(g["sum"] / g["n"] - p))
            if d < distance:
                best, distance = i, d
        if best >= 0 and (distance < threshold or len(groups) >= limit):
            groups[best]["sum"] = groups[best]["sum"] + p
            groups[best]["n"] += 1
            labels.append(best)
        else:
            groups.append({"sum": p.copy(), "n": 1})
            labels.append(len(groups) - 1)
    return labels


# ---- Storage -----------------------------------------------------------------

locks: dict[str, threading.RLock] = {}
locks_guard = threading.Lock()


def lock_of(pid: str) -> threading.RLock:
    with locks_guard:
        return locks.setdefault(pid, threading.RLock())


def folder(pid: str) -> Path:
    if not ID.match(pid):
        raise Refuse(404, "not_found")
    return HOME / pid


def load(pid: str) -> dict:
    path = folder(pid) / "project.json"
    if not path.exists():
        raise Refuse(404, "not_found")
    return json.loads(path.read_text())


def save(project: dict) -> dict:
    project["rev"] = project.get("rev", 0) + 1
    project["updatedAt"] = time.time()
    path = folder(project["id"]) / "project.json"
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(project, ensure_ascii=False))
    temp.replace(path)
    return project


@contextlib.contextmanager
def editing(pid: str):
    with lock_of(pid):
        project = load(pid)
        yield project
        save(project)


def new_line(cue: dict, speaker: str, text: str = "") -> dict:
    return {
        "id": secrets.token_hex(4), "start": round(cue["start"], 3), "end": round(cue["end"], 3),
        "speaker": speaker, "source": cue["text"], "text": text, "delivery": "", "takes": [], "pick": -1,
    }


def new_speaker(name: str, index: int) -> dict:
    return {
        "id": secrets.token_hex(4), "name": name, "color": COLORS[index % len(COLORS)],
        "voice": {"kind": "stock", "speaker": STOCK_VOICES[index % len(STOCK_VOICES)]},
    }


def run(args: list[str], job: dict | None = None) -> str:
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace")
    if job is not None:
        job["process"] = process
    out, err = process.communicate()
    if job is not None:
        job.pop("process", None)
        if job["cancel"]:
            raise Refuse(499, "cancelled")
    if process.returncode:
        raise RuntimeError(err.strip()[-600:] or f"{args[0]} failed")
    return out


def ffmpeg(*args: str, job: dict | None = None) -> None:
    run(["ffmpeg", "-y", "-nostdin", "-loglevel", "error", *args], job)


def ffmpeg_timed(args: list[str], job: dict, duration: float, low: float, high: float) -> None:
    """ffmpeg with progress mapped onto part of the job's bar."""
    process = subprocess.Popen(
        ["ffmpeg", "-y", "-nostdin", "-loglevel", "error", "-progress", "pipe:1", *args],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace",
    )
    job["process"] = process
    errors: list[str] = []
    drain = threading.Thread(target=lambda: errors.extend(process.stderr.readlines()), daemon=True)
    drain.start()
    for line in process.stdout:
        if line.startswith("out_time_us=") and duration:
            with contextlib.suppress(ValueError):
                done = int(line.split("=")[1]) / 1e6
                job["progress"] = round(low + (high - low) * min(1, done / duration), 3)
    process.wait()
    drain.join(2)
    job.pop("process", None)
    if job["cancel"]:
        raise Refuse(499, "cancelled")
    if process.returncode:
        raise RuntimeError("".join(errors).strip()[-600:] or "ffmpeg failed")


def probe(path: Path) -> dict:
    data = json.loads(run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)]))
    video, audio, subtitles = None, [], []
    counts = {"audio": 0, "subtitle": 0}
    for s in data.get("streams", []):
        tags = {k.lower(): v for k, v in (s.get("tags") or {}).items()}
        kind = s.get("codec_type")
        if kind == "video" and not video and not (s.get("disposition") or {}).get("attached_pic"):
            rate = s.get("avg_frame_rate", "0/1").split("/")
            video = {
                "codec": s.get("codec_name"), "width": s.get("width"), "height": s.get("height"),
                "fps": round(float(rate[0]) / float(rate[1]), 3) if len(rate) == 2 and float(rate[1]) else 0,
            }
        elif kind in counts:
            entry = {
                "index": counts[kind], "codec": s.get("codec_name", ""),
                "language": language_of(tags.get("language", "")), "title": tags.get("title", ""),
            }
            counts[kind] += 1
            if kind == "audio":
                audio.append(entry | {"channels": s.get("channels", 2)})
            else:
                subtitles.append(entry | {
                    "text": s.get("codec_name") in TEXT_SUBS,
                    "forced": bool((s.get("disposition") or {}).get("forced")),
                })
    return {
        "duration": float(data.get("format", {}).get("duration") or 0),
        "video": video, "audio": audio, "subtitles": subtitles,
    }


def peaks_of(path: Path, per_second: int = 40) -> list[int]:
    import numpy as np

    raw = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", "4000", "-f", "s16le", "-"],
        capture_output=True, check=True,
    ).stdout
    samples = np.abs(np.frombuffer(raw, dtype=np.int16)).astype(np.float32) / 32768
    size = 4000 // per_second
    count = len(samples) // size
    if not count:
        return []
    values = samples[: count * size].reshape(count, size).max(axis=1)
    return [int(v) for v in np.minimum(99, np.sqrt(values) * 99)]


def read_mono(path: Path, rate: int = 16000):
    import numpy as np

    raw = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", str(rate), "-f", "f32le", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


# ---- Models ------------------------------------------------------------------

model_state: dict = {"kind": None, "model": None}


def speech_ready() -> bool:
    return sys.platform == "darwin" and __import__("platform").machine() == "arm64"


def cached(repo: str) -> bool:
    root = Path(os.environ.get("HF_HOME") or Path.home() / ".cache" / "huggingface") / "hub"
    return (root / f"models--{repo.replace('/', '--')}" / "snapshots").exists()


def get_model(kind: str, job: dict):
    # One at a time: two of these side by side swap a 16 GB Mac to a standstill.
    if model_state["kind"] != kind:
        job["label"] = "loading_voice" if cached(MODELS[kind]) else "downloading_voice"
        model_state.update(kind=None, model=None)
        import gc

        import mlx.core as mx
        from mlx_audio.tts.utils import load_model

        gc.collect()
        mx.clear_cache()
        model_state.update(model=load_model(MODELS[kind]), kind=kind)
        job["label"] = "takes"
    return model_state["model"]


def speak(job: dict, voice: dict, text: str, language: str, delivery: str, base: Path, seed: int):
    import mlx.core as mx
    import numpy as np

    name = LANGUAGES.get(language, "English")
    mx.random.seed(seed)
    kind = voice.get("kind")
    if kind == "clone":
        reference = base / "voices" / voice["file"]
        if not reference.exists():
            raise Refuse(409, "voice_missing")
        result = get_model("clone", job).generate(
            text=text, ref_audio=str(reference), ref_text=voice.get("refText", ""), lang_code=name.lower(),
        )
    elif kind == "design":
        result = get_model("design", job).generate_voice_design(
            text=text, language=name, instruct=" ".join(x for x in (voice.get("prompt", ""), delivery) if x),
        )
    else:
        result = get_model("stock", job).generate_custom_voice(
            text=text, speaker=voice.get("speaker", STOCK_VOICES[0]), language=name, instruct=delivery or None,
        )
    chunks = [np.array(r.audio, dtype=np.float32) for r in result]
    audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
    return audio, model_state["model"].sample_rate


def trim_and_level(audio, rate: int):
    import numpy as np

    if not len(audio):
        return audio
    window = max(1, rate // 100)
    envelope = np.convolve(np.abs(audio), np.ones(window) / window, mode="same")
    loud = np.nonzero(envelope > max(0.004, envelope.max() * 0.03))[0]
    if len(loud):
        audio = audio[max(0, loud[0] - rate // 50) : min(len(audio), loud[-1] + rate // 12)]
    rms = float(np.sqrt(np.mean(audio**2))) or 1.0
    return np.clip(audio * min(6.0, TARGET_RMS / rms), -1, 1)


def transcribe(path: Path, language: str, job: dict) -> tuple[list[dict], str]:
    import mlx_whisper

    job["label"] = "transcribing" if cached(WHISPER) else "downloading_whisper"
    result = mlx_whisper.transcribe(
        str(path), path_or_hf_repo=WHISPER, language=language or None, word_timestamps=True,
        condition_on_previous_text=False, verbose=None,
    )
    cues = []
    for seg in result.get("segments", []):
        # Whisper invents speech over music; these are its own doubts about that.
        if seg.get("no_speech_prob", 0) > 0.6 or seg.get("compression_ratio", 0) > 2.4:
            continue
        words = seg.get("words") or []
        start = float(words[0]["start"]) if words else float(seg["start"])
        end = float(words[-1]["end"]) if words else float(seg["end"])
        text = seg["text"].strip()
        if text:
            cues.append({"start": start, "end": max(end, start + 0.2), "text": text, "speaker": ""})
    return tidy_cues(cues), result.get("language", language) or ""


# ---- Jobs --------------------------------------------------------------------

jobs: dict[str, dict] = {}
queues = {"media": queue.Queue(), "gpu": queue.Queue()}


def enqueue(project: str, kind: str, lane: str, /, **payload) -> dict:
    job = {
        "id": secrets.token_hex(6), "project": project, "kind": kind, "lane": lane, "label": kind, "state": "queued",
        "progress": 0.0, "error": "", "cancel": False, "payload": payload, "createdAt": time.time(),
    }
    jobs[job["id"]] = job
    queues[lane].put(job)
    return public_job(job)


def public_job(job: dict) -> dict:
    return {k: job[k] for k in ("id", "project", "kind", "label", "state", "progress", "error", "createdAt")} | {
        "lines": job["payload"].get("lines") or [],
    }


def worker(lane: str) -> None:
    while True:
        job = queues[lane].get()
        if job["cancel"]:
            job["state"] = "cancelled"
            continue
        job["state"] = "running"
        try:
            WORK[job["kind"]](job)
            job.update(state="done", progress=1.0)
        except Refuse as e:
            job.update(state="cancelled" if e.code == "cancelled" else "failed", error=e.code)
        except Exception as e:  # A failed job must never stop the worker.
            traceback.print_exc()
            job.update(state="failed", error=str(e)[:400] or "failed")
        finally:
            job.pop("process", None)
            if job["kind"] == "ingest" and job["state"] != "done":
                with contextlib.suppress(Exception), editing(job["project"]) as p:
                    p["status"] = "failed"


def check_cancel(job: dict) -> None:
    if job["cancel"]:
        raise Refuse(499, "cancelled")


def do_ingest(job: dict) -> None:
    pid = job["project"]
    base = folder(pid)
    project = load(pid)
    source = base / project["source"]["file"]
    info = probe(source)
    if not info["video"]:
        raise Refuse(422, "no_video")
    if not info["audio"]:
        raise Refuse(422, "no_audio")
    with editing(pid) as p:
        p["source"].update(info)
        # The first Japanese track, if any: that's the performance being replaced.
        chosen = next((a for a in info["audio"] if a["language"] == "ja"), info["audio"][0])
        p["source"]["audioIndex"] = chosen["index"]
        p["sourceLang"] = chosen["language"] or p.get("sourceLang", "")
    audio_index = chosen["index"]
    job["label"] = "proxy"
    ffmpeg_timed(
        ["-i", str(source), "-map", "0:v:0", "-map", f"0:a:{audio_index}", "-vf", "scale=-2:'min(720,ih)',format=yuv420p",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-g", "24", "-c:a", "aac", "-b:a", "128k", "-ac", "2",
         "-movflags", "+faststart", str(base / "proxy.part.mp4")],
        job, info["duration"], 0.0, 0.85,
    )
    (base / "proxy.part.mp4").replace(base / "proxy.mp4")
    job["label"] = "audio"
    # AAC opens on a tiny priming frame that the FLAC encoder refuses as a block size.
    ffmpeg("-i", str(source), "-map", f"0:a:{audio_index}", "-ac", "2", "-ar", "44100", "-af", "asetnsamples=n=4096", "-c:a", "flac", str(base / "audio.flac"), job=job)
    (base / "peaks.json").write_text(json.dumps(peaks_of(base / "audio.flac")))
    with editing(pid) as p:
        p["status"] = "ready"


def apply_cues(pid: str, cues: list[dict], origin: dict, language: str, job: dict) -> None:
    if not cues:
        raise Refuse(422, "no_dialogue")
    base = folder(pid)
    job["label"] = "casting"
    named = sorted({c["speaker"] for c in cues if c["speaker"]})
    with lock_of(pid):
        project = load(pid)
        target = project.get("targetLang", "en")
        speakers = []
        lookup: dict = {}
        if len(named) >= 2:
            # The subtitles name who speaks; that beats anything we could hear.
            for name in named[:12]:
                speakers.append(new_speaker(name, len(speakers)))
                lookup[name] = speakers[-1]["id"]
            labels = [lookup.get(c["speaker"], speakers[0]["id"]) for c in cues]
        else:
            import numpy as np

            samples = read_mono(base / ("vocals.flac" if (base / "vocals.flac").exists() else "audio.flac"))
            prints = []
            for c in cues:
                clip = samples[int(c["start"] * 16000) : int(c["end"] * 16000)]
                prints.append(voiceprint(np.asarray(clip), 16000) if c["end"] - c["start"] >= 0.5 else None)
            groups = cluster_voices(prints)
            order = list(dict.fromkeys(groups))
            for n in order:
                speakers.append(new_speaker(f"#{len(speakers) + 1}", len(speakers)))
            ids = {n: speakers[i]["id"] for i, n in enumerate(order)}
            labels = [ids[g] for g in groups]
        same = bool(language) and language == target
        project["lines"] = [new_line(c, s, c["text"] if same else "") for c, s in zip(cues, labels)]
        project["speakers"] = speakers
        project["sourceLang"] = language or project.get("sourceLang", "")
        project["script"] = origin
        save(project)


def do_script(job: dict) -> None:
    pid, payload = job["project"], job["payload"]
    base = folder(pid)
    project = load(pid)
    kind = payload["kind"]
    if kind == "track":
        track = next((s for s in project["source"]["subtitles"] if s["index"] == payload["index"]), None)
        if not track or not track["text"]:
            raise Refuse(422, "bitmap_subtitles")
        job["label"] = "reading_subs"
        out = base / "subs.ass" if track["codec"] in ("ass", "ssa") else base / "subs.srt"
        ffmpeg("-i", str(base / project["source"]["file"]), "-map", f"0:s:{payload['index']}", str(out), job=job)
        text = out.read_text(errors="replace")
        language = track["language"] or payload.get("language", "")
        origin = {"kind": "track", "language": language, "title": track["title"]}
    elif kind == "sidecar":
        job["label"] = "reading_subs"
        path = base / payload["file"]
        text = path.read_text(errors="replace")
        language = payload.get("language", "")
        origin = {"kind": "sidecar", "language": language, "title": payload.get("name", "")}
        cues = parse_subtitles(text, path.suffix.lower())
        apply_cues(pid, cues, origin, language, job)
        return
    else:
        if not speech_ready():
            raise Refuse(501, "apple_silicon_only")
        audio = base / "vocals.flac" if (base / "vocals.flac").exists() else base / "audio.flac"
        cues, language = transcribe(audio, payload.get("language", ""), job)
        apply_cues(pid, cues, {"kind": "whisper", "language": language, "title": ""}, language, job)
        return
    apply_cues(pid, parse_subtitles(text, out.suffix), origin, language, job)


def do_separate(job: dict) -> None:
    if not speech_ready():
        raise Refuse(501, "apple_silicon_only")
    pid = job["project"]
    base = folder(pid)
    work = base / "stems.tmp"
    shutil.rmtree(work, ignore_errors=True)
    job["label"] = "separating"
    run([str(Path(sys.executable).parent / "demucs-mlx"), "-o", str(work), str(base / "audio.flac")], job)
    vocals = next(work.rglob("vocals.*"), None)
    others = [f for f in work.rglob("*") if f.is_file() and f.stem in ("drums", "bass", "other")]
    if not vocals or len(others) != 3:
        raise RuntimeError("Stem separation produced no files")
    ffmpeg("-i", str(vocals), "-c:a", "flac", str(base / "vocals.flac"), job=job)
    # Everything that isn't a voice is the bed the dub sits on.
    inputs = [arg for f in others for arg in ("-i", str(f))]
    ffmpeg(*inputs, "-filter_complex", "amix=inputs=3:normalize=0", "-c:a", "flac", str(base / "bed.flac"), job=job)
    shutil.rmtree(work, ignore_errors=True)
    with editing(pid) as p:
        p["stems"] = True


def voice_key(voice: dict) -> str:
    # Must match voiceKey in lib/dub/model.ts byte for byte, or every take looks stale.
    keys = ("file", "kind", "prompt", "speaker")
    return json.dumps({k: voice.get(k) for k in keys}, separators=(",", ":"), ensure_ascii=False)


def do_takes(job: dict) -> None:
    import soundfile as sf

    pid = job["project"]
    base = folder(pid)
    ids = job["payload"]["lines"]
    project = load(pid)
    language = project.get("targetLang", "en")
    (base / "takes").mkdir(exist_ok=True)
    for done, line_id in enumerate(ids):
        check_cancel(job)
        job["progress"] = round(done / max(1, len(ids)), 3)
        job["line"] = line_id
        project = load(pid)
        line = next((l for l in project["lines"] if l["id"] == line_id), None)
        speaker = next((s for s in project["speakers"] if line and s["id"] == line["speaker"]), None)
        if not line or not speaker or not line["text"].strip():
            continue
        seed = secrets.randbelow(2**31)
        audio, rate = speak(job, speaker["voice"], line["text"], language, line.get("delivery", ""), base, seed)
        check_cancel(job)
        audio = trim_and_level(audio, rate)
        if not len(audio):
            raise RuntimeError("The voice came back silent")
        duration = len(audio) / rate
        index = lines_index(project, line_id)
        slot = slot_of(project["lines"], index, project["source"]["duration"])
        fit = fit_tempo(duration, slot)
        name = f"{line_id}-{secrets.token_hex(3)}.wav"
        raw = base / "takes" / f"raw-{name}"
        sf.write(raw, audio, rate)
        if abs(fit["tempo"] - 1) > 0.01:
            ffmpeg("-i", str(raw), "-af", atempo_chain(fit["tempo"]), "-ar", "48000", str(base / "takes" / name))
        else:
            ffmpeg("-i", str(raw), "-ar", "48000", str(base / "takes" / name))
        raw.unlink()
        store_take(pid, line_id, {
            "file": name, "text": line["text"], "voice": voice_key(speaker["voice"]), "seconds": round(duration / fit["tempo"], 3),
            "tempo": fit["tempo"], "over": fit["over"], "kind": speaker["voice"].get("kind"), "seed": seed,
        })


def store_take(pid: str, line_id: str, take: dict) -> None:
    with editing(pid) as p:
        for line in p["lines"]:
            if line["id"] != line_id:
                continue
            line["takes"].append(take)
            while len(line["takes"]) > MAX_TAKES:
                gone = line["takes"].pop(0)
                with contextlib.suppress(OSError):
                    (folder(pid) / "takes" / gone["file"]).unlink()
            line["pick"] = len(line["takes"]) - 1


def lines_index(project: dict, line_id: str) -> int:
    return next(i for i, l in enumerate(project["lines"]) if l["id"] == line_id)


def do_audition(job: dict) -> None:
    import soundfile as sf

    pid, payload = job["project"], job["payload"]
    base = folder(pid)
    project = load(pid)
    speaker = next((s for s in project["speakers"] if s["id"] == payload["speaker"]), None)
    if not speaker:
        raise Refuse(404, "not_found")
    audio, rate = speak(job, speaker["voice"], payload["text"][:240], project.get("targetLang", "en"), "", base, 7)
    (base / "voices").mkdir(exist_ok=True)
    name = f"audition-{speaker['id']}-{secrets.token_hex(2)}.wav"
    sf.write(base / "voices" / name, trim_and_level(audio, rate), rate)
    with editing(pid) as p:
        for s in p["speakers"]:
            if s["id"] == speaker["id"]:
                s["audition"] = name


def do_reference(job: dict) -> None:
    """Turns any recording into a clean clone reference and writes down what it
    says, since Qwen clones far better when it knows the words."""
    import numpy as np
    import soundfile as sf

    pid, payload = job["project"], job["payload"]
    base = folder(pid)
    (base / "voices").mkdir(exist_ok=True)
    name = f"{secrets.token_hex(5)}.wav"
    target = base / "voices" / name
    if "start" in payload:
        clean = base / "vocals.flac" if (base / "vocals.flac").exists() else base / "audio.flac"
        span = min(MAX_REF_SECONDS, float(payload["end"]) - float(payload["start"]))
        ffmpeg("-ss", str(payload["start"]), "-t", str(span), "-i", str(clean), "-ac", "1", "-ar", "24000", str(target), job=job)
    else:
        upload = base / "voices" / payload["upload"]
        ffmpeg("-i", str(upload), "-t", str(MAX_REF_SECONDS), "-ac", "1", "-ar", "24000", str(target), job=job)
        upload.unlink(missing_ok=True)
    audio, rate = sf.read(target, dtype="float32")
    if len(audio) / rate < 1.5 or float(np.sqrt(np.mean(audio**2))) < 0.002:
        target.unlink(missing_ok=True)
        raise Refuse(422, "reference_too_short")
    ref_text = payload.get("text", "").strip()
    if not ref_text:
        ref_text = " ".join(c["text"] for c in transcribe(target, "", job)[0])
    if not ref_text:
        target.unlink(missing_ok=True)
        raise Refuse(422, "reference_silent")
    with editing(pid) as p:
        for s in p["speakers"]:
            if s["id"] == payload["speaker"]:
                s["voice"] = {
                    "kind": "clone", "file": name, "refText": ref_text, "seconds": round(len(audio) / rate, 1),
                    "origin": "film" if "start" in payload else payload.get("origin", "file"),
                    "consentAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
                s.pop("audition", None)


def dub_track(project: dict, base: Path, path: Path) -> int:
    import numpy as np
    import soundfile as sf

    rate = 48000
    total = int((project["source"]["duration"] + 1) * rate)
    track = np.zeros(total, dtype=np.float32)
    placed = 0
    volumes = {s["id"]: float(s.get("level", 1)) for s in project["speakers"]}
    muted = {s["id"] for s in project["speakers"] if s.get("muted")}
    for line in project["lines"]:
        takes, pick = line.get("takes") or [], line.get("pick", -1)
        if line["speaker"] in muted or not 0 <= pick < len(takes):
            continue
        take = base / "takes" / takes[pick]["file"]
        if not take.exists():
            continue
        audio, _ = sf.read(take, dtype="float32")
        at = int(line["start"] * rate)
        audio = audio[: max(0, total - at)]
        track[at : at + len(audio)] += audio * volumes.get(line["speaker"], 1.0)
        placed += 1
    sf.write(path, np.clip(track, -1, 1), rate, subtype="PCM_24")
    return placed


def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def to_srt(lines: list[dict]) -> str:
    rows = [l for l in lines if l["text"].strip()]
    return "\n".join(f"{i + 1}\n{srt_time(l['start'])} --> {srt_time(l['end'])}\n{l['text'].strip()}\n" for i, l in enumerate(rows))


def mix_filter(mix: dict, stems: bool, keep_vocals: bool) -> str:
    dub, bed, room = float(mix.get("dub", 1)), float(mix.get("bed", 1)), float(mix.get("room", 0.15))
    # Stems have no voices left to duck under; a full mix ducks whenever the
    # dub speaks, so it reads as a voice-over rather than a clash.
    voice = f"[1:a]volume={dub:.3f}"
    if room > 0.01:
        voice += f",aecho=0.9:0.9:{int(24 + room * 50)}|{int(41 + room * 70)}:{room * 0.28:.3f}|{room * 0.17:.3f}"
    voice += ",asplit=2[d1][d2]"
    if stems:
        chain = f"[2:a]volume={bed:.3f}[b]"
        inputs = "[b][d2]"
        count = 2
        if keep_vocals:
            chain += f";[3:a]volume={float(mix.get('original', 0)):.3f}[v]"
            inputs = "[b][v][d2]"
            count = 3
        return f"{voice};{chain};[d1]anullsink;{inputs}amix=inputs={count}:normalize=0,alimiter=limit=0.95[out]"
    return (
        f"{voice};[2:a]volume={bed:.3f}[b];"
        f"[d1]aformat=channel_layouts=stereo[key];"
        f"[b][key]sidechaincompress=threshold=0.015:ratio=9:attack=25:release=380[ducked];"
        f"[ducked][d2]amix=inputs=2:normalize=0,alimiter=limit=0.95[out]"
    )


def do_render(job: dict) -> None:
    pid, payload = job["project"], job["payload"]
    base = folder(pid)
    project = load(pid)
    (base / "out").mkdir(exist_ok=True)
    job["label"] = "dub_track"
    track = base / "dub.wav"
    placed = dub_track(project, base, track)
    if not placed:
        raise Refuse(409, "no_takes")
    check_cancel(job)
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", project["title"]).strip("-") or "dub"
    language = project.get("targetLang", "en")
    container = "mp4" if payload.get("container") == "mp4" else "mkv"
    number = len(project.get("renders") or []) + 1
    name = f"{stem}.{language}.{number}.{container}"
    subtitles = base / "out" / f"{stem}.{language}.{number}.srt"
    subtitles.write_text(to_srt(project["lines"]))
    mix = project.get("mix") or {}
    stems = bool(project.get("stems")) and (base / "bed.flac").exists()
    keep = stems and float(mix.get("original", 0)) > 0.005
    audio_index = project["source"].get("audioIndex", 0)
    args = ["-i", str(base / project["source"]["file"]), "-i", str(track)]
    args += ["-i", str(base / "bed.flac")] if stems else ["-i", str(base / "audio.flac")]
    if keep:
        args += ["-i", str(base / "vocals.flac")]
    subtitle_input = 3 + int(keep)
    args += ["-i", str(subtitles)]
    args += [
        "-filter_complex", mix_filter(mix, stems, keep),
        "-map", "0:v:0", "-map", "[out]", "-map", f"0:a:{audio_index}", "-map", f"{subtitle_input}:s:0",
        "-c:v", "copy", "-c:a:0", "aac", "-b:a:0", "224k", "-c:a:1", "copy",
        "-c:s", "mov_text" if container == "mp4" else "srt",
        "-metadata:s:a:0", f"language={ISO2.get(language, 'und')}", "-metadata:s:a:0", f"title=Dub ({LANGUAGES.get(language, language)})",
        "-disposition:a:0", "default", "-disposition:a:1", "0", "-metadata:s:s:0", f"language={ISO2.get(language, 'und')}",
        "-shortest",
    ]
    if container == "mp4" and project["source"]["video"]["codec"] == "hevc":
        args += ["-tag:v", "hvc1"]
    job["label"] = "mastering"
    temp = base / "out" / f"part-{name}"
    ffmpeg_timed([*args, str(temp)], job, project["source"]["duration"], 0.1, 1.0)
    temp.replace(base / "out" / name)
    with editing(pid) as p:
        p.setdefault("renders", []).append({
            "file": name, "subtitles": subtitles.name, "at": time.time(), "size": (base / "out" / name).stat().st_size,
            "language": language, "lines": placed, "stems": stems,
        })


WORK = {
    "ingest": do_ingest, "script": do_script, "separate": do_separate, "takes": do_takes,
    "audition": do_audition, "reference": do_reference, "render": do_render,
}

# ---- What the page may change ------------------------------------------------

LINE_FIELDS = {"start", "end", "speaker", "text", "delivery", "pick"}
SPEAKER_FIELDS = {"name", "color", "voice", "level", "muted"}


def valid_voice(voice) -> bool:
    if not isinstance(voice, dict):
        return False
    if voice.get("kind") == "stock":
        return voice.get("speaker") in STOCK_VOICES
    if voice.get("kind") == "design":
        return isinstance(voice.get("prompt"), str) and 0 < len(voice["prompt"]) <= 500
    if voice.get("kind") == "clone":
        return bool(SAFE_FILE.match(str(voice.get("file", ""))))
    return False


def apply_patch(project: dict, patch: dict) -> None:
    """Field by field, so an edit on the page can't overwrite a take a job just
    finished. Unknown fields are ignored."""
    if isinstance(patch.get("title"), str):
        project["title"] = patch["title"][:120]
    if patch.get("targetLang") in LANGUAGES:
        project["targetLang"] = patch["targetLang"]
    if patch.get("sourceLang") == "" or patch.get("sourceLang") in LANGUAGES:
        project["sourceLang"] = patch["sourceLang"]
    if isinstance(patch.get("mix"), dict):
        for key in ("dub", "bed", "original", "room"):
            if isinstance(patch["mix"].get(key), (int, float)):
                project.setdefault("mix", {})[key] = max(0.0, min(2.0, float(patch["mix"][key])))
    known = {s["id"] for s in project["speakers"]}
    for item in patch.get("addSpeakers") or []:
        speaker = new_speaker(str(item.get("name", "Voice"))[:60], len(project["speakers"]))
        speaker["id"] = item.get("id") if re.fullmatch(r"[a-f0-9]{8}", str(item.get("id"))) else speaker["id"]
        project["speakers"].append(speaker)
        known.add(speaker["id"])
    for speaker in project["speakers"]:
        changes = (patch.get("speakers") or {}).get(speaker["id"])
        if not isinstance(changes, dict):
            continue
        for key, value in changes.items():
            if key not in SPEAKER_FIELDS:
                continue
            if key == "voice" and not valid_voice(value):
                raise Refuse(422, "invalid_voice")
            speaker[key] = value
    removed = set(patch.get("removeSpeakers") or [])
    if removed:
        fallback = next((s["id"] for s in project["speakers"] if s["id"] not in removed), None)
        if not fallback:
            raise Refuse(422, "last_speaker")
        project["speakers"] = [s for s in project["speakers"] if s["id"] not in removed]
        for line in project["lines"]:
            if line["speaker"] in removed:
                line["speaker"] = fallback
    for item in patch.get("addLines") or []:
        line = new_line({"start": float(item["start"]), "end": float(item["end"]), "text": str(item.get("source", ""))[:2000]},
                        item["speaker"], str(item.get("text", ""))[:2000])
        if re.fullmatch(r"[a-f0-9]{8}", str(item.get("id"))):
            line["id"] = item["id"]
        project["lines"].append(line)
    removed_lines = set(patch.get("removeLines") or [])
    project["lines"] = [l for l in project["lines"] if l["id"] not in removed_lines]
    for line in project["lines"]:
        changes = (patch.get("lines") or {}).get(line["id"])
        if not isinstance(changes, dict):
            continue
        for key, value in changes.items():
            if key not in LINE_FIELDS:
                continue
            if key in ("start", "end"):
                value = round(max(0.0, float(value)), 3)
            elif key in ("text", "delivery"):
                value = str(value)[:2000]
            elif key == "speaker" and value not in known:
                continue
            elif key == "pick" and not (isinstance(value, int) and -1 <= value < len(line["takes"])):
                continue
            line[key] = value
        if line["end"] <= line["start"]:
            line["end"] = round(line["start"] + 0.2, 3)
    project["lines"].sort(key=lambda l: l["start"])


# ---- HTTP --------------------------------------------------------------------


def allowed_origin(origin: str | None, extra: set[str]) -> bool:
    return bool(origin) and (origin in ALLOWED_ORIGINS or origin in extra or bool(LOCAL_ORIGIN.match(origin)))


def allowed_host(host: str | None, port: int) -> bool:
    return host in (f"127.0.0.1:{port}", f"localhost:{port}")


def media_type(path: Path) -> str:
    return {
        ".mp4": "video/mp4", ".mkv": "video/x-matroska", ".wav": "audio/wav", ".flac": "audio/flac",
        ".json": "application/json", ".srt": "text/plain; charset=utf-8",
    }.get(path.suffix.lower(), "application/octet-stream")


class Booth(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "PalmframeBooth"
    token = ""
    origins: set[str] = set()
    port = PORT

    def log_message(self, *_):  # The terminal stays readable.
        pass

    def cors(self) -> None:
        origin = self.headers.get("Origin")
        if allowed_origin(origin, self.origins):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Allow-Headers", "authorization, content-type, x-file-name")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
            self.send_header("Access-Control-Expose-Headers", "content-range, accept-ranges, content-length")
            self.send_header("Access-Control-Max-Age", "600")

    def reply(self, status: int, body: dict | list) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def drain(self) -> None:
        """A refused upload still has to be read, or the socket poisons the next
        request on this connection."""
        self.close_connection = True

    def gate(self, parsed) -> bool:
        origin = self.headers.get("Origin")
        if not allowed_host(self.headers.get("Host"), self.port) or (origin and not allowed_origin(origin, self.origins)):
            self.drain()
            self.reply(403, {"error": "forbidden"})
            return False
        if parsed.path == "/hello":
            return True
        given = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        given = given or (urllib.parse.parse_qs(parsed.query).get("t") or [""])[0]
        if not secrets.compare_digest(given.encode(), self.token.encode()):
            self.drain()
            self.reply(401, {"error": "unpaired"})
            return False
        return True

    def json_body(self) -> dict:
        size = int(self.headers.get("Content-Length") or 0)
        if size > 8_000_000:
            raise Refuse(413, "too_large")
        try:
            body = json.loads(self.rfile.read(size) or b"{}")
        except ValueError as e:
            raise Refuse(400, "invalid") from e
        if not isinstance(body, dict):
            raise Refuse(400, "invalid")
        return body

    def receive(self, target: Path) -> int:
        remaining = int(self.headers.get("Content-Length") or 0)
        if not remaining:
            raise Refuse(400, "empty")
        written = 0
        with target.open("wb") as out:
            while remaining:
                chunk = self.rfile.read(min(4 << 20, remaining))
                if not chunk:
                    raise Refuse(400, "interrupted")
                out.write(chunk)
                remaining -= len(chunk)
                written += len(chunk)
        return written

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def handle_any(self, method: str):
        parsed = urllib.parse.urlparse(self.path)
        try:
            if self.gate(parsed):
                self.route(method, parsed)
        except Refuse as e:
            self.drain()
            self.reply(e.status, {"error": e.code})
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except Exception as e:
            traceback.print_exc()
            self.drain()
            self.reply(500, {"error": "failed", "detail": str(e)[:300]})

    do_GET = lambda self: self.handle_any("GET")
    do_POST = lambda self: self.handle_any("POST")
    do_PATCH = lambda self: self.handle_any("PATCH")
    do_DELETE = lambda self: self.handle_any("DELETE")

    def route(self, method: str, parsed) -> None:
        parts = [urllib.parse.unquote(p) for p in parsed.path.strip("/").split("/") if p]
        if parts == ["hello"]:
            return self.reply(200, {"app": "palmframe-booth", "version": VERSION})
        if parts == ["status"]:
            return self.reply(200, status())
        if parts == ["projects"]:
            if method == "GET":
                return self.reply(200, list_projects())
            return self.reply(201, self.create_project())
        if len(parts) >= 2 and parts[0] == "jobs" and method == "POST":
            job = jobs.get(parts[1])
            if not job:
                raise Refuse(404, "not_found")
            job["cancel"] = True
            process = job.get("process")
            if process:
                process.terminate()
            return self.reply(200, {"ok": True})
        if len(parts) < 2 or parts[0] != "projects":
            raise Refuse(404, "not_found")
        pid = parts[1]
        rest = parts[2:]
        if not rest:
            if method == "GET":
                project = load(pid)
                wanted = (urllib.parse.parse_qs(parsed.query).get("rev") or [""])[0]
                live = [public_job(j) | {"line": j.get("line")} for j in jobs.values() if j["project"] == pid and is_recent(j)]
                if wanted == str(project.get("rev")):
                    return self.reply(200, {"same": True, "jobs": live})
                return self.reply(200, {"project": project, "jobs": live})
            if method == "PATCH":
                patch = self.json_body()
                with editing(pid) as project:
                    apply_patch(project, patch)
                    rev = project["rev"] + 1
                return self.reply(200, {"rev": rev})
            if method == "DELETE":
                if any(j["project"] == pid and j["state"] in ("queued", "running") for j in jobs.values()):
                    raise Refuse(409, "busy")
                load(pid)
                shutil.rmtree(folder(pid))
                return self.reply(200, {"ok": True})
        if rest[0] == "media" and method == "GET":
            return self.media(pid, rest[1:])
        if method != "POST":
            raise Refuse(405, "method")
        load(pid)
        action = rest[0]
        if action == "sidecar":
            name = urllib.parse.unquote(self.headers.get("X-File-Name", "subs.srt"))
            suffix = Path(name).suffix.lower()
            if suffix not in (".srt", ".ass", ".ssa", ".vtt"):
                raise Refuse(422, "bad_subtitles")
            file = f"sidecar{suffix}"
            self.receive(folder(pid) / file)
            body = {"language": urllib.parse.parse_qs(parsed.query).get("language", [""])[0]}
            return self.reply(202, enqueue(pid, "script", "media", kind="sidecar", file=file, name=name, **body))
        if action == "reference-upload":
            voices = folder(pid) / "voices"
            voices.mkdir(exist_ok=True)
            file = f"up-{secrets.token_hex(4)}.audio"
            self.receive(voices / file)
            query = urllib.parse.parse_qs(parsed.query)
            speaker = query.get("speaker", [""])[0]
            if query.get("consent", [""])[0] != "1":
                (voices / file).unlink()
                raise Refuse(422, "consent_required")
            return self.reply(202, enqueue(
                pid, "reference", "gpu", upload=file, speaker=speaker,
                origin=query.get("origin", ["file"])[0], text=query.get("text", [""])[0],
            ))
        if action == "take-upload":
            return self.reply(200, self.take_upload(pid, parsed))
        body = self.json_body()
        if action == "script":
            kind = body.get("kind")
            if kind == "track":
                return self.reply(202, enqueue(pid, "script", "media", kind=kind, index=int(body.get("index", 0))))
            return self.reply(202, enqueue(pid, "script", "gpu", kind="whisper", language=str(body.get("language", ""))))
        if action == "separate":
            return self.reply(202, enqueue(pid, "separate", "gpu"))
        if action == "takes":
            ids = [str(i) for i in body.get("lines") or []]
            if not ids:
                raise Refuse(422, "nothing")
            if not speech_ready():
                raise Refuse(501, "apple_silicon_only")
            return self.reply(202, enqueue(pid, "takes", "gpu", lines=ids))
        if action == "audition":
            return self.reply(202, enqueue(pid, "audition", "gpu", speaker=str(body.get("speaker")), text=str(body.get("text", ""))))
        if action == "reference":
            if body.get("consent") is not True:
                raise Refuse(422, "consent_required")
            return self.reply(202, enqueue(
                pid, "reference", "gpu", speaker=str(body.get("speaker")), start=float(body["start"]),
                end=float(body["end"]), text=str(body.get("text", "")),
            ))
        if action == "render":
            return self.reply(202, enqueue(pid, "render", "media", container=body.get("container")))
        if action == "reveal":
            subprocess.Popen(["open", "-R", str(folder(pid) / "out" / safe_name(str(body.get("file"))))])
            return self.reply(200, {"ok": True})
        raise Refuse(404, "not_found")

    def take_upload(self, pid: str, parsed) -> dict:
        """A take someone recorded themselves, at the mic, against the band."""
        import soundfile as sf

        query = urllib.parse.parse_qs(parsed.query)
        line_id = query.get("line", [""])[0]
        base = folder(pid)
        project = load(pid)
        line = next((l for l in project["lines"] if l["id"] == line_id), None)
        if not line:
            raise Refuse(404, "not_found")
        (base / "takes").mkdir(exist_ok=True)
        raw = base / "takes" / f"up-{secrets.token_hex(4)}.audio"
        self.receive(raw)
        name = f"{line_id}-{secrets.token_hex(3)}.wav"
        ffmpeg("-i", str(raw), "-ac", "1", "-ar", "48000", str(base / "takes" / name))
        raw.unlink()
        audio, rate = sf.read(base / "takes" / name, dtype="float32")
        audio = trim_and_level(audio, rate)
        sf.write(base / "takes" / name, audio, rate)
        take = {
            "file": name, "text": line["text"], "voice": "mic", "seconds": round(len(audio) / rate, 3),
            "tempo": 1.0, "over": 0.0, "kind": "mic", "seed": 0,
        }
        store_take(pid, line_id, take)
        return take

    def media(self, pid: str, parts: list[str]) -> None:
        if len(parts) == 1 and parts[0] in ("proxy.mp4", "peaks.json", "bed.flac"):
            path = folder(pid) / parts[0]
        elif len(parts) == 2 and parts[0] in ("takes", "voices", "out"):
            path = folder(pid) / parts[0] / safe_name(parts[1])
        else:
            raise Refuse(404, "not_found")
        if not path.is_file():
            raise Refuse(404, "not_found")
        size = path.stat().st_size
        start, end = 0, size - 1
        match = re.match(r"bytes=(\d*)-(\d*)$", self.headers.get("Range", ""))
        ranged = bool(match) and (match[1] or match[2])
        if ranged:
            if match[1]:
                start = int(match[1])
                end = min(end, int(match[2])) if match[2] else end
            else:
                start = max(0, size - int(match[2]))
            if start >= size or start > end:
                self.send_response(416)
                self.cors()
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
        self.send_response(206 if ranged else 200)
        self.cors()
        self.send_header("Content-Type", media_type(path))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if ranged:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with path.open("rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining:
                chunk = f.read(min(1 << 20, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def create_project(self) -> dict:
        name = urllib.parse.unquote(self.headers.get("X-File-Name", "episode.mkv"))
        suffix = Path(name).suffix.lower()
        if suffix not in (".mkv", ".mp4", ".mov", ".webm", ".avi", ".m4v", ".ts"):
            raise Refuse(422, "bad_video")
        pid = secrets.token_hex(6)
        base = folder(pid)
        base.mkdir(parents=True)
        try:
            self.receive(base / f"source{suffix}")
        except Exception:
            shutil.rmtree(base, ignore_errors=True)
            raise
        project = {
            "id": pid, "rev": 0, "createdAt": time.time(), "status": "ingesting", "title": Path(name).stem[:120],
            "source": {"file": f"source{suffix}", "name": name, "duration": 0, "subtitles": [], "audio": [], "video": None},
            "sourceLang": "", "targetLang": "en", "lines": [], "speakers": [], "script": None, "stems": False,
            "mix": {"dub": 1.0, "bed": 1.0, "original": 0.0, "room": 0.15}, "renders": [],
        }
        save(project)
        enqueue(pid, "ingest", "media")
        return project


def safe_name(name: str) -> str:
    if not SAFE_FILE.match(name) or name.startswith("."):
        raise Refuse(404, "not_found")
    return name


def is_recent(job: dict) -> bool:
    return job["state"] in ("queued", "running") or time.time() - job["createdAt"] < 3600


def list_projects() -> list[dict]:
    rows = []
    if HOME.exists():
        for path in HOME.glob("*/project.json"):
            with contextlib.suppress(ValueError, OSError):
                p = json.loads(path.read_text())
                rows.append({
                    "id": p["id"], "title": p["title"], "status": p["status"], "updatedAt": p.get("updatedAt", 0),
                    "duration": p["source"].get("duration", 0), "targetLang": p.get("targetLang", ""),
                    "lines": len(p["lines"]), "takes": sum(1 for l in p["lines"] if l.get("takes")),
                    "renders": len(p.get("renders") or []),
                })
    return sorted(rows, key=lambda r: -r["updatedAt"])


def status() -> dict:
    return {
        "version": VERSION, "ffmpeg": bool(shutil.which("ffmpeg") and shutil.which("ffprobe")), "speech": speech_ready(),
        "models": {kind: cached(repo) for kind, repo in MODELS.items()} | {"whisper": cached(WHISPER)},
        "voices": STOCK_VOICES, "languages": LANGUAGES, "home": str(HOME),
        "free": shutil.disk_usage(HOME if HOME.exists() else Path.home()).free,
    }


def token_file() -> Path:
    return Path.home() / ".palmframe-booth-token"


def load_token() -> str:
    path = token_file()
    if path.exists() and len(path.read_text().strip()) >= 32:
        return path.read_text().strip()
    token = secrets.token_urlsafe(32)
    path.touch(mode=0o600)
    path.write_text(token)
    return token


def serve(port: int, app: str, origins: set[str], browser: bool) -> None:
    if not shutil.which("ffmpeg"):
        sys.exit("The Booth needs ffmpeg. Install it with: brew install ffmpeg")
    HOME.mkdir(parents=True, exist_ok=True)
    # Jobs die with the process, so an interrupted import can't stay "in progress".
    for path in HOME.glob("*/project.json"):
        with contextlib.suppress(ValueError, OSError):
            if json.loads(path.read_text()).get("status") == "ingesting":
                with editing(path.parent.name) as p:
                    p["status"] = "failed"
    Booth.token, Booth.port, Booth.origins = load_token(), port, origins
    for lane in queues:
        threading.Thread(target=worker, args=(lane,), daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", port), Booth)
    link = f"{app}/dub#booth={Booth.token}"
    print(f"\n  The Booth is open on 127.0.0.1:{port}\n  Your dubs live in {HOME}\n\n  Pair this browser:\n  {link}\n", flush=True)
    if browser:
        webbrowser.open(link)
    with contextlib.suppress(KeyboardInterrupt):
        server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description="Palmframe's local dubbing booth")
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--app", default=APP_URL, help="the Palmframe address to pair with")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    extra = {args.app.rstrip("/")} if args.app.startswith("https://") else set()
    serve(args.port, args.app.rstrip("/"), extra, not args.no_browser)


if __name__ == "__main__":
    main()
