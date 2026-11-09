"""色彩测量：OKLab 空间 k-means 调色板与画面亮度 / 彩度（与 packages/core/src/color.ts 同一口径）。"""
from __future__ import annotations

import numpy as np


def srgb_to_oklab(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    l = 0.4122214708 * c[..., 0] + 0.5363325363 * c[..., 1] + 0.0514459929 * c[..., 2]
    m = 0.2119034982 * c[..., 0] + 0.6806995451 * c[..., 1] + 0.1073969566 * c[..., 2]
    s = 0.0883024619 * c[..., 0] + 0.2817188376 * c[..., 1] + 0.6299787005 * c[..., 2]
    l_, m_, s_ = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    return np.stack([0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
                     1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                     0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_], axis=-1)


def oklab_to_srgb(lab: np.ndarray) -> np.ndarray:
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    l, m, s = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    c = np.stack([4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                  -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                  -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s], axis=-1).clip(0, 1)
    c = np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)
    return (c * 255).round().astype(int)


def to_hex(rgb) -> str:
    return "#%02X%02X%02X" % tuple(int(v) for v in rgb)


def kmeans(x: np.ndarray, k: int, w: np.ndarray | None = None, iters: int = 30, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    """加权 k-means（k-means++ 初始化），纯 numpy。"""
    rng = np.random.default_rng(seed)
    w = np.ones(len(x)) if w is None else w
    k = min(k, len(x))
    cent = [x[rng.choice(len(x), p=w / w.sum())]]
    for _ in range(1, k):
        d = np.min(((x[:, None] - np.asarray(cent)[None]) ** 2).sum(-1), axis=1) * w
        cent.append(x[rng.choice(len(x), p=d / d.sum())] if d.sum() > 0 else x[rng.integers(len(x))])
    cent = np.asarray(cent)
    for _ in range(iters):
        lab = np.argmin(((x[:, None] - cent[None]) ** 2).sum(-1), axis=1)
        new = np.asarray([np.average(x[lab == j], axis=0, weights=w[lab == j]) if (lab == j).any() else cent[j] for j in range(k)])
        if np.allclose(new, cent, atol=1e-5):
            break
        cent = new
    return cent, lab


def palette(rgb: np.ndarray, k: int = 5, sample: int = 5000, seed: int = 0) -> list[dict]:
    px = rgb.reshape(-1, 3)
    rng = np.random.default_rng(seed)
    if px.shape[0] > sample:
        px = px[rng.choice(px.shape[0], sample, replace=False)]
    lab = srgb_to_oklab(px)
    cent, lbl = kmeans(lab, k, seed=seed)
    share = np.bincount(lbl, minlength=len(cent)) / len(lbl)
    return [{"hex": to_hex(oklab_to_srgb(cent[i])), "share": round(float(share[i]), 3), "L": round(float(cent[i][0]), 3),
             "C": round(float(np.hypot(cent[i][1], cent[i][2])), 3), "oklab": [round(float(v), 4) for v in cent[i]]}
            for i in np.argsort(-share)]


def frame_stats(rgb: np.ndarray) -> dict:
    lab = srgb_to_oklab(rgb.reshape(-1, 3)[::7])
    return {"L": round(float(lab[:, 0].mean()), 3), "C": round(float(np.hypot(lab[:, 1], lab[:, 2]).mean()), 3)}


def merge_palettes(palettes: list[list[dict]], k: int = 8) -> list[dict]:
    pts = np.asarray([c["oklab"] for p in palettes for c in p])
    if not len(pts):
        return []
    wts = np.asarray([c["share"] for p in palettes for c in p])
    cent, lbl = kmeans(pts, k, wts)
    share = np.bincount(lbl, weights=wts, minlength=len(cent))
    share = share / share.sum()
    return [{"hex": to_hex(oklab_to_srgb(cent[i])), "share": round(float(share[i]), 3), "L": round(float(cent[i][0]), 3),
             "C": round(float(np.hypot(*cent[i][1:])), 3)} for i in np.argsort(-share)]
