"""拼图：每段三帧（看图标注 / 复核用）、全片总览、切点复核。"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from .util import cjk_font, grab_frame, scaled_size


def _tile(frames: list[np.ndarray]) -> Image.Image:
    return Image.fromarray(np.concatenate(frames, axis=1))


def shot_sheets(path: str, info: dict, shots: list[dict], out_dir: Path, per_sheet: int = 6) -> list[str]:
    """每镜取起点 / 中点 / 终点三帧，附镜头编号、时间和文案片段。"""
    size = scaled_size(info["width"], info["height"], 240)
    font = cjk_font(18)
    files = []
    out_dir.mkdir(parents=True, exist_ok=True)
    for b in range(0, len(shots), per_sheet):
        rows = []
        for s in shots[b: b + per_sheet]:
            ts = [s["start"] + 0.1, (s["start"] + s["end"]) / 2, max(s["start"] + 0.1, s["end"] - 0.15)]
            fr = [grab_frame(path, t, size) for t in ts]
            fr = [f if f is not None else np.zeros((size[1], size[0], 3), np.uint8) for f in fr]
            strip = _tile(fr)
            canvas = Image.new("RGB", (strip.width, strip.height + 52), (20, 20, 24))
            canvas.paste(strip, (0, 52))
            d = ImageDraw.Draw(canvas)
            d.text((6, 4), f"{s['id']}  [{s.get('shot_id', '')} · {s.get('boundary', '')}]  {s['start']:.2f}–{s['end']:.2f}s  ({s['dur']:.2f}s)", fill=(255, 220, 0), font=font)
            d.text((6, 27), (s.get("text") or "")[:40], fill=(230, 230, 230), font=font)
            rows.append(canvas)
        W = max(r.width for r in rows)
        sheet = Image.new("RGB", (W, sum(r.height for r in rows)), (0, 0, 0))
        y = 0
        for r in rows:
            sheet.paste(r, (0, y))
            y += r.height
        f = out_dir / f"shots-{b // per_sheet + 1:02d}.png"
        sheet.save(f)
        files.append(str(f))
    return files


def overview_sheet(path: str, info: dict, shots: list[dict], out: Path, cols: int = 10) -> str:
    size = scaled_size(info["width"], info["height"], 120)
    font = cjk_font(14)
    tiles = []
    for s in shots:
        f = grab_frame(path, (s["start"] + s["end"]) / 2, size)
        img = Image.fromarray(f if f is not None else np.zeros((size[1], size[0], 3), np.uint8))
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, img.width, 18], fill=(0, 0, 0))
        d.text((3, 1), f"{s['id']} {s['dur']:.1f}s{' |' if s.get('boundary') == 'cut' else ''}", fill=(255, 220, 0), font=font)
        tiles.append(img)
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * size[0], rows * size[1]), (0, 0, 0))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * size[0], (i // cols) * size[1]))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    return str(out)


def cut_review_sheet(path: str, info: dict, events: list[dict], out: Path, title: str, cols: int = 4) -> str | None:
    """每个事件显示切点前 2 帧与后 1 帧，供人 / 模型判断是否真的是切点。"""
    if not events:
        return None
    size = scaled_size(info["width"], info["height"], 110)
    fps = info["fps"]
    font = cjk_font(14)
    cells = []
    for k, e in enumerate(events):
        a = grab_frame(path, (e["frame"] - 2) / fps, size)
        b = grab_frame(path, (e["frame"] + 1) / fps, size)
        a = a if a is not None else np.zeros((size[1], size[0], 3), np.uint8)
        b = b if b is not None else np.zeros((size[1], size[0], 3), np.uint8)
        pair = Image.fromarray(np.concatenate([a, np.full((size[1], 4, 3), 255, np.uint8), b], axis=1))
        cell = Image.new("RGB", (pair.width, pair.height + 18), (20, 20, 24))
        cell.paste(pair, (0, 18))
        ImageDraw.Draw(cell).text((3, 1), f"#{k} t={e['t']:.2f} d={e.get('d', 0):.2f} dp={e.get('dp', 0):.2f}", fill=(255, 220, 0), font=font)
        cells.append(cell)
    cw, ch = cells[0].width + 6, cells[0].height + 6
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cw, rows * ch + 24), (0, 0, 0))
    ImageDraw.Draw(sheet).text((4, 3), title, fill=(255, 255, 255), font=cjk_font(16))
    for i, c in enumerate(cells):
        sheet.paste(c, ((i % cols) * cw, 24 + (i // cols) * ch))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    return str(out)
