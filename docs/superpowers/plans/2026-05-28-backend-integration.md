# Backend + Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python backend (FastAPI + faster-whisper + ZhipuAI GLM) and wire the frontend to use real microphone recording, WebSocket streaming, and HTTP summary generation — turning the mock demo into a working end-to-end system.

**Architecture:** FastAPI backend exposes WebSocket `/ws/transcribe` for real-time ASR (faster-whisper) and POST `/generate_summary` for LLM-powered meeting minutes. Frontend replaces mock scripts with `MediaRecorder` audio capture, WebSocket client, and real HTTP calls. A `SIMULATION_MODE` env var provides graceful fallback when ASR/LLM services are unavailable, ensuring the project runs immediately for demo.

**Tech Stack:** Python 3.13, FastAPI, uvicorn, faster-whisper, zhipuai SDK, JavaScript (vanilla), Web Audio API, WebSocket API

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/main.py` | **Create** | FastAPI app: WebSocket `/ws/transcribe`, POST `/generate_summary`, CORS, static file serving |
| `backend/transcription.py` | **Create** | faster-whisper wrapper: load model, transcribe WAV bytes, simulation fallback |
| `backend/summarizer.py` | **Create** | ZhipuAI GLM wrapper: build prompt, call API, parse JSON response, template fallback |
| `backend/config.py` | **Create** | Pydantic Settings: load `.env`, expose typed config |
| `backend/requirements.txt` | **Modify** | Add `pydantic-settings` dependency |
| `backend/.env.example` | **Modify** | Add `SIMULATION_MODE` variable |
| `frontend/app.js` | **Modify** | Replace mock with real MediaRecorder + WebSocket + HTTP |
| `frontend/index.html` | **Modify** | Add connection status banner |
| `README.md` | **Modify** | Update quick-start instructions |

---

### Task 1: Backend Configuration (`config.py`)

**Files:**
- Create: `backend/config.py`
- Modify: `backend/requirements.txt`
- Modify: `backend/.env.example`

- [ ] **Step 1: Update requirements.txt**

Add `pydantic-settings` to `backend/requirements.txt`:

```txt
# Web 框架
fastapi==0.115.0
uvicorn[standard]==0.30.6
python-multipart==0.0.9

# 语音识别
faster-whisper==1.0.3

# LLM 摘要 (智谱 GLM)
zhipuai==2.1.5

# 工具
python-dotenv==1.0.1
numpy==1.26.4
pydantic-settings==2.6.0
```

- [ ] **Step 2: Update .env.example**

Replace contents of `backend/.env.example`:

```env
# 智谱 GLM API Key (不填则使用模板摘要)
ZHIPUAI_API_KEY=

# Whisper 配置
WHISPER_MODEL_SIZE=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8

# 仿真模式: 设为 true 可在无 ASR/LLM 服务时使用模拟数据
SIMULATION_MODE=false
```

- [ ] **Step 3: Create config.py**

Create `backend/config.py`:

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    zhipuai_api_key: str = ""
    whisper_model_size: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    simulation_mode: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
```

- [ ] **Step 4: Commit**

```bash
git add backend/config.py backend/requirements.txt backend/.env.example
git commit -m "[backend] 添加配置模块与依赖"
```

---

### Task 2: ASR Transcription Service (`transcription.py`)

**Files:**
- Create: `backend/transcription.py`

- [ ] **Step 1: Create transcription.py**

Create `backend/transcription.py`:

```python
import logging
import os
import tempfile
import struct
import io

import numpy as np

from config import settings

logger = logging.getLogger(__name__)

# Global model reference (lazy-loaded)
_model = None
_model_load_attempted = False


def _load_model():
    """Lazy-load faster-whisper model on first use."""
    global _model, _model_load_attempted
    if _model_load_attempted:
        return _model
    _model_load_attempted = True

    try:
        from faster_whisper import WhisperModel

        logger.info(
            "Loading faster-whisper model: %s (device=%s, compute=%s)",
            settings.whisper_model_size,
            settings.whisper_device,
            settings.whisper_compute_type,
        )
        _model = WhisperModel(
            settings.whisper_model_size,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
        logger.info("faster-whisper model loaded successfully")
    except Exception as e:
        logger.warning("Failed to load faster-whisper: %s — falling back to simulation", e)
        _model = None

    return _model


def _pcm_to_wav(pcm_data: bytes, sample_rate: int = 16000, channels: int = 1, sample_width: int = 2) -> bytes:
    """Wrap raw PCM data in a WAV header."""
    data_size = len(pcm_data)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,  # chunk size
        1,  # PCM format
        channels,
        sample_rate,
        sample_rate * channels * sample_width,  # byte rate
        channels * sample_width,  # block align
        sample_width * 8,  # bits per sample
        b"data",
        data_size,
    )
    return header + pcm_data


# Simulation phrases for demo mode
_SIM_PHRASES = [
    "同学们好，今天我们来复习第三章的内容。",
    "老师，这部分能再讲一遍吗？",
    "当然，我们从基本概念开始。",
    "这个公式的推导过程是怎样的？",
    "我们来看一下具体的例子。",
    "明白了，我课后整理一份笔记。",
    "好的，作业是课后习题第三题，下周交。",
]
_sim_index = 0


def transcribe_audio(audio_bytes: bytes) -> str:
    """
    Transcribe audio bytes to text.

    Accepts raw PCM16 or WAV audio. Uses faster-whisper if available,
    otherwise returns simulated text for demo purposes.
    """
    global _sim_index

    if settings.simulation_mode:
        phrase = _SIM_PHRASES[_sim_index % len(_SIM_PHRASES)]
        _sim_index += 1
        return phrase

    model = _load_model()
    if model is None:
        # Model failed to load — use simulation
        phrase = _SIM_PHRASES[_sim_index % len(_SIM_PHRASES)]
        _sim_index += 1
        return phrase

    # Ensure audio is WAV format
    if audio_bytes[:4] == b"RIFF":
        wav_bytes = audio_bytes
    else:
        wav_bytes = _pcm_to_wav(audio_bytes)

    # Write to temp file (faster-whisper needs a file path or file-like)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(wav_bytes)
        tmp_path = tmp.name

    try:
        segments, info = model.transcribe(tmp_path, language="zh", beam_size=5)
        text = "".join(seg.text for seg in segments).strip()
        logger.info("Transcribed (%.1fs audio): %s", info.duration, text[:80])
        return text
    except Exception as e:
        logger.error("Transcription error: %s", e)
        return ""
    finally:
        os.unlink(tmp_path)
```

- [ ] **Step 2: Commit**

```bash
git add backend/transcription.py
git commit -m "[backend] 添加 ASR 转写服务(faster-whisper + 仿真回退)"
```

---

### Task 3: LLM Summary Service (`summarizer.py`)

**Files:**
- Create: `backend/summarizer.py`

- [ ] **Step 1: Create summarizer.py**

Create `backend/summarizer.py`:

```python
import json
import logging
import re

from config import settings

logger = logging.getLogger(__name__)

PROMPT_TEMPLATE = """你是一个课堂会议纪要助手。请根据以下课堂转写记录，生成结构化的会议纪要。

要求：
1. 摘要：用一两句话概括本次课堂的核心内容
2. 关键信息：列出课堂中提到的 3-5 个重点知识点
3. 待办事项：列出提到的作业、任务或后续安排

请严格以如下 JSON 格式返回（不要包含其他文字）：
{{
  "summary": "一句话摘要",
  "key_points": ["重点1", "重点2", "重点3"],
  "action_items": ["待办1", "待办2"]
}}

课堂转写记录：
{transcript}"""


def _build_template_summary(transcript: str) -> dict:
    """Generate a template-based summary when LLM is unavailable."""
    lines = [l.strip() for l in transcript.strip().split("\n") if l.strip()]
    line_count = len(lines)

    # Extract speaker names
    speakers = set()
    for line in lines:
        match = re.match(r"[【\[](.+?)[】\]]", line)
        if match:
            speakers.add(match.group(1))

    speaker_str = "、".join(speakers) if speakers else "参与者"

    return {
        "summary": f"本次课堂共有 {speaker_str} 参与，包含 {line_count} 条发言记录。",
        "key_points": [
            "课堂内容已记录完毕",
            f"共 {line_count} 条发言",
            "详细内容请查看原始转写",
        ],
        "action_items": [
            "请查看完整转写记录了解详细内容",
        ],
    }


def generate_summary(transcript: str) -> dict:
    """
    Generate structured meeting minutes from transcript text.

    Uses ZhipuAI GLM API if key is configured, otherwise falls back to
    template-based summary.
    """
    if not settings.zhipuai_api_key or settings.simulation_mode:
        logger.info("Using template summary (no API key or simulation mode)")
        return _build_template_summary(transcript)

    try:
        from zhipuai import ZhipuAI

        client = ZhipuAI(api_key=settings.zhipuai_api_key)
        prompt = PROMPT_TEMPLATE.format(transcript=transcript)

        response = client.chat.completions.create(
            model="glm-4-flash",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )

        content = response.choices[0].message.content.strip()

        # Extract JSON from response (handle markdown code blocks)
        json_match = re.search(r"\{[\s\S]*\}", content)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = json.loads(content)

        # Validate structure
        assert "summary" in result
        assert "key_points" in result
        assert "action_items" in result

        logger.info("LLM summary generated successfully")
        return result

    except Exception as e:
        logger.error("LLM summary failed: %s — falling back to template", e)
        return _build_template_summary(transcript)
```

- [ ] **Step 2: Commit**

```bash
git add backend/summarizer.py
git commit -m "[backend] 添加 LLM 纪要生成服务(智谱 GLM + 模板回退)"
```

---

### Task 4: FastAPI Main Application (`main.py`)

**Files:**
- Create: `backend/main.py`

- [ ] **Step 1: Create main.py**

Create `backend/main.py`:

```python
import logging
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from config import settings
from transcription import transcribe_audio
from summarizer import generate_summary

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="课堂会议纪要工具")

# CORS — allow frontend served from same origin or file://
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


class SummaryRequest(BaseModel):
    transcript: str


class SummaryResponse(BaseModel):
    summary: str
    key_points: list[str]
    action_items: list[str]


@app.get("/")
async def index():
    """Serve the frontend HTML."""
    html_path = FRONTEND_DIR / "index.html"
    if html_path.exists():
        return FileResponse(str(html_path))
    return {"message": "课堂会议纪要工具 API — 前端文件未找到"}


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "simulation_mode": settings.simulation_mode,
        "whisper_model": settings.whisper_model_size,
        "llm_configured": bool(settings.zhipuai_api_key),
    }


@app.websocket("/ws/transcribe")
async def ws_transcribe(ws: WebSocket):
    """
    WebSocket endpoint for real-time transcription.

    Protocol:
    - Client sends binary audio frames (PCM16, 16kHz mono)
    - Server sends back JSON: {"type": "transcript", "text": "..."}
    - Client sends JSON: {"type": "end"} to signal end of stream
    """
    await ws.accept()
    logger.info("WebSocket client connected")

    # Accumulate audio chunks for batch processing
    audio_buffer = bytearray()
    CHUNK_THRESHOLD = 16000 * 2 * 3  # 3 seconds of 16kHz 16-bit mono PCM

    try:
        while True:
            msg = await ws.receive()

            if "text" in msg:
                # JSON control message
                import json

                try:
                    data = json.loads(msg["text"])
                    if data.get("type") == "end":
                        # Flush remaining buffer
                        if audio_buffer:
                            text = transcribe_audio(bytes(audio_buffer))
                            if text:
                                await ws.send_json({"type": "transcript", "text": text})
                            audio_buffer.clear()
                        await ws.send_json({"type": "done"})
                        break
                    elif data.get("type") == "flush":
                        # Force-process current buffer
                        if audio_buffer:
                            text = transcribe_audio(bytes(audio_buffer))
                            if text:
                                await ws.send_json({"type": "transcript", "text": text})
                            audio_buffer.clear()
                except json.JSONDecodeError:
                    pass

            elif "bytes" in msg:
                # Binary audio data
                audio_buffer.extend(msg["bytes"])

                # Process when buffer reaches threshold
                while len(audio_buffer) >= CHUNK_THRESHOLD:
                    chunk = bytes(audio_buffer[:CHUNK_THRESHOLD])
                    audio_buffer = audio_buffer[CHUNK_THRESHOLD:]

                    text = transcribe_audio(chunk)
                    if text:
                        await ws.send_json({"type": "transcript", "text": text})

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error("WebSocket error: %s", e)
        try:
            await ws.close()
        except Exception:
            pass


@app.post("/api/generate_summary", response_model=SummaryResponse)
async def api_generate_summary(req: SummaryRequest):
    """Generate structured meeting minutes from transcript."""
    if not req.transcript.strip():
        return SummaryResponse(
            summary="暂无转写内容",
            key_points=[],
            action_items=[],
        )

    result = generate_summary(req.transcript)
    return SummaryResponse(**result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
```

- [ ] **Step 2: Commit**

```bash
git add backend/main.py
git commit -m "[backend] 添加 FastAPI 主应用(WebSocket + REST + 静态文件)"
```

---

### Task 5: Frontend — Real Audio & WebSocket (`app.js`)

**Files:**
- Modify: `frontend/app.js`

- [ ] **Step 1: Rewrite app.js**

Replace the entire contents of `frontend/app.js` with:

```javascript
/* ============================================
   课堂会议纪要工具 - 前端(接入后端版)
   ============================================ */

// ============================================
// 配置
// ============================================
const API_BASE = location.origin;  // 同源部署
const WS_URL = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/transcribe`;
const AUDIO_SAMPLE_RATE = 16000;
const AUDIO_CHUNK_MS = 3000;  // 3秒切片

// ============================================
// 状态
// ============================================
const state = {
  isRecording: false,
  startTime: null,
  currentSpeaker: "老师",
  speakers: ["老师", "学生A", "学生B"],
  transcript: [],     // [{ speaker, text, time }]
  summary: null,
  timerInterval: null,

  // 实时连接
  ws: null,
  mediaRecorder: null,
  audioChunks: [],
  isConnected: false,
  useSimulation: false,

  // 仿真模式
  mockTimer: null,
  mockIndex: 0,
};

// 仿真脚本(后端不可用时)
const MOCK_TRANSCRIPT = [
  { speaker: "老师", text: "同学们好,今天我们来复习第三章的函数与导数。", delay: 800 },
  { speaker: "学生A", text: "老师,导数的几何意义那部分能再讲一遍吗?", delay: 1200 },
  { speaker: "老师", text: "当然。导数在某一点的值,就是函数图像在该点处切线的斜率。", delay: 1500 },
  { speaker: "学生B", text: "那它有什么实际应用?", delay: 1000 },
  { speaker: "老师", text: "物理上,位置对时间的导数就是速度,速度的导数是加速度。", delay: 1400 },
  { speaker: "学生A", text: "明白了,我课后整理一份笔记发到学习群里。", delay: 1100 },
  { speaker: "老师", text: "好。作业是第三章课后习题第 1 到 5 题,周三课前提交。", delay: 1300 },
];

const MOCK_SUMMARY = {
  summary: "本次课堂围绕第三章「函数与导数」展开复习,讲解了导数的几何意义与物理应用,并布置了课后作业。",
  keyPoints: [
    "导数 = 函数图像在该点处切线的斜率",
    "物理应用: 位置对时间求导得速度,速度求导得加速度",
    "复习范围: 教材第三章",
  ],
  actionItems: [
    "学生A: 整理课堂笔记并发布到学习群",
    "全体学生: 完成第三章课后习题第 1-5 题,周三课前提交",
  ],
};

// ============================================
// DOM 引用
// ============================================
const $ = (sel) => document.querySelector(sel);
const els = {
  btnRecord: $("#btn-record"),
  btnReset: $("#btn-reset"),
  btnAddSpeaker: $("#btn-add-speaker"),
  btnGenerate: $("#btn-generate"),
  btnExport: $("#btn-export"),
  btnCopy: $("#btn-copy"),
  speakerList: $("#speaker-list"),
  transcript: $("#transcript"),
  summary: $("#summary"),
  statusDot: $("#status-dot"),
  statusText: $("#status-text"),
  duration: $("#duration"),
  wordCount: $("#word-count"),
  connectionBanner: $("#connection-banner"),
};

// ============================================
// 工具函数
// ============================================
function fmtTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 1800);
}

function setStatus(state_, label) {
  els.statusDot.dataset.state = state_;
  els.statusDot.title = label;
  els.statusText.textContent = label;
}

function updateWordCount() {
  const total = state.transcript.reduce((acc, l) => acc + l.text.length, 0);
  els.wordCount.textContent = `${total} 字`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showConnectionStatus(connected, simulation) {
  const banner = els.connectionBanner;
  if (!banner) return;

  if (connected && !simulation) {
    banner.hidden = true;
  } else if (connected && simulation) {
    banner.hidden = false;
    banner.className = "connection-banner is-simulation";
    banner.textContent = "仿真模式：后端 ASR 服务未就绪，使用模拟数据演示";
  } else {
    banner.hidden = false;
    banner.className = "connection-banner is-error";
    banner.textContent = "后端连接失败，请检查 127.0.0.1:8000 是否已启动";
  }
}

// ============================================
// WebSocket 连接
// ============================================
function connectWebSocket() {
  return new Promise((resolve) => {
    try {
      state.ws = new WebSocket(WS_URL);
      state.ws.binaryType = "arraybuffer";

      state.ws.onopen = () => {
        state.isConnected = true;
        logger.info("WebSocket connected");
        resolve(true);
      };

      state.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "transcript" && data.text) {
            const speaker = state.currentSpeaker;
            state.transcript.push({ speaker, text: data.text, time: Date.now() });
            appendTranscriptLine(speaker, data.text);
            updateWordCount();
          }
        } catch (e) {
          console.error("WS message parse error:", e);
        }
      };

      state.ws.onclose = () => {
        state.isConnected = false;
        if (state.isRecording) {
          stopRecording();
          toast("与后端断开连接");
        }
        showConnectionStatus(false, false);
      };

      state.ws.onerror = () => {
        state.isConnected = false;
        showConnectionStatus(false, false);
        resolve(false);
      };

      // Timeout
      setTimeout(() => {
        if (!state.isConnected) {
          resolve(false);
        }
      }, 3000);
    } catch (e) {
      resolve(false);
    }
  });
}

// ============================================
// 录音控制
// ============================================
async function startRecording() {
  // 尝试连接后端
  if (!state.isConnected) {
    const connected = await connectWebSocket();
    if (!connected) {
      // 后端不可用，进入仿真模式
      state.useSimulation = true;
      showConnectionStatus(true, true);
      toast("后端不可用，使用仿真模式");
    } else {
      // 检查后端是否为仿真模式
      try {
        const resp = await fetch(`${API_BASE}/api/health`);
        const data = await resp.json();
        state.useSimulation = data.simulation_mode;
        showConnectionStatus(true, data.simulation_mode);
      } catch {
        state.useSimulation = false;
        showConnectionStatus(true, false);
      }
    }
  }

  state.isRecording = true;
  state.startTime = Date.now();

  // UI
  els.btnRecord.classList.add("is-recording");
  els.btnRecord.querySelector(".btn-label").textContent = "停止录音";
  setStatus("recording", "录音中");
  els.btnGenerate.disabled = true;

  if (state.transcript.length === 0) {
    els.transcript.innerHTML = "";
  }

  // 计时器
  state.timerInterval = setInterval(() => {
    els.duration.textContent = fmtTime(Date.now() - state.startTime);
  }, 250);

  if (state.useSimulation) {
    // 仿真模式
    state.mockIndex = 0;
    scheduleNextMockLine();
  } else {
    // 真实录音
    await startRealRecording();
  }

  toast("已开始录音");
}

async function startRealRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: AUDIO_SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // Use MediaRecorder with webm/opus (widely supported)
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    state.mediaRecorder = new MediaRecorder(stream, { mimeType });

    state.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0 && state.ws && state.ws.readyState === WebSocket.OPEN) {
        // Send audio chunk to server
        e.data.arrayBuffer().then((buf) => {
          state.ws.send(buf);
        });
      }
    };

    // Collect chunks every AUDIO_CHUNK_MS
    state.mediaRecorder.start(AUDIO_CHUNK_MS);
  } catch (err) {
    console.error("Microphone error:", err);
    toast("麦克风权限被拒绝，请允许麦克风访问");
    stopRecording();
  }
}

function stopRecording() {
  state.isRecording = false;
  clearInterval(state.timerInterval);
  clearTimeout(state.mockTimer);

  // Stop MediaRecorder
  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
    state.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    state.mediaRecorder = null;
  }

  // Flush remaining audio to server
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "flush" }));
  }

  els.btnRecord.classList.remove("is-recording");
  els.btnRecord.querySelector(".btn-label").textContent = "继续录音";
  setStatus("stopped", "已停止");

  if (state.transcript.length > 0) {
    els.btnGenerate.disabled = false;
  }

  toast("录音已停止");
}

function toggleRecording() {
  if (state.isRecording) stopRecording();
  else startRecording();
}

function resetAll() {
  if (!confirm("确定重置吗?所有转写和纪要将被清空。")) return;

  clearInterval(state.timerInterval);
  clearTimeout(state.mockTimer);

  // Close WebSocket
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  state.isConnected = false;

  // Stop recording
  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
    state.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    state.mediaRecorder = null;
  }

  state.isRecording = false;
  state.startTime = null;
  state.transcript = [];
  state.summary = null;
  state.mockIndex = 0;
  state.useSimulation = false;

  els.btnRecord.classList.remove("is-recording");
  els.btnRecord.querySelector(".btn-label").textContent = "开始录音";
  setStatus("idle", "待机");
  els.duration.textContent = "00:00";
  els.wordCount.textContent = "0 字";
  els.btnGenerate.disabled = true;
  els.btnExport.disabled = true;
  els.btnCopy.disabled = true;

  if (els.connectionBanner) els.connectionBanner.hidden = true;

  renderEmptyTranscript();
  renderEmptySummary();

  toast("已重置");
}

// ============================================
// 仿真流式转写(后端不可用时)
// ============================================
function scheduleNextMockLine() {
  if (!state.isRecording || !state.useSimulation) return;
  if (state.mockIndex >= MOCK_TRANSCRIPT.length) {
    state.mockTimer = setTimeout(() => {
      if (state.isRecording) toast("仿真脚本播放完毕,可以停止录音");
    }, 1500);
    return;
  }

  const line = MOCK_TRANSCRIPT[state.mockIndex];
  state.mockTimer = setTimeout(() => {
    if (!state.isRecording) return;
    if (line.speaker !== state.currentSpeaker) setActiveSpeaker(line.speaker);
    streamTranscriptLine(line.speaker, line.text);
    state.mockIndex++;
  }, line.delay);
}

function streamTranscriptLine(speaker, fullText) {
  const lineEl = document.createElement("div");
  lineEl.className = "transcript-line";
  lineEl.innerHTML = `
    <div class="transcript-speaker">${speaker}</div>
    <div class="transcript-text"><span class="text-content"></span><span class="cursor"></span></div>
  `;
  els.transcript.appendChild(lineEl);
  els.transcript.scrollTop = els.transcript.scrollHeight;

  const textEl = lineEl.querySelector(".text-content");
  const cursorEl = lineEl.querySelector(".cursor");
  let i = 0;

  function typeChar() {
    if (!state.isRecording) {
      cursorEl.remove();
      return;
    }
    if (i >= fullText.length) {
      cursorEl.remove();
      state.transcript.push({ speaker, text: fullText, time: Date.now() });
      updateWordCount();
      scheduleNextMockLine();
      return;
    }
    textEl.textContent += fullText[i++];
    els.transcript.scrollTop = els.transcript.scrollHeight;
    setTimeout(typeChar, 50 + Math.random() * 60);
  }
  typeChar();
}

// ============================================
// 实时转写显示(来自后端 WebSocket)
// ============================================
function appendTranscriptLine(speaker, text) {
  const lineEl = document.createElement("div");
  lineEl.className = "transcript-line";
  lineEl.innerHTML = `
    <div class="transcript-speaker">${escapeHtml(speaker)}</div>
    <div class="transcript-text">${escapeHtml(text)}</div>
  `;
  els.transcript.appendChild(lineEl);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

function renderEmptyTranscript() {
  els.transcript.innerHTML = `
    <div class="empty-state">
      <p class="empty-title">尚未开始</p>
      <p class="empty-desc">点击右上角"开始录音",转写文本将实时出现在这里</p>
    </div>
  `;
}

// ============================================
// 说话人切换
// ============================================
function setActiveSpeaker(name) {
  state.currentSpeaker = name;
  els.speakerList.querySelectorAll(".speaker-chip").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.speaker === name);
  });
}

function renderSpeakerList() {
  els.speakerList.innerHTML = state.speakers
    .map((s) => `<button class="speaker-chip${s === state.currentSpeaker ? " is-active" : ""}" data-speaker="${s}">${s}</button>`)
    .join("");
}

function addSpeaker() {
  if (document.querySelector(".speaker-input")) return;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "speaker-input";
  input.placeholder = "新说话人";
  input.maxLength = 8;

  els.btnAddSpeaker.style.display = "none";
  els.speakerList.parentNode.insertBefore(input, els.btnAddSpeaker);
  input.focus();

  function commit() {
    const name = input.value.trim();
    if (name && !state.speakers.includes(name)) {
      state.speakers.push(name);
      renderSpeakerList();
      setActiveSpeaker(name);
      toast(`已添加: ${name}`);
    }
    input.remove();
    els.btnAddSpeaker.style.display = "";
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      input.remove();
      els.btnAddSpeaker.style.display = "";
    }
  });
  input.addEventListener("blur", commit);
}

// ============================================
// 生成纪要(真实 API 或仿真)
// ============================================
async function generateSummary() {
  if (state.transcript.length === 0) {
    toast("请先录入一些转写内容");
    return;
  }

  setStatus("generating", "生成中");
  els.btnGenerate.disabled = true;

  els.summary.innerHTML = `
    <div class="summary-loading">
      <div class="loading-dots"><span></span><span></span><span></span></div>
      <div class="loading-text">AI 正在分析转写内容,生成结构化纪要…</div>
    </div>
  `;

  try {
    let result;

    if (state.useSimulation) {
      // 仿真模式：使用 mock 数据
      await new Promise((r) => setTimeout(r, 1800));
      result = MOCK_SUMMARY;
    } else {
      // 真实 API 调用
      const transcriptText = state.transcript
        .map((l) => `【${l.speaker}】${l.text}`)
        .join("\n");

      const resp = await fetch(`${API_BASE}/api/generate_summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcriptText }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      result = await resp.json();
    }

    state.summary = result;
    renderSummary(result);
    setStatus("stopped", "已完成");
    els.btnExport.disabled = false;
    els.btnCopy.disabled = false;
    toast("纪要生成完成");
  } catch (err) {
    console.error("Summary generation failed:", err);
    toast("纪要生成失败，请重试");
    setStatus("stopped", "已停止");
  }

  els.btnGenerate.disabled = false;
}

function renderSummary(data) {
  els.summary.innerHTML = `
    <div class="summary-card is-coral">
      <div class="summary-card-head">
        <span class="summary-icon">📋</span>
        <span class="summary-card-title">摘要</span>
      </div>
      <div class="summary-card-body">
        <p>${escapeHtml(data.summary)}</p>
      </div>
    </div>

    <div class="summary-card">
      <div class="summary-card-head">
        <span class="summary-icon">⭐</span>
        <span class="summary-card-title">关键信息</span>
      </div>
      <div class="summary-card-body">
        <ul>${(data.key_points || data.keyPoints || []).map((k) => `<li>${escapeHtml(k)}</li>`).join("")}</ul>
      </div>
    </div>

    <div class="summary-card">
      <div class="summary-card-head">
        <span class="summary-icon">✅</span>
        <span class="summary-card-title">待办事项</span>
      </div>
      <div class="summary-card-body">
        <ul>${(data.action_items || data.actionItems || []).map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
      </div>
    </div>
  `;
}

function renderEmptySummary() {
  els.summary.innerHTML = `
    <div class="empty-state">
      <p class="empty-title">等待生成</p>
      <p class="empty-desc">录音结束后,点击下方按钮生成结构化纪要</p>
    </div>
  `;
}

// ============================================
// 导出 / 复制
// ============================================
function buildMarkdown() {
  const date = new Date().toLocaleString("zh-CN", { hour12: false });
  let md = `# 课堂会议纪要\n\n`;
  md += `> 生成时间: ${date}  \n`;
  md += `> 时长: ${els.duration.textContent}  \n`;
  md += `> 字数: ${els.wordCount.textContent}\n\n`;

  if (state.summary) {
    md += `## 📋 摘要\n\n${state.summary.summary}\n\n`;
    md += `## ⭐ 关键信息\n\n`;
    (state.summary.key_points || state.summary.keyPoints || []).forEach((k) => (md += `- ${k}\n`));
    md += `\n## ✅ 待办事项\n\n`;
    (state.summary.action_items || state.summary.actionItems || []).forEach((a) => (md += `- ${a}\n`));
    md += `\n---\n\n`;
  }

  md += `## 📝 原始转写\n\n`;
  state.transcript.forEach((line) => {
    md += `**${line.speaker}**: ${line.text}\n\n`;
  });
  return md;
}

function buildPlainText() {
  const date = new Date().toLocaleString("zh-CN", { hour12: false });
  let txt = `课堂会议纪要\n`;
  txt += `${"=".repeat(40)}\n`;
  txt += `生成时间: ${date}\n`;
  txt += `时长: ${els.duration.textContent}\n`;
  txt += `字数: ${els.wordCount.textContent}\n\n`;

  if (state.summary) {
    txt += `[摘要]\n${state.summary.summary}\n\n`;
    txt += `[关键信息]\n`;
    (state.summary.key_points || state.summary.keyPoints || []).forEach((k) => (txt += `  - ${k}\n`));
    txt += `\n[待办事项]\n`;
    (state.summary.action_items || state.summary.actionItems || []).forEach((a) => (txt += `  - ${a}\n`));
    txt += `\n${"-".repeat(40)}\n\n`;
  }

  txt += `[原始转写]\n\n`;
  state.transcript.forEach((line) => {
    txt += `${line.speaker}: ${line.text}\n\n`;
  });
  return txt;
}

function buildWordHTML() {
  const date = new Date().toLocaleString("zh-CN", { hour12: false });
  const css = `
    body { font-family: "Microsoft YaHei", "PingFang SC", serif; font-size: 11pt; line-height: 1.7; color: #252523; }
    h1 { font-size: 22pt; color: #141413; border-bottom: 2px solid #cc785c; padding-bottom: 6px; margin-bottom: 8pt; }
    h2 { font-size: 14pt; color: #141413; margin-top: 18pt; margin-bottom: 6pt; }
    .meta { color: #6c6a64; font-size: 10pt; margin-bottom: 14pt; }
    .meta p { margin: 2pt 0; }
    blockquote { background: #faf9f5; border-left: 3pt solid #cc785c; padding: 8pt 12pt; margin: 6pt 0; color: #252523; }
    ul { margin: 4pt 0 4pt 16pt; padding: 0; }
    li { margin: 3pt 0; }
    .transcript-line { margin: 6pt 0; }
    .transcript-speaker { color: #cc785c; font-weight: bold; }
    hr { border: none; border-top: 1px solid #e6dfd8; margin: 16pt 0; }
  `;

  let body = `<h1>课堂会议纪要</h1>`;
  body += `<div class="meta">`;
  body += `<p>生成时间: ${date}</p>`;
  body += `<p>时长: ${els.duration.textContent} &nbsp;·&nbsp; 字数: ${els.wordCount.textContent}</p>`;
  body += `</div>`;

  if (state.summary) {
    body += `<h2>📋 摘要</h2>`;
    body += `<blockquote>${escapeHtml(state.summary.summary)}</blockquote>`;
    body += `<h2>⭐ 关键信息</h2><ul>`;
    (state.summary.key_points || state.summary.keyPoints || []).forEach((k) => (body += `<li>${escapeHtml(k)}</li>`));
    body += `</ul>`;
    body += `<h2>✅ 待办事项</h2><ul>`;
    (state.summary.action_items || state.summary.actionItems || []).forEach((a) => (body += `<li>${escapeHtml(a)}</li>`));
    body += `</ul><hr/>`;
  }

  body += `<h2>📝 原始转写</h2>`;
  state.transcript.forEach((line) => {
    body += `<p class="transcript-line"><span class="transcript-speaker">${escapeHtml(line.speaker)}:</span> ${escapeHtml(line.text)}</p>`;
  });

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>课堂会议纪要</title>
<style>${css}</style>
</head>
<body>${body}</body>
</html>`;
}

const EXPORT_PROFILES = {
  md:  { build: buildMarkdown,  mime: "text/markdown;charset=utf-8",      ext: "md",  name: "Markdown" },
  doc: { build: buildWordHTML,  mime: "application/msword;charset=utf-8", ext: "doc", name: "Word 文档" },
  txt: { build: buildPlainText, mime: "text/plain;charset=utf-8",         ext: "txt", name: "纯文本" },
};

function exportAs(format) {
  const profile = EXPORT_PROFILES[format];
  if (!profile) return;

  const content = profile.build();
  const blob = new Blob(["﻿" + content], { type: profile.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  a.href = url;
  a.download = `会议纪要_${stamp}.${profile.ext}`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`已下载 ${profile.name}`);
  closeExportMenu();
}

function toggleExportMenu() {
  const menu = document.getElementById("export-menu");
  if (menu.hidden) {
    menu.hidden = false;
    setTimeout(() => document.addEventListener("click", handleOutsideClick), 0);
  } else {
    closeExportMenu();
  }
}

function closeExportMenu() {
  const menu = document.getElementById("export-menu");
  menu.hidden = true;
  document.removeEventListener("click", handleOutsideClick);
}

function handleOutsideClick(e) {
  if (!e.target.closest(".dropdown")) closeExportMenu();
}

async function copyAll() {
  const md = buildMarkdown();
  try {
    await navigator.clipboard.writeText(md);
    toast("已复制全文到剪贴板");
  } catch {
    toast("复制失败,请检查浏览器权限");
  }
}

// ============================================
// 事件绑定
// ============================================
function init() {
  els.btnRecord.addEventListener("click", toggleRecording);
  els.btnReset.addEventListener("click", resetAll);
  els.btnAddSpeaker.addEventListener("click", addSpeaker);
  els.btnGenerate.addEventListener("click", generateSummary);
  els.btnExport.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleExportMenu();
  });

  document.getElementById("export-menu").addEventListener("click", (e) => {
    const item = e.target.closest(".dropdown-item");
    if (item) exportAs(item.dataset.format);
  });

  els.btnCopy.addEventListener("click", copyAll);

  els.speakerList.addEventListener("click", (e) => {
    const chip = e.target.closest(".speaker-chip");
    if (chip) setActiveSpeaker(chip.dataset.speaker);
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      toggleRecording();
    }
  });

  // 尝试预连接后端
  connectWebSocket().then((connected) => {
    if (connected) {
      fetch(`${API_BASE}/api/health`)
        .then((r) => r.json())
        .then((data) => {
          showConnectionStatus(true, data.simulation_mode);
        })
        .catch(() => {
          showConnectionStatus(true, false);
        });
    } else {
      showConnectionStatus(false, false);
    }
  });
}

init();
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app.js
git commit -m "[frontend] 替换 mock 为真实录音 + WebSocket + API 调用"
```

---

### Task 6: Frontend HTML — Connection Banner

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add connection banner to index.html**

Add a connection status banner after the `<header>` tag. Also update the footer text.

In `frontend/index.html`, add after the `</header>` closing tag (around line 32):

```html
  <div id="connection-banner" class="connection-banner" hidden></div>
```

Also update the footer text (line 119-121) to remove the "尚未接入" disclaimer:

```html
  <footer class="page-footer">
    <span>数字语音处理课程项目 · 2026</span>
  </footer>
```

- [ ] **Step 2: Add CSS for connection banner**

In `frontend/style.css`, add before the `@media` responsive section:

```css
/* ============================================
   Connection banner
   ============================================ */
.connection-banner {
  padding: var(--s-xs) var(--s-xl);
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  animation: slide-in 0.3s ease;
}

.connection-banner.is-error {
  background: #fdecea;
  color: var(--color-error);
  border-bottom: 1px solid #f5c6cb;
}

.connection-banner.is-simulation {
  background: #fff8e1;
  color: #856404;
  border-bottom: 1px solid #ffeeba;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html frontend/style.css
git commit -m "[frontend] 添加后端连接状态提示条"
```

---

### Task 7: README & Launch Script

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README quick-start section**

Update the "快速开始" section in `README.md` to reflect the integrated system:

```markdown
## 快速开始

### 一键启动 (推荐)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate     # Windows
pip install -r requirements.txt
cp .env.example .env       # 可选: 填入智谱 API key 启用真实摘要生成
python main.py
```

然后浏览器打开 http://127.0.0.1:8000

### 仿真模式

不安装 faster-whisper 也可运行 — 将 `.env` 中设 `SIMULATION_MODE=true`，系统会使用模拟数据演示完整流程。

### 前端独立 Demo (无需后端)

```bash
# 直接双击打开
frontend/index.html
```

操作:
1. 点击右上角"开始录音"(或按空格)
2. 转写文本会按预设脚本流式出现
3. 录音停止后点"一键生成会议纪要"
4. 通过底部"导出"下拉选择 Markdown / Word / 纯文本 下载
```

Also update the progress checklist:

```markdown
## 当前进度

- [x] 项目方案设计 (见 `docs/`)
- [x] 前端 UI Mock Demo (双栏布局 + 流式转写 + 三格式导出)
- [x] 后端 FastAPI 服务 (WebSocket + REST API)
- [x] faster-whisper 实时转录接入
- [x] GLM 摘要生成接入 (智谱 GLM-4-Flash)
- [x] 端到端联调
- [ ] 项目报告
- [ ] 5 分钟演示视频
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "[docs] 更新 README 反映已完成的后端集成"
```

---

### Task 8: End-to-End Smoke Test

- [ ] **Step 1: Install backend dependencies**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

- [ ] **Step 2: Start backend in simulation mode**

Create a `.env` file in `backend/` with:
```
SIMULATION_MODE=true
```

Then run:
```bash
cd backend
python main.py
```

Expected: Server starts on http://127.0.0.1:8000

- [ ] **Step 3: Test health endpoint**

```bash
curl http://127.0.0.1:8000/api/health
```

Expected: `{"status":"ok","simulation_mode":true,...}`

- [ ] **Step 4: Test summary endpoint**

```bash
curl -X POST http://127.0.0.1:8000/api/generate_summary \
  -H "Content-Type: application/json" \
  -d '{"transcript":"【老师】同学们好\n【学生A】老师好"}'
```

Expected: JSON with summary, key_points, action_items

- [ ] **Step 5: Open frontend in browser**

Navigate to http://127.0.0.1:8000 — verify the page loads and connection banner behavior is correct.

- [ ] **Step 6: Full integration test**

1. Click "开始录音" — verify simulation mode kicks in
2. Watch transcript lines appear
3. Click "停止录音"
4. Click "一键生成会议纪要" — verify summary appears
5. Test export buttons

- [ ] **Step 7: Final commit with all changes**

```bash
git add -A
git status  # verify no .env or secrets staged
git commit -m "[集成] 完成前后端联调 — 端到端可运行"
```
