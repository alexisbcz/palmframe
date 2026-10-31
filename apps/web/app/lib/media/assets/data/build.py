#!/usr/bin/env python3
"""Regenerates the embedded data files. Needs fonttools and brotli.

  python build.py <dir with the source fonts> <countries-50m.json> <index_bg.wasm>

Fonts come from github.com/google/fonts (ofl/), the shapes from the npm package
world-atlas, the wasm from the installed @resvg/resvg-wasm. Rerun after upgrading
resvg: a test compares the embedded copy with the installed one.

Everything is embedded as brotli and base64 inside TypeScript modules so that it
reaches the Vercel function through the bundle, and not through file tracing,
which never sees files read at runtime. resvg reads TTF and OTF only.
"""
import base64, json, os, sys, tempfile
import brotli
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

src, atlas, wasm = sys.argv[1:4]
here = os.path.dirname(os.path.abspath(__file__))


def chars_of(encoding, ranges):
    out = set()
    for lo, hi in ranges:
        for a in range(lo, hi):
            for b in range(0xA1, 0xFF):
                try:
                    out.update(ord(c) for c in bytes([a, b]).decode(encoding))
                except UnicodeDecodeError:
                    pass
    return out


def span(*ranges):
    return {c for lo, hi in ranges for c in range(lo, hi + 1)}


PUNCT = span((0x20, 0x7E), (0xA0, 0xFF), (0x2000, 0x206F), (0x20A0, 0x20C0), (0x2212, 0x2212), (0x2248, 0x2248))
# Arabic and Hebrew name their font first, so it has to carry spaces and digits.
BASIC = span((0x20, 0x7E), (0xA0, 0xA0))
LATIN = PUNCT | span((0x100, 0x24F), (0x1E00, 0x1EFF))
KANA = span((0x3000, 0x30FF), (0x31F0, 0x31FF), (0xFF00, 0xFFEF))
JP = KANA | PUNCT | chars_of("euc_jp", [(0xA1, 0xFF)])
SC = KANA | chars_of("gb2312", [(0xB0, 0xF8)])
KR = KANA | span((0x1100, 0x11FF), (0x3130, 0x318F)) | chars_of("euc_kr", [(0xB0, 0xC9)])

FACES = [
    # name, source, axes, charset, output group
    ("Palmframe Display", "Archivo[wdth,wght].ttf", {"wdth": 68, "wght": 900}, LATIN, "core"),
    ("Palmframe Text", "Archivo[wdth,wght].ttf", {"wdth": 88, "wght": 500}, LATIN, "core"),
    ("Palmframe Text", "Archivo[wdth,wght].ttf", {"wdth": 88, "wght": 700}, LATIN, "core"),
    ("Noto Sans", "NotoSans[wdth,wght].ttf", {"wdth": 100, "wght": 700}, span((0x370, 0x3FF), (0x400, 0x52F)), "world"),
    ("Noto Sans Arabic", "NotoSansArabic[wdth,wght].ttf", {"wdth": 100, "wght": 700},
     BASIC | span((0x600, 0x6FF), (0x750, 0x77F), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF)), "world"),
    ("Noto Sans Hebrew", "NotoSansHebrew[wdth,wght].ttf", {"wdth": 100, "wght": 700},
     BASIC | span((0x590, 0x5FF), (0xFB1D, 0xFB4F)), "world"),
    ("Noto Sans JP", "NotoSansJP[wght].ttf", {"wght": 700}, JP, "cjk"),
    ("Noto Sans SC", "NotoSansSC[wght].ttf", {"wght": 700}, SC, "cjk"),
    ("Noto Sans KR", "NotoSansKR[wght].ttf", {"wght": 700}, KR, "cjk"),
]


def build_face(name, file, axes, charset):
    font = TTFont(os.path.join(src, file))
    axes = {a.axisTag: axes[a.axisTag] for a in font["fvar"].axes}
    font = instantiateVariableFont(font, axes)
    opts = Options()
    opts.layout_features = ["*"]
    opts.hinting = False
    opts.notdef_outline = True
    opts.name_IDs = ["*"]
    sub = Subsetter(opts)
    sub.populate(unicodes=charset)
    sub.subset(font)
    # Instances of one family would otherwise all carry the variable font's name.
    weight = axes["wght"]
    font["OS/2"].usWeightClass = weight
    style = "Bold" if weight >= 700 else "Regular"
    for rec in list(font["name"].names):
        if rec.nameID in (16, 17, 21, 22):
            font["name"].removeNames(nameID=rec.nameID)
    for nid, value in ((1, name), (2, style), (4, f"{name} {weight}"), (6, f"{name.replace(' ', '')}-{weight}")):
        font["name"].setName(value, nid, 3, 1, 0x409)
    font["head"].macStyle = 1 if weight >= 700 else 0
    font["OS/2"].fsSelection = (font["OS/2"].fsSelection & ~0x61) | (0x20 if weight >= 700 else 0x40)
    with tempfile.NamedTemporaryFile(suffix=".ttf") as tmp:
        font.save(tmp.name)
        data = open(tmp.name, "rb").read()
    return data, font


def emit(name, payload):
    packed = base64.b64encode(brotli.compress(payload, quality=11)).decode()
    path = os.path.join(here, f"{name}.gen.ts")
    with open(path, "w") as f:
        f.write(f'export default "{packed}"\n')
    print(f"{name}: {len(payload) // 1024} KB raw, {len(packed) // 1024} KB embedded")


def ranges_of(codes):
    out, codes = [], sorted(codes)
    for c in codes:
        if out and out[-1][1] == c - 1:
            out[-1][1] = c
        else:
            out.append([c, c])
    return out


groups, coverage, metrics = {}, {}, {}
for name, file, axes, charset, group in FACES:
    data, font = build_face(name, file, axes, charset)
    groups.setdefault(group, []).append(data)
    cmap = font.getBestCmap()
    coverage.setdefault(group, set()).update(cmap)
    print(f"{name} {axes}: {len(cmap)} chars, {len(data) // 1024} KB")
    if group == "core":
        hmtx, upem = font["hmtx"], font["head"].unitsPerEm
        key = "display" if name.endswith("Display") else f"text{axes['wght']}"
        metrics[key] = {str(c): round(hmtx[g][0] * 1000 / upem) for c, g in cmap.items()}

for group, faces in groups.items():
    # Length-prefixed so one blob stays one brotli stream with shared context.
    blob = b"".join(len(f).to_bytes(4, "big") + f for f in faces)
    emit(f"fonts-{group}", blob)

with open(os.path.join(here, "metrics.gen.ts"), "w") as f:
    f.write("// Advance widths in thousandths of an em, and which code points each font group covers.\n")
    f.write("export const metrics = " + json.dumps(
        {"display": metrics["display"], "text": metrics["text500"], "bold": metrics["text700"]},
        separators=(",", ":")) + "\n")
    f.write("export const coverage = " + json.dumps(
        {k: ranges_of(v) for k, v in coverage.items()}, separators=(",", ":")) + "\n")

emit("world", open(atlas, "rb").read())
emit("resvg", open(wasm, "rb").read())
