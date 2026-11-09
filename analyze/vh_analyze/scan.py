"""单次全帧扫描：切点检测（L1）+ 运动强度 / 光流（L3）。

切点检测采用与 PySceneDetect AdaptiveDetector 相同的思路：
HSV 三通道帧间差均值作为内容分，再除以邻域均值得到自适应比值。
"""
from __future__ import annotations

import cv2
import numpy as np

from .util import iter_frames, scaled_size

SCAN_SHORT_SIDE = 216
FLOW_SHORT_SIDE = 108


def scan(path: str, info: dict, content_box: list[float] | None = None) -> dict:
    """content_box：只在该区域内计算切点内容分和运动（归一化坐标），None 表示整帧。"""
    w, h = scaled_size(info["width"], info["height"], SCAN_SHORT_SIDE)
    fps = info["fps"]
    if content_box:
        cx0, cy0 = int(content_box[0] * w), int(content_box[1] * h)
        cx1, cy1 = max(cx0 + 8, int(round(content_box[2] * w))), max(cy0 + 8, int(round(content_box[3] * h)))
    else:
        cx0, cy0, cx1, cy1 = 0, 0, w, h
    cw, chh = cx1 - cx0, cy1 - cy0
    scale = FLOW_SHORT_SIDE / min(cw, chh)
    fw, fh = max(16, int(cw * scale)), max(16, int(chh * scale))

    content, luma, flow, hists, thumbs = [], [], [], [], []
    prev_hsv = prev_gray = prev_small = None
    for i, rgb in enumerate(iter_frames(path, (w, h))):
        rgb = rgb[cy0:cy1, cx0:cx1]
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.int16)
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        small = cv2.resize(gray, (fw, fh), interpolation=cv2.INTER_AREA)
        hist = cv2.calcHist([hsv.astype(np.uint8)], [0, 1, 2], None, [16, 4, 4], [0, 180, 0, 256, 0, 256]).ravel()
        hists.append(hist / max(1.0, hist.sum()))
        thumbs.append(cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA))
        if prev_hsv is None:
            content.append(0.0)
            luma.append(0.0)
            flow.append(0.0)
        else:
            d = np.abs(hsv - prev_hsv)
            # H 通道是环形的
            d[..., 0] = np.minimum(d[..., 0], 180 - d[..., 0])
            content.append(float(d.reshape(-1, 3).mean(axis=0).mean()))
            luma.append(float(np.abs(gray.astype(np.int16) - prev_gray).mean()))
            # 光流：每帧都算，低分辨率；单位换算为"每秒移动画面短边的比例"
            fl = cv2.calcOpticalFlowFarneback(prev_small, small, None, 0.5, 2, 9, 2, 5, 1.1, 0)
            mag = np.sqrt((fl ** 2).sum(axis=2))
            flow.append(float(mag.mean()) * fps / min(fw, fh))
        prev_hsv, prev_gray, prev_small = hsv, gray, small

    content = np.asarray(content)
    luma = np.asarray(luma)
    flow = np.asarray(flow)
    hists = np.asarray(hists, np.float32)
    thumbs = np.asarray(thumbs, np.uint8)
    cuts, candidates = detect_cuts(content, hists, fps)
    beats, beat_signal = detect_beats(thumbs, fps)
    return {
        "fps": fps,
        "n_frames": int(content.size),
        "content": content,
        "luma": luma,
        "flow": flow,
        "cuts": cuts,
        "cut_candidates": candidates,
        "content_box": content_box,
        "beats": beats,
        "beat_signal": beat_signal,
    }


def _bhatt(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.sqrt(max(0.0, 1.0 - float(np.sum(np.sqrt(a * b))))))


def detect_cuts(
    content: np.ndarray,
    hists: np.ndarray,
    fps: float,
    min_dist: float = 0.42,
    max_post_drift: float = 0.5,
    window: int = 2,
    min_len_frames: int = 8,
) -> tuple[list[dict], list[dict]]:
    """两段式切点检测。

    1. 候选：HSV 内容分的自适应比值或绝对值偏高（与 PySceneDetect AdaptiveDetector 同思路）；
    2. 确认：切点前 4 帧与后 3 帧的颜色直方图 Bhattacharyya 距离 d ≥ min_dist，
       且切后画面稳定——切后 3 帧与 0.3s 后的距离 dp ≤ max_post_drift。
       第 2 条用来排除 MG 视频中大量"闪一下"的故障风 / 闪白 / 全屏动效。
    阈值来自早期在竖屏 MG 参考集上的人工复核，用 eval/ 的合成集回归，帧号 i 表示 i-1 与 i 之间切换。
    """
    n = content.size
    raw = []
    for i in range(1, n):
        lo, hi = max(1, i - window), min(n, i + window + 1)
        neigh = np.concatenate([content[lo:i], content[i + 1:hi]])
        base = float(neigh.mean()) if neigh.size else 0.0
        ratio = content[i] / (base + 1e-3)
        if (ratio >= 2.0 and content[i] >= 8.0) or content[i] >= 30.0:
            pre = hists[max(0, i - 4):i].mean(axis=0)
            post = hists[i:i + 3].mean(axis=0)
            back = hists[i + 8:i + 12].mean(axis=0) if i + 12 <= n else post
            d, dp = _bhatt(pre, post), _bhatt(post, back)
            raw.append({"frame": i, "t": round(i / fps, 3), "score": round(float(content[i]), 2), "ratio": round(float(ratio), 2),
                        "d": round(d, 3), "dp": round(dp, 3), "accept": d >= min_dist and dp <= max_post_drift})
    # 非极大值抑制：min_len_frames 内只保留 d 最大的确认切点
    cuts, candidates = [], []
    acc = sorted([r for r in raw if r["accept"]], key=lambda r: -r["d"])
    taken: list[int] = []
    for r in acc:
        if all(abs(r["frame"] - f) >= min_len_frames for f in taken):
            taken.append(r["frame"])
            cuts.append(r)
        else:
            candidates.append({**r, "suppressed": True})
    candidates += [r for r in raw if not r["accept"]]
    cuts.sort(key=lambda r: r["frame"])
    candidates.sort(key=lambda r: r["frame"])
    return cuts, candidates


def detect_beats(
    thumbs: np.ndarray,
    fps: float,
    gap: int = 9,
    win: int = 6,
    thresh: float = 10.0,
    min_spacing_s: float = 0.8,
) -> tuple[list[dict], np.ndarray]:
    """视觉节拍：画面构图发生一次实质变化（切点、MG 场景切换、主要元素入场 / 退场）。

    比较 [i-gap-win, i-gap) 与 [i+gap, i+gap+win) 两个窗口的 32×32 灰度均值图的平均绝对差（0–255），
    取 ±min_spacing_s 内的局部极大且 ≥ thresh。空间结构对"同一黑底上换内容"的 MG 转场敏感，
    颜色直方图做不到这一点。阈值来自早期在竖屏 MG 参考集上的人工复核，用 eval/ 的合成集回归。
    """
    n = len(thumbs)
    T = thumbs.astype(np.float32)
    D = np.zeros(n, np.float32)
    for i in range(gap + win, n - gap - win):
        D[i] = np.abs(T[i - gap - win:i - gap].mean(axis=0) - T[i + gap:i + gap + win].mean(axis=0)).mean()
    r = int(min_spacing_s * fps)
    beats = []
    for i in range(1, n - 1):
        if D[i] >= thresh and D[i] == D[max(0, i - r):i + r + 1].max():
            beats.append({"frame": i, "t": round(i / fps, 3), "strength": round(float(D[i]), 2)})
    return beats, D


def static_intervals(luma: np.ndarray, fps: float, thresh: float = 0.6, min_s: float = 0.5) -> list[dict]:
    """连续帧间亮度差低于阈值（0–255 尺度）的区间，即画面几乎不动。"""
    out, start = [], None
    for i, v in enumerate(luma):
        still = v < thresh
        if still and start is None:
            start = i
        elif not still and start is not None:
            if (i - start) / fps >= min_s:
                out.append({"start": round(start / fps, 3), "end": round(i / fps, 3), "dur": round((i - start) / fps, 3)})
            start = None
    if start is not None and (len(luma) - start) / fps >= min_s:
        out.append({"start": round(start / fps, 3), "end": round(len(luma) / fps, 3), "dur": round((len(luma) - start) / fps, 3)})
    return out
