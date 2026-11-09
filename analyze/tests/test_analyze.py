import subprocess
from pathlib import Path

import numpy as np

from vh_analyze.analyze import narration_alignment, run
from vh_analyze.color import palette


def _video(tmp: Path) -> Path:
    """三段纯色 + 移动方块，硬切在 2.0s 和 4.0s。"""
    out = tmp / "v.mp4"
    parts = []
    for i, c in enumerate(["0x3050C0", "0xE0A040", "0x40B070"]):
        p = tmp / f"p{i}.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c={c}:s=640x360:r=30:d=2",
                        "-vf", "drawbox=x='40+t*120':y=140:w=80:h=80:color=white:t=fill", "-pix_fmt", "yuv420p", str(p)], check=True)
        parts.append(p)
    lst = tmp / "l.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in parts))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(out)], check=True)
    return out


def test_cuts_detected(tmp_path):
    res = run(str(_video(tmp_path)), str(tmp_path / "out"), sheets=False)
    cuts = res["rhythm"]["cuts"]
    assert len(cuts) == 2
    assert abs(cuts[0] - 2.0) < 0.07 and abs(cuts[1] - 4.0) < 0.07
    assert (tmp_path / "out" / "analysis.json").exists()


def test_palette_finds_dominant_color():
    img = np.zeros((40, 40, 3), np.uint8)
    img[:, :30] = (230, 80, 120)
    img[:, 30:] = (20, 20, 60)
    pal = palette(img, k=2)
    assert pal[0]["share"] > 0.7
    assert pal[0]["hex"].upper() in ("#E65078", "#E65079", "#E64F78")


def test_narration_alignment_vs_random():
    words = [{"w": f"w{i}", "s": i * 0.3 + (i // 10) * 1.0, "e": i * 0.3 + 0.25 + (i // 10) * 1.0} for i in range(60)]
    segs = [{"text": "x", "s": words[k]["s"], "e": words[k + 9]["e"]} for k in range(0, 60, 10)]
    bounds = [words[k + 1]["s"] - 0.05 for k in range(9, 59, 10)]  # 停顿里、紧贴下一句开头
    r = narration_alignment(bounds, {"backend": "test", "words": words, "segments": segs})
    assert r["boundary_in_pause_share"] == 1.0
    assert r["phrase_alignment_gain"] > 1.5
