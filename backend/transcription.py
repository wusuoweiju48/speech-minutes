import logging
import os
import struct
import tempfile

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
        from faster_whisper import WhisperModel

        logger.info(
            "Loading faster-whisper: %s (device=%s, compute=%s)",
            settings.whisper_model_size,
            settings.whisper_device,
            settings.whisper_compute_type,
        )
        _model = WhisperModel(
            settings.whisper_model_size,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
        logger.info("faster-whisper loaded")
    except Exception as e:
        logger.warning("faster-whisper unavailable: %s — using simulation", e)
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

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(wav)
        path = f.name

    try:
        segs, info = model.transcribe(path, language="zh", beam_size=5)
        text = "".join(s.text for s in segs).strip()
        logger.info("Transcribed (%.1fs): %s", info.duration, text[:80])
        return text
    except Exception as e:
        logger.error("Transcription error: %s", e)
        return ""
    finally:
        os.unlink(path)
