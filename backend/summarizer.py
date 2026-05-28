import json
import logging
import re

import httpx

from config import settings

logger = logging.getLogger(__name__)

PROMPT = """你是一个课堂会议纪要助手。请根据以下课堂转写记录，生成结构化的会议纪要。

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

API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"


def _template_summary(text: str) -> dict:
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    speakers = set()
    for line in lines:
        m = re.match(r"[【\[](.+?)[】\]]", line)
        if m:
            speakers.add(m.group(1))
    who = "、".join(speakers) if speakers else "参与者"
    return {
        "summary": f"本次课堂共有 {who} 参与，包含 {len(lines)} 条发言记录。",
        "key_points": ["课堂内容已记录完毕", f"共 {len(lines)} 条发言", "详细内容请查看原始转写"],
        "action_items": ["请查看完整转写记录了解详细内容"],
    }


def generate_summary(transcript: str) -> dict:
    if not settings.zhipuai_api_key or settings.simulation_mode:
        logger.info("Using template summary")
        return _template_summary(transcript)

    try:
        resp = httpx.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {settings.zhipuai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "glm-4-flash",
                "messages": [{"role": "user", "content": PROMPT.format(transcript=transcript)}],
                "temperature": 0.7,
                "max_tokens": 1024,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"].strip()

        m = re.search(r"\{[\s\S]*\}", content)
        result = json.loads(m.group() if m else content)
        assert all(k in result for k in ("summary", "key_points", "action_items"))
        logger.info("LLM summary OK")
        return result
    except Exception as e:
        logger.error("LLM failed: %s — fallback", e)
        return _template_summary(transcript)
