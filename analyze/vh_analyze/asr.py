"""逐词时间戳。后端可插拔：openai（whisper-1）/ local（faster-whisper）/ none。

中文场景下 whisper 的"词"基本是单字。
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

from .util import cache_dir, file_sha256, log


def transcribe(path: str, backend: str = "auto", language: str = "zh") -> dict | None:
    if backend == "none":
        return None
    if backend == "auto":
        backend = os.environ.get("VH_ASR_BACKEND", "openai")
    if backend.startswith("file:"):
        # 自己渲染的成片：语音时间轴已知（vh 的 voice.json），无需识别
        d = json.loads(Path(backend[5:]).read_text())
        return {"backend": "file", "text": "".join(w["w"] for w in d["words"]), "words": d["words"], "segments": d["segments"]}

    key = f"asr-{backend}-{language}-{file_sha256(path)[:16]}.json"
    cpath = cache_dir() / key
    if cpath.exists():
        return json.loads(cpath.read_text())

    if backend == "openai":
        res = _openai(path, language)
    elif backend == "local":
        res = _local(path, language)
    else:
        raise ValueError(f"unknown asr backend {backend}")
    cpath.write_text(json.dumps(res, ensure_ascii=False))
    return res


def _openai(path: str, language: str) -> dict:
    from openai import OpenAI

    with tempfile.TemporaryDirectory() as td:
        mp3 = Path(td) / "a.mp3"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", str(mp3)],
            check=True,
        )
        log("asr: openai whisper-1")
        client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", "sk-proxy-injected"))
        with open(mp3, "rb") as f:
            r = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                response_format="verbose_json",
                timestamp_granularities=["word", "segment"],
                language=language,
            )
    return {
        "backend": "openai/whisper-1",
        "text": r.text,
        "words": [{"w": w.word, "s": round(w.start, 3), "e": round(w.end, 3)} for w in (r.words or [])],
        "segments": [{"text": s.text, "s": round(s.start, 3), "e": round(s.end, 3)} for s in (r.segments or [])],
    }


def _local(path: str, language: str) -> dict:
    from faster_whisper import WhisperModel

    model = WhisperModel(os.environ.get("VH_WHISPER_MODEL", "small"), compute_type="int8")
    segs, _ = model.transcribe(path, language=language, word_timestamps=True)
    words, segments, text = [], [], []
    for s in segs:
        segments.append({"text": s.text, "s": round(s.start, 3), "e": round(s.end, 3)})
        text.append(s.text)
        for w in s.words or []:
            words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)})
    return {"backend": "faster-whisper", "text": "".join(text), "words": words, "segments": segments}


def pauses(words: list[dict], min_gap: float = 0.15) -> list[dict]:
    out = []
    for a, b in zip(words, words[1:]):
        g = b["s"] - a["e"]
        if g >= min_gap:
            out.append({"s": a["e"], "e": b["s"], "dur": round(g, 3)})
    return out
