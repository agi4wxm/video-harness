"""profile_build：把同一参考集多个视频的分析结果聚合为 reference-profile.json。

原则：风格是分布。逐镜 / 逐条目的原始值跨视频合并后再取分位数；
视频级指标（如每分钟切镜数）以"每个视频一个值"的分布给出。
按画幅分组，不同画幅不混合。
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans

from .color import merge_palettes
from .util import SCHEMA_VERSION, pct, write_json


def _load(vdir: Path) -> dict | None:
    try:
        return {
            "measures": json.loads((vdir / "measures.json").read_text()),
            "shots": json.loads((vdir / "shots.json").read_text()),
            "ocr": json.loads((vdir / "ocr.json").read_text()),
        }
    except FileNotFoundError:
        return None


def _easing_clusters(entrances: list[dict], k: int = 3) -> list[dict]:
    pts = np.asarray([e["bezier"] for e in entrances if e.get("bezier") and e.get("bezier_rmse", 1) <= 0.08])
    if len(pts) < k:
        return []
    km = KMeans(n_clusters=k, n_init=5, random_state=0).fit(pts)
    share = np.bincount(km.labels_, minlength=k) / len(km.labels_)
    return [
        {"bezier": [round(float(v), 3) for v in km.cluster_centers_[i]], "share": round(float(share[i]), 3)}
        for i in np.argsort(-share)
    ]


def _count(xs) -> dict:
    out: dict = {}
    for x in xs:
        if x is None:
            continue
        out[x] = out.get(x, 0) + 1
    tot = sum(out.values()) or 1
    return {k: round(v / tot, 3) for k, v in sorted(out.items(), key=lambda kv: -kv[1])}


def _group_profile(vids: list[dict]) -> dict:
    M = [v["measures"] for v in vids]
    shots = [s for v in vids for s in v["shots"]["shots"]]
    segs = [g for v in vids for g in v["shots"].get("segments", [])]
    align = [a for v in vids for a in v["shots"]["align"]]
    ents = [e for v in vids for e in v["shots"]["entrances"] if e.get("ok")]
    items = [it for v in vids for it in v["ocr"]["items"]]
    caps = [it for it in items if it.get("kind") == "caption"]
    gfx = [it for it in items if it.get("kind") == "graphic"]
    labels = [g["label"] for g in segs if g.get("label")]

    def vv(path):
        out = []
        for m in M:
            cur = m
            for k in path:
                cur = None if cur is None else cur.get(k)
            out.append(cur)
        return out

    return {
        "videos": [m["video_id"] for m in M],
        "duration_s": pct([m["L0"]["duration_s"] for m in M]),
        "rhythm": {
            "shot_duration_s": pct([s["dur"] for s in shots]),
            "cuts_per_min": pct(vv(["L1", "cuts_per_min"])),
            "first_cut_s": pct(vv(["L1", "first_cut_s"])),
            "segment_duration_s": pct([g["dur"] for g in segs]),
            "boundaries_per_min": pct(vv(["L1", "boundaries_per_min"])),
            "segments_per_shot": pct([x.get("n_segments") for x in shots]),
            "cut_to_word_boundary_ms": pct([a["to_word_ms"] for a in align if a.get("kind", "cut") == "cut"]),
            "boundary_to_word_boundary_ms": pct([a["to_word_ms"] for a in align]),
            "boundary_to_segment_boundary_ms": pct([a["to_segment_ms"] for a in align]),
            "cut_in_pause_share": pct(vv(["L1", "cut_in_pause_share"])),
            "speech_chars_per_min": pct(vv(["L1", "speech", "chars_per_min"])),
            "speech_pauses_per_min": pct(vv(["L1", "speech", "pauses_per_min"])),
            "speech_lead_in_s": pct(vv(["L1", "speech", "lead_in_s"])),
        },
        "visual": {
            "layout": {
                "templated_share": round(float(np.mean([bool(m["L2"]["layout"]["templated"]) for m in M])), 3),
                "content_box": [m["L2"]["layout"]["content_box"] for m in M],
                "content_area_ratio": pct([m["L2"]["layout"]["content_area_ratio"] for m in M]),
            },
            "palette": merge_palettes([g["palette"] for g in segs if g.get("palette")], k=8),
            "frame_L_mean": pct([g.get("L_mean") for g in segs]),
            "frame_C_mean": pct([g.get("C_mean") for g in segs]),
            "caption": None if not caps else {
                "h_ratio": pct([it["h_ratio"] for it in caps]),
                "center_y": pct([it["cy"] for it in caps]),
                "chars_per_line": pct([it["chars"] for it in caps]),
                "hold_s": pct([it["dur"] for it in caps]),
            },
            "graphic_text": None if not gfx else {
                "h_ratio": pct([it["h_ratio"] for it in gfx]),
                "chars_per_line": pct([it["chars"] for it in gfx]),
                "hold_s": pct([it["dur"] for it in gfx]),
                "hold_vs_reading": pct([it["dur"] / max(0.8, it["chars"] / 7) for it in gfx]),
                "groups_on_screen_p90": pct([(m["L2"]["graphic_text"] or {}).get("groups_on_screen", {}).get("p90") for m in M]),
                "share_time_with_graphic_text": pct([(m["L2"]["graphic_text"] or {}).get("share_time_with_graphic_text") for m in M]),
            },
        },
        "motion": {
            "flow_mean": pct([s["motion_flow_mean"] for s in shots], digits=4),
            "static_max_s": pct(vv(["L3", "static_intervals", "max_s"])),
            "motion_speech_corr": pct(vv(["L3", "motion_speech_corr"])),
            "entrance": {
                "n": len(ents),
                "dur_s": pct([e["dur_s"] for e in ents]),
                "dur_10_90_s": pct([e["dur_10_90_s"] for e in ents]),
                "pop_share": round(float(np.mean([e.get("kind") == "pop" for e in ents])), 3) if ents else None,
                "slide_ratio": pct([e["slide_ratio"] for e in ents if e["slide_ratio"] > 0.02], digits=4),
                "slide_share": round(float(np.mean([e["slide_ratio"] > 0.02 for e in ents])), 3) if ents else None,
                "slide_dirs": _count([e.get("slide_dir") for e in ents]),
                "nearest_named": _count([e.get("nearest_named") for e in ents]),
                "easing_clusters": _easing_clusters(ents),
            },
        },
        "audio": {
            "integrated_lufs": pct(vv(["L0", "loudness", "integrated_lufs"])),
            "true_peak_dbtp": pct(vv(["L0", "loudness", "true_peak_dbtp"])),
            "tempo_bpm": pct(vv(["L4", "tempo_bpm"])),
            "beat_confidence": pct(vv(["L4", "beat_confidence"])),
            "boundary_to_beat_ms": pct([a["to_beat_ms"] for a in align]),
        },
        "rhetoric": None if not labels else {
            "labeled_segments": len(labels),
            "shot_type_share": _count([l.get("shot_type") for l in labels]),
            "metaphor_share": _count([l.get("metaphor") for l in labels]),
            "cut_in_share": _count([l.get("cut_in") for l in labels]),
            "emphasis_share": _count([l.get("emphasis_treatment") for l in labels]),
        },
        "measurement_quality": {
            m["video_id"]: m["E1"] for m in M
        },
    }


def build_profile(videos_dir: str, out: str, author: str | None = None) -> dict:
    vids = [v for d in sorted(Path(videos_dir).iterdir()) if d.is_dir() and (v := _load(d))]
    groups: dict[str, list[dict]] = {}
    for v in vids:
        groups.setdefault(v["measures"]["L0"]["aspect"], []).append(v)
    profile = {
        "schema": SCHEMA_VERSION,
        "source": {"author": author, "n_videos": len(vids)},
        "by_aspect": {k: _group_profile(g) for k, g in groups.items()},
        "unmeasured": [
            "配乐压低幅度（需要人声 / 配乐分离）",
            "音效与画面击打点对齐（需要区分音效与人声起音点）",
            "缩放 / 旋转类入场的曲线（当前只跟踪平移和淡入）",
            "非文字元素（图标、图形、3D 物体）的入场动效",
            "L5 修辞标签：由客户端模型通过 segments_label 写回后才会出现在 rhetoric 中",
        ],
    }
    write_json(Path(out), profile)
    return {"out": out, "groups": {k: len(g) for k, g in groups.items()}}
