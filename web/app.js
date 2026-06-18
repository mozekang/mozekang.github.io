(function () {
  "use strict";

  const config = window.ATTENTION_CONFIG || {};
  const categories = [
    { label: "即时快感", value: "即时快感", mood: "被即时快感牵走" },
    { label: "正在掌控", value: "正在掌控", mood: "方向盘在我手里" },
    { label: "生活维护", value: "生活维护", mood: "现实世界维护中" }
  ];
  const state = {
    category: categories[0].value,
    mood: categories[0].mood,
    records: [],
    dailyGoalsByDate: {},
    followUp: null,
    followUpCheckedFor: "",
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
    $("#monthLabel").textContent = now.toLocaleDateString("zh-CN", { month: "long" });
    $("#weekdayLabel").textContent = now.toLocaleDateString("zh-CN", { weekday: "long" });
  }

  function renderCategories() {
    const container = $("#categoryButtons");
    container.innerHTML = "";
    for (const item of categories) {
      const button = document.createElement("button");
      button.className = `segment${item.value === state.category ? " selected" : ""}`;
      button.type = "button";
      button.dataset.category = item.value;
      button.dataset.mood = item.mood;
      button.textContent = item.label;
      container.appendChild(button);
    }
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
  }

  function timelinePoint(index, total, score) {
    const width = Math.max(520, total * 82);
    const paddingX = 42;
    const paddingY = 28;
    const innerWidth = width - paddingX * 2;
    const innerHeight = 190 - paddingY * 2;
    return {
      x: total <= 1 ? width / 2 : paddingX + (index / (total - 1)) * innerWidth,
      y: paddingY + (1 - score / 100) * innerHeight
    };
  }

  function renderTimeline() {
    const container = $("#timelineCanvas");
    const points = state.records.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (!points.length) {
      container.innerHTML = '<div class="empty-timeline">还没有能量点</div>';
      return;
    }
    const width = Math.max(520, points.length * 82);
    const height = 190;
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
      return `<g class="day-divider"><line x1="${point.x}" y1="12" x2="${point.x}" y2="162"></line><text x="${point.x}" y="16">${escapeHtml(label)}</text></g>`;
    }).join("");
    const labels = plotted.map((point) => `<g class="timeline-label"><text x="${point.x}" y="176">${escapeHtml(localTime(point.timestamp))}</text></g>`).join("");
    const dots = plotted.map((point) => `<g class="timeline-point${point.isLatest ? " latest" : ""}"><title>${escapeHtml(point.activity)}</title><circle cx="${point.x}" cy="${point.y}" r="${point.isLatest ? 17 : 15}"></circle><text x="${point.x}" y="${Math.max(20, point.y - 24)}">${point.energyScore ?? "--"}</text></g>`).join("");
    container.innerHTML = `<svg class="timeline-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><line x1="28" y1="162" x2="${width - 28}" y2="162" class="baseline"></line>${dividers}<path d="${pathData}" class="energy-line"></path>${labels}${dots}</svg>`;
    container.scrollLeft = container.scrollWidth;
  }

  function renderStats() {
    const today = todayKey();
    const todayRecords = state.records.filter((record) => todayKey(new Date(record.timestamp)) === today);
    const energyRecords = todayRecords.filter((record) => Number.isFinite(Number(record.energyScore)));
    const average = energyRecords.length
      ? Math.round(energyRecords.reduce((total, record) => total + Number(record.energyScore), 0) / energyRecords.length)
      : null;
    $("#averageEnergy").textContent = average ?? "--";
    $("#spentMinutes").textContent = todayRecords.filter((record) => record.category === "即时快感").length * 15;
    $("#recordCount").textContent = todayRecords.length;
  }

  function renderRecent() {
    const recent = $("#recentList");
    const items = state.records.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8);
    recent.innerHTML = "";
    if (!items.length) {
      recent.innerHTML = '<div class="recent-empty">还没有记录。</div>';
      return;
    }
    for (const record of items) {
      const item = document.createElement("article");
      item.className = "recent-item";
      item.innerHTML = `<time>${localTime(record.timestamp)}</time><strong>${escapeHtml(record.energyScore ?? "--")}</strong><span>${escapeHtml(record.energyLabel || record.category)}</span><p>${escapeHtml(record.activity)}</p>`;
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
    }
  }

  function resetFollowUp() {
    state.followUp = null;
    state.followUpCheckedFor = "";
    $("#followUpBox").classList.add("hidden");
    $("#followUpQuestion").textContent = "";
    $("#followUpInput").value = "";
    $("#saveLabel").textContent = "记录";
  }

  function buildActivityWithFollowUp(activity) {
    if (!state.followUp) return activity;
    const answer = $("#followUpInput").value.trim();
    return answer ? `${activity}\n追问：${state.followUp.question}\n回答：${answer}` : activity;
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
      if (!state.followUp && state.followUpCheckedFor !== activity) {
        $("#saveLabel").textContent = "分析中";
        const followUp = await api("maybeFollowUp", {
          activity,
          category: state.category,
          mood: state.mood,
          goals: getGoals()
        });
        if (followUp.needsFollowUp && followUp.question) {
          state.followUp = { question: followUp.question };
          state.followUpCheckedFor = activity;
          $("#followUpQuestion").textContent = followUp.question;
          $("#followUpBox").classList.remove("hidden");
          $("#saveLabel").textContent = "确认记录";
          $("#followUpInput").focus();
          return;
        }
      }
      $("#saveLabel").textContent = "分析中";
      const data = await api("addRecord", {
        activity: buildActivityWithFollowUp(activity),
        category: state.category,
        mood: state.mood,
        goals: getGoals()
      });
      state.records = Array.isArray(data.records) ? data.records : state.records;
      state.dailyGoalsByDate = data.dailyGoalsByDate || state.dailyGoalsByDate;
      input.value = "";
      resetFollowUp();
      renderAll();
    } finally {
      $("#saveButton").disabled = false;
      $("#saveLabel").textContent = state.followUp ? "确认记录" : "记录";
    }
  }

  function bindEvents() {
    $("#categoryButtons").addEventListener("click", (event) => {
      const button = event.target.closest(".segment");
      if (!button) return;
      state.category = button.dataset.category;
      state.mood = button.dataset.mood;
      renderCategories();
    });
    $("#activityInput").addEventListener("input", resetFollowUp);
    $("#saveButton").addEventListener("click", saveRecord);
    $("#quickAnswers").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-answer]");
      if (!button) return;
      const input = $("#followUpInput");
      input.value = input.value ? `${input.value}，${button.dataset.answer}` : button.dataset.answer;
      input.focus();
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

  function init() {
    renderDate();
    renderCategories();
    bindEvents();
    pull();
  }
})();
