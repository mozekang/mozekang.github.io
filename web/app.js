(function () {
  "use strict";

  const config = window.ATTENTION_CONFIG || {};
  const state = {
    records: [],
    dailyGoalsByDate: {},
    deviceId: localStorage.getItem("attentionDeviceId") || `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  };
  localStorage.setItem("attentionDeviceId", state.deviceId);

  document.addEventListener("DOMContentLoaded", init);

  function $(selector) {
    return document.querySelector(selector);
  }

  function todayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function localTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }

  function renderDate() {
    const now = new Date();
    $("#dayNumber").textContent = String(now.getDate()).padStart(2, "0");
    $("#weekdayLabel").textContent = now.toLocaleDateString("zh-CN", { weekday: "long" });
    $("#timeLabel").textContent = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }

  function getGoals() {
    return Array.from(document.querySelectorAll(".goal-input"))
      .map((input) => input.value.trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  function renderGoals() {
    const goals = state.dailyGoalsByDate[todayKey()] || [];
    document.querySelectorAll(".goal-input").forEach((input, index) => {
      if (document.activeElement !== input) input.value = goals[index] || "";
    });
    $("#goalPrompt").classList.toggle("hidden", goals.length > 0);
  }

  function timelinePoint(index, total, score) {
    const width = Math.max(520, total * 82);
    const paddingX = 42;
    const paddingY = 22;
    const innerWidth = width - paddingX * 2;
    const innerHeight = 166 - paddingY * 2;
    return {
      x: total <= 1 ? width / 2 : paddingX + (index / (total - 1)) * innerWidth,
      y: paddingY + (1 - score / 100) * innerHeight
    };
  }

  function timelineRecords() {
    return state.records
      .filter((record) => Number.isFinite(Number(record.energyScore)))
      .slice()
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-10);
  }

  function dotStyle(score, isLatest) {
    const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
    const radius = 6 + Math.round((safeScore / 100) * 12);
    let fill = "#050505";
    if (safeScore >= 80) fill = "#ff6a21";
    else if (safeScore >= 60) fill = "#58584f";
    else if (safeScore >= 40) fill = "#242822";
    return { radius: isLatest ? radius + 2 : radius, fill };
  }

  function renderTimeline() {
    const container = $("#timelineCanvas");
    const points = timelineRecords();
    if (!points.length) {
      container.innerHTML = '<div class="empty-timeline">还没有能量点</div>';
      $("#timelineDetail").classList.add("hidden");
      return;
    }
    const width = Math.max(520, points.length * 82);
    const height = 170;
    const plotted = points.map((point, index) => ({
      ...point,
      ...timelinePoint(index, points.length, Number(point.energyScore) || 50),
      isLatest: index === points.length - 1
    }));
    const pathData = plotted.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    const dividers = plotted.map((point, index) => {
      const date = new Date(point.timestamp);
      const previous = index > 0 ? new Date(plotted[index - 1].timestamp) : null;
      if (index !== 0 && date.toDateString() === previous.toDateString()) return "";
      const label = date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
      return `<g class="day-divider"><line x1="${point.x}" y1="10" x2="${point.x}" y2="142"></line><text x="${point.x}" y="15">${escapeHtml(label)}</text></g>`;
    }).join("");
    const labels = plotted.map((point) => `<g class="timeline-label"><text x="${point.x}" y="158">${escapeHtml(localTime(point.timestamp))}</text></g>`).join("");
    const dots = plotted.map((point) => {
      const style = dotStyle(point.energyScore, point.isLatest);
      return `<g class="timeline-point${point.isLatest ? " latest" : ""}" data-id="${escapeHtml(point.id)}"><title>${escapeHtml(point.energyReason || point.activity)}</title><circle cx="${point.x}" cy="${point.y}" r="${style.radius}" fill="${style.fill}"></circle><text x="${point.x}" y="${Math.max(16, point.y - style.radius - 8)}">${point.energyScore ?? "--"}</text></g>`;
    }).join("");
    container.innerHTML = `<svg class="timeline-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><line x1="28" y1="142" x2="${width - 28}" y2="142" class="baseline"></line>${dividers}<path d="${pathData}" class="energy-line"></path>${labels}${dots}</svg>`;
    container.scrollLeft = container.scrollWidth;
  }

  function showTimelineDetail(recordId) {
    const detail = $("#timelineDetail");
    const record = state.records.find((item) => item.id === recordId);
    if (!record) return;
    detail.innerHTML = `<strong>${escapeHtml(record.energyScore ?? "--")}</strong><span>${escapeHtml(record.energyLabel || "已分析")}</span><span>${escapeHtml(localTime(record.timestamp))}</span><p>${escapeHtml(record.energyReason || "没有保存评分原因")}</p>`;
    detail.classList.remove("hidden");
  }

  function renderStats() {
    const today = todayKey();
    const todayRecords = state.records.filter((record) => todayKey(new Date(record.timestamp)) === today);
    const sorted = todayRecords.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const latest = sorted[0];
    const scored = sorted.filter((record) => Number.isFinite(Number(record.energyScore)));
    const delta = scored.length >= 2 ? Number(scored[0].energyScore) - Number(scored[1].energyScore) : null;
    const forwardCount = todayRecords.filter((record) => Number(record.energyScore) >= 60).length;
    let trend = "--";
    let trendClass = "";
    if (delta !== null) {
      if (Math.abs(delta) < 5) {
        trend = "→";
        trendClass = "trend-flat";
      } else {
        trend = `${delta > 0 ? "↑" : "↓"}${Math.abs(delta)}`;
        trendClass = delta > 0 ? "trend-up" : "trend-down";
      }
    }
    $("#currentEnergy").textContent = Number.isFinite(Number(latest?.energyScore)) ? latest.energyScore : "--";
    $("#trendValue").textContent = trend;
    $("#trendValue").className = trendClass;
    $("#forwardCount").textContent = forwardCount;
  }

  function renderRecent() {
    const recent = $("#recentList");
    const items = state.records.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    recent.innerHTML = "";
    if (!items.length) {
      recent.innerHTML = '<div class="recent-empty">还没有记录。</div>';
      return;
    }
    for (const record of items) {
      const item = document.createElement("article");
      item.className = "recent-item";
      item.title = record.energyReason || "";
      item.innerHTML = `<time>${localTime(record.timestamp)}</time><strong>${escapeHtml(record.energyScore ?? "--")}</strong><span>${escapeHtml(record.energyLabel || "已记录")}</span><p>${escapeHtml(record.activity)}</p>`;
      recent.appendChild(item);
    }
  }

  function renderAll() {
    renderGoals();
    renderTimeline();
    renderStats();
    renderRecent();
  }

  async function api(action, payload = {}) {
    const response = await fetch(config.syncEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, deviceId: state.deviceId, ...payload })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function pull() {
    $("#syncStatus").textContent = "同步中";
    try {
      const data = await api("pull");
      state.records = Array.isArray(data.records) ? data.records : [];
      state.dailyGoalsByDate = data.dailyGoalsByDate || {};
      $("#syncStatus").textContent = "已同步";
      renderAll();
    } catch {
      $("#syncStatus").textContent = "同步失败";
      renderAll();
    }
  }

  async function saveRecord() {
    const input = $("#activityInput");
    const activity = input.value.trim();
    if (!activity) {
      input.focus();
      return;
    }

    $("#saveButton").disabled = true;
    try {
      $("#saveLabel").textContent = "…";
      const data = await api("addRecord", {
        activity,
        goals: getGoals()
      });
      if (data.record) {
        state.records = state.records.filter((record) => record.id !== data.record.id);
        state.records.push(data.record);
      }
      $("#syncStatus").textContent = "已同步 · 待本地分析";
      input.value = "";
      renderAll();
    } finally {
      $("#saveButton").disabled = false;
      $("#saveLabel").textContent = "→";
    }
  }

  function bindEvents() {
    $("#activityInput").addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        saveRecord();
      }
    });
    $("#saveButton").addEventListener("click", saveRecord);
    bindTimelineDrag();
    $("#openRecordsButton").addEventListener("click", () => document.body.classList.add("records-open"));
    $("#backToMainButton").addEventListener("click", () => document.body.classList.remove("records-open"));
    $("#scoreGuideButton").addEventListener("click", () => $("#scoreGuide").classList.remove("hidden"));
    $("#closeScoreGuide").addEventListener("click", () => $("#scoreGuide").classList.add("hidden"));
    $("#scoreGuide").addEventListener("click", (event) => {
      if (event.target.id === "scoreGuide") $("#scoreGuide").classList.add("hidden");
    });
    document.querySelectorAll(".goal-input").forEach((input) => {
      input.addEventListener("blur", async () => {
        state.dailyGoalsByDate[todayKey()] = getGoals();
        renderGoals();
        try {
          await api("setGoals", { dateKey: todayKey(), goals: getGoals() });
          $("#syncStatus").textContent = "已同步";
        } catch {
          $("#syncStatus").textContent = "目标未同步";
        }
      });
    });
  }

  function bindTimelineDrag() {
    const container = $("#timelineCanvas");
    let drag = null;
    container.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const point = event.target.closest(".timeline-point");
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        scrollLeft: container.scrollLeft,
        moved: false,
        recordId: point?.dataset.id || ""
      };
      container.classList.add("dragging");
      container.setPointerCapture(event.pointerId);
    });
    container.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      if (Math.abs(dx) > 3) drag.moved = true;
      container.scrollLeft = drag.scrollLeft - dx;
    });
    container.addEventListener("pointerup", (event) => {
      const finished = drag;
      drag = null;
      container.classList.remove("dragging");
      if (!finished) return;
      container.releasePointerCapture(event.pointerId);
      if (finished.moved) return;
      if (finished.recordId) showTimelineDetail(finished.recordId);
    });
    container.addEventListener("pointercancel", () => {
      drag = null;
      container.classList.remove("dragging");
    });
  }

  function init() {
    renderDate();
    setInterval(renderDate, 30000);
    bindEvents();
    pull();
    setInterval(pull, 30000);
  }
})();
