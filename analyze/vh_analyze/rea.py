"""接入 rea-video：读取它的 breakdown.json（逐镜制作方式、包装层、声音），与本包的版式感知切镜合并。

rea-video 用整帧变化判断切镜、用整帧纹理判断制作方式；固定版式（窗口、边框、常驻标题栏）会稀释和主导这些统计。
这里把 rea-video 的镜头映射到"内容区内"重新检测出的段上，并把渲染画面的复刻路线改写成代码路线（本项目不用生成式视频）。
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from .util import log

# rea-video 的制作方式 → 本项目的代码实现路线
CODE_ROUTE = {
    "code_render": "kit / local 场景图（Remotion）",
    "anim_2d": "local 场景图：参数化角色 + 插画场景 + 虚拟相机（SVG），不做逐帧手绘",
    "cg_3d": "html 镜头：Three.js，seek(t) 驱动相机与物体",
    "still_motion": "local 场景图：插画元素 + 推拉摇移",
    "static_hold": "kit：标题卡 / 数字卡，保持轻微呼吸动作",
    "screen_capture": "html 镜头：用 DOM 重建界面，或需要用户提供录屏",
    "live_action": "需要用户提供素材；或改写为插画场景（不用生成式视频）",
    "film_footage": "需要用户提供素材（注意授权）",
    "ai_video": "改写为插画场景 / Three.js 场景（本项目不调用视频生成）",
    "avatar": "改写为参数化角色（character-scene）",
    "stop_motion": "local 场景图：有限帧节奏（按 2–3 帧一换）",
}


def decompose(video: str, out_root: str, lang: str = "en") -> Path | None:
    exe = shutil.which("rea-video")
    if not exe:
        log("未安装 rea-video（见 analyze/README.md），跳过制作方式拆解")
        return None
    subprocess.run([exe, "decompose", video, "--lang", lang, "--out", out_root], check=True)
    hits = sorted(Path(out_root).glob("**/breakdown.json"), key=lambda p: p.stat().st_mtime)
    return hits[-1] if hits else None


def merge(analysis: dict, breakdown_path: str) -> dict:
    bd = json.loads(Path(breakdown_path).read_text())
    shots = bd.get("shots", [])
    segs = analysis["rhythm"]["segments"]
    mapped = []
    for g in segs:
        mid = (g["start"] + g["end"]) / 2
        s = next((x for x in shots if x.get("start", 0) <= mid < x.get("end", 0)), None)
        base = (s or {}).get("base") or {}
        label = base.get("label")
        mapped.append({"start": g["start"], "end": g["end"], "rea_shot": (s or {}).get("id"), "label": label,
                       "confidence": base.get("confidence"), "route": CODE_ROUTE.get(label, "待确认")})
    return {
        "breakdown": str(Path(breakdown_path).resolve()),
        "summary": bd.get("summary", {}),
        "rea_shots": len(shots),
        "content_segments": len(segs),
        "segments": mapped,
        "note": "段来自版式感知的切点 + 视觉节拍；label 来自 rea-video 对应时刻的镜头，低置信度的按 rea-video 的复核协议看图确认",
    }
