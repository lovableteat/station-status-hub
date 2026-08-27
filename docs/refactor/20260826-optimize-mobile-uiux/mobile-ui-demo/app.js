(function () {
  "use strict";

  const stations = ["電氣測試", "功能驗證", "出貨檢查"];
  const machines = [
    {
      id: "SSH-26031",
      name: "組裝站狀態控制器 A-031",
      station: "電氣測試",
      nextStation: "功能驗證",
      status: "進行中",
      engineer: "王小明",
      progress: 56,
      completed: 5,
      total: 9,
      issueCount: 1,
      tasks: [
        { id: "power", name: "電源與接地檢查", status: "已完成", progress: 100, note: "數值正常", updated: "王小明・09:18", issue: null },
        { id: "io", name: "I/O 訊號逐點確認", status: "異常", progress: 40, note: "DI-07 訊號間歇遺失", updated: "王小明・10:42", issue: "ISS-204" },
        { id: "safety", name: "安全迴路測試", status: "進行中", progress: 70, note: "待確認 E-stop 回復時間", updated: "王小明・11:06", issue: null },
        { id: "network", name: "網路連線與位址確認", status: "未開始", progress: 0, note: "", updated: "尚未更新", issue: null }
      ]
    },
    {
      id: "SSH-26028",
      name: "包裝線資料閘道器 B-028",
      station: "功能驗證",
      nextStation: "出貨檢查",
      status: "進行中",
      engineer: "陳怡君",
      progress: 75,
      completed: 6,
      total: 8,
      issueCount: 0,
      tasks: [
        { id: "boot", name: "系統開機與版本確認", status: "已完成", progress: 100, note: "v2.8.1", updated: "陳怡君・08:40", issue: null },
        { id: "sync", name: "站點資料同步", status: "進行中", progress: 80, note: "連續運行測試中", updated: "陳怡君・10:16", issue: null },
        { id: "alarm", name: "異常告警驗證", status: "未開始", progress: 0, note: "", updated: "尚未更新", issue: null },
        { id: "report", name: "報表資料核對", status: "已完成", progress: 100, note: "資料一致", updated: "陳怡君・09:52", issue: null }
      ]
    },
    {
      id: "SSH-26024",
      name: "倉儲環境監測器 C-024",
      station: "出貨檢查",
      nextStation: "—",
      status: "已完成",
      engineer: "林志豪",
      progress: 100,
      completed: 7,
      total: 7,
      issueCount: 0,
      tasks: [
        { id: "visual", name: "外觀與標示檢查", status: "已完成", progress: 100, note: "合格", updated: "林志豪・昨日 16:40", issue: null },
        { id: "package", name: "配件與包裝確認", status: "已完成", progress: 100, note: "合格", updated: "林志豪・昨日 16:52", issue: null }
      ]
    },
    {
      id: "SSH-26035",
      name: "遠端維護終端 D-035－超長名稱壓力測試版本",
      station: "電氣測試",
      nextStation: "功能驗證",
      status: "未開始",
      engineer: "王小明",
      progress: 0,
      completed: 0,
      total: 6,
      issueCount: 0,
      tasks: [
        { id: "input", name: "輸入電壓範圍測試", status: "未開始", progress: 0, note: "", updated: "尚未更新", issue: null },
        { id: "ground", name: "接地阻抗量測", status: "未開始", progress: 0, note: "", updated: "尚未更新", issue: null }
      ]
    }
  ];

  const state = {
    filters: { search: "", station: "", status: "", engineer: "" },
    prioritySort: false,
    selectedMachine: null,
    selectedTaskId: null,
    expandedTaskId: null,
    dirtyTasks: new Set(),
    originalTasks: null,
    issueDrafts: new Map(),
    completedExpanded: false,
    lastTrigger: null,
    issueLastTrigger: null,
    pendingConfirm: null,
    confirmTrigger: null
  };

  const el = (id) => document.getElementById(id);
  const filterControlIds = {
    search: ["searchInput"],
    station: ["stationFilter"],
    status: ["statusFilter"],
    engineer: ["engineerFilter"]
  };
  const filterControls = (key) => filterControlIds[key].map(el).filter(Boolean);
  const machineList = el("machineList");
  const emptyState = el("emptyState");
  const progressOverlay = el("progressOverlay");
  const issueOverlay = el("issueOverlay");
  const confirmLayer = el("confirmLayer");
  const taskList = el("taskList");
  const closeIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg>';
  let toastTimer;

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function icon(name) {
    const paths = {
      edit: '<path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4"/>',
      alert: '<path d="M12 9v4m0 4h.01M10 3h4l7 16H3l7-16Z"/>',
      arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      play: '<path d="m9 7 8 5-8 5V7Z"/>',
      more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>'
    };
    return `<svg aria-hidden="true" viewBox="0 0 24 24">${paths[name] || ""}</svg>`;
  }

  function statusClass(status) {
    return status === "異常" ? "issue" : status === "已完成" ? "done" : status === "未開始" ? "waiting" : "active";
  }

  function loadFiltersFromUrl() {
    const params = new URLSearchParams(location.search);
    Object.keys(state.filters).forEach((key) => {
      const value = params.get(key) || "";
      state.filters[key] = value;
      filterControls(key).forEach((control) => { control.value = value; });
    });
  }

  function syncFiltersToUrl() {
    const params = new URLSearchParams(location.search);
    Object.entries(state.filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    const next = `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`;
    try { history.replaceState(null, "", next); } catch (_) { /* file:// may restrict history in some browsers */ }
  }

  function renderChips() {
    const labels = { search: "搜尋", station: "站點", status: "狀態", engineer: "工程師" };
    const active = Object.entries(state.filters).filter(([, value]) => value);
    el("filterChips").innerHTML = active.length
      ? active.map(([key, value]) => `<span class="filter-chip">${labels[key]}：${escapeHtml(value)}<button type="button" data-clear-filter="${key}" aria-label="清除${labels[key]}條件">${closeIcon}</button></span>`).join("")
      : '<span class="no-filter">目前沒有套用條件</span>';
  }

  function filteredMachines() {
    const search = state.filters.search.trim().toLocaleLowerCase("zh-Hant");
    let result = machines.filter((machine) => {
      const matchesSearch = !search || `${machine.name} ${machine.id} ${machine.engineer}`.toLocaleLowerCase("zh-Hant").includes(search);
      return matchesSearch && (!state.filters.station || machine.station === state.filters.station) && (!state.filters.status || machine.status === state.filters.status) && (!state.filters.engineer || machine.engineer === state.filters.engineer);
    });
    if (state.prioritySort) {
      const rank = { "異常": 0, "進行中": 1, "未開始": 2, "已完成": 3 };
      result = result.slice().sort((a, b) => rank[a.status] - rank[b.status]);
    }
    return result;
  }

  function renderMachines() {
    const result = filteredMachines();
    el("resultCount").textContent = `${result.length} 台`;
    el("pageHeaderDescription").textContent = `GB300 EVT 驗證 · ${result.length} 台符合條件`;
    machineList.hidden = result.length === 0;
    emptyState.hidden = result.length !== 0;
    machineList.innerHTML = result.map((machine) => `
      <article class="machine-card" data-status="${machine.status}" data-blocked="${machine.issueCount > 0}">
        <div class="machine-card-header">
          <div class="machine-title"><h3>${escapeHtml(machine.name)}</h3><p>${machine.id}</p></div>
          <button class="icon-button more-button" type="button" aria-label="${escapeHtml(machine.name)}更多操作" data-more="${machine.id}">${icon("more")}</button>
        </div>
        <div class="machine-status-row"><span class="badge ${statusClass(machine.status)}">${machine.status}</span></div>
        <div class="machine-meta">
          <div><span>目前／下一站</span><strong>${machine.station} → ${machine.nextStation}</strong></div>
          <div><span>負責工程師</span><strong>${machine.engineer}</strong></div>
        </div>
        <div class="progress-row">
          <div class="progress-track" role="progressbar" aria-label="${escapeHtml(machine.name)}完成 ${machine.progress}%" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${machine.progress}"><span style="width:${machine.progress}%"></span></div>
          <span class="progress-number">${machine.progress}%</span>
          <span class="progress-caption">已完成 ${machine.completed}／${machine.total} 個測項</span>
        </div>
        ${machine.issueCount ? `<div class="machine-alert">${icon("alert")}<div><strong>${machine.issueCount} 個未解問題阻擋測試</strong><br><button type="button" data-view-issue="${machine.id}">查看問題 ISS-204</button></div></div>` : ""}
        <div class="machine-actions"><button class="primary-button" type="button" data-open-progress="${machine.id}">${icon("edit")}更新進度${icon("arrow")}</button></div>
      </article>`).join("");
  }

  function renderOverview() {
    const average = Math.round(machines.reduce((sum, machine) => sum + machine.progress, 0) / machines.length);
    const counts = machines.reduce((result, machine) => {
      result[machine.status] = (result[machine.status] || 0) + 1;
      return result;
    }, {});
    const progress = el("overviewProgress");
    el("overviewValue").textContent = `${average}%`;
    el("overviewTotal").textContent = `共 ${machines.length} 台機台`;
    el("overviewWaiting").textContent = counts["未開始"] || 0;
    el("overviewActive").textContent = counts["進行中"] || 0;
    el("overviewDone").textContent = counts["已完成"] || 0;
    progress.setAttribute("aria-label", `整體完成率 ${average}%`);
    progress.setAttribute("aria-valuenow", String(average));
    progress.firstElementChild.style.width = `${average}%`;
  }

  function renderAll() {
    Object.entries(state.filters).forEach(([key, value]) => {
      filterControls(key).forEach((control) => { if (control.value !== value) control.value = value; });
    });
    renderChips();
    renderMachines();
    renderOverview();
    syncFiltersToUrl();
  }

  function clearFilters() {
    Object.keys(state.filters).forEach((key) => {
      state.filters[key] = "";
      filterControls(key).forEach((control) => { control.value = ""; });
    });
    renderAll();
  }

  function setBodyLock() {
    document.body.classList.toggle("is-locked", !progressOverlay.hidden || !issueOverlay.hidden || !confirmLayer.hidden);
  }

  function focusableIn(container) {
    return [...container.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]')].filter((node) => node.offsetParent !== null);
  }

  function trapFocus(event, container) {
    if (event.key !== "Tab") return;
    const items = focusableIn(container);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function openProgress(machineId, trigger) {
    state.selectedMachine = machines.find((machine) => machine.id === machineId);
    if (!state.selectedMachine) return;
    state.lastTrigger = trigger;
    state.expandedTaskId = state.selectedMachine.tasks.find((task) => task.status !== "已完成")?.id || null;
    state.completedExpanded = false;
    state.dirtyTasks.clear();
    state.originalTasks = structuredClone(state.selectedMachine.tasks);
    el("sheetMachineId").textContent = `${state.selectedMachine.id}・${state.selectedMachine.station}`;
    el("sheetStationSelect").innerHTML = stations.map((station) => `<option${station === state.selectedMachine.station ? " selected" : ""}>${station}</option>`).join("");
    progressOverlay.hidden = false;
    renderTasks();
    setBodyLock();
    requestAnimationFrame(() => progressOverlay.querySelector("[data-close-progress]").focus());
  }

  function requestCloseProgress() {
    if (state.dirtyTasks.size) {
      showConfirm({
        type: "discard",
        title: "捨棄尚未儲存的變更？",
        description: `目前有 ${state.dirtyTasks.size} 個測項尚未儲存。關閉後將還原這些展示資料。`,
        detail: "建議返回繼續編輯，或先按「儲存變更」。",
        actionLabel: "捨棄變更",
        destructive: true
      });
      return;
    }
    closeProgress();
  }

  function closeProgress() {
    progressOverlay.hidden = true;
    state.selectedMachine = null;
    state.expandedTaskId = null;
    state.dirtyTasks.clear();
    state.originalTasks = null;
    setBodyLock();
    if (state.lastTrigger) state.lastTrigger.focus();
  }

  function renderTasks() {
    const machine = state.selectedMachine;
    if (!machine) return;
    const activeTasks = machine.tasks.filter((task) => task.status !== "已完成").sort((a, b) => {
      const rank = { "異常": 0, "進行中": 1, "未開始": 2 };
      return rank[a.status] - rank[b.status];
    });
    const completedTasks = machine.tasks.filter((task) => task.status === "已完成");
    const issueCount = machine.tasks.filter((task) => task.status === "異常" || task.issue).length;
    el("stationDoneCount").textContent = completedTasks.length;
    el("stationActiveCount").textContent = machine.tasks.filter((task) => task.status === "進行中").length;
    el("stationIssueCount").textContent = issueCount;
    const sections = [`<div class="task-section-heading"><h3>待處理測項</h3><span>${activeTasks.length} 項</span></div><div class="task-list">${activeTasks.map(taskTemplate).join("") || '<p class="no-filter">此站沒有待處理測項</p>'}</div>`];
    if (completedTasks.length) {
      sections.push(`<button class="secondary-button completed-toggle" type="button" id="completedToggle" aria-expanded="${state.completedExpanded}">${state.completedExpanded ? "收合" : "顯示"}已完成測項（${completedTasks.length}）</button>`);
      if (state.completedExpanded) sections.push(`<div class="task-list" style="margin-top:10px">${completedTasks.map(taskTemplate).join("")}</div>`);
    }
    taskList.innerHTML = sections.join("");
    updateDirtyUi();
  }

  function taskTemplate(task) {
    const expanded = state.expandedTaskId === task.id;
    return `<article class="task-card ${task.issue ? "is-issue" : ""}">
      <button class="task-summary" type="button" data-expand-task="${task.id}" aria-expanded="${expanded}">
        <span class="task-summary-main"><strong>${escapeHtml(task.name)}</strong><small>${escapeHtml(task.updated)}</small></span>
        <span class="badge task-status ${statusClass(task.status)}">${task.status}</span>
        <span class="task-progress"><span class="progress-track"><span style="width:${task.progress}%"></span></span><span>${task.progress}%</span></span>
      </button>
      ${expanded ? `<div class="task-editor">
        ${task.issue ? `<div class="linked-issue"><span><strong>${task.issue}</strong>・未解問題，目前不可完成</span><button type="button" data-view-linked-issue>查看問題</button></div>` : ""}
        <div class="quick-actions" aria-label="快速更新${escapeHtml(task.name)}">
          <button type="button" data-task-action="start" data-task="${task.id}">${icon("play")}開始</button>
          <button type="button" data-task-action="complete" data-task="${task.id}" ${task.issue ? "disabled title=\"請先解決關聯問題\"" : ""}>${icon("check")}完成</button>
          <button class="issue-action" type="button" data-task-action="issue" data-task="${task.id}">${icon("alert")}回報異常</button>
        </div>
        <label class="field"><span>完成進度</span><span class="range-row"><input type="range" min="0" max="100" step="10" value="${task.progress}" data-task-range="${task.id}" aria-label="${escapeHtml(task.name)}完成進度"><output class="range-value">${task.progress}%</output></span></label>
        <label class="field"><span>測試備註</span><textarea rows="3" data-task-note="${task.id}" placeholder="記錄量測結果或交接事項">${escapeHtml(task.note)}</textarea></label>
      </div>` : ""}
    </article>`;
  }

  function markDirty(taskId) {
    state.dirtyTasks.add(taskId);
    updateDirtyUi();
  }

  function updateDirtyUi() {
    const count = state.dirtyTasks.size;
    el("dirtyFooter").hidden = count === 0;
    el("dirtyCount").textContent = `${count} 項尚未儲存`;
    el("saveState").textContent = count ? "尚未儲存" : "已儲存";
    el("saveState").classList.toggle("is-dirty", count > 0);
  }

  function saveTasks() {
    if (!state.dirtyTasks.size) return;
    const button = el("saveAllButton");
    button.disabled = true;
    button.textContent = "儲存中…";
    el("saveState").textContent = "儲存中…";
    setTimeout(() => {
      state.selectedMachine.tasks.forEach((task) => {
        if (state.dirtyTasks.has(task.id)) task.updated = "王小明・剛剛";
      });
      state.dirtyTasks.clear();
      state.originalTasks = structuredClone(state.selectedMachine.tasks);
      button.disabled = false;
      button.textContent = "儲存變更";
      renderTasks();
      showToast("進度已儲存（僅限本地 Demo）");
    }, 650);
  }

  function openIssue(taskId, trigger) {
    state.selectedTaskId = taskId;
    state.issueLastTrigger = trigger;
    const task = state.selectedMachine.tasks.find((item) => item.id === taskId);
    el("issueContext").textContent = `${state.selectedMachine.id}・${state.selectedMachine.station}`;
    el("issueTaskContext").textContent = task.name;
    const savedDraft = state.issueDrafts.get(taskId);
    el("issueDescription").value = savedDraft ?? (task.note && task.status === "異常" ? task.note : "");
    el("issueDescriptionError").textContent = "";
    el("issueFormStatus").textContent = savedDraft ? "已還原尚未送出的本地草稿。" : "草稿只保留在此頁面。";
    el("attachmentInput").value = "";
    el("attachmentPreview").hidden = true;
    issueOverlay.hidden = false;
    progressOverlay.querySelector(".progress-sheet").setAttribute("aria-hidden", "true");
    setBodyLock();
    requestAnimationFrame(() => issueOverlay.querySelector("[data-close-issue]").focus());
  }

  function closeIssue() {
    issueOverlay.hidden = true;
    progressOverlay.querySelector(".progress-sheet").removeAttribute("aria-hidden");
    setBodyLock();
    if (state.issueLastTrigger) state.issueLastTrigger.focus();
  }

  function submitIssue(event) {
    event.preventDefault();
    const description = el("issueDescription").value.trim();
    if (!description) {
      el("issueDescriptionError").textContent = "請先描述異常，讓接手者知道需要處理什麼。";
      el("issueDescription").setAttribute("aria-invalid", "true");
      el("issueDescription").focus();
      return;
    }
    el("issueDescriptionError").textContent = "";
    el("issueDescription").removeAttribute("aria-invalid");
    const button = el("createIssueButton");
    button.disabled = true;
    button.textContent = "建立中…";
    el("issueFormStatus").textContent = "正在建立問題並更新測項狀態…";
    setTimeout(() => {
      const task = state.selectedMachine.tasks.find((item) => item.id === state.selectedTaskId);
      task.issue = task.issue || `ISS-${Math.floor(300 + Math.random() * 600)}`;
      task.status = "異常";
      task.note = description;
      task.updated = "王小明・剛剛";
      state.selectedMachine.issueCount = state.selectedMachine.tasks.filter((item) => item.issue).length;
      state.selectedMachine.status = "進行中";
      state.dirtyTasks.delete(task.id);
      state.issueDrafts.delete(task.id);
      state.originalTasks = structuredClone(state.selectedMachine.tasks);
      button.disabled = false;
      button.innerHTML = `${icon("alert")}建立問題並標記異常`;
      closeIssue();
      renderTasks();
      renderMachines();
      renderOverview();
      showToast(`${task.issue} 已建立，並已關聯原測項`);
    }, 800);
  }

  function showConfirm(options) {
    state.pendingConfirm = options;
    state.confirmTrigger = document.activeElement;
    el("confirmTitle").textContent = options.title;
    el("confirmDescription").textContent = options.description;
    el("confirmDetail").textContent = options.detail;
    el("confirmIcon").className = `confirm-icon${options.blocked ? " is-blocked" : ""}`;
    el("confirmIcon").innerHTML = icon(options.blocked || options.destructive ? "alert" : "check");
    const action = el("confirmActionButton");
    action.textContent = options.actionLabel || "確認完成";
    action.disabled = Boolean(options.blocked);
    action.className = options.destructive ? "danger-button" : "primary-button";
    confirmLayer.hidden = false;
    setBodyLock();
    requestAnimationFrame(() => (options.blocked ? confirmLayer.querySelector("[data-cancel-confirm]") : action).focus());
  }

  function closeConfirm() {
    confirmLayer.hidden = true;
    state.pendingConfirm = null;
    setBodyLock();
    if (state.confirmTrigger) state.confirmTrigger.focus();
    state.confirmTrigger = null;
  }

  function requestCompleteStation() {
    const machine = state.selectedMachine;
    const remaining = machine.tasks.filter((task) => task.status !== "已完成");
    const issues = machine.tasks.filter((task) => task.issue);
    showConfirm(issues.length ? {
      type: "blocked",
      title: "此站目前無法完成",
      description: `還有 ${issues.length} 個未解問題阻擋 ${remaining.length} 個測項。`,
      detail: `${issues.map((task) => task.issue).join("、")} 必須先完成處理或解除關聯。`,
      actionLabel: "確認完成",
      blocked: true
    } : {
      type: "complete",
      title: "完成此站的所有測項？",
      description: `這會把 ${remaining.length} 個未完成測項設為「已完成」及 100%。`,
      detail: `機台：${machine.id}　站點：${machine.station}`,
      actionLabel: `完成 ${remaining.length} 個測項`
    });
  }

  function confirmAction() {
    const options = state.pendingConfirm;
    if (!options) return;
    if (options.type === "discard") {
      if (state.originalTasks) state.selectedMachine.tasks = structuredClone(state.originalTasks);
      state.dirtyTasks.clear();
      confirmLayer.hidden = true;
      state.pendingConfirm = null;
      closeProgress();
      return;
    }
    if (options.type === "complete") {
      state.selectedMachine.tasks.forEach((task) => { task.status = "已完成"; task.progress = 100; task.updated = "王小明・剛剛"; });
      state.selectedMachine.progress = 100;
      state.selectedMachine.completed = state.selectedMachine.total;
      state.selectedMachine.status = "已完成";
      state.dirtyTasks.clear();
      state.originalTasks = structuredClone(state.selectedMachine.tasks);
      closeConfirm();
      renderTasks();
      renderMachines();
      renderOverview();
      showToast("此站已完成（僅限本地 Demo）");
    }
  }

  function showToast(message) {
    const toast = el("toast");
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  ["search", "station", "status", "engineer"].forEach((key) => {
    filterControls(key).forEach((control) => {
      control.addEventListener(key === "search" ? "input" : "change", () => {
        state.filters[key] = control.value;
        renderAll();
      });
    });
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button, [data-task-range], [data-task-note]");
    if (!target) return;
    if (target.dataset.clearFilter) {
      const key = target.dataset.clearFilter;
      state.filters[key] = "";
      filterControls(key).forEach((control) => { control.value = ""; });
      renderAll();
    }
    if (target.dataset.openProgress) openProgress(target.dataset.openProgress, target);
    if (target.matches("[data-close-progress]")) requestCloseProgress();
    if (target.dataset.expandTask) { state.expandedTaskId = state.expandedTaskId === target.dataset.expandTask ? null : target.dataset.expandTask; renderTasks(); }
    if (target.id === "completedToggle") { state.completedExpanded = !state.completedExpanded; renderTasks(); }
    if (target.dataset.taskAction) {
      const task = state.selectedMachine.tasks.find((item) => item.id === target.dataset.task);
      if (target.dataset.taskAction === "issue") openIssue(task.id, target);
      if (target.dataset.taskAction === "start") { task.status = "進行中"; task.progress = Math.max(task.progress, 10); markDirty(task.id); renderTasks(); }
      if (target.dataset.taskAction === "complete" && !task.issue) { task.status = "已完成"; task.progress = 100; markDirty(task.id); renderTasks(); }
    }
    if (target.matches("[data-close-issue]")) closeIssue();
    if (target.matches("[data-cancel-confirm]")) closeConfirm();
    if (target.dataset.more) showToast("次要操作會放在此選單，不干擾主要更新流程");
    if (target.dataset.viewIssue || target.hasAttribute("data-view-linked-issue")) showToast("Demo：開啟已關聯問題 ISS-204");
    if (target.dataset.moduleTarget) {
      if (!desktopLayout.matches) el("moduleSwitcher").open = false;
      showToast(`Demo：切換至${target.dataset.moduleTarget}`);
    }
  });

  taskList.addEventListener("input", (event) => {
    const range = event.target.closest("[data-task-range]");
    const note = event.target.closest("[data-task-note]");
    if (range) {
      const task = state.selectedMachine.tasks.find((item) => item.id === range.dataset.taskRange);
      task.progress = Number(range.value);
      task.status = task.progress === 100 ? "已完成" : task.progress > 0 ? "進行中" : "未開始";
      range.nextElementSibling.textContent = `${range.value}%`;
      markDirty(task.id);
    }
    if (note) {
      const task = state.selectedMachine.tasks.find((item) => item.id === note.dataset.taskNote);
      task.note = note.value;
      markDirty(task.id);
    }
  });

  el("clearAllButton").addEventListener("click", clearFilters);
  el("emptyClearButton").addEventListener("click", clearFilters);
  el("sortButton").addEventListener("click", (event) => {
    state.prioritySort = !state.prioritySort;
    event.currentTarget.setAttribute("aria-pressed", String(state.prioritySort));
    event.currentTarget.classList.toggle("is-active", state.prioritySort);
    renderMachines();
  });
  el("saveAllButton").addEventListener("click", saveTasks);
  el("completeStationButton").addEventListener("click", requestCompleteStation);
  el("sheetStationSelect").addEventListener("change", (event) => {
    if (state.dirtyTasks.size) {
      event.currentTarget.value = state.selectedMachine.station;
      showToast("請先儲存目前測項，再切換站點");
      return;
    }
    state.selectedMachine.station = event.currentTarget.value;
    el("sheetMachineId").textContent = `${state.selectedMachine.id}・${state.selectedMachine.station}`;
    renderMachines();
    showToast(`已切換至${state.selectedMachine.station}（展示沿用相同測項）`);
  });
  el("issueForm").addEventListener("submit", submitIssue);
  el("issueDescription").addEventListener("input", () => {
    if (state.selectedTaskId) state.issueDrafts.set(state.selectedTaskId, el("issueDescription").value);
    if (el("issueDescription").value.trim()) { el("issueDescriptionError").textContent = ""; el("issueDescription").removeAttribute("aria-invalid"); }
  });
  el("attachmentInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    const preview = el("attachmentPreview");
    if (!file) { preview.hidden = true; return; }
    preview.innerHTML = `<span><strong>${escapeHtml(file.name)}</strong><br>${Math.max(.1, file.size / 1024 / 1024).toFixed(1)} MB・準備上傳</span><button type="button" id="removeAttachment">移除</button>`;
    preview.hidden = false;
    el("removeAttachment").addEventListener("click", () => { event.target.value = ""; preview.hidden = true; });
  });
  el("confirmActionButton").addEventListener("click", confirmAction);

  document.addEventListener("keydown", (event) => {
    if (!confirmLayer.hidden) {
      if (event.key === "Escape") closeConfirm();
      trapFocus(event, confirmLayer);
      return;
    }
    if (!issueOverlay.hidden) {
      if (event.key === "Escape") closeIssue();
      trapFocus(event, issueOverlay);
      return;
    }
    if (!progressOverlay.hidden) {
      if (event.key === "Escape") requestCloseProgress();
      trapFocus(event, progressOverlay);
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (state.dirtyTasks.size) { event.preventDefault(); event.returnValue = ""; }
  });

  const desktopLayout = window.matchMedia("(min-width: 64.0625rem)");
  function syncResponsiveShell() {
    const frame = el("desktopAppFrame");
    if (!desktopLayout.matches) {
      frame.removeAttribute("src");
      return;
    }

    el("moduleSwitcher").open = false;
    if (!frame.hasAttribute("src")) frame.src = frame.dataset.src;
  }
  desktopLayout.addEventListener("change", syncResponsiveShell);
  syncResponsiveShell();

  loadFiltersFromUrl();
  renderAll();
})();
