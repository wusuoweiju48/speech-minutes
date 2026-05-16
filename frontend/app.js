/* ============================================
   课堂会议纪要工具 - 前端 UI Demo
   所有数据均为 mock,展示完整交互流程
   ============================================ */

// 预设转写脚本(模拟课堂场景)
const MOCK_TRANSCRIPT = [
  { speaker: '老师', text: '同学们好,今天我们来复习第三章的函数与导数。', delay: 800 },
  { speaker: '学生A', text: '老师,导数的几何意义那部分能再讲一遍吗?', delay: 1200 },
  { speaker: '老师', text: '当然。导数在某一点的值,就是函数图像在该点处切线的斜率。', delay: 1500 },
  { speaker: '学生B', text: '那它有什么实际应用?', delay: 1000 },
  { speaker: '老师', text: '物理上,位置对时间的导数就是速度,速度的导数是加速度。', delay: 1400 },
  { speaker: '学生A', text: '明白了,我课后整理一份笔记发到学习群里。', delay: 1100 },
  { speaker: '老师', text: '好。作业是第三章课后习题第 1 到 5 题,周三课前提交。', delay: 1300 },
];

// 预设的 AI 纪要结果
const MOCK_SUMMARY = {
  summary: '本次课堂围绕第三章「函数与导数」展开复习,讲解了导数的几何意义与物理应用,并布置了课后作业。',
  keyPoints: [
    '导数 = 函数图像在该点处切线的斜率',
    '物理应用: 位置对时间求导得速度,速度求导得加速度',
    '复习范围: 教材第三章',
  ],
  actionItems: [
    '学生A: 整理课堂笔记并发布到学习群',
    '全体学生: 完成第三章课后习题第 1-5 题,周三课前提交',
  ],
};

// ============================================
// 状态
// ============================================
const state = {
  isRecording: false,
  startTime: null,
  currentSpeaker: '老师',
  speakers: ['老师', '学生A', '学生B'],
  transcript: [],     // [{ speaker, text, time }]
  summary: null,
  timerInterval: null,
  mockTimer: null,
  mockIndex: 0,
};

// ============================================
// DOM 引用
// ============================================
const $ = (sel) => document.querySelector(sel);
const els = {
  btnRecord: $('#btn-record'),
  btnReset: $('#btn-reset'),
  btnAddSpeaker: $('#btn-add-speaker'),
  btnGenerate: $('#btn-generate'),
  btnExport: $('#btn-export'),
  btnCopy: $('#btn-copy'),
  speakerList: $('#speaker-list'),
  transcript: $('#transcript'),
  summary: $('#summary'),
  statusDot: $('#status-dot'),
  statusText: $('#status-text'),
  duration: $('#duration'),
  wordCount: $('#word-count'),
};

// ============================================
// 工具函数
// ============================================
function fmtTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 1800);
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

// ============================================
// 录音控制
// ============================================
function startRecording() {
  state.isRecording = true;
  state.startTime = Date.now();
  state.mockIndex = 0;

  // UI
  els.btnRecord.classList.add('is-recording');
  els.btnRecord.querySelector('.btn-label').textContent = '停止录音';
  setStatus('recording', '录音中');
  els.btnGenerate.disabled = true;

  // 清空空状态
  if (state.transcript.length === 0) {
    els.transcript.innerHTML = '';
  }

  // 计时器
  state.timerInterval = setInterval(() => {
    els.duration.textContent = fmtTime(Date.now() - state.startTime);
  }, 250);

  // 启动 mock 流式转写
  scheduleNextMockLine();

  toast('已开始录音');
}

function stopRecording() {
  state.isRecording = false;
  clearInterval(state.timerInterval);
  clearTimeout(state.mockTimer);

  els.btnRecord.classList.remove('is-recording');
  els.btnRecord.querySelector('.btn-label').textContent = '继续录音';
  setStatus('stopped', '已停止');

  if (state.transcript.length > 0) {
    els.btnGenerate.disabled = false;
  }

  toast('录音已停止');
}

function toggleRecording() {
  if (state.isRecording) stopRecording();
  else startRecording();
}

function resetAll() {
  if (!confirm('确定重置吗?所有转写和纪要将被清空。')) return;

  clearInterval(state.timerInterval);
  clearTimeout(state.mockTimer);

  state.isRecording = false;
  state.startTime = null;
  state.transcript = [];
  state.summary = null;
  state.mockIndex = 0;

  els.btnRecord.classList.remove('is-recording');
  els.btnRecord.querySelector('.btn-label').textContent = '开始录音';
  setStatus('idle', '待机');
  els.duration.textContent = '00:00';
  els.wordCount.textContent = '0 字';
  els.btnGenerate.disabled = true;
  els.btnExport.disabled = true;
  els.btnCopy.disabled = true;

  renderEmptyTranscript();
  renderEmptySummary();

  toast('已重置');
}

// ============================================
// Mock 流式转写
// ============================================
function scheduleNextMockLine() {
  if (!state.isRecording) return;
  if (state.mockIndex >= MOCK_TRANSCRIPT.length) {
    // 脚本播完后,等3秒提示
    state.mockTimer = setTimeout(() => {
      if (state.isRecording) {
        toast('已到脚本末尾,可以停止录音并生成纪要');
      }
    }, 1500);
    return;
  }

  const line = MOCK_TRANSCRIPT[state.mockIndex];
  state.mockTimer = setTimeout(() => {
    if (!state.isRecording) return;

    // 自动按脚本切换说话人(同时也保留用户手动切换的能力)
    if (line.speaker !== state.currentSpeaker) {
      setActiveSpeaker(line.speaker);
    }

    streamTranscriptLine(line.speaker, line.text);
    state.mockIndex++;
  }, line.delay);
}

function streamTranscriptLine(speaker, fullText) {
  // 创建行元素,文本逐字"打字"出现
  const lineEl = document.createElement('div');
  lineEl.className = 'transcript-line';
  lineEl.innerHTML = `
    <div class="transcript-speaker">${speaker}</div>
    <div class="transcript-text"><span class="text-content"></span><span class="cursor"></span></div>
  `;
  els.transcript.appendChild(lineEl);
  els.transcript.scrollTop = els.transcript.scrollHeight;

  const textEl = lineEl.querySelector('.text-content');
  const cursorEl = lineEl.querySelector('.cursor');
  let i = 0;

  function typeChar() {
    if (!state.isRecording) {
      cursorEl.remove();
      return;
    }
    if (i >= fullText.length) {
      cursorEl.remove();
      // 写完此句,把转写记录入状态,再排下一句
      state.transcript.push({ speaker, text: fullText, time: Date.now() });
      updateWordCount();
      scheduleNextMockLine();
      return;
    }
    textEl.textContent += fullText[i++];
    els.transcript.scrollTop = els.transcript.scrollHeight;
    setTimeout(typeChar, 50 + Math.random() * 60);  // 50~110ms 随机,模拟自然节奏
  }
  typeChar();
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
  els.speakerList.querySelectorAll('.speaker-chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.speaker === name);
  });
}

function renderSpeakerList() {
  els.speakerList.innerHTML = state.speakers
    .map(
      (s) => `<button class="speaker-chip${s === state.currentSpeaker ? ' is-active' : ''}" data-speaker="${s}">${s}</button>`
    )
    .join('');
}

function addSpeaker() {
  // inline input
  if (document.querySelector('.speaker-input')) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'speaker-input';
  input.placeholder = '新说话人';
  input.maxLength = 8;

  els.btnAddSpeaker.style.display = 'none';
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
    els.btnAddSpeaker.style.display = '';
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') {
      input.remove();
      els.btnAddSpeaker.style.display = '';
    }
  });
  input.addEventListener('blur', commit);
}

// ============================================
// 生成纪要(mock LLM)
// ============================================
function generateSummary() {
  if (state.transcript.length === 0) {
    toast('请先录入一些转写内容');
    return;
  }

  setStatus('generating', '生成中');
  els.btnGenerate.disabled = true;

  els.summary.innerHTML = `
    <div class="summary-loading">
      <div class="loading-dots"><span></span><span></span><span></span></div>
      <div class="loading-text">AI 正在分析转写内容,生成结构化纪要…</div>
    </div>
  `;

  // 模拟 LLM 延时
  setTimeout(() => {
    state.summary = MOCK_SUMMARY;
    renderSummary(MOCK_SUMMARY);
    setStatus('stopped', '已完成');
    els.btnGenerate.disabled = false;
    els.btnExport.disabled = false;
    els.btnCopy.disabled = false;
    toast('纪要生成完成');
  }, 1800);
}

function renderSummary(data) {
  els.summary.innerHTML = `
    <div class="summary-card is-coral">
      <div class="summary-card-head">
        <span class="summary-icon">📋</span>
        <span class="summary-card-title">摘要</span>
      </div>
      <div class="summary-card-body">
        <p>${data.summary}</p>
      </div>
    </div>

    <div class="summary-card">
      <div class="summary-card-head">
        <span class="summary-icon">⭐</span>
        <span class="summary-card-title">关键信息</span>
      </div>
      <div class="summary-card-body">
        <ul>${data.keyPoints.map((k) => `<li>${escapeHtml(k)}</li>`).join('')}</ul>
      </div>
    </div>

    <div class="summary-card">
      <div class="summary-card-head">
        <span class="summary-icon">✅</span>
        <span class="summary-card-title">待办事项</span>
      </div>
      <div class="summary-card-body">
        <ul>${data.actionItems.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
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

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============================================
// 导出 / 复制
// ============================================
function buildMarkdown() {
  const date = new Date().toLocaleString('zh-CN', { hour12: false });
  let md = `# 课堂会议纪要\n\n`;
  md += `> 生成时间: ${date}  \n`;
  md += `> 时长: ${els.duration.textContent}  \n`;
  md += `> 字数: ${els.wordCount.textContent}\n\n`;

  if (state.summary) {
    md += `## 📋 摘要\n\n${state.summary.summary}\n\n`;
    md += `## ⭐ 关键信息\n\n`;
    state.summary.keyPoints.forEach((k) => (md += `- ${k}\n`));
    md += `\n## ✅ 待办事项\n\n`;
    state.summary.actionItems.forEach((a) => (md += `- ${a}\n`));
    md += `\n---\n\n`;
  }

  md += `## 📝 原始转写\n\n`;
  state.transcript.forEach((line) => {
    md += `**${line.speaker}**: ${line.text}\n\n`;
  });
  return md;
}

function buildPlainText() {
  const date = new Date().toLocaleString('zh-CN', { hour12: false });
  let txt = `课堂会议纪要\n`;
  txt += `${'='.repeat(40)}\n`;
  txt += `生成时间: ${date}\n`;
  txt += `时长: ${els.duration.textContent}\n`;
  txt += `字数: ${els.wordCount.textContent}\n\n`;

  if (state.summary) {
    txt += `[摘要]\n${state.summary.summary}\n\n`;
    txt += `[关键信息]\n`;
    state.summary.keyPoints.forEach((k) => (txt += `  - ${k}\n`));
    txt += `\n[待办事项]\n`;
    state.summary.actionItems.forEach((a) => (txt += `  - ${a}\n`));
    txt += `\n${'-'.repeat(40)}\n\n`;
  }

  txt += `[原始转写]\n\n`;
  state.transcript.forEach((line) => {
    txt += `${line.speaker}: ${line.text}\n\n`;
  });
  return txt;
}

function buildWordHTML() {
  const date = new Date().toLocaleString('zh-CN', { hour12: false });
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
    state.summary.keyPoints.forEach((k) => (body += `<li>${escapeHtml(k)}</li>`));
    body += `</ul>`;
    body += `<h2>✅ 待办事项</h2><ul>`;
    state.summary.actionItems.forEach((a) => (body += `<li>${escapeHtml(a)}</li>`));
    body += `</ul><hr/>`;
  }

  body += `<h2>📝 原始转写</h2>`;
  state.transcript.forEach((line) => {
    body += `<p class="transcript-line"><span class="transcript-speaker">${escapeHtml(line.speaker)}:</span> ${escapeHtml(line.text)}</p>`;
  });

  // Word 通过 MS Office XML namespace 识别本文档为 Word 文档
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
  md:  { build: buildMarkdown,  mime: 'text/markdown;charset=utf-8',          ext: 'md',  name: 'Markdown' },
  doc: { build: buildWordHTML,  mime: 'application/msword;charset=utf-8',     ext: 'doc', name: 'Word 文档' },
  txt: { build: buildPlainText, mime: 'text/plain;charset=utf-8',             ext: 'txt', name: '纯文本' },
};

function exportAs(format) {
  const profile = EXPORT_PROFILES[format];
  if (!profile) return;

  // Word/中文场景加 BOM (﻿) 防止乱码
  const content = profile.build();
  const blob = new Blob(['﻿' + content], { type: profile.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  a.href = url;
  a.download = `会议纪要_${stamp}.${profile.ext}`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`已下载 ${profile.name}`);
  closeExportMenu();
}

function toggleExportMenu() {
  const menu = document.getElementById('export-menu');
  if (menu.hidden) {
    menu.hidden = false;
    setTimeout(() => document.addEventListener('click', handleOutsideClick), 0);
  } else {
    closeExportMenu();
  }
}

function closeExportMenu() {
  const menu = document.getElementById('export-menu');
  menu.hidden = true;
  document.removeEventListener('click', handleOutsideClick);
}

function handleOutsideClick(e) {
  if (!e.target.closest('.dropdown')) closeExportMenu();
}

async function copyAll() {
  const md = buildMarkdown();
  try {
    await navigator.clipboard.writeText(md);
    toast('已复制全文到剪贴板');
  } catch {
    toast('复制失败,请检查浏览器权限');
  }
}

// ============================================
// 事件绑定
// ============================================
function init() {
  els.btnRecord.addEventListener('click', toggleRecording);
  els.btnReset.addEventListener('click', resetAll);
  els.btnAddSpeaker.addEventListener('click', addSpeaker);
  els.btnGenerate.addEventListener('click', generateSummary);
  els.btnExport.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExportMenu();
  });

  // 下拉菜单内具体格式选择
  document.getElementById('export-menu').addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (item) exportAs(item.dataset.format);
  });

  els.btnCopy.addEventListener('click', copyAll);

  // 说话人按钮(事件委托)
  els.speakerList.addEventListener('click', (e) => {
    const chip = e.target.closest('.speaker-chip');
    if (chip) setActiveSpeaker(chip.dataset.speaker);
  });

  // 空格快捷键开始/停止
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      toggleRecording();
    }
  });
}

init();
