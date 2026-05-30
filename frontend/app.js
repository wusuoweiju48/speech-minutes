/* ============================================
   课堂会议纪要工具 - 前端(接入后端版)
   ============================================ */

// 配置
const API_BASE = location.origin;
const WS_URL = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/transcribe`;

// 状态
const state = {
  isRecording: false,
  startTime: null,
  currentSpeaker: "老师",
  speakers: ["老师", "学生A", "学生B"],
  transcript: [],
  summary: null,
  timerInterval: null,
  ws: null,
  mediaRecorder: null,
  isConnected: false,
  useSimulation: false,
  mockTimer: null,
  mockIndex: 0,
};

// 仿真脚本
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
  key_points: [
    "导数 = 函数图像在该点处切线的斜率",
    "物理应用: 位置对时间求导得速度,速度求导得加速度",
    "复习范围: 教材第三章",
  ],
  action_items: [
    "学生A: 整理课堂笔记并发布到学习群",
    "全体学生: 完成第三章课后习题第 1-5 题,周三课前提交",
  ],
};

// DOM
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

// 工具
function fmtTime(ms) {
  const t = Math.floor(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 1800);
}

function setStatus(s, label) {
  els.statusDot.dataset.state = s;
  els.statusDot.title = label;
  els.statusText.textContent = label;
}

function updateWordCount() {
  els.wordCount.textContent = `${state.transcript.reduce((a, l) => a + l.text.length, 0)} 字`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showConnectionStatus(connected, sim) {
  const b = els.connectionBanner;
  if (!b) return;
  if (connected && !sim) { b.hidden = true; }
  else if (connected && sim) { b.hidden = false; b.className = "connection-banner is-simulation"; b.textContent = "仿真模式：后端 ASR 未就绪，使用模拟数据演示"; }
  else { b.hidden = false; b.className = "connection-banner is-error"; b.textContent = "后端连接失败，请检查 127.0.0.1:8080 是否已启动"; }
}

// WebSocket
function connectWebSocket() {
  return new Promise((resolve) => {
    try {
      state.ws = new WebSocket(WS_URL);
      state.ws.binaryType = "arraybuffer";
      state.ws.onopen = () => { state.isConnected = true; resolve(true); };
      state.ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          console.log("[WS] received:", d);
          if (d.type === "transcript" && d.text) {
            state.transcript.push({ speaker: state.currentSpeaker, text: d.text, time: Date.now() });
            appendTranscriptLine(state.currentSpeaker, d.text);
            updateWordCount();
            els.btnGenerate.disabled = false;  // 有转写内容就启用按钮
          }
        } catch (err) { console.error("[WS] parse error:", err); }
      };
      state.ws.onclose = () => { state.isConnected = false; if (state.isRecording) { stopRecording(); toast("与后端断开连接"); } showConnectionStatus(false, false); };
      state.ws.onerror = () => { state.isConnected = false; showConnectionStatus(false, false); resolve(false); };
      setTimeout(() => { if (!state.isConnected) resolve(false); }, 3000);
    } catch { resolve(false); }
  });
}

// 录音
async function startRecording() {
  if (!state.isConnected) {
    const ok = await connectWebSocket();
    if (!ok) {
      state.useSimulation = true;
      showConnectionStatus(true, true);
      toast("后端不可用，使用仿真模式");
    } else {
      try {
        const r = await fetch(`${API_BASE}/api/health`);
        const d = await r.json();
        state.useSimulation = d.simulation_mode;
        showConnectionStatus(true, d.simulation_mode);
      } catch { state.useSimulation = false; showConnectionStatus(true, false); }
    }
  }

  state.isRecording = true;
  state.startTime = Date.now();
  els.btnRecord.classList.add("is-recording");
  els.btnRecord.querySelector(".btn-label").textContent = "停止录音";
  setStatus("recording", "录音中");
  els.btnGenerate.disabled = true;
  if (state.transcript.length === 0) els.transcript.innerHTML = "";

  state.timerInterval = setInterval(() => { els.duration.textContent = fmtTime(Date.now() - state.startTime); }, 250);

  if (state.useSimulation) { state.mockIndex = 0; scheduleNextMockLine(); }
  else await startRealRecording();

  toast("已开始录音");
}

async function startRealRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const source = audioCtx.createMediaStreamSource(stream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);

    state.audioCtx = audioCtx;
    state.audioStream = stream;
    state.audioProcessor = processor;
    state.pcmBuffer = new Int16Array(0);

    processor.onaudioprocess = (e) => {
      if (!state.isRecording) return;
      const float32 = e.inputBuffer.getChannelData(0);
      // float32 转 int16
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      // 拼接缓冲区
      const newBuf = new Int16Array(state.pcmBuffer.length + int16.length);
      newBuf.set(state.pcmBuffer);
      newBuf.set(int16, state.pcmBuffer.length);
      state.pcmBuffer = newBuf;

      // 每 3 秒（48000 样本 @16kHz）发送一次
      if (state.pcmBuffer.length >= 16000 * 3) {
        const chunk = state.pcmBuffer.buffer;
        state.pcmBuffer = new Int16Array(0);
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
          state.ws.send(chunk);
        }
      }
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);
  } catch (err) {
    console.error("麦克风错误:", err);
    toast("麦克风权限被拒绝");
    stopRecording();
  }
}

function stopRecording() {
  state.isRecording = false;
  clearInterval(state.timerInterval);
  clearTimeout(state.mockTimer);

  // 停止 Web Audio
  if (state.audioProcessor) { state.audioProcessor.disconnect(); state.audioProcessor = null; }
  if (state.audioCtx) { state.audioCtx.close(); state.audioCtx = null; }
  if (state.audioStream) { state.audioStream.getTracks().forEach((t) => t.stop()); state.audioStream = null; }
  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
    state.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    state.mediaRecorder = null;
  }

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "flush" }));
  }

  els.btnRecord.classList.remove("is-recording");
  els.btnRecord.querySelector(".btn-label").textContent = "继续录音";
  setStatus("stopped", "已停止");
  els.btnGenerate.disabled = false;
  toast("录音已停止");
}

function toggleRecording() { state.isRecording ? stopRecording() : startRecording(); }

function resetAll() {
  if (!confirm("确定重置吗?所有转写和纪要将被清空。")) return;
  clearInterval(state.timerInterval);
  clearTimeout(state.mockTimer);
  if (state.ws) { state.ws.close(); state.ws = null; }
  state.isConnected = false;
  if (state.audioProcessor) { state.audioProcessor.disconnect(); state.audioProcessor = null; }
  if (state.audioCtx) { state.audioCtx.close(); state.audioCtx = null; }
  if (state.audioStream) { state.audioStream.getTracks().forEach((t) => t.stop()); state.audioStream = null; }
  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
    state.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    state.mediaRecorder = null;
  }
  state.isRecording = false; state.startTime = null; state.transcript = []; state.summary = null; state.mockIndex = 0; state.useSimulation = false;
  els.btnRecord.classList.remove("is-recording");
  els.btnRecord.querySelector(".btn-label").textContent = "开始录音";
  setStatus("idle", "待机");
  els.duration.textContent = "00:00"; els.wordCount.textContent = "0 字";
  els.btnGenerate.disabled = true; els.btnExport.disabled = true; els.btnCopy.disabled = true;
  if (els.connectionBanner) els.connectionBanner.hidden = true;
  renderEmptyTranscript(); renderEmptySummary();
  toast("已重置");
}

// 仿真
function scheduleNextMockLine() {
  if (!state.isRecording || !state.useSimulation) return;
  if (state.mockIndex >= MOCK_TRANSCRIPT.length) { state.mockTimer = setTimeout(() => { if (state.isRecording) toast("仿真脚本播放完毕"); }, 1500); return; }
  const line = MOCK_TRANSCRIPT[state.mockIndex];
  state.mockTimer = setTimeout(() => {
    if (!state.isRecording) return;
    if (line.speaker !== state.currentSpeaker) setActiveSpeaker(line.speaker);
    streamTranscriptLine(line.speaker, line.text);
    state.mockIndex++;
  }, line.delay);
}

function streamTranscriptLine(speaker, text) {
  const el = document.createElement("div");
  el.className = "transcript-line";
  el.innerHTML = `<div class="transcript-speaker">${speaker}</div><div class="transcript-text"><span class="text-content"></span><span class="cursor"></span></div>`;
  els.transcript.appendChild(el);
  els.transcript.scrollTop = els.transcript.scrollHeight;
  const t = el.querySelector(".text-content"), c = el.querySelector(".cursor");
  let i = 0;
  function type() {
    if (!state.isRecording) { c.remove(); return; }
    if (i >= text.length) { c.remove(); state.transcript.push({ speaker, text, time: Date.now() }); updateWordCount(); scheduleNextMockLine(); return; }
    t.textContent += text[i++];
    els.transcript.scrollTop = els.transcript.scrollHeight;
    setTimeout(type, 50 + Math.random() * 60);
  }
  type();
}

function appendTranscriptLine(speaker, text) {
  const el = document.createElement("div");
  el.className = "transcript-line";
  el.innerHTML = `<div class="transcript-speaker">${escapeHtml(speaker)}</div><div class="transcript-text">${escapeHtml(text)}</div>`;
  els.transcript.appendChild(el);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

function renderEmptyTranscript() {
  els.transcript.innerHTML = `<div class="empty-state"><p class="empty-title">尚未开始</p><p class="empty-desc">点击右上角"开始录音",转写文本将实时出现在这里</p></div>`;
}

// 说话人
function setActiveSpeaker(name) {
  state.currentSpeaker = name;
  els.speakerList.querySelectorAll(".speaker-chip").forEach((c) => c.classList.toggle("is-active", c.dataset.speaker === name));
}

function renderSpeakerList() {
  els.speakerList.innerHTML = state.speakers.map((s) => `<button class="speaker-chip${s === state.currentSpeaker ? " is-active" : ""}" data-speaker="${s}">${s}</button>`).join("");
}

function addSpeaker() {
  if (document.querySelector(".speaker-input")) return;
  const input = document.createElement("input");
  input.type = "text"; input.className = "speaker-input"; input.placeholder = "新说话人"; input.maxLength = 8;
  els.btnAddSpeaker.style.display = "none";
  els.speakerList.parentNode.insertBefore(input, els.btnAddSpeaker);
  input.focus();
  function commit() { const n = input.value.trim(); if (n && !state.speakers.includes(n)) { state.speakers.push(n); renderSpeakerList(); setActiveSpeaker(n); toast(`已添加: ${n}`); } input.remove(); els.btnAddSpeaker.style.display = ""; }
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { input.remove(); els.btnAddSpeaker.style.display = ""; } });
  input.addEventListener("blur", commit);
}

// 生成纪要
async function generateSummary() {
  if (state.transcript.length === 0) { toast("请先录入一些转写内容"); return; }
  setStatus("generating", "生成中");
  els.btnGenerate.disabled = true;
  els.summary.innerHTML = `<div class="summary-loading"><div class="loading-dots"><span></span><span></span><span></span></div><div class="loading-text">AI 正在分析转写内容,生成结构化纪要…</div></div>`;

  try {
    let result;
    if (state.useSimulation) {
      await new Promise((r) => setTimeout(r, 1800));
      result = MOCK_SUMMARY;
    } else {
      const text = state.transcript.map((l) => `【${l.speaker}】${l.text}`).join("\n");
      const resp = await fetch(`${API_BASE}/api/generate_summary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: text }) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      result = await resp.json();
    }
    state.summary = result;
    renderSummary(result);
    setStatus("stopped", "已完成");
    els.btnExport.disabled = false; els.btnCopy.disabled = false;
    toast("纪要生成完成");
  } catch (err) {
    toast("纪要生成失败"); setStatus("stopped", "已停止");
  }
  els.btnGenerate.disabled = false;
}

function renderSummary(d) {
  els.summary.innerHTML = `
    <div class="summary-card is-coral"><div class="summary-card-head"><span class="summary-icon">📋</span><span class="summary-card-title">摘要</span></div><div class="summary-card-body"><p>${escapeHtml(d.summary)}</p></div></div>
    <div class="summary-card"><div class="summary-card-head"><span class="summary-icon">⭐</span><span class="summary-card-title">关键信息</span></div><div class="summary-card-body"><ul>${(d.key_points || d.keyPoints || []).map((k) => `<li>${escapeHtml(k)}</li>`).join("")}</ul></div></div>
    <div class="summary-card"><div class="summary-card-head"><span class="summary-icon">✅</span><span class="summary-card-title">待办事项</span></div><div class="summary-card-body"><ul>${(d.action_items || d.actionItems || []).map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul></div></div>`;
}

function renderEmptySummary() {
  els.summary.innerHTML = `<div class="empty-state"><p class="empty-title">等待生成</p><p class="empty-desc">录音结束后,点击下方按钮生成结构化纪要</p></div>`;
}

// 导出
function buildMarkdown() {
  const date = new Date().toLocaleString("zh-CN", { hour12: false });
  let md = `# 课堂会议纪要\n\n> 生成时间: ${date}  \n> 时长: ${els.duration.textContent}  \n> 字数: ${els.wordCount.textContent}\n\n`;
  if (state.summary) {
    md += `## 📋 摘要\n\n${state.summary.summary}\n\n## ⭐ 关键信息\n\n`;
    (state.summary.key_points || state.summary.keyPoints || []).forEach((k) => md += `- ${k}\n`);
    md += `\n## ✅ 待办事项\n\n`;
    (state.summary.action_items || state.summary.actionItems || []).forEach((a) => md += `- ${a}\n`);
    md += `\n---\n\n`;
  }
  md += `## 📝 原始转写\n\n`;
  state.transcript.forEach((l) => md += `**${l.speaker}**: ${l.text}\n\n`);
  return md;
}

function buildPlainText() {
  const date = new Date().toLocaleString("zh-CN", { hour12: false });
  let t = `课堂会议纪要\n${"=".repeat(40)}\n生成时间: ${date}\n时长: ${els.duration.textContent}\n字数: ${els.wordCount.textContent}\n\n`;
  if (state.summary) {
    t += `[摘要]\n${state.summary.summary}\n\n[关键信息]\n`;
    (state.summary.key_points || state.summary.keyPoints || []).forEach((k) => t += `  - ${k}\n`);
    t += `\n[待办事项]\n`;
    (state.summary.action_items || state.summary.actionItems || []).forEach((a) => t += `  - ${a}\n`);
    t += `\n${"-".repeat(40)}\n\n`;
  }
  t += `[原始转写]\n\n`;
  state.transcript.forEach((l) => t += `${l.speaker}: ${l.text}\n\n`);
  return t;
}

function buildWordHTML() {
  const date = new Date().toLocaleString("zh-CN", { hour12: false });
  const css = `body{font-family:"Microsoft YaHei","PingFang SC",serif;font-size:11pt;line-height:1.7;color:#252523}h1{font-size:22pt;border-bottom:2px solid #cc785c;padding-bottom:6px}h2{font-size:14pt;margin-top:18pt}.meta{color:#6c6a64;font-size:10pt}.meta p{margin:2pt 0}blockquote{background:#faf9f5;border-left:3pt solid #cc785c;padding:8pt 12pt}ul{margin:4pt 0 4pt 16pt;padding:0}li{margin:3pt 0}.transcript-speaker{color:#cc785c;font-weight:bold}hr{border:none;border-top:1px solid #e6dfd8;margin:16pt 0}`;
  let b = `<h1>课堂会议纪要</h1><div class="meta"><p>生成时间: ${date}</p><p>时长: ${els.duration.textContent} · 字数: ${els.wordCount.textContent}</p></div>`;
  if (state.summary) {
    b += `<h2>📋 摘要</h2><blockquote>${escapeHtml(state.summary.summary)}</blockquote><h2>⭐ 关键信息</h2><ul>`;
    (state.summary.key_points || state.summary.keyPoints || []).forEach((k) => b += `<li>${escapeHtml(k)}</li>`);
    b += `</ul><h2>✅ 待办事项</h2><ul>`;
    (state.summary.action_items || state.summary.actionItems || []).forEach((a) => b += `<li>${escapeHtml(a)}</li>`);
    b += `</ul><hr/>`;
  }
  b += `<h2>📝 原始转写</h2>`;
  state.transcript.forEach((l) => b += `<p><span class="transcript-speaker">${escapeHtml(l.speaker)}:</span> ${escapeHtml(l.text)}</p>`);
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>${css}</style></head><body>${b}</body></html>`;
}

const EXPORT_PROFILES = {
  md: { build: buildMarkdown, mime: "text/markdown;charset=utf-8", ext: "md", name: "Markdown" },
  doc: { build: buildWordHTML, mime: "application/msword;charset=utf-8", ext: "doc", name: "Word 文档" },
  txt: { build: buildPlainText, mime: "text/plain;charset=utf-8", ext: "txt", name: "纯文本" },
};

function exportAs(fmt) {
  const p = EXPORT_PROFILES[fmt]; if (!p) return;
  const blob = new Blob(["﻿" + p.build()], { type: p.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `会议纪要_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16)}.${p.ext}`;
  a.click(); URL.revokeObjectURL(url);
  toast(`已下载 ${p.name}`); closeExportMenu();
}

function toggleExportMenu() {
  const m = document.getElementById("export-menu");
  if (m.hidden) { m.hidden = false; setTimeout(() => document.addEventListener("click", handleOutsideClick), 0); }
  else closeExportMenu();
}
function closeExportMenu() { document.getElementById("export-menu").hidden = true; document.removeEventListener("click", handleOutsideClick); }
function handleOutsideClick(e) { if (!e.target.closest(".dropdown")) closeExportMenu(); }

async function copyAll() {
  try { await navigator.clipboard.writeText(buildMarkdown()); toast("已复制全文到剪贴板"); } catch { toast("复制失败"); }
}

// 初始化
function init() {
  els.btnRecord.addEventListener("click", toggleRecording);
  els.btnReset.addEventListener("click", resetAll);
  els.btnAddSpeaker.addEventListener("click", addSpeaker);
  els.btnGenerate.addEventListener("click", generateSummary);
  els.btnExport.addEventListener("click", (e) => { e.stopPropagation(); toggleExportMenu(); });
  document.getElementById("export-menu").addEventListener("click", (e) => { const item = e.target.closest(".dropdown-item"); if (item) exportAs(item.dataset.format); });
  els.btnCopy.addEventListener("click", copyAll);
  els.speakerList.addEventListener("click", (e) => { const chip = e.target.closest(".speaker-chip"); if (chip) setActiveSpeaker(chip.dataset.speaker); });
  document.addEventListener("keydown", (e) => { if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); toggleRecording(); } });

  // 预连接
  connectWebSocket().then((ok) => {
    if (ok) fetch(`${API_BASE}/api/health`).then((r) => r.json()).then((d) => showConnectionStatus(true, d.simulation_mode)).catch(() => showConnectionStatus(true, false));
    else showConnectionStatus(false, false);
  });
}

init();
