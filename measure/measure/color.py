"""L2 色彩测量：OKLab 空间 k-means 调色板。"""
from __future__ import annotations

import numpy as np
from sklearn.cluster import KMeans


def srgb_to_oklab(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    l = 0.4122214708 * c[..., 0] + 0.5363325363 * c[..., 1] + 0.0514459929 * c[..., 2]
    m = 0.2119034982 * c[..., 0] + 0.6806995451 * c[..., 1] + 0.1073969566 * c[..., 2]
    s = 0.0883024619 * c[..., 0] + 0.2817188376 * c[..., 1] + 0.6299787005 * c[..., 2]
    l_, m_, s_ = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return np.stack([L, a, b], axis=-1)


def oklab_to_srgb(lab: np.ndarray) -> np.ndarray:
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    c = np.stack([r, g, bb], axis=-1).clip(0, 1)
    c = np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)
    return (c * 255).round().astype(int)


def to_hex(rgb) -> str:
    return "#%02X%02X%02X" % tuple(int(v) for v in rgb)


def palette(rgb: np.ndarray, k: int = 5, sample: int = 6000, seed: int = 0) -> list[dict]:
    px = rgb.reshape(-1, 3)
    rng = np.random.default_rng(seed)
    if px.shape[0] > sample:
        px = px[rng.choice(px.shape[0], sample, replace=False)]
    lab = srgb_to_oklab(px)
    km = KMeans(n_clusters=k, n_init=3, random_state=seed).fit(lab)
    counts = np.bincount(km.labels_, minlength=k) / len(km.labels_)
    order = np.argsort(-counts)
    out = []
    for i in order:
        c = km.cluster_centers_[i]
        out.append({
            "hex": to_hex(oklab_to_srgb(c)),
            "share": round(float(counts[i]), 3),
            "L": round(float(c[0]), 3),
            "C": round(float(np.hypot(c[1], c[2])), 3),
            "oklab": [round(float(v), 4) for v in c],
        })
    return out


def frame_stats(rgb: np.ndarray) -> dict:
    lab = srgb_to_oklab(rgb.reshape(-1, 3)[::7])
    C = np.hypot(lab[:, 1], lab[:, 2])
    return {"L_mean": round(float(lab[:, 0].mean()), 3), "C_mean": round(float(C.mean()), 3)}


def merge_palettes(palettes: list[list[dict]], k: int = 8, seed: int = 0) -> list[dict]:
    pts, wts = [], []
    for pal in palettes:
        for c in pal:
            pts.append(c["oklab"])
            wts.append(c["share"])
    if not pts:
        return []
    pts, wts = np.asarray(pts), np.asarray(wts)
    k = min(k, len(pts))
    km = KMeans(n_clusters=k, n_init=5, random_state=seed).fit(pts, sample_weight=wts)
    share = np.bincount(km.labels_, weights=wts, minlength=k)
    share = share / share.sum()
    order = np.argsort(-share)
    return [
        {
            "hex": to_hex(oklab_to_srgb(km.cluster_centers_[i])),
            "share": round(float(share[i]), 3),
            "L": round(float(km.cluster_centers_[i][0]), 3),
            "C": round(float(np.hypot(*km.cluster_centers_[i][1:])), 3),
        }
        for i in order
    ]
