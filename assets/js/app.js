(function () {
  "use strict";

  const config = window.FEEDBACK_CONFIG || {};
  const storageKey = `party-feedback:${config.eventId || "default"}`;
  const nowIso = () => new Date().toISOString();
  const nowMs = () => Date.now();

  const questionMeta = {
    q1: {
      id: "keep",
      max: 2,
      type: "multi",
      options: ["电影选择", "破冰问题", "一对一聊天", "放映后的讨论", "酒水/微醺感", "空间/灯光/音乐", "人的匹配度", "某个意外瞬间"]
    },
    q2: {
      id: "tune",
      max: 2,
      type: "multi",
      exclusive: "没有明显问题",
      options: ["刚到场时有点尴尬", "放映前等待不够自然", "破冰问题不够好进入", "电影讨论有点散", "话题太浅", "话题太重", "酒水/零食/空间舒适度", "结束阶段有点松散", "没有明显问题"]
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

  const initialState = {
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

  let state = restoreState();
  let isSubmitting = false;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindConfigText();
    renderIdentities();
    renderQuestion("q1", "[data-role='q1-options']");
    renderQuestion("q2", "[data-role='q2-options']");
    renderQuestion("q3", "[data-role='q3-options']");
    renderFactors();
    bindGlobalActions();
    restoreInputValues();
    showScreen(state.currentStep || "intro", { restore: true });
  }

  function bindConfigText() {
    document.querySelectorAll("[data-config='eventName']").forEach((node) => {
      node.textContent = config.eventName || "聚会反馈";
    });
    document.querySelectorAll("[data-config='movieName']").forEach((node) => {
      node.textContent = config.movieName || "电影之夜";
    });
    document.title = `${config.eventName || "聚会"}反馈`;
  }

  function renderIdentities() {
    const list = document.querySelector("[data-role='identity-list']");
    const identities = [...(config.identities || [])];
    if (config.includeAnonymous !== false) identities.push("匿名反馈");
    list.innerHTML = "";
    identities.slice(0, 8).forEach((name, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "identity-card";
      button.dataset.identity = name;
      button.innerHTML = `<span>ROLE ${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(name)}</strong>`;
      button.addEventListener("click", () => {
        state.answers.identity = name;
        state.timings.identity_selected_time = nowIso();
        saveState();
        markSelected(".identity-card", "identity", name);
        setTimeout(() => showScreen("q1"), 160);
      });
      list.appendChild(button);
    });
    markSelected(".identity-card", "identity", state.answers.identity);
  }

  function renderQuestion(key, selector) {
    const host = document.querySelector(selector);
    const meta = questionMeta[key];
    host.innerHTML = "";
    meta.options.forEach((label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-card";
      button.textContent = label;
      button.dataset.question = key;
      button.dataset.value = label;
      button.addEventListener("click", () => selectOption(key, label));
      host.appendChild(button);
    });
    paintQuestion(key);
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
        saveState();
        paintFactors();
      });
      host.appendChild(button);
    });
    paintFactors();
  }

  function bindGlobalActions() {
    document.querySelector("[data-action='start']").addEventListener("click", () => showScreen("identity"));

    document.querySelectorAll("[data-action='next']").forEach((button) => {
      button.addEventListener("click", () => {
        const next = button.dataset.next;
        const current = state.currentStep;
        if (!validateStep(current)) return;
        finishQuestion(current);
        showScreen(next);
      });
    });

    const momentInput = document.querySelector("[data-role='moment-input']");
    momentInput.addEventListener("input", () => {
      recordFirstInteraction("open");
      state.answers.moment = momentInput.value;
      saveState();
    });

    document.querySelector("[data-action='submit']").addEventListener("click", submitFeedback);
  }

  function selectOption(key, value) {
    recordFirstInteraction(key);
    const meta = questionMeta[key];
    const hint = document.querySelector(`[data-role='${key}-hint']`);
    hint.textContent = "";

    if (meta.type === "single") {
      state.answers[key] = value;
      document.querySelector("[data-role='factor-panel']").hidden = false;
    } else {
      const selected = state.answers[key];
      if (meta.exclusive && value === meta.exclusive) {
        state.answers[key] = selected.includes(value) ? [] : [value];
      } else {
        const withoutExclusive = meta.exclusive ? selected.filter((item) => item !== meta.exclusive) : selected;
        state.answers[key] = withoutExclusive;
        const added = toggleValue(state.answers[key], value, meta.max);
        if (!added && !state.answers[key].includes(value)) {
          hint.textContent = `最多选 ${meta.max} 个。`;
        }
      }
    }

    saveState();
    paintQuestion(key);
  }

  function toggleValue(list, value, max) {
    const index = list.indexOf(value);
    if (index >= 0) {
      list.splice(index, 1);
      return true;
    }
    if (max && list.length >= max) return false;
    list.push(value);
    return true;
  }

  function paintQuestion(key) {
    document.querySelectorAll(`[data-question='${key}']`).forEach((button) => {
      const answer = state.answers[key];
      const selected = Array.isArray(answer) ? answer.includes(button.dataset.value) : answer === button.dataset.value;
      button.classList.toggle("is-selected", selected);
    });
    if (key === "q3") {
      document.querySelector("[data-role='factor-panel']").hidden = !state.answers.q3;
    }
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
    });
    state.currentStep = name;
    if (!options.restore && questionMeta[name]) startQuestion(name);
    saveState();
    window.scrollTo({ top: 0, behavior: "auto" });
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
    saveState();
  }

  function validateStep(step) {
    const hint = document.querySelector(`[data-role='${step}-hint']`);
    if (hint) hint.textContent = "";
    if (step === "q1" && state.answers.q1.length === 0) {
      hint.textContent = "选一个最想保留的就可以。";
      return false;
    }
    if (step === "q2" && state.answers.q2.length === 0) {
      hint.textContent = "选一个需要调参的点，或者选“没有明显问题”。";
      return false;
    }
    if (step === "q3" && !state.answers.q3) {
      hint.textContent = "选一个最接近的状态。";
      return false;
    }
    return true;
  }

  async function submitFeedback() {
    if (isSubmitting) return;
    const hint = document.querySelector("[data-role='open-hint']");
    hint.textContent = "";

    if (!state.answers.moment.trim() && !state.hasPromptedMoment) {
      state.hasPromptedMoment = true;
      saveState();
      hint.textContent = "一个具体瞬间会非常有帮助，哪怕只有一句。再点一次可直接提交。";
      return;
    }

    finishQuestion("open");
    state.timings.submitted_time = nowIso();
    state.timings.total_duration_ms = nowMs() - state.timings.page_open_ms;
    saveState();

    const submitButton = document.querySelector("[data-action='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "正在提交...";
    isSubmitting = true;

    try {
      const response = await fetch(config.submitEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload())
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      sessionStorage.removeItem(storageKey);
      showScreen("success");
    } catch (error) {
      hint.textContent = "网络没有接上，内容还在。请稍后重试。";
    } finally {
      isSubmitting = false;
      submitButton.disabled = false;
      submitButton.textContent = "提交";
    }
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

  function restoreInputValues() {
    document.querySelector("[data-role='moment-input']").value = state.answers.moment || "";
    ["q1", "q2", "q3"].forEach(paintQuestion);
    paintFactors();
  }

  function saveState() {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      // Session persistence is best-effort; feedback can still be submitted.
    }
  }

  function restoreState() {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return clone(initialState);
      return mergeState(clone(initialState), JSON.parse(raw));
    } catch (error) {
      return clone(initialState);
    }
  }

  function mergeState(base, saved) {
    return {
      ...base,
      ...saved,
      event: { ...base.event, ...(saved.event || {}) },
      answers: { ...base.answers, ...(saved.answers || {}) },
      timings: {
        ...base.timings,
        ...(saved.timings || {}),
        questions: { ...base.timings.questions, ...((saved.timings && saved.timings.questions) || {}) }
      }
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }
})();
