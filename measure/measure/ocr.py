"""L2 文字测量：OCR 采样、跨帧合并为文字条目、区分字幕 / 画面文字 / 常驻水印。"""
from __future__ import annotations

import difflib

import numpy as np

from .util import iter_frames, log, scaled_size

OCR_SHORT_SIDE = 540
MIN_SCORE = 0.6


def _engine():
    from rapidocr_onnxruntime import RapidOCR

    return RapidOCR()


def sample_ocr(path: str, info: dict, fps: float = 2.0) -> list[dict]:
    w, h = scaled_size(info["width"], info["height"], OCR_SHORT_SIDE)
    eng = _engine()
    samples = []
    for i, rgb in enumerate(iter_frames(path, (w, h), fps=fps)):
        t = round(i / fps, 3)
        res, _ = eng(rgb[..., ::-1])  # RapidOCR 期望 BGR
        boxes = []
        for pts, text, score in res or []:
            if float(score) < MIN_SCORE or not text.strip():
                continue
            pts = np.asarray(pts, float)
            x0, y0 = pts.min(axis=0)
            x1, y1 = pts.max(axis=0)
            boxes.append({
                "text": text.strip(),
                "score": round(float(score), 3),
                "box": [round(x0 / w, 4), round(y0 / h, 4), round(x1 / w, 4), round(y1 / h, 4)],
            })
        samples.append({"t": t, "boxes": boxes})
        if i % 60 == 0:
            log(f"ocr t={t:.0f}s")
    return samples


def _iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def _sim(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()


def track_items(samples: list[dict], step: float) -> list[dict]:
    """把相邻采样中位置相近、文字相近的框合并成一个文字条目。"""
    items: list[dict] = []
    active: list[dict] = []
    for s in samples:
        nxt = []
        used = set()
        for b in s["boxes"]:
            best, best_score = None, 0.0
            for k, it in enumerate(active):
                if k in used:
                    continue
                sc = _iou(it["box"], b["box"]) * 0.5 + _sim(it["text"], b["text"]) * 0.5
                if sc > best_score:
                    best, best_score = k, sc
            if best is not None and best_score >= 0.6:
                it = active[best]
                used.add(best)
                it["last_t"] = s["t"]
                it["n"] += 1
                if len(b["text"]) > len(it["text"]):
                    it["text"] = b["text"]
                it["box"] = b["box"]
                nxt.append(it)
            else:
                it = {"text": b["text"], "box": b["box"], "first_box": b["box"], "first_t": s["t"], "last_t": s["t"], "n": 1}
                items.append(it)
                nxt.append(it)
        active = nxt
    for it in items:
        it["dur"] = round(it["last_t"] - it["first_t"] + step, 3)
        x0, y0, x1, y1 = it["box"]
        it["h_ratio"] = round(y1 - y0, 4)
        it["cy"] = round((y0 + y1) / 2, 4)
        it["chars"] = len(it["text"])
    return items


def classify_items(items: list[dict], words: list[dict] | None, duration: float) -> None:
    """kind ∈ caption（与语音一致的字幕）/ persistent（常驻水印、台标）/ graphic（画面文字）。"""
    for it in items:
        if it["dur"] >= 0.3 * duration:
            it["kind"] = "persistent"
            continue
        it["kind"] = "graphic"
        if words and it["chars"] >= 3:
            win = "".join(w["w"] for w in words if w["e"] >= it["first_t"] - 1.0 and w["s"] <= it["last_t"] + 1.5)
            if win:
                hit = sum(1 for c in it["text"] if c in win) / it["chars"]
                it["asr_overlap"] = round(hit, 3)
                if hit >= 0.6:
                    it["kind"] = "caption"


def caption_agreement(items: list[dict], words: list[dict] | None) -> dict | None:
    """E1 交叉验证：字幕 OCR 文字与 ASR 文字的字符一致率（两个独立工具互相印证）。"""
    caps = [it for it in items if it["kind"] == "caption"]
    if not caps or not words:
        return None
    ratios = []
    for it in caps:
        win = "".join(w["w"] for w in words if w["e"] >= it["first_t"] - 0.5 and w["s"] <= it["last_t"] + 1.0)
        m = difflib.SequenceMatcher(None, it["text"], win)
        matched = sum(b.size for b in m.get_matching_blocks())
        ratios.append(matched / max(1, it["chars"]))
    return {"n_captions": len(caps), "char_agreement_mean": round(float(np.mean(ratios)), 3)}


def lines_on_screen(samples: list[dict], items: list[dict], kind: str = "graphic") -> list[int]:
    """每个采样时刻某类文字的行数。"""
    boxes_by_t: dict[float, int] = {}
    for it in items:
        if it["kind"] != kind:
            continue
        for s in samples:
            if it["first_t"] <= s["t"] <= it["last_t"]:
                boxes_by_t[s["t"]] = boxes_by_t.get(s["t"], 0) + 1
    return [boxes_by_t.get(s["t"], 0) for s in samples]


def groups_on_screen(samples: list[dict], items: list[dict]) -> list[int]:
    """把纵向相邻（间距小于一行高）的画面文字行合并成组，统计每个采样时刻的组数。"""
    out = []
    for s in samples:
        active = sorted(
            [it for it in items if it["kind"] == "graphic" and it["first_t"] <= s["t"] <= it["last_t"]],
            key=lambda it: it["box"][1],
        )
        groups, last_bottom, last_h = 0, None, None
        for it in active:
            x0, y0, x1, y1 = it["box"]
            if last_bottom is None or y0 - last_bottom > max(last_h, y1 - y0):
                groups += 1
            last_bottom, last_h = y1, y1 - y0
        out.append(groups)
    return out
