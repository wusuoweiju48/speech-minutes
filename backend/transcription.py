import logging
import os
import struct
import tempfile

import numpy as np

from config import settings

logger = logging.getLogger(__name__)

_model = None
_model_load_attempted = False


def _load_model():
    global _model, _model_load_attempted
    if _model_load_attempted:
        return _model
    _model_load_attempted = True

    try:
        import whisper

        logger.info("Loading openai-whisper: %s", settings.whisper_model_size)
        _model = whisper.load_model(settings.whisper_model_size)
        logger.info("openai-whisper loaded")
    except Exception as e:
        logger.warning("openai-whisper unavailable: %s — using simulation", e)
        _model = None

    return _model


def _pcm_to_wav(pcm: bytes, sr: int = 16000, ch: int = 1, sw: int = 2) -> bytes:
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + len(pcm), b"WAVE", b"fmt ",
        16, 1, ch, sr, sr * ch * sw, ch * sw, sw * 8,
        b"data", len(pcm),
    )
    return header + pcm


_SIM = [
    "同学们好，今天我们来复习第三章的内容。",
    "老师，这部分能再讲一遍吗？",
    "当然，我们从基本概念开始。",
    "这个公式的推导过程是怎样的？",
    "我们来看一下具体的例子。",
    "明白了，我课后整理一份笔记。",
    "好的，作业是课后习题第三题，下周交。",
]
_sim_i = 0

# Whisper 对静音/噪音常见的幻觉输出
_HALLUCINATION_PATTERNS = [
    "字幕by索兰娅",
    "字幕 by 索兰娅",
    "谢谢观看",
    "Thank you for watching",
    "请订阅",
]


def _is_silence(pcm: bytes, threshold: float = 500.0) -> bool:
    """检测 PCM 音频是否为静音/噪音（RMS 能量低于阈值）"""
    samples = np.frombuffer(pcm, dtype=np.int16)
    if len(samples) == 0:
        return True
    rms = np.sqrt(np.mean(samples.astype(np.float64) ** 2))
    return rms < threshold


def _is_hallucination(text: str) -> bool:
    """检测是否为 Whisper 幻觉输出"""
    for pat in _HALLUCINATION_PATTERNS:
        if pat in text:
            return True
    # 过滤纯重复字符（如 "谢谢谢谢谢谢..."）
    if len(text) >= 4 and len(set(text)) <= 2:
        return True
    return False


def transcribe_audio(audio_bytes: bytes) -> str:
    global _sim_i

    if settings.simulation_mode:
        phrase = _SIM[_sim_i % len(_SIM)]
        _sim_i += 1
        return phrase

    model = _load_model()
    if model is None:
        phrase = _SIM[_sim_i % len(_SIM)]
        _sim_i += 1
        return phrase

    wav = audio_bytes if audio_bytes[:4] == b"RIFF" else _pcm_to_wav(audio_bytes)

    # 静音检测：提取 PCM 数据检查能量
    if audio_bytes[:4] == b"RIFF":
        pcm_data = audio_bytes[44:]  # 跳过 WAV header
    else:
        pcm_data = audio_bytes
    if _is_silence(pcm_data):
        logger.info("Skipped: silence detected")
        return ""

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(wav)
        path = f.name

    try:
        result = model.transcribe(path, language="zh", fp16=False)
        text = result["text"].strip()
        if _is_hallucination(text):
            logger.info("Filtered hallucination: %s", text[:40])
            return ""
        logger.info("Transcribed: %s", text[:80])
        return text
    except Exception as e:
        logger.error("Transcription error: %s", e)
        return ""
    finally:
        os.unlink(path)
