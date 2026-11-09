"""vh_analyze profile：把同一作者 / 同一类视频的多份 analysis.json 聚合成分布（中位数与 P10–P90）。
一条视频只说明这一条；3–5 条里稳定的部分才是风格。结果是诊断参考，不是闸门。"""
from __future__ import annotations

import json
from pathlib import Path

from .color import merge_palettes
from .util import pct, write_json


def build(paths: list[str], out: str) -> dict:
    A = [json.loads(Path(p).read_text()) for p in paths]
    prof = {
        "schema": "vh_analyze.profile.v1",
        "videos": [a["source"]["path"] for a in A],
        "rhythm": {
            "segment_s": pct([g["dur"] for a in A for g in a["rhythm"]["segments"]]),
            "shot_s": pct([x for a in A for x in _shots(a)]),
            "boundaries_per_min": pct([_dig(a, ("rhythm", "boundaries_per_min")) for a in A]),
            "cuts_per_min": pct([_dig(a, ("rhythm", "cuts_per_min")) for a in A]),
        },
        "narration": {
            "boundary_in_pause_share": pct([_dig(a, ("narration", "boundary_in_pause_share")) for a in A]),
            "phrase_alignment_gain": pct([_dig(a, ("narration", "phrase_alignment_gain")) for a in A]),
            "pauses_per_min": pct([_dig(a, ("narration", "pauses_per_min")) for a in A]),
        },
        "design": {
            "palette": merge_palettes([[{**c, "oklab": c.get("oklab", [c["L"], 0, 0])} for c in g.get("palette", [])] for a in A for g in a["rhythm"]["segments"]], k=8),
            "L": pct([g.get("L") for a in A for g in a["rhythm"]["segments"]]),
            "C": pct([g.get("C") for a in A for g in a["rhythm"]["segments"]]),
        },
    }
    write_json(Path(out), prof)
    return prof


def _dig(a, ks):
    for k in ks:
        a = None if a is None else a.get(k)
    return a


def _shots(a):
    b = [0.0] + a["rhythm"]["cuts"] + [a["source"]["duration_s"]]
    return [y - x for x, y in zip(b, b[1:]) if y > x]
