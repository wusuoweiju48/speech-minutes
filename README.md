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
| 实时 ASR | faster-whisper (small 模型, 本地推理) |
| 摘要生成 | 智谱 GLM-3 API |
| UI 风格 | Anthropic 暖色调 (cream + coral) |

## 目录结构

```
.
├── frontend/              # 前端 UI(已完成 mock demo)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── backend/               # 后端服务(待开发)
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
- [ ] 后端 FastAPI 骨架
- [ ] faster-whisper 实时转录接入
- [ ] GLM-3 摘要生成接入
- [ ] 端到端联调
- [ ] 项目报告
- [ ] 5 分钟演示视频

## 快速开始

### 前端 Demo (无需依赖)

```bash
# 直接双击打开
frontend/index.html
```

操作:
1. 点击右上角"开始录音"(或按空格)
2. 转写文本会按预设脚本流式出现
3. 录音停止后点"一键生成会议纪要"
4. 通过底部"导出"下拉选择 Markdown / Word / 纯文本 下载

### 后端(待开发)

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate  # Windows
pip install -r requirements.txt
cp .env.example .env    # 填入 GLM API key
uvicorn main:app --reload
```

## 协作约定

- 主分支 `master` 保持可运行
- 大改动新建 feature 分支 (例: `feature/whisper-integration`),完成后提 Pull Request
- 提交信息格式: `[模块] 简短描述`,例: `[frontend] 添加导出 docx 功能`
- 不要提交 `.env`、模型文件、本地配置(已在 `.gitignore` 里)

## 参考资料

- 项目设计文档: `docs/superpowers/specs/2026-05-13-语音识别课堂会议纪要工具-design.md`
- UI 视觉规范: `DESIGN.md`
- 课程要求: `期末作业相关信息.txt`
