(function () {
  "use strict";

  const config = window.FEEDBACK_CONFIG || {};
  const nowIso = () => new Date().toISOString();
  const nowMs = () => Date.now();
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const steps = ["intro", "identity", "q1", "q2", "q3", "open", "success"];

  const questionMeta = {
    q1: {
      id: "keep",
      type: "multi",
      options: ["电影本身", "有深度的对话", "环节安排", "某个人", "酒和微醺感", "空间、灯光、音乐"]
    },
    q2: {
      id: "tune",
      type: "multi",
      exclusive: "没有什么明显问题",
      options: ["刚到场时不知道做什么", "破冰问题不够好", "电影讨论不足", "整体聊的话题太浅", "主理人令我不舒服", "酒 / 零食 / 空间舒适度可以更好", "结束得有点平淡", "其它", "没有什么明显问题"]
    },
    q3: {
      id: "returnIntent",
      type: "single",
      options: ["很想再来", "主题合适就会来", "有点犹豫", "大概率不会"],
      factors: ["电影主题", "当晚氛围", "人的匹配度", "时间安排", "价格", "社交能量消耗"]
    },
    open: {
      id: "moment",
      type: "text"
    }
  };

  const state = {
    currentStep: "intro",
    event: {
      eventId: config.eventId || "",
      eventName: config.eventName || "",
      movieName: config.movieName || ""
    },
    answers: {
      identity: "",
      q1: [],
      q2: [],
      q3: "",
      q3Factors: [],
      moment: ""
    },
    timings: {
      page_open_time: nowIso(),
      page_open_ms: nowMs(),
      identity_selected_time: null,
      submitted_time: null,
      total_duration_ms: null,
      questions: {}
    },
    hasPromptedMoment: false
  };

  let isSubmitting = false;
  let factorPanelTimer = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    document.title = `${config.eventName || "聚会"}反馈`;
    renderIdentities();
    renderQuestion("q1", "[data-role='q1-options']");
    renderQuestion("q2", "[data-role='q2-options']");
    renderQuestion("q3", "[data-role='q3-options']");
    renderFactors();
    bindGlobalActions();
    showScreen("intro", { restore: true });
  }

  function renderIdentities() {
    const list = document.querySelector("[data-role='identity-list']");
    const identities = [...(config.identities || [])];
    if (config.includeAnonymous !== false) identities.push("匿名反馈");
    list.innerHTML = "";

    identities.slice(0, 8).forEach((name) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "identity-card";
      button.dataset.identity = name;
      button.innerHTML = `<strong>${escapeHtml(name)}</strong>`;
      button.addEventListener("click", () => {
        state.answers.identity = name;
        state.timings.identity_selected_time = nowIso();
        markSelected(".identity-card", "identity", name);
        clearHint("identity");
      });
      list.appendChild(button);
    });
  }

  function renderQuestion(key, selector) {
    const host = document.querySelector(selector);
    const meta = questionMeta[key];
    host.innerHTML = "";
    meta.options.forEach((label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-card";
      if (key === "q2" && label === "其它") {
        button.classList.add("has-note");
        button.innerHTML = `<span>${escapeHtml(label)}</span><span class="option-note">我会在今天联系你</span>`;
      } else {
        button.textContent = label;
      }
      button.dataset.question = key;
      button.dataset.value = label;
      button.addEventListener("click", () => selectOption(key, label));
      host.appendChild(button);
    });
  }

  function renderFactors() {
    const host = document.querySelector("[data-role='factor-options']");
    host.innerHTML = "";
    questionMeta.q3.factors.forEach((label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "factor-chip";
      button.textContent = label;
      button.dataset.factor = label;
      button.addEventListener("click", () => {
        recordFirstInteraction("q3");
        toggleValue(state.answers.q3Factors, label, 2);
        paintFactors();
      });
      host.appendChild(button);
    });
  }

  function bindGlobalActions() {
    document.addEventListener("dblclick", (event) => event.preventDefault(), { passive: false });
    document.querySelector("[data-action='start']").addEventListener("click", () => showScreen("identity"));
    document.querySelector("[data-action='side-prev']").addEventListener("click", goPrevious);
    document.querySelector("[data-action='side-next']").addEventListener("click", goNext);

    const momentInput = document.querySelector("[data-role='moment-input']");
    momentInput.addEventListener("input", () => {
      recordFirstInteraction("open");
      state.answers.moment = momentInput.value;
      resizeMomentInput(momentInput);
    });
    resizeMomentInput(momentInput);

  }

  function goPrevious() {
    const index = steps.indexOf(state.currentStep);
    if (index <= 0) return;
    showScreen(steps[index - 1]);
  }

  function goNext() {
    const index = steps.indexOf(state.currentStep);
    if (state.currentStep === "open") {
      submitFeedback();
      return;
    }
    if (index < 0 || index >= steps.length - 2) return;
    if (!validateStep(state.currentStep)) return;
    finishQuestion(state.currentStep);
    showScreen(steps[index + 1]);
  }

  function selectOption(key, value) {
    recordFirstInteraction(key);
    const meta = questionMeta[key];
    clearHint(key);

    if (meta.type === "single") {
      state.answers[key] = value;
      if (key === "q3" && value === "很想再来") {
        state.answers.q3Factors = [];
        paintFactors();
      }
      updateFactorPanel();
    } else {
      const selected = state.answers[key];
      if (meta.exclusive && value === meta.exclusive) {
        state.answers[key] = selected.includes(value) ? [] : [value];
      } else {
        const withoutExclusive = meta.exclusive ? selected.filter((item) => item !== meta.exclusive) : selected;
        state.answers[key] = withoutExclusive;
        toggleValue(state.answers[key], value, 2);
      }
    }

    paintQuestion(key);
  }

  function toggleValue(list, value, max) {
    const index = list.indexOf(value);
    if (index >= 0) {
      list.splice(index, 1);
      return true;
    }
    list.push(value);
    if (max && list.length > max) {
      list.shift();
    }
    return true;
  }

  function paintQuestion(key) {
    document.querySelectorAll(`[data-question='${key}']`).forEach((button) => {
      const answer = state.answers[key];
      const selected = Array.isArray(answer) ? answer.includes(button.dataset.value) : answer === button.dataset.value;
      button.classList.toggle("is-selected", selected);
    });
    if (key === "q3") {
      updateFactorPanel();
    }
  }

  function updateFactorPanel() {
    const panel = document.querySelector("[data-role='factor-panel']");
    const shouldShow = Boolean(state.answers.q3 && state.answers.q3 !== "很想再来");
    if (factorPanelTimer) {
      clearTimeout(factorPanelTimer);
      factorPanelTimer = null;
    }

    if (shouldShow) {
      panel.hidden = false;
      requestAnimationFrame(() => {
        panel.classList.remove("is-collapsing");
        panel.classList.add("is-visible");
      });
      return;
    }

    panel.hidden = false;
    panel.classList.remove("is-visible");
    panel.classList.add("is-collapsing");
    factorPanelTimer = setTimeout(() => {
      panel.classList.remove("is-collapsing");
      factorPanelTimer = null;
    }, 240);
  }

  function paintFactors() {
    document.querySelectorAll("[data-factor]").forEach((button) => {
      button.classList.toggle("is-selected", state.answers.q3Factors.includes(button.dataset.factor));
    });
  }

  function markSelected(selector, dataName, value) {
    document.querySelectorAll(selector).forEach((button) => {
      button.classList.toggle("is-selected", button.dataset[dataName] === value);
    });
  }

  function showScreen(name, options = {}) {
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.toggle("is-active", screen.dataset.screen === name);
      if (screen.dataset.screen === "success" && name !== "success") {
        screen.classList.remove("is-ready");
      }
    });
    state.currentStep = name;
    if (name === "success") updateSuccessNote();
    if (!options.restore && questionMeta[name]) startQuestion(name);
    updateArrows(name);
  }

  function updateArrows(name) {
    const left = document.querySelector("[data-action='side-prev']");
    const right = document.querySelector("[data-action='side-next']");
    const index = steps.indexOf(name);
    left.classList.toggle("is-visible", index > 0 && name !== "success");
    right.classList.toggle("is-visible", index > 0 && index <= steps.indexOf("open"));
  }

  function startQuestion(key) {
    if (!state.timings.questions[key]) {
      state.timings.questions[key] = {};
    }
    const timing = state.timings.questions[key];
    if (!timing.question_view_time) {
      timing.question_view_time = nowIso();
      timing.question_view_ms = nowMs();
    }
  }

  function recordFirstInteraction(key) {
    startQuestion(key);
    const timing = state.timings.questions[key];
    if (!timing.first_interaction_time) {
      timing.first_interaction_time = nowIso();
      timing.first_interaction_ms = nowMs();
    }
  }

  function finishQuestion(key) {
    if (!questionMeta[key]) return;
    startQuestion(key);
    const timing = state.timings.questions[key];
    timing.answered_time = nowIso();
    timing.answered_ms = nowMs();
    timing.duration_ms = timing.question_view_ms ? timing.answered_ms - timing.question_view_ms : null;
    timing.think_before_first_interaction_ms = timing.first_interaction_ms && timing.question_view_ms
      ? timing.first_interaction_ms - timing.question_view_ms
      : null;
  }

  function validateStep(step) {
    clearHint(step);
    if (step === "identity" && !state.answers.identity) {
      setHint(step, "先选一个称呼。");
      return false;
    }
    if (step === "q1" && state.answers.q1.length === 0) {
      setHint(step, "选一个最想保留的就可以。");
      return false;
    }
    if (step === "q2" && state.answers.q2.length === 0) {
      setHint(step, "选一个最需要调整的地方就行");
      return false;
    }
    if (step === "q3" && !state.answers.q3) {
      setHint(step, "选一个最接近的状态。");
      return false;
    }
    return true;
  }

  async function submitFeedback() {
    if (isSubmitting) return;
    clearHint("open");

    if (!state.answers.moment.trim() && !state.hasPromptedMoment) {
      state.hasPromptedMoment = true;
      setHint("open", "一句话就会很有帮助，但不填也没关系，再点一下即可");
      return;
    }

    finishQuestion("open");
    state.answers.q3 = state.answers.q3 || "未选择";
    state.timings.submitted_time = nowIso();
    state.timings.total_duration_ms = nowMs() - state.timings.page_open_ms;

    isSubmitting = true;
    showScreen("success");

    const minimumProgress = wait(1250);

    try {
      const response = await fetch(config.submitEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload())
        });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await minimumProgress;
      markSuccessReady();
    } catch (error) {
      await minimumProgress;
      markSuccessReady();
    } finally {
      isSubmitting = false;
    }
  }

  function markSuccessReady() {
    const screen = document.querySelector("[data-screen='success']");
    if (screen) screen.classList.add("is-ready");
  }

  function updateSuccessNote() {
    const note = document.querySelector("[data-role='success-note']");
    if (!note) return;
    const identity = state.answers.identity;
    note.textContent = identity && identity !== "匿名反馈" ? `${identity}，期待下次见` : "期待下次见";
  }

  function buildPayload() {
    return {
      event: state.event,
      answers: state.answers,
      timings: publicTimings(),
      client_meta: {
        page_url: location.href.split("#")[0],
        timezone_offset_minutes: new Date().getTimezoneOffset(),
        language: navigator.language || ""
      }
    };
  }

  function publicTimings() {
    const questions = {};
    Object.entries(state.timings.questions).forEach(([key, timing]) => {
      questions[key] = {
        question_view_time: timing.question_view_time || null,
        first_interaction_time: timing.first_interaction_time || null,
        answered_time: timing.answered_time || null,
        duration_ms: timing.duration_ms || null,
        think_before_first_interaction_ms: timing.think_before_first_interaction_ms || null
      };
    });
    return {
      page_open_time: state.timings.page_open_time,
      identity_selected_time: state.timings.identity_selected_time,
      submitted_time: state.timings.submitted_time,
      total_duration_ms: state.timings.total_duration_ms,
      questions
    };
  }

  function setHint(key, message) {
    const hint = document.querySelector(`[data-role='${key}-hint']`);
    if (hint) hint.textContent = message;
  }

  function clearHint(key) {
    setHint(key, "");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function resizeMomentInput(input) {
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }
})();
