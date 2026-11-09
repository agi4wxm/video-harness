"""通用工具：ffprobe、帧解码、分位数、缓存、JSON 输出。"""
from __future__ import annotations

import hashlib
import json
import math
import os
import subprocess
import sys
from pathlib import Path
from typing import Iterator

import numpy as np

SCHEMA = "vh_analyze.analysis.v1"
CJK_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]


def ffprobe(path: str) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path],
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def video_info(path: str) -> dict:
    info = ffprobe(path)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    num, den = (int(x) for x in v.get("avg_frame_rate", "30/1").split("/"))
    return {
        "width": int(v["width"]), "height": int(v["height"]),
        "fps": round(num / den if den else 30.0, 3),
        "duration_s": float(info["format"]["duration"]),
        "has_audio": a is not None,
    }


def scaled_size(w: int, h: int, short_side: int) -> tuple[int, int]:
    if w <= h:
        return short_side, int(round(h * short_side / w / 2) * 2)
    return int(round(w * short_side / h / 2) * 2), short_side


def iter_frames(path: str, size: tuple[int, int], fps: float | None = None, gray: bool = False,
                start: float | None = None, duration: float | None = None) -> Iterator[np.ndarray]:
    """用 ffmpeg 解码为原始帧。size=(w,h)。"""
    w, h = size
    vf = ([f"fps={fps}"] if fps else []) + [f"scale={w}:{h}:flags=area"]
    cmd = ["ffmpeg", "-v", "error"]
    if start is not None:
        cmd += ["-ss", f"{max(0.0, start):.3f}"]
    cmd += ["-i", path]
    if duration is not None:
        cmd += ["-t", f"{duration:.3f}"]
    ch = 1 if gray else 3
    cmd += ["-an", "-vf", ",".join(vf), "-f", "rawvideo", "-pix_fmt", "gray" if gray else "rgb24", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    n = w * h * ch
    try:
        while True:
            buf = proc.stdout.read(n)
            if len(buf) < n:
                break
            arr = np.frombuffer(buf, np.uint8)
            yield arr.reshape(h, w) if gray else arr.reshape(h, w, 3)
    finally:
        proc.stdout.close()
        proc.wait()


def grab_frame(path: str, t: float, size: tuple[int, int]) -> np.ndarray | None:
    for f in iter_frames(path, size, start=t, duration=0.1):
        return f
    return None


def pct(values, ps=(10, 50, 90), digits: int = 3) -> dict | None:
    arr = np.asarray([v for v in values if v is not None and not (isinstance(v, float) and math.isnan(v))], float)
    if arr.size == 0:
        return None
    out = {f"p{p}": round(float(np.percentile(arr, p)), digits) for p in ps}
    out["mean"] = round(float(arr.mean()), digits)
    out["n"] = int(arr.size)
    return out


def file_sha256(path: str, limit: int | None = None) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        read = 0
        while chunk := f.read(1 << 20):
            h.update(chunk)
            read += len(chunk)
            if limit and read >= limit:
                break
    return h.hexdigest()


def cache_dir() -> Path:
    d = Path(os.environ.get("VH_CACHE_DIR", Path.home() / ".cache" / "video-harness")) / "asr"
    d.mkdir(parents=True, exist_ok=True)
    return d


class NpEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, np.integer):
            return int(o)
        if isinstance(o, np.floating):
            return float(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
        return super().default(o)


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, cls=NpEncoder))


def cjk_font(size: int):
    from PIL import ImageFont
    for p in CJK_FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def log(msg: str) -> None:
    print(f"[vh_analyze] {msg}", flush=True, file=sys.stderr)
