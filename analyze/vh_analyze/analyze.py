"""vh_analyze run：对一条视频（参考片或自己的成片）测量节奏、旁白关系与色彩，写 analysis.json。

测量的是 rea-video 不做的部分（rea-video 负责逐镜制作方式、包装层、声音分轨）：
- 版式感知：先找出全片不变的模板区域，切点 / 节拍只在内容区里算；
- 两级时间结构：硬切 → 镜头内的视觉节拍（MG 讲解的主要节奏单位）；
- 旁白锚定：逐词时间戳 → 停顿；画面变化落在停顿里的比例、对齐短语边界相对随机的倍数；
- 设计体系：OKLab 调色板、画面亮度 / 彩度分布。
同一套代码分析参考视频和检测成片，两边数字可以直接比较。
"""
from __future__ import annotations

import time
from pathlib import Path

import numpy as np

from . import asr as asr_mod
from .color import frame_stats, merge_palettes, palette
from .layout import detect_layout
from .scan import scan, static_intervals
from .util import SCHEMA, grab_frame, log, pct, scaled_size, video_info, write_json


def narration_alignment(boundaries: list[float], asr: dict, seed: int = 0) -> dict:
    """边界与旁白的关系，都和同一视频内的随机时刻比较（中文逐字时间戳很密，不比较随机就没有意义）。"""
    words = asr["words"]
    pz = asr_mod.pauses(words)
    span = words[-1]["e"] - words[0]["s"]
    seg_b = np.asarray(sorted({x["s"] for x in asr["segments"]} | {x["e"] for x in asr["segments"]}))
    ts = np.asarray([b for b in boundaries if words[0]["s"] <= b <= words[-1]["e"] + 0.5])
    rng = np.random.default_rng(seed)
    rand = rng.uniform(words[0]["s"], words[-1]["e"], size=2000)

    def in_pause(t: float) -> bool:
        return any(p["s"] - 0.05 <= t <= p["e"] + 0.05 for p in pz)

    def dist(arr, t):
        return float(np.min(np.abs(arr - t))) if arr.size else np.nan

    real_d = [dist(seg_b, t) for t in ts]
    rand_d = [dist(seg_b, t) for t in rand]
    return {
        "backend": asr.get("backend"),
        "words": len(words),
        "words_per_min": round(len(words) / (span / 60), 1) if span > 0 else None,
        "pauses_per_min": round(len(pz) / (span / 60), 1) if span > 0 else None,
        "pause_s": pct([p["dur"] for p in pz]),
        "boundary_in_pause_share": round(float(np.mean([in_pause(t) for t in ts])), 3) if ts.size else None,
        "random_in_pause_share": round(float(np.mean([in_pause(t) for t in rand[:400]])), 3),
        "phrase_alignment_gain": round(float(np.nanmedian(rand_d) / max(1e-6, np.nanmedian(real_d))), 2) if ts.size and seg_b.size else None,
        "note": "gain = 随机时刻到最近语句边界的中位距离 ÷ 实际边界的中位距离；≈1 没有对齐，>1.5 明显对齐",
    }


def run(path: str, out_dir: str, asr_backend: str = "none", lang: str = "en", sheets: bool = True) -> dict:
    t0 = time.time()
    info = video_info(path)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    dur, fps = info["duration_s"], info["fps"]
    log(f"{Path(path).name}: {info['width']}x{info['height']} {fps}fps {dur:.1f}s")

    layout = detect_layout(path, info)
    sc = scan(path, info, layout["content_box"] if layout["templated"] else None)
    cuts = [c["t"] for c in sc["cuts"]]
    # 视觉节拍：与切点相距 < 0.4s 的并入切点；切点 ∪ 节拍 = 段
    beats = [b["t"] for b in sc["beats"] if all(abs(b["t"] - c) >= 0.4 for c in cuts) and 0.4 <= b["t"] <= dur - 0.4]
    marks = sorted([(t, "cut") for t in cuts] + [(t, "beat") for t in beats])
    bounds = [(0.0, "start")] + marks + [(dur, "end")]
    segments = [{"start": round(a, 3), "end": round(b, 3), "dur": round(b - a, 3), "boundary": k}
                for (a, k), (b, _) in zip(bounds, bounds[1:]) if b - a > 0]
    shot_b = [0.0] + cuts + [dur]
    shots = [round(b - a, 3) for a, b in zip(shot_b, shot_b[1:]) if b - a > 0]
    statics = static_intervals(sc["luma"], fps)

    size = scaled_size(info["width"], info["height"], 160)
    pals, stats = [], []
    for g in segments:
        f = grab_frame(path, (g["start"] + g["end"]) / 2, size)
        if f is None:
            continue
        g.update(frame_stats(f))
        pal = palette(f, k=5)
        g["palette"] = pal[:3]
        pals.append(pal)
        stats.append(g)

    asr = asr_mod.transcribe(path, asr_backend, lang) if info["has_audio"] or asr_backend.startswith("file:") else None
    narration = narration_alignment([t for t, _ in marks], asr) if asr and asr.get("words") else None

    res = {
        "schema": SCHEMA,
        "source": {"path": str(Path(path).resolve()), **info},
        "layout": layout,
        "rhythm": {
            "cuts": cuts,
            "beats": beats,
            "segments": segments,
            "cuts_per_min": round(len(cuts) / (dur / 60), 2),
            "boundaries_per_min": round(len(marks) / (dur / 60), 2),
            "shot_s": pct(shots),
            "segment_s": pct([g["dur"] for g in segments]),
            "static_max_s": max([s["dur"] for s in statics] or [0.0]),
            "cut_candidates_rejected": len(sc["cut_candidates"]),
        },
        "narration": narration,
        "design": {
            "palette": merge_palettes(pals, k=8),
            "L": pct([g.get("L") for g in stats]),
            "C": pct([g.get("C") for g in stats]),
        },
        "rea": None,
        "elapsed_s": None,
    }
    if asr:
        write_json(out / "asr.json", asr)
    if sheets:
        from .sheets import cut_review_sheet, overview_sheet, shot_sheets
        segs = [{**g, "id": f"g{i + 1:03d}"} for i, g in enumerate(segments)]
        shot_sheets(path, info, segs, out / "contact")
        overview_sheet(path, info, segs, out / "contact" / "overview.png")
        cut_review_sheet(path, info, sc["cuts"], out / "review" / "cuts.png", f"detected cuts ({len(sc['cuts'])})")
    res["elapsed_s"] = round(time.time() - t0, 1)
    write_json(out / "analysis.json", res)
    log(f"done in {res['elapsed_s']}s → {out / 'analysis.json'}")
    return res
