"""L2 版式测量：找出全片几乎不变的"模板"区域（边框、常驻标题栏、台标）与真正变化的内容区域。

很多口播 MG 视频使用固定版式（例如窗口边框 + 底部标题栏），镜头切换只发生在内容区域内。
整帧比较会被不变区域稀释，所以切点检测只在内容区域里做。
"""
from __future__ import annotations

import cv2
import numpy as np

from .util import iter_frames, scaled_size

LAYOUT_SHORT_SIDE = 216


def detect_layout(path: str, info: dict, fps: float = 1.0, std_thresh: float = 6.0) -> dict:
    w, h = scaled_size(info["width"], info["height"], LAYOUT_SHORT_SIDE)
    frames = np.stack([f.astype(np.float32) for f in iter_frames(path, (w, h), fps=fps, gray=True)])
    std = frames.std(axis=0)
    dyn = (std > std_thresh).astype(np.uint8)
    dyn = cv2.morphologyEx(dyn, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    dyn = cv2.morphologyEx(dyn, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(dyn)
    if n <= 1:
        box = (0, 0, w, h)
    else:
        k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        x, y, bw, bh, _ = stats[k]
        box = (x, y, x + bw, y + bh)
    x0, y0, x1, y1 = box
    area = (x1 - x0) * (y1 - y0) / (w * h)
    return {
        "content_box": [round(x0 / w, 4), round(y0 / h, 4), round(x1 / w, 4), round(y1 / h, 4)],
        "content_area_ratio": round(float(area), 3),
        "static_pixel_ratio": round(float(1 - dyn.mean()), 3),
        "templated": bool(area < 0.85),
        "mean_frame_L": round(float(frames.mean() / 255), 3),
    }
