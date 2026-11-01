"""Checks for the parts of the Booth that need no models or film:
uv run --python 3.12 --with numpy --with soundfile python -m unittest discover -s apps/web/scripts/booth"""
import importlib.util
import sys
import unittest
from pathlib import Path

# The Booth lives in public/, and a __pycache__ there would be published with it.
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("booth", Path(__file__).parents[2] / "public/dub/booth.py")
booth = importlib.util.module_from_spec(spec)
sys.modules["booth"] = booth
spec.loader.exec_module(booth)

ASS = """[Script Info]
Title: x

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Comment: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,not spoken
Dialogue: 0,0:00:01.00,0:00:03.50,Default,Mara,0,0,0,,{\\i1}Where,\\Nare you?{\\i0}
Dialogue: 1,0:00:01.00,0:00:03.50,Default,Mara,0,0,0,,{\\i1}Where,\\Nare you?{\\i0}
Dialogue: 0,0:00:02.00,0:00:04.00,Signs,,0,0,0,,CAFE
Dialogue: 0,0:00:02.00,0:00:04.00,Default,,0,0,0,,{\\pos(10,10)}Sign on a wall
Dialogue: 0,0:00:05.00,0:00:06.00,OP-Romaji,,0,0,0,,la la la
Dialogue: 0,0:00:07.00,0:00:08.00,Default,Jun,0,0,0,,Here.
"""


class Subtitles(unittest.TestCase):
    def test_ass_keeps_only_spoken_dialogue(self):
        cues = booth.parse_subtitles(ASS, ".ass")
        self.assertEqual([c["text"] for c in cues], ["Where, are you?", "Here."])
        self.assertEqual([c["speaker"] for c in cues], ["Mara", "Jun"])
        self.assertEqual(cues[0]["end"], 3.5)

    def test_srt_and_vtt(self):
        srt = "1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Hello</i>\r\nthere\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n♪♪\r\n\r\n3\r\n00:00:05,000 --> 00:00:06,000\r\n[door slams]\r\n"
        self.assertEqual([c["text"] for c in booth.parse_subtitles(srt, ".srt")], ["Hello there"])
        vtt = "WEBVTT\n\n00:01.000 --> 00:02.000\nHi\n"
        self.assertEqual(booth.parse_subtitles(vtt, ".vtt")[0]["start"], 1.0)

    def test_repeated_cue_across_a_gap_joins(self):
        srt = "1\n00:00:01,000 --> 00:00:02,000\nWait\n\n2\n00:00:02,100 --> 00:00:03,000\nWait\n"
        cues = booth.parse_subtitles(srt, ".srt")
        self.assertEqual(len(cues), 1)
        self.assertEqual(cues[0]["end"], 3.0)

    def test_rank_prefers_target_language_then_dialogue(self):
        tracks = [
            {"text": False, "language": "en", "title": ""},
            {"text": True, "language": "en", "title": "Signs & Songs"},
            {"text": True, "language": "ja", "title": ""},
            {"text": True, "language": "fr", "title": ""},
            {"text": True, "language": "en", "title": "Full"},
        ]
        best = sorted(tracks, key=lambda t: booth.subtitle_rank(t, "fr"))
        self.assertEqual(best[0]["language"], "fr")
        self.assertEqual(best[1]["title"], "Full")
        self.assertFalse(best[-1]["text"])


class Fitting(unittest.TestCase):
    def test_fits_inside_the_limit(self):
        self.assertEqual(booth.fit_tempo(2.4, 2.0), {"tempo": 1.2, "over": 0.0})

    def test_reports_what_cannot_fit(self):
        fit = booth.fit_tempo(4.0, 2.0)
        self.assertEqual(fit["tempo"], booth.MAX_TEMPO)
        self.assertGreater(fit["over"], 1)

    def test_short_take_stretches_only_a_little(self):
        self.assertEqual(booth.fit_tempo(1.0, 4.0)["tempo"], booth.MIN_TEMPO)

    def test_slot_stops_before_the_next_line(self):
        lines = [{"start": 1, "end": 2}, {"start": 2.2, "end": 3}]
        self.assertAlmostEqual(booth.slot_of(lines, 0, 10), 1.15)
        self.assertAlmostEqual(booth.slot_of(lines, 1, 10), 1.4)


class Patch(unittest.TestCase):
    def project(self):
        return {
            "title": "a", "targetLang": "en", "sourceLang": "", "mix": {},
            "speakers": [{"id": "s1", "name": "A", "voice": {"kind": "stock", "speaker": "Ryan"}}, {"id": "s2", "name": "B", "voice": {}}],
            "lines": [{"id": "l1", "start": 1.0, "end": 2.0, "speaker": "s1", "text": "", "takes": [{}], "pick": 0, "source": "x"}],
        }

    def test_ignores_fields_it_does_not_know(self):
        p = self.project()
        booth.apply_patch(p, {"lines": {"l1": {"takes": [], "text": "hi", "evil": 1}}, "id": "x"})
        self.assertEqual(len(p["lines"][0]["takes"]), 1)
        self.assertEqual(p["lines"][0]["text"], "hi")
        self.assertNotIn("evil", p["lines"][0])

    def test_refuses_a_voice_with_a_path(self):
        p = self.project()
        with self.assertRaises(booth.Refuse):
            booth.apply_patch(p, {"speakers": {"s1": {"voice": {"kind": "clone", "file": "../../secret"}}}})

    def test_removing_a_speaker_hands_lines_on(self):
        p = self.project()
        booth.apply_patch(p, {"removeSpeakers": ["s1"]})
        self.assertEqual(p["lines"][0]["speaker"], "s2")

    def test_keeps_lines_ordered_and_positive(self):
        p = self.project()
        booth.apply_patch(p, {"lines": {"l1": {"end": 0.5}}, "addLines": [{"start": 0, "end": 0.5, "speaker": "s1"}]})
        self.assertEqual(p["lines"][0]["start"], 0)
        self.assertGreater(p["lines"][1]["end"], p["lines"][1]["start"])


class Gate(unittest.TestCase):
    def test_origins(self):
        ok = lambda o: booth.allowed_origin(o, set())
        self.assertTrue(ok("https://www.palmframe.com"))
        self.assertTrue(ok("http://localhost:3000"))
        self.assertFalse(ok("https://evil.example"))
        self.assertFalse(ok("https://www.palmframe.com.evil.example"))
        self.assertFalse(ok("http://localhost.evil.example:3000"))
        self.assertFalse(ok(None))

    def test_rebinding_host_is_refused(self):
        self.assertTrue(booth.allowed_host("127.0.0.1:7847", 7847))
        self.assertFalse(booth.allowed_host("evil.example:7847", 7847))

    def test_files_cannot_climb_out(self):
        for name in ("../x", "a/b", ".hidden", ""):
            with self.assertRaises(booth.Refuse):
                booth.safe_name(name)
        with self.assertRaises(booth.Refuse):
            booth.folder("../../etc")


class Output(unittest.TestCase):
    def test_voice_key_matches_the_page(self):
        # The same string is pinned in lib/dub/dub.test.ts.
        self.assertEqual(
            booth.voice_key({"kind": "design", "prompt": "gruff"}),
            '{"file":null,"kind":"design","prompt":"gruff","speaker":null}',
        )

    def test_srt_timecodes(self):
        out = booth.to_srt([{"start": 3661.5, "end": 3662, "text": "Hi"}, {"start": 1, "end": 2, "text": " "}])
        self.assertIn("01:01:01,500 --> 01:01:02,000\nHi", out)
        self.assertNotIn("\n2\n", out)

    def test_voices_cluster_apart(self):
        import numpy as np

        low = np.array([1.0, 0, 0]); high = np.array([0, 1.0, 0])
        self.assertEqual(booth.cluster_voices([low, low + 0.01, high, None, low]), [0, 0, 1, 1, 0])


if __name__ == "__main__":
    unittest.main()
