(function () {
  "use strict";

  const STORE_KEY = "donow.tasks.v1";
  const SETTINGS_KEY = "donow.settings.v1";

  const state = {
    tasks: [],
    view: "now",
    nowMinutes: "",       // "" = show all active
    packMode: false,      // fit-to-budget on Do Now
    archiveStatus: "all", // all | completed | abandoned
    editingId: null,
    theme: "light",       // light | dark
    sort: "priority",     // priority | time | age
    expanded: new Set(),  // ids of expanded cards (session only)
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
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
      state.nowMinutes = s.nowMinutes != null ? String(s.nowMinutes) : "";
      state.packMode = !!s.packMode;
      state.theme = s.theme === "dark" ? "dark" : "light";
      state.sort = ["priority", "time", "age"].includes(s.sort) ? s.sort : "priority";
    } catch (e) { /* defaults */ }
  }
  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      nowMinutes: state.nowMinutes,
      packMode: state.packMode,
      theme: state.theme,
      sort: state.sort,
    }));
  }
  function applyTheme() {
    const dark = state.theme === "dark";
    if (dark) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    const btn = document.getElementById("themeBtn");
    if (btn) {
      btn.textContent = dark ? "☀" : "☾";
      btn.title = dark ? "Switch to light mode" : "Switch to dark mode";
    }
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
    document.getElementById("view-now").hidden = v !== "now";
    document.getElementById("view-new").hidden = v !== "new";
    document.getElementById("view-archive").hidden = v !== "archive";
    if (v === "now") renderNow();
    if (v === "archive") renderArchive();
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
          '<span class="card-time">' + Number(t.minutes) + " min</span>" +
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
    if (state.view === "now") renderNow();
    else if (state.view === "archive") renderArchive();
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
    const blob = new Blob([JSON.stringify(state.tasks, null, 2)], {
      type: "application/json",
    });
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
      if (!Array.isArray(parsed)) {
        toast("Expected a list of tasks.");
        return;
      }
      let added = 0, skipped = 0;
      // A todo is a duplicate if its label matches one already present
      // (case-insensitive, trimmed).
      const sigOf = (x) => String(x.label || "").trim().toLowerCase();
      const sigs = new Set(state.tasks.map(sigOf));
      const ids = new Set(state.tasks.map((t) => t.id));
      parsed.forEach((raw) => {
        if (!raw || typeof raw !== "object") return;
        const t = {
          id: raw.id || uid(),
          label: String(raw.label || "").slice(0, 120),
          description: String(raw.description || ""),
          minutes: Math.max(1, parseInt(raw.minutes, 10) || 1),
          priority: clampPriority(raw.priority),
          status: ["active", "completed", "abandoned"].includes(raw.status)
            ? raw.status : "active",
          createdAt: raw.createdAt || new Date().toISOString(),
          closedAt: raw.closedAt || null,
        };
        const s = sigOf(t);
        if (sigs.has(s)) { skipped++; return; }   // duplicate content → ignore
        if (ids.has(t.id)) t.id = uid();          // keep ids unique for a new item
        state.tasks.push(t);
        ids.add(t.id);
        sigs.add(s);
        added++;
      });
      save();
      renderCurrent();
      toast("Imported: " + added + " added, " + skipped + " skipped.");
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
    loadSettings();
    applyTheme();

    document.getElementById("themeBtn").addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      saveSettings();
      applyTheme();
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

    // minutes filter
    const minInput = document.getElementById("nowMinutes");
    minInput.value = state.nowMinutes;
    minInput.addEventListener("input", () => {
      state.nowMinutes = minInput.value;
      saveSettings();
      renderNow();
    });
    document.getElementById("minuteChips").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      state.nowMinutes = c.dataset.min;
      minInput.value = c.dataset.min;
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
      const head = e.target.closest(".card-head");
      if (head) toggleCard(head);
    });
    mainEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const head = e.target.closest(".card-head");
      if (head) { e.preventDefault(); toggleCard(head); }
    });

    // modal
    document.getElementById("modalSave").addEventListener("click", saveEdit);
    document.getElementById("modalCancel").addEventListener("click", closeEdit);
    document.getElementById("modal").addEventListener("click", (e) => {
      if (e.target.id === "modal") closeEdit();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("modal").hidden) closeEdit();
    });

    // export / import
    document.getElementById("exportBtn").addEventListener("click", exportData);
    document.getElementById("importBtn").addEventListener("click", () =>
      document.getElementById("importFile").click());
    document.getElementById("importFile").addEventListener("change", (e) => {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });

    setView("now");
  }

  document.addEventListener("DOMContentLoaded", init);
})();