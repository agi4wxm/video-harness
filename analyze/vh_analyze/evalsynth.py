"""合成评测集打分：vh eval synth 渲染的视频（真值来自场景图）→ 运行检测 → 切点 / 节拍的精确率与召回。

- 硬切（cut）：容差 2 帧；
- 转场（fade / push / wipe / zoom）：检测到的切点或节拍落在转场区间 ±2 帧内即算命中；
- 文字出现事件（text_events）作为"视觉节拍"真值的代理：检测到的边界在事件后 0.6s 内算命中（入场动画需要时间）。
"""
from __future__ import annotations

import json
from pathlib import Path

from .analyze import run
from .util import write_json


def _hard(hit: int, ok_pred: int, n_pred: int, n_true: int) -> dict:
    """召回按真实硬切算；精确率允许检测到的切点落在转场区间内（转场也是真实的镜头边界）。"""
    p = ok_pred / n_pred if n_pred else None
    r = hit / n_true if n_true else None
    f = 2 * p * r / (p + r) if p and r else None
    return {"precision": None if p is None else round(p, 3), "recall": None if r is None else round(r, 3), "f1": None if f is None else round(f, 3), "tp": hit, "pred": n_pred, "true": n_true}


def score_one(truth: dict, ana: dict, fps: float = 30.0) -> dict:
    tol = 2 / fps
    cuts = ana["rhythm"]["cuts"]
    marks = sorted(cuts + ana["rhythm"]["beats"])
    hard = [c for c in truth["cuts"] if c["kind"] == "cut"]
    soft = [c for c in truth["cuts"] if c["kind"] != "cut"]
    hit_hard = sum(any(abs(p - c["t"]) <= tol for p in cuts) for c in hard)
    hit_soft = sum(any(c["t"] - c["duration"] - tol <= p <= c["t"] + tol for p in marks) for c in soft)
    true_cut_t = [c["t"] for c in hard]
    # 精确率：检测到的硬切是否对应某个真实切点 / 转场
    ok_pred = sum(any(abs(p - t) <= tol for t in true_cut_t) or any(c["t"] - c["duration"] - tol <= p <= c["t"] + tol for c in soft) for p in cuts)
    # 视觉节拍：文字出现事件（排除镜头开头 0.8s 内的，它们和切点重合）
    starts = [0.0] + [c["t"] for c in truth["cuts"]]
    ev = sorted({round(e["t"], 2) for e in truth["text_events"] if all(not (0 <= e["t"] - s < 0.8) for s in starts)})
    merged = []
    for t in ev:
        if not merged or t - merged[-1] > 0.5:
            merged.append(t)
    hit_ev = sum(any(0 - tol <= p - t <= 0.6 for p in marks) for t in merged)
    return {
        "hard_cut": _hard(hit_hard, ok_pred, len(cuts), len(hard)),
        "transition_recall": None if not soft else round(hit_soft / len(soft), 3),
        "text_event_recall": None if not merged else round(hit_ev / len(merged), 3),
        "n": {"hard": len(hard), "soft": len(soft), "text_events": len(merged), "pred_cuts": len(cuts), "pred_beats": len(ana["rhythm"]["beats"])},
    }


def score_dir(root: str) -> dict:
    rows = []
    for d in sorted(Path(root).glob("v*")):
        if not (d / "truth.json").exists() or not (d / "video.mp4").exists():
            continue
        truth = json.loads((d / "truth.json").read_text())
        ana = run(str(d / "video.mp4"), str(d / "analysis"), sheets=False)
        rows.append({"video": d.name, **score_one(truth, ana)})
    tp = sum(r["hard_cut"]["tp"] for r in rows)
    pred = sum(r["n"]["pred_cuts"] for r in rows)
    true = sum(r["n"]["hard"] for r in rows)
    prec_num = sum((r["hard_cut"]["precision"] or 0) * r["n"]["pred_cuts"] for r in rows)
    soft_n = sum(r["n"]["soft"] for r in rows)
    ev_n = sum(r["n"]["text_events"] for r in rows)
    agg = {
        "hard_cut_recall": round(tp / true, 3) if true else None,
        "hard_cut_precision": round(prec_num / pred, 3) if pred else None,
        "transition_recall": round(sum((r["transition_recall"] or 0) * r["n"]["soft"] for r in rows) / soft_n, 3) if soft_n else None,
        "text_event_recall": round(sum((r["text_event_recall"] or 0) * r["n"]["text_events"] for r in rows) / ev_n, 3) if ev_n else None,
        "videos": len(rows),
    }
    res = {"aggregate": agg, "videos": rows}
    write_json(Path(root) / "results.json", res)
    return res
