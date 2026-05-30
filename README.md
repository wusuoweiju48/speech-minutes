# 基于语音识别的课堂会议纪要自动生成工具

> 数字语音处理课程 · 期末项目

实时识别课堂讲话内容,自动生成结构化的会议纪要(摘要 / 关键信息 / 待办事项),支持多发言人手动标注与多格式导出。

## 团队

- 成员 1 - 分工
- 成员 2 - 分工
- 成员 3 - 分工

*(请大家补充自己的姓名和分工)*

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | 纯 HTML + JavaScript (零构建工具) |
| 后端 | Python FastAPI + WebSocket |
| 实时 ASR | openai-whisper (base 模型, 本地推理) |
| 摘要生成 | 智谱 GLM-4.7-Flash API |
| UI 风格 | Anthropic 暖色调 (cream + coral) |

## 目录结构

```
.
├── frontend/              # 前端 UI
│   ├── index.html
│   ├── style.css
│   └── app.js
├── backend/               # 后端服务
│   ├── main.py            # FastAPI 主应用
│   ├── config.py          # 配置管理
│   ├── transcription.py   # ASR 转写 (openai-whisper)
│   ├── summarizer.py      # 纪要生成 (智谱 GLM)
│   ├── requirements.txt
│   └── .env.example
├── docs/                  # 项目设计文档
│   └── superpowers/specs/2026-05-13-语音识别课堂会议纪要工具-design.md
├── DESIGN.md              # UI 视觉规范(Anthropic 风格参考)
└── README.md
```

## 当前进度

- [x] 项目方案设计 (见 `docs/`)
- [x] 前端 UI Mock Demo (双栏布局 + 流式转写 + 三格式导出)
- [x] 后端 FastAPI 服务 (WebSocket + REST API)
- [x] openai-whisper 实时转录接入 (含静音检测 + 幻觉过滤)
- [x] GLM 摘要生成接入 (智谱 GLM-4.7-Flash)
- [x] 端到端联调
- [x] 项目报告 (见 `docs/项目报告.md`)
- [ ] 5 分钟演示视频

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

然后浏览器打开 http://127.0.0.1:8080

### 仿真模式

不安装 whisper 也可运行 — 将 `.env` 中设 `SIMULATION_MODE=true`，系统会使用模拟数据演示完整流程。

### 前端独立 Demo (无需后端)

```bash
# 直接双击打开
frontend/index.html
```

操作:
1. 点击右上角"开始录音"(或按空格)
2. 转写文本会实时出现 (仿真模式使用预设脚本)
3. 录音停止后点"一键生成会议纪要"
4. 通过底部"导出"下拉选择 Markdown / Word / 纯文本 下载

## 协作约定

- 主分支 `master` 保持可运行
- 大改动新建 feature 分支 (例: `feature/whisper-integration`),完成后提 Pull Request
- 提交信息格式: `[模块] 简短描述`,例: `[frontend] 添加导出 docx 功能`
- 不要提交 `.env`、模型文件、本地配置(已在 `.gitignore` 里)

## 参考资料

- 项目设计文档: `docs/superpowers/specs/2026-05-13-语音识别课堂会议纪要工具-design.md`
- UI 视觉规范: `DESIGN.md`
- 课程要求: `期末作业相关信息.txt`
