(function () {
  "use strict";

  const STORE_KEY = "donow.tasks.v1";
  const SETTINGS_KEY = "donow.settings.v1";
  const DAYS_KEY = "donow.dayssince.v1";

  // Theme registry. Preview colors mirror the CSS token blocks in styles.css.
  const THEMES = [
    { id: "light",      name: "Light",      bg: "#f4f5f6", panel: "#ffffff", ink: "#17191c", accent: "#0d7d72", line: "#d7dadd", topbar: "#17191c" },
    { id: "dark",       name: "Dark",       bg: "#15181b", panel: "#1d2125", ink: "#e6e9ec", accent: "#1f9e8f", line: "#2b3036", topbar: "#17191c" },
    { id: "batman",     name: "Batman",     bg: "#0c0c0f", panel: "#161619", ink: "#e9e9ec", accent: "#ffd400", line: "#26262c", topbar: "#000000" },
    { id: "joker",      name: "Joker",      bg: "#160a24", panel: "#241338", ink: "#e7d9ff", accent: "#4ade80", line: "#33204d", topbar: "#2d0b45" },
    { id: "terminator", name: "Terminator", bg: "#0b0c0e", panel: "#151719", ink: "#d7d9dc", accent: "#e10600", line: "#26292d", topbar: "#000000" },
    { id: "matrix",     name: "Matrix",     bg: "#000600", panel: "#031803", ink: "#00ff41", accent: "#00ff41", line: "#052b05", topbar: "#000000" },
    { id: "sonic",      name: "Sonic",      bg: "#0a2a6b", panel: "#123a86", ink: "#eaf1ff", accent: "#ffd21e", line: "#1c4aa0", topbar: "#061c4a" },
    { id: "redwings",   name: "Red Wings",  bg: "#f3f4f5", panel: "#ffffff", ink: "#1a1a1a", accent: "#ce1126", line: "#e2d7d7", topbar: "#ce1126" },
    { id: "michigan",   name: "Michigan",   bg: "#00274c", panel: "#0a355f", ink: "#eef3f8", accent: "#ffcb05", line: "#164574", topbar: "#001730" },
    { id: "lions",      name: "Lions",      bg: "#eceef0", panel: "#ffffff", ink: "#1b2733", accent: "#0076b6", line: "#d3d9de", topbar: "#0076b6" },
    { id: "tigers",     name: "Tigers",     bg: "#0c2340", panel: "#132f52", ink: "#eef2f7", accent: "#fa4616", line: "#1d3f63", topbar: "#07182e" },
    { id: "pistons",    name: "Pistons '95",bg: "#052e2a", panel: "#0a3f39", ink: "#e6f2f0", accent: "#00a89d", line: "#0f4d46", topbar: "#021815" },
    { id: "nineties",   name: "90s",        bg: "#f4f1ea", panel: "#ffffff", ink: "#1f2a33", accent: "#009fb7", line: "#e2ded4", topbar: "#1f2a33" },
    { id: "eighties",   name: "80s",        bg: "#0b1233", panel: "#141a44", ink: "#eaf0ff", accent: "#ff2e88", line: "#222a5e", topbar: "#060826" },
    { id: "seventies",  name: "70s",        bg: "#e8dcc0", panel: "#f3ead2", ink: "#3a2c17", accent: "#c1440e", line: "#d6c69f", topbar: "#6b4a2b" },
    { id: "sixties",    name: "60s",        bg: "#faf3e0", panel: "#ffffff", ink: "#2b2320", accent: "#e8551f", line: "#eadfc6", topbar: "#1f9e8f" },
    { id: "fifties",    name: "50s",        bg: "#f6efe4", panel: "#fffdf7", ink: "#33403f", accent: "#ff6f61", line: "#dfe8e2", topbar: "#2ec4b6" },
  ];
  const THEME_IDS = THEMES.map((t) => t.id);

  const state = {
    tasks: [],
    view: "now",
    nowMinutes: "",       // canonical limit in MINUTES ("" = show all active)
    nowUnit: "min",       // min | hr — how the limit is entered/displayed
    packMode: false,      // fit-to-budget on Do Now
    archiveStatus: "all", // all | completed | abandoned
    editingId: null,
    theme: "light",       // light | dark
    sort: "priority",     // priority | time | age
    expanded: new Set(),  // ids of expanded task cards (session only)
    daysItems: [],        // "days since" trackers
    showHiddenDays: false,
    editingDayId: null,
    newKind: "task",      // task | day — which form the New tab shows
    mainKind: "now",      // now | days — which pane the Home tab shows
  };

  /* ---------- storage ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      state.tasks = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(state.tasks)) state.tasks = [];
    } catch (e) {
      state.tasks = [];
    }
  }
  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.tasks));
  }
  function loadDays() {
    try {
      const raw = localStorage.getItem(DAYS_KEY);
      state.daysItems = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(state.daysItems)) state.daysItems = [];
    } catch (e) { state.daysItems = []; }
  }
  function saveDays() {
    localStorage.setItem(DAYS_KEY, JSON.stringify(state.daysItems));
  }
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
      state.nowMinutes = s.nowMinutes != null ? String(s.nowMinutes) : "";
      state.nowUnit = s.nowUnit === "hr" ? "hr" : "min";
      state.packMode = !!s.packMode;
      state.theme = THEME_IDS.includes(s.theme) ? s.theme : "light";
      state.sort = ["priority", "time", "age"].includes(s.sort) ? s.sort : "priority";
    } catch (e) { /* defaults */ }
  }
  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      nowMinutes: state.nowMinutes,
      nowUnit: state.nowUnit,
      packMode: state.packMode,
      theme: state.theme,
      sort: state.sort,
    }));
  }
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    document.querySelectorAll(".theme-row").forEach((r) => {
      const on = r.dataset.themeId === state.theme;
      r.classList.toggle("active", on);
      r.setAttribute("aria-pressed", String(on));
    });
  }
  function renderThemes() {
    const list = document.getElementById("themeList");
    list.innerHTML = THEMES.map((t) => {
      const active = t.id === state.theme;
      return (
        '<button class="theme-row' + (active ? " active" : "") +
          '" data-theme-id="' + t.id + '" aria-pressed="' + active + '">' +
          '<span class="theme-preview" style="background:' + t.bg + '">' +
            '<span class="tp-bar" style="background:' + t.topbar + '"></span>' +
            '<span class="tp-card" style="background:' + t.panel + ';border-color:' + t.line + '">' +
              '<span class="tp-line" style="background:' + t.ink + '"></span>' +
              '<span class="tp-accent" style="background:' + t.accent + '"></span>' +
            "</span>" +
          "</span>" +
          '<span class="theme-name">' + t.name + "</span>" +
          '<span class="theme-check">\u2713</span>' +
        "</button>"
      );
    }).join("");
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- helpers ---------- */
  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function fmtFull(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString();
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function clampPriority(p) {
    p = parseInt(p, 10);
    if (isNaN(p)) p = 3;
    return Math.min(5, Math.max(1, p));
  }
  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }
  // 45 -> "45 minutes"; 60 -> "1 hour"; 200 -> "3 hours 20 minutes";
  // 6075 -> "4 days 5 hours 15 minutes". Zero units are omitted.
  function fmtDuration(mins) {
    mins = Math.max(0, Math.round(Number(mins) || 0));
    if (mins < 60) return plural(mins, "minute");
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    const parts = [];
    if (d) parts.push(plural(d, "day"));
    if (h) parts.push(plural(h, "hour"));
    if (m) parts.push(plural(m, "minute"));
    return parts.join(" ");
  }
  function toast(msg, opts) {
    opts = opts || {};
    const t = document.getElementById("toast");
    t.innerHTML = "";
    const span = document.createElement("span");
    span.textContent = msg;
    t.appendChild(span);
    if (opts.actionLabel && typeof opts.onAction === "function") {
      const b = document.createElement("button");
      b.className = "toast-action";
      b.textContent = opts.actionLabel;
      b.addEventListener("click", () => {
        clearTimeout(toast._t);
        t.hidden = true;
        opts.onAction();
      });
      t.appendChild(b);
    }
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, opts.ms || 2200);
  }

  /* ---------- view switching ---------- */
  function setView(v) {
    state.view = v;
    document.querySelectorAll(".tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.view === v));
    document.getElementById("view-main").hidden = v !== "main";
    document.getElementById("view-new").hidden = v !== "new";
    document.getElementById("view-archive").hidden = v !== "archive";
    document.getElementById("view-themes").hidden = v !== "themes";
    if (v === "main") renderMainKind();
    if (v === "new") renderNewKind();
    if (v === "archive") renderArchive();
    if (v === "themes") renderThemes();
  }
  function renderMainKind() {
    document.getElementById("pane-now").hidden = state.mainKind !== "now";
    document.getElementById("pane-days").hidden = state.mainKind !== "days";
    document.querySelectorAll("#mainSubtabs .chip").forEach((c) =>
      c.classList.toggle("active", c.dataset.mainkind === state.mainKind));
    if (state.mainKind === "days") renderDays();
    else renderNow();
  }
  function renderNewKind() {
    document.getElementById("taskForm").hidden = state.newKind !== "task";
    document.getElementById("dayForm").hidden = state.newKind !== "day";
    document.querySelectorAll("#newSubtabs .chip").forEach((c) =>
      c.classList.toggle("active", c.dataset.newkind === state.newKind));
  }

  /* ---------- card builder ---------- */
  function cardHTML(t, context, opts) {
    opts = opts || {};
    const p = clampPriority(t.priority);
    const expanded = state.expanded.has(t.id);
    const doneClass = (t.status === "completed" || t.status === "abandoned") ? " done" : "";
    const overflowClass = opts.overflow ? " overflow" : "";
    const collapsedClass = expanded ? "" : " collapsed";

    let dates =
      '<span title="' + esc(fmtFull(t.createdAt)) + '">created <b>' + fmtDate(t.createdAt) + "</b></span>";
    if (t.closedAt) {
      dates += '<span title="' + esc(fmtFull(t.closedAt)) + '">' +
        (t.status === "completed" ? "completed" : "abandoned") +
        " <b>" + fmtDate(t.closedAt) + "</b></span>";
    }

    const fitsBadge = opts.inPack ? '<span class="badge fits">fits</span>' : "";
    const statusBadge = context === "archive"
      ? '<span class="badge status-' + t.status + '">' + t.status + "</span>" : "";

    let actions;
    if (context === "now") {
      actions =
        '<button class="btn btn-sm" data-act="edit" data-id="' + t.id + '">Edit</button>' +
        '<button class="btn btn-sm btn-good" data-act="complete" data-id="' + t.id + '">Complete</button>' +
        '<button class="btn btn-sm btn-warn" data-act="abandon" data-id="' + t.id + '">Abandon</button>';
    } else {
      actions =
        '<button class="btn btn-sm" data-act="restore" data-id="' + t.id + '">Restore</button>' +
        '<button class="btn btn-sm btn-danger" data-act="delete" data-id="' + t.id + '">Delete</button>';
    }

    return (
      '<div class="card p' + p + doneClass + overflowClass + collapsedClass + '" data-id="' + t.id + '">' +
        '<div class="card-head" role="button" tabindex="0" aria-expanded="' + expanded + '">' +
          '<span class="card-title">' + esc(t.label) + "</span>" +
          '<span class="card-time">' + fmtDuration(t.minutes) + "</span>" +
          '<span class="badge p' + p + '">P' + p + "</span>" +
          fitsBadge + statusBadge +
        "</div>" +
        '<div class="card-body">' +
          '<div class="meta">' + dates + "</div>" +
          (t.description ? '<div class="desc">' + esc(t.description) + "</div>" : "") +
          '<div class="card-actions">' + actions + "</div>" +
        "</div>" +
      "</div>"
    );
  }

  /* ---------- Do Now ---------- */
  // Presets are stored in minutes; labels render in the active unit.
  const PRESETS = { min: [5, 15, 30, 60], hr: [60, 120, 240, 480] };

  // canonical minutes -> value shown in the input, in the active unit
  function limitDisplayValue() {
    if (state.nowMinutes === "") return "";
    const m = parseInt(state.nowMinutes, 10);
    if (isNaN(m)) return "";
    return state.nowUnit === "hr" ? String(+(m / 60).toFixed(2)) : String(m);
  }

  function syncLimitInput() {
    const el = document.getElementById("nowMinutes");
    el.value = limitDisplayValue();
    if (state.nowUnit === "hr") {
      el.step = "0.25";
      el.setAttribute("inputmode", "decimal");
    } else {
      el.step = "1";
      el.setAttribute("inputmode", "numeric");
    }
  }

  function renderPresetChips() {
    const wrap = document.getElementById("minuteChips");
    const list = PRESETS[state.nowUnit] || PRESETS.min;
    wrap.innerHTML =
      list.map((m) =>
        '<button class="chip" data-min="' + m + '">' +
        (state.nowUnit === "hr" ? m / 60 : m) +
        "</button>").join("") +
      '<button class="chip" data-min="">all</button>';
  }

  function nowComparator() {
    const byPrio = (a, b) => clampPriority(b.priority) - clampPriority(a.priority);
    const byTime = (a, b) => Number(a.minutes) - Number(b.minutes);
    const byAge = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);
    if (state.sort === "time") return (a, b) => byTime(a, b) || byPrio(a, b) || byAge(a, b);
    if (state.sort === "age") return (a, b) => byAge(a, b) || byPrio(a, b) || byTime(a, b);
    return (a, b) => byPrio(a, b) || byTime(a, b) || byAge(a, b);
  }
  function renderNow() {
    const list = document.getElementById("nowList");
    const countEl = document.getElementById("nowCount");
    const packBtn = document.getElementById("packToggle");
    packBtn.classList.toggle("active", state.packMode);

    const limitRaw = state.nowMinutes;
    const hasLimit = limitRaw !== "" && !isNaN(parseInt(limitRaw, 10));
    const limit = hasLimit ? parseInt(limitRaw, 10) : Infinity;

    let items = state.tasks.filter(
      (t) => t.status === "active" && Number(t.minutes) <= limit
    );
    items.sort(nowComparator());

    // chip highlight
    document.querySelectorAll("#minuteChips .chip").forEach((c) =>
      c.classList.toggle("active", c.dataset.min === String(state.nowMinutes)));
    document.querySelectorAll("#unitChips .chip").forEach((c) =>
      c.classList.toggle("active", c.dataset.unit === state.nowUnit));
    document.querySelectorAll("#sortChips .chip").forEach((c) =>
      c.classList.toggle("active", c.dataset.sort === state.sort));

    if (!items.length) {
      countEl.textContent = "";
      list.innerHTML =
        '<div class="empty"><b>Nothing fits.</b>' +
        (hasLimit ? "Raise the minutes, or add a task." : "Add a task on the New tab.") +
        "</div>";
      return;
    }

    const totalMin = items.reduce((s, t) => s + Number(t.minutes), 0);

    if (state.packMode && hasLimit) {
      // greedy fill: items already sorted priority-desc, then shortest, then oldest
      const packIds = new Set();
      let sum = 0;
      for (const t of items) {
        if (sum + Number(t.minutes) <= limit) {
          sum += Number(t.minutes);
          packIds.add(t.id);
        }
      }
      const pack = items.filter((t) => packIds.has(t.id));
      const overflow = items.filter((t) => !packIds.has(t.id));

      let html = pack.map((t) => cardHTML(t, "now", { inPack: true })).join("");
      if (overflow.length) {
        html += '<div class="pack-divider">over budget — ' + overflow.length + ' more</div>';
        html += overflow.map((t) => cardHTML(t, "now", { overflow: true })).join("");
      }
      list.innerHTML = html;
      countEl.textContent =
        "pack " + fmtDuration(sum) + " of " + fmtDuration(limit) +
        " · " + plural(pack.length, "task");
    } else {
      list.innerHTML = items.map((t) => cardHTML(t, "now")).join("");
      countEl.textContent = plural(items.length, "task") + " · " + fmtDuration(totalMin);
    }
  }

  /* ---------- Archive ---------- */
  function renderArchive() {
    const list = document.getElementById("archiveList");
    let items = state.tasks.filter(
      (t) => t.status === "completed" || t.status === "abandoned"
    );
    if (state.archiveStatus !== "all") {
      items = items.filter((t) => t.status === state.archiveStatus);
    }
    items.sort((a, b) => new Date(b.closedAt || 0) - new Date(a.closedAt || 0));

    document.getElementById("archiveCount").textContent = plural(items.length, "item");

    document.querySelectorAll("#archiveChips .chip").forEach((c) =>
      c.classList.toggle("active", c.dataset.status === state.archiveStatus));

    if (!items.length) {
      list.innerHTML =
        '<div class="empty"><b>Empty.</b>Completed and abandoned tasks land here.</div>';
      return;
    }
    list.innerHTML = items.map((t) => cardHTML(t, "archive")).join("");
  }

  function renderCurrent() {
    if (state.view === "main") {
      if (state.mainKind === "days") renderDays();
      else renderNow();
    } else if (state.view === "archive") renderArchive();
  }

  /* ---------- Days Since ---------- */
  function findDay(id) { return state.daysItems.find((x) => x.id === id); }
  function daysSince(it) {
    const ms = Date.now() - new Date(it.lastReset).getTime();
    if (isNaN(ms)) return 0;
    return Math.max(0, Math.floor(ms / 86400000));
  }
  function addDay(d) {
    const now = new Date().toISOString();
    state.daysItems.push({
      id: uid(),
      title: String(d.title || "").trim().slice(0, 120),
      notes: String(d.notes || "").trim(),
      goal: Math.max(1, parseInt(d.goal, 10) || 1),
      lastReset: now,
      createdAt: now,
      hidden: false,
      minimized: false,
    });
    saveDays();
  }
  function resetDayWithUndo(id) {
    const it = findDay(id);
    if (!it) return;
    const prev = it.lastReset;
    it.lastReset = new Date().toISOString();
    saveDays();
    renderDays();
    toast("Reset to 0 days.", {
      actionLabel: "Undo", ms: 5000,
      onAction: () => { it.lastReset = prev; saveDays(); renderDays(); toast("Undone."); },
    });
  }
  function toggleHideDay(id) {
    const it = findDay(id);
    if (!it) return;
    it.hidden = !it.hidden;
    saveDays();
    renderDays();
  }
  function deleteDay(id) {
    state.daysItems = state.daysItems.filter((x) => x.id !== id);
    saveDays();
    renderDays();
  }
  function toggleDayCard(card) {
    const it = findDay(card.dataset.id);
    if (!it) return;
    it.minimized = !it.minimized;
    saveDays();
    card.classList.toggle("collapsed", it.minimized);
    const head = card.querySelector(".card-head");
    if (head) head.setAttribute("aria-expanded", String(!it.minimized));
  }
  function openDayEdit(id) {
    const it = findDay(id);
    if (!it) return;
    state.editingDayId = id;
    document.getElementById("de-title").value = it.title;
    document.getElementById("de-goal").value = it.goal;
    document.getElementById("de-date").value = fmtDate(it.lastReset);
    document.getElementById("de-notes").value = it.notes || "";
    document.getElementById("dayModal").hidden = false;
    document.getElementById("de-title").focus();
  }
  function closeDayEdit() {
    document.getElementById("dayModal").hidden = true;
    state.editingDayId = null;
  }
  function saveDayEdit() {
    const it = findDay(state.editingDayId);
    if (!it) return closeDayEdit();
    const title = document.getElementById("de-title").value.trim();
    if (!title) { toast("Title can't be empty."); return; }
    it.title = title;
    it.goal = Math.max(1, parseInt(document.getElementById("de-goal").value, 10) || 1);
    const dv = document.getElementById("de-date").value;
    if (dv) {
      const parts = dv.split("-").map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2]); // local midnight
      if (!isNaN(d)) it.lastReset = d.toISOString();
    }
    it.notes = document.getElementById("de-notes").value.trim();
    saveDays();
    closeDayEdit();
    renderDays();
    toast("Saved.");
  }
  function dayCardHTML(it) {
    const n = daysSince(it);
    const reached = n >= it.goal;
    const pct = Math.min(100, Math.round((n / it.goal) * 100));
    const collapsedClass = it.minimized ? " collapsed" : "";
    const hiddenClass = it.hidden ? " ishidden" : "";
    const reachedClass = reached ? " reached" : "";
    const reachedBadge = reached ? '<span class="badge fits">Overdue </span>' : "";
    return (
      '<div class="card daycard' + collapsedClass + hiddenClass + reachedClass + '" data-id="' + it.id + '">' +
        '<div class="card-head" role="button" tabindex="0" aria-expanded="' + (!it.minimized) + '">' +
          '<span class="card-title">' + esc(it.title) + "</span>" +
          '<span class="day-count">' + plural(n, "day") + "</span>" +
        "</div>" +
        '<div class="card-body">' +
          '<div class="meta">' +
            "<span>goal <b>" + plural(it.goal, "day") + "</b></span>" +
            '<span title="' + esc(fmtFull(it.lastReset)) + '">since <b>' + fmtDate(it.lastReset) + "</b></span>" +
            reachedBadge +
          "</div>" +
          (it.notes ? '<div class="desc">' + esc(it.notes) + "</div>" : "") +
          '<div class="card-actions">' +
            '<button class="btn btn-sm btn-good" data-dact="reset" data-id="' + it.id + '">Complete</button>' +
            '<button class="btn btn-sm" data-dact="edit" data-id="' + it.id + '">Edit</button>' +
            '<button class="btn btn-sm" data-dact="hide" data-id="' + it.id + '">' + (it.hidden ? "Unhide" : "Hide") + "</button>" +
            '<button class="btn btn-sm btn-danger" data-dact="delete" data-id="' + it.id + '">Delete</button>' +
          "</div>" +
        "</div>" +
        '<div class="day-progress"><div class="day-progress-fill" style="width:' + pct + '%"></div></div>' +
      "</div>"
    );
  }
  function renderDays() {
    const list = document.getElementById("daysList");
    const countEl = document.getElementById("daysCount");
    document.getElementById("showHidden").checked = state.showHiddenDays;

    const all = state.daysItems.slice();
    const hiddenCount = all.filter((x) => x.hidden).length;
    let items = state.showHiddenDays ? all : all.filter((x) => !x.hidden);
    // most overdue relative to goal first
    items.sort((a, b) => (daysSince(b) / b.goal) - (daysSince(a) / a.goal));

    let label = plural(items.length, "tracker");
    if (hiddenCount && !state.showHiddenDays) label += " · " + hiddenCount + " hidden";
    countEl.textContent = label;

    if (!items.length) {
      list.innerHTML =
        '<div class="empty"><b>No trackers.</b>Add one above to start counting days.</div>';
      return;
    }
    list.innerHTML = items.map(dayCardHTML).join("");
  }

  /* ---------- mutations ---------- */
  function addTask(data) {
    state.tasks.push({
      id: uid(),
      label: data.label.trim(),
      description: (data.description || "").trim(),
      minutes: Math.max(1, parseInt(data.minutes, 10) || 1),
      priority: clampPriority(data.priority),
      status: "active",
      createdAt: new Date().toISOString(),
      closedAt: null,
    });
    save();
  }
  function findTask(id) {
    return state.tasks.find((t) => t.id === id);
  }
  function removeTask(id) {
    state.tasks = state.tasks.filter((t) => t.id !== id);
    save();
  }
  function statusWithUndo(id, status, doneMsg) {
    const t = findTask(id);
    if (!t) return;
    const prev = { status: t.status, closedAt: t.closedAt };
    t.status = status;
    t.closedAt = status === "active" ? null : new Date().toISOString();
    save();
    renderCurrent();
    toast(doneMsg, {
      actionLabel: "Undo",
      ms: 5000,
      onAction: () => {
        t.status = prev.status;
        t.closedAt = prev.closedAt;
        save();
        renderCurrent();
        toast("Undone.");
      },
    });
  }

  /* ---------- edit modal ---------- */
  function openEdit(id) {
    const t = findTask(id);
    if (!t) return;
    state.editingId = id;
    document.getElementById("e-label").value = t.label;
    document.getElementById("e-minutes").value = t.minutes;
    document.getElementById("e-priority").value = clampPriority(t.priority);
    document.getElementById("e-desc").value = t.description || "";
    document.getElementById("modal").hidden = false;
    document.getElementById("e-label").focus();
  }
  function closeEdit() {
    document.getElementById("modal").hidden = true;
    state.editingId = null;
  }
  function saveEdit() {
    const t = findTask(state.editingId);
    if (!t) return closeEdit();
    const label = document.getElementById("e-label").value.trim();
    if (!label) { toast("Label can't be empty."); return; }
    t.label = label;
    t.minutes = Math.max(1, parseInt(document.getElementById("e-minutes").value, 10) || 1);
    t.priority = clampPriority(document.getElementById("e-priority").value);
    t.description = document.getElementById("e-desc").value.trim();
    save();
    closeEdit();
    renderCurrent();
    toast("Saved.");
  }

  /* ---------- export / import ---------- */
  function exportData() {
    const bundle = {
      app: "donow",
      version: 2,
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
      daysItems: state.daysItems,
      settings: {
        nowMinutes: state.nowMinutes,
        nowUnit: state.nowUnit,
        packMode: state.packMode,
        sort: state.sort,
        theme: state.theme,
      },
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    a.href = url;
    a.download =
      "donow-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Merge tasks additively; a task is a duplicate if its label matches one
  // already present (case-insensitive, trimmed).
  function mergeTasks(arr) {
    let added = 0, skipped = 0;
    const sigOf = (x) => String(x.label || "").trim().toLowerCase();
    const sigs = new Set(state.tasks.map(sigOf));
    const ids = new Set(state.tasks.map((t) => t.id));
    (arr || []).forEach((raw) => {
      if (!raw || typeof raw !== "object") return;
      const t = {
        id: raw.id || uid(),
        label: String(raw.label || "").slice(0, 120),
        description: String(raw.description || ""),
        minutes: Math.max(1, parseInt(raw.minutes, 10) || 1),
        priority: clampPriority(raw.priority),
        status: ["active", "completed", "abandoned"].includes(raw.status) ? raw.status : "active",
        createdAt: raw.createdAt || new Date().toISOString(),
        closedAt: raw.closedAt || null,
      };
      const s = sigOf(t);
      if (sigs.has(s)) { skipped++; return; }
      if (ids.has(t.id)) t.id = uid();
      state.tasks.push(t);
      ids.add(t.id);
      sigs.add(s);
      added++;
    });
    return { added, skipped };
  }

  // Merge trackers additively; duplicate if the title matches one already present.
  function mergeDays(arr) {
    let added = 0, skipped = 0;
    const sigOf = (x) => String(x.title || "").trim().toLowerCase();
    const sigs = new Set(state.daysItems.map(sigOf));
    const ids = new Set(state.daysItems.map((x) => x.id));
    (arr || []).forEach((raw) => {
      if (!raw || typeof raw !== "object") return;
      const now = new Date().toISOString();
      const it = {
        id: raw.id || uid(),
        title: String(raw.title || "").slice(0, 120),
        notes: String(raw.notes || ""),
        goal: Math.max(1, parseInt(raw.goal, 10) || 1),
        lastReset: raw.lastReset || now,
        createdAt: raw.createdAt || now,
        hidden: !!raw.hidden,
        minimized: !!raw.minimized,
      };
      const s = sigOf(it);
      if (sigs.has(s)) { skipped++; return; }
      if (ids.has(it.id)) it.id = uid();
      state.daysItems.push(it);
      ids.add(it.id);
      sigs.add(s);
      added++;
    });
    return { added, skipped };
  }

  function applyImportedSettings(s) {
    if (!s || typeof s !== "object") return;
    if (s.nowMinutes != null) state.nowMinutes = String(s.nowMinutes);
    if (s.nowUnit === "hr" || s.nowUnit === "min") state.nowUnit = s.nowUnit;
    if (typeof s.packMode === "boolean") state.packMode = s.packMode;
    if (["priority", "time", "age"].includes(s.sort)) state.sort = s.sort;
    if (THEME_IDS.includes(s.theme)) state.theme = s.theme;
    saveSettings();
    renderPresetChips();
    syncLimitInput();
    renderThemes();
    applyTheme();
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (e) {
        toast("That file isn't valid JSON.");
        return;
      }

      // Legacy format: a bare array of tasks.
      if (Array.isArray(parsed)) {
        const r = mergeTasks(parsed);
        save();
        renderCurrent();
        toast("Imported: " + r.added + " tasks added, " + r.skipped + " skipped.");
        return;
      }
      if (!parsed || typeof parsed !== "object") {
        toast("Unrecognized file format.");
        return;
      }

      // Bundle format.
      const tr = mergeTasks(parsed.tasks);
      const dr = mergeDays(parsed.daysItems);
      save();
      saveDays();
      applyImportedSettings(parsed.settings);
      renderCurrent();
      toast(
        "Imported: " + tr.added + " tasks, " + dr.added + " trackers" +
        ((tr.skipped + dr.skipped) ? " · " + (tr.skipped + dr.skipped) + " skipped" : "")
      );
    };
    reader.readAsText(file);
  }

  function toggleCard(head) {
    const card = head.closest(".card");
    if (!card) return;
    const id = card.dataset.id;
    const nowExpanded = !state.expanded.has(id);
    if (nowExpanded) state.expanded.add(id);
    else state.expanded.delete(id);
    card.classList.toggle("collapsed", !nowExpanded);
    head.setAttribute("aria-expanded", String(nowExpanded));
  }

  /* ---------- wiring ---------- */
  function init() {
    load();
    loadDays();
    loadSettings();
    renderThemes();
    applyTheme();

    document.getElementById("themeBtn").addEventListener("click", () => {
      setView("themes");
    });
    document.getElementById("themeList").addEventListener("click", (e) => {
      const row = e.target.closest(".theme-row");
      if (!row) return;
      state.theme = row.dataset.themeId;
      saveSettings();
      applyTheme();
    });
    document.getElementById("newSubtabs").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      state.newKind = c.dataset.newkind;
      renderNewKind();
    });
    document.getElementById("mainSubtabs").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      state.mainKind = c.dataset.mainkind;
      renderMainKind();
    });

    document.getElementById("tabs").addEventListener("click", (e) => {
      const b = e.target.closest(".tab");
      if (b) setView(b.dataset.view);
    });

    // add form
    document.getElementById("taskForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const label = document.getElementById("f-label").value.trim();
      if (!label) { toast("Give it a label."); return; }
      addTask({
        label,
        description: document.getElementById("f-desc").value,
        minutes: document.getElementById("f-minutes").value,
        priority: document.getElementById("f-priority").value,
      });
      e.target.reset();
      document.getElementById("f-priority").value = "3";
      document.getElementById("f-label").focus();
      toast("Added.");
    });

    // minutes / hours filter
    const minInput = document.getElementById("nowMinutes");
    renderPresetChips();
    syncLimitInput();
    minInput.addEventListener("input", () => {
      const raw = minInput.value;
      if (raw === "") {
        state.nowMinutes = "";
      } else {
        const v = parseFloat(raw);
        state.nowMinutes = isNaN(v)
          ? ""
          : String(Math.max(0, Math.round(v * (state.nowUnit === "hr" ? 60 : 1))));
      }
      saveSettings();
      renderNow();
    });
    document.getElementById("minuteChips").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      state.nowMinutes = c.dataset.min;
      syncLimitInput();
      saveSettings();
      renderNow();
    });
    document.getElementById("unitChips").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c || c.dataset.unit === state.nowUnit) return;
      state.nowUnit = c.dataset.unit;   // limit stays the same, only its display changes
      renderPresetChips();
      syncLimitInput();
      saveSettings();
      renderNow();
    });

    // fit-to-budget toggle
    document.getElementById("packToggle").addEventListener("click", () => {
      state.packMode = !state.packMode;
      saveSettings();
      renderNow();
    });

    // sort
    document.getElementById("sortChips").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      state.sort = c.dataset.sort;
      saveSettings();
      renderNow();
    });

    // archive filter
    document.getElementById("archiveChips").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      state.archiveStatus = c.dataset.status;
      renderArchive();
    });

    // days-since add form
    document.getElementById("dayForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const title = document.getElementById("d-title").value.trim();
      if (!title) { toast("Give it a title."); return; }
      addDay({
        title,
        goal: document.getElementById("d-goal").value,
        notes: document.getElementById("d-notes").value,
      });
      e.target.reset();
      document.getElementById("d-title").focus();
      renderDays();
      toast("Tracker added.");
    });
    document.getElementById("showHidden").addEventListener("change", (e) => {
      state.showHiddenDays = e.target.checked;
      renderDays();
    });
    document.getElementById("dayModalSave").addEventListener("click", saveDayEdit);
    document.getElementById("dayModalCancel").addEventListener("click", closeDayEdit);
    document.getElementById("dayModal").addEventListener("click", (e) => {
      if (e.target.id === "dayModal") closeDayEdit();
    });

    // card actions + collapse toggle (delegated)
    const mainEl = document.querySelector("main");
    mainEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (btn) {
        const id = btn.dataset.id;
        switch (btn.dataset.act) {
          case "edit": openEdit(id); break;
          case "complete": statusWithUndo(id, "completed", "Completed."); break;
          case "abandon": statusWithUndo(id, "abandoned", "Abandoned."); break;
          case "restore": statusWithUndo(id, "active", "Restored to active."); break;
          case "delete":
            if (confirm("Delete this task permanently? This can't be undone.")) {
              removeTask(id); renderArchive(); toast("Deleted.");
            }
            break;
        }
        return;
      }
      const dbtn = e.target.closest("[data-dact]");
      if (dbtn) {
        const id = dbtn.dataset.id;
        switch (dbtn.dataset.dact) {
          case "reset": resetDayWithUndo(id); break;
          case "edit": openDayEdit(id); break;
          case "hide": toggleHideDay(id); break;
          case "delete":
            if (confirm("Delete this tracker permanently? This can't be undone.")) {
              deleteDay(id); toast("Deleted.");
            }
            break;
        }
        return;
      }
      const head = e.target.closest(".card-head");
      if (head) {
        const card = head.closest(".card");
        if (card && card.classList.contains("daycard")) toggleDayCard(card);
        else toggleCard(head);
      }
    });
    mainEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const head = e.target.closest(".card-head");
      if (!head) return;
      e.preventDefault();
      const card = head.closest(".card");
      if (card && card.classList.contains("daycard")) toggleDayCard(card);
      else toggleCard(head);
    });

    // modal
    document.getElementById("modalSave").addEventListener("click", saveEdit);
    document.getElementById("modalCancel").addEventListener("click", closeEdit);
    document.getElementById("modal").addEventListener("click", (e) => {
      if (e.target.id === "modal") closeEdit();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!document.getElementById("modal").hidden) closeEdit();
      if (!document.getElementById("dayModal").hidden) closeDayEdit();
    });

    // export / import
    document.getElementById("exportBtn").addEventListener("click", exportData);
    document.getElementById("importBtn").addEventListener("click", () =>
      document.getElementById("importFile").click());
    document.getElementById("importFile").addEventListener("change", (e) => {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });

    renderNewKind();
    setView("main");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
