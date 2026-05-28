import json
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


class SummaryRequest(BaseModel):
    transcript: str


class SummaryResponse(BaseModel):
    summary: str
    key_points: list[str]
    action_items: list[str]


@app.get("/")
async def index():
    html = FRONTEND_DIR / "index.html"
    if html.exists():
        return FileResponse(str(html))
    return {"message": "课堂会议纪要工具 API"}


@app.get("/style.css")
async def css():
    return FileResponse(str(FRONTEND_DIR / "style.css"), media_type="text/css")


@app.get("/app.js")
async def js():
    return FileResponse(str(FRONTEND_DIR / "app.js"), media_type="application/javascript")


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
    await ws.accept()
    logger.info("WebSocket connected")

    buf = bytearray()
    CHUNK = 16000 * 2 * 3  # 3秒 16kHz 16bit mono

    try:
        while True:
            msg = await ws.receive()

            if "text" in msg:
                try:
                    data = json.loads(msg["text"])
                    if data.get("type") == "end":
                        if buf:
                            text = transcribe_audio(bytes(buf))
                            if text:
                                await ws.send_json({"type": "transcript", "text": text})
                            buf.clear()
                        await ws.send_json({"type": "done"})
                        break
                    elif data.get("type") == "flush":
                        if buf:
                            text = transcribe_audio(bytes(buf))
                            if text:
                                await ws.send_json({"type": "transcript", "text": text})
                            buf.clear()
                except json.JSONDecodeError:
                    pass

            elif "bytes" in msg:
                buf.extend(msg["bytes"])
                while len(buf) >= CHUNK:
                    chunk = bytes(buf[:CHUNK])
                    buf = buf[CHUNK:]
                    text = transcribe_audio(chunk)
                    if text:
                        await ws.send_json({"type": "transcript", "text": text})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error("WebSocket error: %s", e)
        try:
            await ws.close()
        except Exception:
            pass


@app.post("/api/generate_summary", response_model=SummaryResponse)
async def api_generate_summary(req: SummaryRequest):
    if not req.transcript.strip():
        return SummaryResponse(summary="暂无转写内容", key_points=[], action_items=[])
    result = generate_summary(req.transcript)
    return SummaryResponse(**result)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8080, reload=True)
