"""video_analyze：对单个视频跑完 L0–L4 测量，并生成 L5 标注与 E1 复核用的拼图。

输出目录结构（见 docs/01-reference-analysis.md §3.3）：
  measures.json   视频级测量
  shots.json      每镜测量（L5 标签由客户端模型通过 shots_label 写回）
  ocr.json        OCR 采样与文字条目
  asr.json        逐词时间戳
  timeline.npz    逐帧内容分 / 亮度差 / 光流
  contact/        每镜三帧拼图、全片总览
  review/         切点复核拼图（E1）
"""
from __future__ import annotations

import time
from pathlib import Path

import numpy as np

from . import asr as asr_mod
from .audio import measure_audio
from .layout import detect_layout
from .color import frame_stats, palette
from .ocr import caption_agreement, classify_items, groups_on_screen, lines_on_screen, sample_ocr, track_items
from .scan import scan, static_intervals
from .sheets import cut_review_sheet, overview_sheet, shot_sheets
from .track import track_entrance
from .util import SCHEMA_VERSION, grab_frame, log, pct, scaled_size, video_id, video_info, write_json

MAX_ENTRANCES = 60


def analyze(path: str, out_root: str, asr_backend: str = "auto", ocr_fps: float = 2.0, sheets: bool = True) -> dict:
    t_begin = time.time()
    info = video_info(path)
    vid = video_id(path)
    out = Path(out_root) / vid
    out.mkdir(parents=True, exist_ok=True)
    fps = info["fps"]
    dur = info["duration_s"]
    log(f"{vid}: {info['width']}x{info['height']} {fps}fps {dur:.1f}s")

    # ---- L0 / L4 音频
    log("audio")
    audio = measure_audio(path) if info["has_audio"] else None

    # ---- 语音
    log("asr")
    asr = asr_mod.transcribe(path, asr_backend)
    words = asr["words"] if asr else []
    if asr:
        write_json(out / "asr.json", asr)

    # ---- L1 / L3 全帧扫描
    log("layout")
    layout = detect_layout(path, info)
    log(f"layout: content_box={layout['content_box']} templated={layout['templated']}")
    log("scan")
    sc = scan(path, info, layout["content_box"] if layout["templated"] else None)
    np.savez_compressed(out / "timeline.npz", content=sc["content"], luma=sc["luma"], flow=sc["flow"], beat_signal=sc["beat_signal"])
    cut_ts = [c["t"] for c in sc["cuts"]]
    bounds = [0.0] + cut_ts + [dur]
    shots = []
    for i in range(len(bounds) - 1):
        s, e = bounds[i], bounds[i + 1]
        if e - s <= 0:
            continue
        shots.append({"id": f"s{i + 1:03d}", "start": round(s, 3), "end": round(e, 3), "dur": round(e - s, 3)})

    # 视觉节拍：与切点相距 < 0.4s 的节拍并入切点；切点 ∪ 节拍 = 段（segment），段是 L5 标注单位
    beat_ts = [b["t"] for b in sc["beats"] if all(abs(b["t"] - c) >= 0.4 for c in cut_ts) and 0.4 <= b["t"] <= dur - 0.4]
    marks = sorted([(t, "cut") for t in cut_ts] + [(t, "beat") for t in beat_ts])
    seg_bounds_t = [(0.0, "start")] + marks
    segments = []
    for k, (t0, kind) in enumerate(seg_bounds_t):
        t1 = seg_bounds_t[k + 1][0] if k + 1 < len(seg_bounds_t) else dur
        if t1 - t0 <= 0:
            continue
        shot = next(x for x in shots if x["start"] <= t0 + 1e-6 < x["end"] + 1e-6)
        segments.append({"id": f"g{len(segments) + 1:03d}", "shot_id": shot["id"], "start": round(t0, 3), "end": round(t1, 3),
                         "dur": round(t1 - t0, 3), "boundary": kind})
    for x in shots:
        x["n_segments"] = sum(1 for g in segments if g["shot_id"] == x["id"])

    statics = static_intervals(sc["luma"], fps)

    # ---- L2 文字
    log("ocr")
    samples = sample_ocr(path, info, ocr_fps)
    items = track_items(samples, 1.0 / ocr_fps)
    classify_items(items, words, dur)
    write_json(out / "ocr.json", {"fps": ocr_fps, "samples": samples, "items": items})

    # ---- 每镜 / 每段测量
    log("shots")
    for s in shots:
        f0, f1 = int(s["start"] * fps), max(int(s["start"] * fps) + 1, int(s["end"] * fps))
        # 切点所在帧的内容分本身很高，排除每镜首帧
        s["motion_luma_mean"] = round(float(sc["luma"][f0 + 1:f1].mean()) if f1 - f0 > 1 else 0.0, 3)
        s["motion_flow_mean"] = round(float(sc["flow"][f0 + 1:f1].mean()) if f1 - f0 > 1 else 0.0, 4)
        s["static_max_s"] = round(max([min(st["end"], s["end"]) - max(st["start"], s["start"]) for st in statics
                                       if st["end"] > s["start"] and st["start"] < s["end"]] or [0.0]), 3)
    pal_size = scaled_size(info["width"], info["height"], 160)
    for s in segments:
        s["text"] = "".join(w["w"] for w in words if (w["s"] + w["e"]) / 2 >= s["start"] and (w["s"] + w["e"]) / 2 < s["end"])
        s["chars"] = len(s["text"])
        mid = grab_frame(path, (s["start"] + s["end"]) / 2, pal_size)
        if mid is not None:
            s["palette"] = palette(mid, k=5)
            s.update(frame_stats(mid))
        s["graphic_text_items"] = [k for k, it in enumerate(items)
                                   if it["kind"] == "graphic" and s["start"] <= it["first_t"] < s["end"]]
        s["has_caption"] = any(it["kind"] == "caption" and it["first_t"] < s["end"] and it["last_t"] >= s["start"] for it in items)
        s["label"] = None  # L5，由客户端模型通过 segments_label 写回

    # ---- L3 入场动效
    log("entrances")
    cand = [(k, it) for k, it in enumerate(items) if it["kind"] == "graphic" and it["chars"] >= 2 and it["dur"] >= 0.8]
    if len(cand) > MAX_ENTRANCES:
        idx = np.linspace(0, len(cand) - 1, MAX_ENTRANCES).round().astype(int)
        cand = [cand[i] for i in idx]
    entrances = []
    for k, it in cand:
        shot = next((s for s in shots if s["start"] <= it["first_t"] < s["end"]), None)
        r = track_entrance(path, info, it, shot["start"] if shot else 0.0)
        if r is not None:
            r["item"] = k
            r["at_shot_start"] = bool(shot and it["first_t"] - shot["start"] <= 0.5)
            entrances.append(r)

    # ---- 对齐
    word_bounds = np.asarray(sorted({w["s"] for w in words} | {w["e"] for w in words})) if words else np.asarray([])
    seg_bounds = np.asarray(sorted({x["s"] for x in asr["segments"]} | {x["e"] for x in asr["segments"]})) if asr else np.asarray([])
    pz = asr_mod.pauses(words) if words else []
    onsets = np.asarray(audio["onsets"]) if audio else np.asarray([])
    beats = np.asarray(audio["beats"]) if audio else np.asarray([])

    def nearest(arr, t):
        return float(np.min(np.abs(arr - t))) if arr.size else None

    align = []
    for c, kind in marks:
        align.append({
            "t": c,
            "kind": kind,
            "to_word_ms": None if not word_bounds.size else round(nearest(word_bounds, c) * 1000, 1),
            "to_segment_ms": None if not seg_bounds.size else round(nearest(seg_bounds, c) * 1000, 1),
            "in_pause": any(p["s"] - 0.05 <= c <= p["e"] + 0.05 for p in pz),
            "to_onset_ms": None if not onsets.size else round(nearest(onsets, c) * 1000, 1),
            "to_beat_ms": None if not beats.size else round(nearest(beats, c) * 1000, 1),
        })

    # ---- 运动强度与语音能量的相关（10Hz）
    corr = None
    if audio:
        n10 = len(audio["rms_db_10hz"])
        step = fps / 10
        flow10 = np.asarray([sc["flow"][int(i * step): int((i + 1) * step)].mean() if int(i * step) < len(sc["flow"]) else 0
                             for i in range(n10)])
        rms = np.asarray(audio["rms_db_10hz"])
        mask = rms > np.percentile(rms, 20)
        if mask.sum() > 20 and flow10[mask].std() > 0:
            corr = round(float(np.corrcoef(flow10[mask], rms[mask])[0, 1]), 3)

    # ---- 视频级汇总
    speech_span = (words[-1]["e"] - words[0]["s"]) if words else None
    # 只统计至少被 OCR 看到两次的画面文字，单次出现多为闪烁 / 误识别
    graphic = [it for it in items if it["kind"] == "graphic" and it.get("n", 1) >= 2]
    captions = [it for it in items if it["kind"] == "caption"]
    persistent = [it for it in items if it["kind"] == "persistent"]
    graphic_lines = lines_on_screen(samples, items, "graphic")
    graphic_groups = groups_on_screen(samples, items)
    ok_ent = [e for e in entrances if e.get("ok")]

    measures = {
        "schema": SCHEMA_VERSION,
        "video_id": vid,
        "source": Path(path).name,
        "L0": {**info, "aspect": "9:16" if info["height"] > info["width"] else "16:9",
               "loudness": None if not audio else {
                   "integrated_lufs": audio["integrated_lufs"], "true_peak_dbtp": audio["true_peak_dbtp"],
                   "clip_ratio": audio["clip_ratio"], "crosscheck_ffmpeg": audio["crosscheck_ffmpeg"]}},
        "L1": {
            "n_shots": len(shots),
            "cuts_per_min": round(len(cut_ts) / (dur / 60), 2),
            "shot_duration_s": pct([s["dur"] for s in shots]),
            "first_cut_s": cut_ts[0] if cut_ts else None,
            "cut_to_word_ms": pct([a["to_word_ms"] for a in align if a["kind"] == "cut"]),
            "cut_to_segment_ms": pct([a["to_segment_ms"] for a in align if a["kind"] == "cut"]),
            "cut_in_pause_share": round(float(np.mean([a["in_pause"] for a in align if a["kind"] == "cut"])), 3) if cut_ts else None,
            "n_segments": len(segments),
            "boundaries_per_min": round(len(marks) / (dur / 60), 2),
            "segment_duration_s": pct([g["dur"] for g in segments]),
            "boundary_to_word_ms": pct([a["to_word_ms"] for a in align]),
            "boundary_to_segment_ms": pct([a["to_segment_ms"] for a in align]),
            "segments_per_shot": pct([x["n_segments"] for x in shots]),
            "speech": None if not words else {
                "chars": len(words),
                "chars_per_min": round(len(words) / (speech_span / 60), 1),
                "pause_s": pct([p["dur"] for p in pz]),
                "pauses_per_min": round(len(pz) / (speech_span / 60), 1),
                "lead_in_s": round(words[0]["s"], 3),
            },
        },
        "L2": {
            "layout": layout,
            "caption": None if not captions else {
                "n": len(captions),
                "h_ratio": pct([it["h_ratio"] for it in captions]),
                "cy": pct([it["cy"] for it in captions]),
                "chars_per_line": pct([it["chars"] for it in captions]),
            },
            "graphic_text": None if not graphic else {
                "n_items": len(graphic),
                "h_ratio": pct([it["h_ratio"] for it in graphic]),
                "chars_per_line": pct([it["chars"] for it in graphic]),
                "hold_s": pct([it["dur"] for it in graphic]),
                "hold_vs_reading": pct([it["dur"] / max(0.8, it["chars"] / 7) for it in graphic]),
                "lines_on_screen": pct(graphic_lines),
                "groups_on_screen": pct(graphic_groups),
                "share_time_with_graphic_text": round(float(np.mean([g > 0 for g in graphic_lines])), 3),
            },
            "persistent_text": [{"text": it["text"], "box": it["box"]} for it in persistent],
            "frame_L_mean": pct([s.get("L_mean") for s in segments]),
            "frame_C_mean": pct([s.get("C_mean") for s in segments]),
        },
        "L3": {
            "motion_flow_mean": pct([s["motion_flow_mean"] for s in shots], digits=4),
            "static_intervals": {"n": len(statics), "max_s": max([x["dur"] for x in statics] or [0]), "dur_s": pct([x["dur"] for x in statics])},
            "entrances": {
                "tracked": len(entrances), "ok": len(ok_ent),
                "dur_s": pct([e["dur_s"] for e in ok_ent]),
                "dur_10_90_s": pct([e["dur_10_90_s"] for e in ok_ent]),
                "pop_share": round(float(np.mean([e.get("kind") == "pop" for e in ok_ent])), 3) if ok_ent else None,
                "slide_ratio": pct([e["slide_ratio"] for e in ok_ent], digits=4),
                "slide_dirs": _count([e["slide_dir"] for e in ok_ent if e.get("slide_dir")]),
                "nearest_named": _count([e["nearest_named"] for e in ok_ent if e.get("nearest_named")]),
            },
            "motion_speech_corr": corr,
        },
        "L4": None if not audio else {
            "tempo_bpm": audio["tempo_bpm"], "beat_confidence": audio["beat_confidence"],
            "boundary_to_onset_ms": pct([a["to_onset_ms"] for a in align]),
            "boundary_to_beat_ms": pct([a["to_beat_ms"] for a in align]),
            "onsets_per_min": round(len(audio["onsets"]) / (dur / 60), 1),
        },
        "E1": {
            "loudness_crosscheck_delta_lu": None if not audio or audio["crosscheck_ffmpeg"]["integrated_lufs"] is None
            else round(audio["integrated_lufs"] - audio["crosscheck_ffmpeg"]["integrated_lufs"], 2),
            "caption_ocr_vs_asr": caption_agreement(items, words),
            "cut_candidates_rejected": len(sc["cut_candidates"]),
        },
        "elapsed_s": None,
    }

    write_json(out / "shots.json", {"video_id": vid, "shots": shots, "segments": segments, "cuts": sc["cuts"],
                                    "cut_candidates": sc["cut_candidates"], "visual_beats": sc["beats"],
                                    "align": align, "entrances": entrances, "static_intervals": statics})

    if sheets:
        log("sheets")
        shot_sheets(path, info, segments, out / "contact")
        overview_sheet(path, info, segments, out / "contact" / "overview.png")
        cut_review_sheet(path, info, sc["cuts"], out / "review" / "cuts.png", f"{vid} detected cuts ({len(sc['cuts'])})")
        # 只复核"接近阈值"的被拒候选，用于估计漏检（召回）
        near = sorted([c for c in sc["cut_candidates"] if c.get("d", 0) >= 0.3], key=lambda c: -c["d"])[:40]
        cut_review_sheet(path, info, sorted(near, key=lambda c: c["t"]), out / "review" / "candidates.png",
                         f"{vid} rejected candidates with d>=0.3 ({len(near)})")

    measures["elapsed_s"] = round(time.time() - t_begin, 1)
    write_json(out / "measures.json", measures)
    log(f"{vid}: done in {measures['elapsed_s']}s")
    return measures


def _count(xs) -> dict:
    out: dict = {}
    for x in xs:
        out[x] = out.get(x, 0) + 1
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))
