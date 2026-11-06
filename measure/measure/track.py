"""L3 入场动效测量：对画面文字的出现过程做逐帧模板跟踪，估计入场时长、位移和缓动曲线。

方法：
1. 取文字条目首次被 OCR 看到后 ~0.5s 的帧作为"落定帧"，裁出文字区域作为模板；
2. 在 [首次看到 - 1.0s, 首次看到 + 0.5s] 内逐帧（原生帧率）在扩展区域里做归一化互相关匹配；
3. 匹配分数从低到高的过程即入场进度（适用于淡入、滑入、缩放等多数入场），
   匹配位置的变化即滑入位移；
4. 对归一化进度曲线拟合 cubic-bezier，与常见缓动对比。
"""
from __future__ import annotations

import cv2
import numpy as np
from scipy.optimize import least_squares

from .util import iter_frames, scaled_size

TRACK_SHORT_SIDE = 540

NAMED_EASINGS = {
    "linear": (0.0, 0.0, 1.0, 1.0),
    "ease": (0.25, 0.1, 0.25, 1.0),
    "ease-in": (0.42, 0.0, 1.0, 1.0),
    "ease-out": (0.0, 0.0, 0.58, 1.0),
    "ease-in-out": (0.42, 0.0, 0.58, 1.0),
    "out-cubic": (0.33, 1.0, 0.68, 1.0),
    "out-expo": (0.16, 1.0, 0.3, 1.0),
}


def bezier_y_of_x(x1, y1, x2, y2, xs: np.ndarray) -> np.ndarray:
    ts = np.linspace(0, 1, 201)
    bx = 3 * (1 - ts) ** 2 * ts * x1 + 3 * (1 - ts) * ts ** 2 * x2 + ts ** 3
    by = 3 * (1 - ts) ** 2 * ts * y1 + 3 * (1 - ts) * ts ** 2 * y2 + ts ** 3
    return np.interp(xs, bx, by)


def fit_bezier(xs: np.ndarray, ys: np.ndarray) -> tuple[tuple[float, float, float, float], float]:
    def resid(p):
        return bezier_y_of_x(p[0], p[1], p[2], p[3], xs) - ys

    best = None
    for init in [(0.25, 0.1, 0.25, 1.0), (0.2, 0.9, 0.1, 1.0), (0.42, 0.0, 0.58, 1.0)]:
        r = least_squares(resid, init, bounds=([0, -0.5, 0, 0], [1, 1.5, 1, 1.5]))
        if best is None or r.cost < best.cost:
            best = r
    p = tuple(round(float(v), 3) for v in best.x)
    rmse = float(np.sqrt(np.mean(resid(best.x) ** 2)))
    return p, rmse


def nearest_named(xs: np.ndarray, ys: np.ndarray) -> tuple[str, float]:
    best, err = None, 1e9
    for name, p in NAMED_EASINGS.items():
        e = float(np.sqrt(np.mean((bezier_y_of_x(*p, xs) - ys) ** 2)))
        if e < err:
            best, err = name, e
    return best, round(err, 4)


def track_entrance(path: str, info: dict, item: dict, shot_start: float) -> dict | None:
    fps = info["fps"]
    w, h = scaled_size(info["width"], info["height"], TRACK_SHORT_SIDE)
    t_seen = item["first_t"]
    t0 = max(shot_start, t_seen - 1.0)
    t_settle = min(item["last_t"], t_seen + 0.5)
    t1 = t_settle + 0.05
    if t1 - t0 < 0.2:
        return None
    frames = list(iter_frames(path, (w, h), gray=True, start=t0, duration=t1 - t0))
    if len(frames) < 5:
        return None

    x0, y0, x1, y1 = item["box"]
    bx0, by0, bx1, by1 = int(x0 * w), int(y0 * h), int(np.ceil(x1 * w)), int(np.ceil(y1 * h))
    if bx1 - bx0 < 8 or by1 - by0 < 6:
        return None
    ref = frames[-1]
    tpl = ref[by0:by1, bx0:bx1]
    if tpl.std() < 5:
        return None
    # 搜索范围：四周扩展画面短边的 25%
    m = int(0.25 * min(w, h))
    sx0, sy0 = max(0, bx0 - m), max(0, by0 - m)
    sx1, sy1 = min(w, bx1 + m), min(h, by1 + m)

    scores, locs = [], []
    for f in frames:
        region = f[sy0:sy1, sx0:sx1]
        res = cv2.matchTemplate(region, tpl, cv2.TM_CCOEFF_NORMED)
        _, mx, _, loc = cv2.minMaxLoc(res)
        scores.append(mx)
        locs.append((loc[0] + sx0, loc[1] + sy0))
    scores = np.clip(np.asarray(scores), 0, 1)
    locs = np.asarray(locs, float)
    ts = t0 + np.arange(len(frames)) / fps

    final = float(np.median(scores[-3:]))
    if final < 0.8:
        return {"ok": False, "reason": "final_match_low", "final_score": round(final, 3)}
    lo = float(scores[: max(1, len(scores) // 5)].min())
    if final - lo < 0.3:
        # 窗口内一开始就已存在：要么入场早于窗口，要么是硬切入
        return {"ok": False, "reason": "no_transition_in_window", "final_score": round(final, 3)}

    prog = (scores - lo) / (final - lo)
    prog = np.clip(prog, 0, 1)
    # 进度单调化（入场过程应基本单调），取 10%→90% 的时间跨度
    mono = np.maximum.accumulate(prog)
    i10 = int(np.argmax(mono >= 0.1))
    i90 = int(np.argmax(mono >= 0.9))
    i_start = int(np.argmax(mono >= 0.02))
    i_end = int(np.argmax(mono >= 0.98)) if (mono >= 0.98).any() else len(mono) - 1
    dur_10_90 = (i90 - i10) / fps
    dur_full = (i_end - i_start) / fps

    disp = locs - locs[-1]
    start_disp = disp[i_start]
    slide = float(np.hypot(*start_disp)) / min(w, h)
    method = "match_score"
    if slide > 0.02:
        # 滑入：用位移计算进度（匹配分数在元素到位前一直偏低，会把曲线扭成 ease-in）
        dist = np.hypot(disp[:, 0], disp[:, 1])
        valid = scores >= 0.5
        if valid.sum() >= 4:
            j0 = int(np.argmax(valid))
            d0 = max(dist[j0], 1e-6)
            prog_d = np.clip(1 - dist / d0, 0, 1)
            prog_d[:j0] = 0
            mono = np.maximum.accumulate(prog_d)
            i_start = j0
            i10 = int(np.argmax(mono >= 0.1))
            i90 = int(np.argmax(mono >= 0.9))
            i_end = int(np.argmax(mono >= 0.98)) if (mono >= 0.98).any() else len(mono) - 1
            dur_10_90 = (i90 - i10) / fps
            dur_full = (i_end - i_start) / fps
            method = "displacement"

    out = {
        "ok": True,
        "t_start": round(float(ts[i_start]), 3),
        "dur_s": round(dur_full, 3),
        "dur_10_90_s": round(dur_10_90, 3),
        "frames": int(i_end - i_start),
        "slide_ratio": round(slide, 4),
        "slide_dir": _direction(start_disp) if slide > 0.01 else None,
        "final_score": round(final, 3),
        "method": method,
    }
    if i_end - i_start >= 4:
        seg = mono[i_start: i_end + 1]
        xs = np.linspace(0, 1, seg.size)
        ys = (seg - seg[0]) / max(1e-6, seg[-1] - seg[0])
        p, rmse = fit_bezier(xs, ys)
        name, nerr = nearest_named(xs, ys)
        out.update({"bezier": p, "bezier_rmse": round(rmse, 4), "nearest_named": name, "nearest_named_rmse": nerr})
    else:
        out["kind"] = "pop"  # 4 帧以内完成：视为硬切入 / 闪现
    return out


def _direction(d) -> str:
    dx, dy = d  # 起点相对终点的偏移
    if abs(dx) > abs(dy):
        return "from-left" if dx < 0 else "from-right"
    return "from-top" if dy < 0 else "from-bottom"
