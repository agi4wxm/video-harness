"""L0/L4 音频测量：响度、真峰值、节拍、起音点、能量曲线。"""
from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np


def extract_wav(path: str, sr: int, out: Path, mono: bool = True) -> Path:
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", path, "-vn"] + (["-ac", "1"] if mono else []) + ["-ar", str(sr), str(out)]
    subprocess.run(cmd, check=True)
    return out


def ffmpeg_ebur128(path: str) -> dict:
    """用 ffmpeg 的 ebur128 滤镜交叉验证（E1）。"""
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    txt = r.stderr
    tail = txt[txt.rfind("Summary:"):] if "Summary:" in txt else txt
    I = re.search(r"I:\s+(-?[\d.]+) LUFS", tail)
    pk = re.search(r"Peak:\s+(-?[\d.]+) dBFS", tail)
    lra = re.search(r"LRA:\s+(-?[\d.]+) LU", tail)
    return {
        "integrated_lufs": float(I.group(1)) if I else None,
        "true_peak_dbtp": float(pk.group(1)) if pk else None,
        "lra_lu": float(lra.group(1)) if lra else None,
    }


def measure_audio(path: str) -> dict:
    import librosa
    import pyloudnorm as pyln
    from scipy.signal import resample_poly
    import soundfile as sf

    with tempfile.TemporaryDirectory() as td:
        # 响度按 BS.1770 在原始声道上测（下混成单声道会偏低约 3 LU）
        wav48 = extract_wav(path, 48000, Path(td) / "a48.wav", mono=False)
        y48, sr48 = sf.read(str(wav48))
        wav22 = extract_wav(path, 22050, Path(td) / "a22.wav")
        y22, sr22 = sf.read(str(wav22))

    meter = pyln.Meter(sr48)
    lufs = float(meter.integrated_loudness(y48))
    over = resample_poly(y48, 4, 1, axis=0)
    tp = float(20 * np.log10(np.max(np.abs(over)) + 1e-12))
    clip_ratio = float(np.mean(np.abs(y48) >= 0.999))

    # 10Hz RMS 能量曲线（dBFS）
    hop = sr22 // 10
    rms = librosa.feature.rms(y=y22, frame_length=hop * 2, hop_length=hop)[0]
    rms_db = 20 * np.log10(rms + 1e-9)

    onset_env = librosa.onset.onset_strength(y=y22, sr=sr22)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr22, units="time", backtrack=False)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr22, units="time")
    tempo = float(np.atleast_1d(tempo)[0])
    # 节拍置信度：节拍处 onset 强度相对整体中位数的倍数。口播视频以人声为主，节拍通常不可靠。
    if len(beats):
        bf = librosa.time_to_frames(beats, sr=sr22)
        bf = bf[bf < onset_env.size]
        beat_conf = float(np.median(onset_env[bf]) / (np.median(onset_env) + 1e-9)) if bf.size else 0.0
    else:
        beat_conf = 0.0

    return {
        "integrated_lufs": round(lufs, 2),
        "true_peak_dbtp": round(tp, 2),
        "clip_ratio": round(clip_ratio, 6),
        "tempo_bpm": round(tempo, 1),
        "beat_confidence": round(beat_conf, 2),
        "beats": [round(float(b), 3) for b in beats],
        "onsets": [round(float(o), 3) for o in onsets],
        "rms_db_10hz": [round(float(v), 1) for v in rms_db],
        "crosscheck_ffmpeg": ffmpeg_ebur128(path),
    }
