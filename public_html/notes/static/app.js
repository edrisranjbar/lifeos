const $ = (id) => document.getElementById(id);

const KEY = "edi_notes_v1";
const COLORS = ["yellow", "pink", "blue", "green", "lavender", "peach"];
const FONT_FACES = {
  sans: 'Inter, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"JetBrains Mono", ui-monospace, monospace'
};
const NOTE_W = 220;
const NOTE_H = 200;
const GRID = 32;

const state = {
  notes: [],
  connections: [],
  connectFrom: null,
  zCounter: 1,
  search: ""
};

function loadState() {
  try {
    const saved = JSON.parse(appStorage.getItem(KEY));
    if (saved && Array.isArray(saved.notes)) {
      state.notes = saved.notes.map(normalizeNote).filter(Boolean);
      const ids = new Set(state.notes.map(note => note.id));
      state.connections = Array.isArray(saved.connections)
        ? saved.connections.filter(link => link && typeof link.a === "string" && typeof link.b === "string" && link.a !== link.b && ids.has(link.a) && ids.has(link.b))
        : [];
    }
  } catch (e) {
    console.error("Failed to load notes:", e);
  }
  let maxZ = 0;
  for (const n of state.notes) if (typeof n.z === "number" && n.z > maxZ) maxZ = n.z;
  state.zCounter = maxZ + 1;

  if (state.notes.length === 0) {
    const seed1 = makeNote("Today list", "Capture your first thought.\n\n• What did you ship?\n• What's next?", { x: 80, y: 80 });
    const seed2 = makeNote("Reading", "Atomic Habits — ch. 3 takeaways\n\n1) Habit stacking\n2) Environment design", { x: 340, y: 60 });
    const seed3 = makeNote("Idea 💡", "What if the timer app linked to notes so you could dump stray thoughts mid-session?", { x: 600, y: 140 });
    state.notes.push(seed1, seed2, seed3);
    persist();
  }
}

function normalizeNote(note) {
  if (!note || typeof note !== "object" || !note.id) return null;
  return {
    id: note.id,
    title: typeof note.title === "string" ? note.title : "",
    body: typeof note.body === "string" ? note.body : "",
    color: COLORS.includes(note.color) ? note.color : "yellow",
    fontFace: Object.hasOwn(FONT_FACES, note.fontFace) ? note.fontFace : "sans",
    fontSize: Number.isInteger(note.fontSize) ? Math.min(28, Math.max(11, note.fontSize)) : 14,
    secret: note.secret === true,
    x: typeof note.x === "number" ? note.x : 80,
    y: typeof note.y === "number" ? note.y : 80,
    w: typeof note.w === "number" ? note.w : NOTE_W,
    h: typeof note.h === "number" ? note.h : NOTE_H,
    z: typeof note.z === "number" ? note.z : 1,
    updated: typeof note.updated === "number" ? note.updated : Date.now()
  };
}

function makeNote(title, body, pos) {
  return {
    id: cryptoId(),
    title: title || "",
    body: body || "",
    color: COLORS[state.notes.length % COLORS.length],
    fontFace: "sans",
    fontSize: 14,
    secret: false,
    x: pos?.x ?? 80,
    y: pos?.y ?? 80,
    w: NOTE_W,
    h: NOTE_H,
    z: ++state.zCounter,
    updated: Date.now()
  };
}

function cryptoId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return "n_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function persist() {
  try {
    appStorage.setItem(KEY, JSON.stringify({ notes: state.notes, connections: state.connections }));
  } catch (e) {
    showToast("Unable to save note.", "error");
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function renderInline(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");
  return html;
}

function renderMarkdown(source) {
  if (!source.trim()) return '<p class="preview-empty">Double-click to write Markdown.</p>';
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let list = "", code = false, codeLines = [];
  const closeList = () => { if (list) { output.push(`</${list}>`); list = ""; } };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      closeList();
      if (code) { output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`); codeLines = []; }
      code = !code;
      continue;
    }
    if (code) { codeLines.push(line); continue; }
    if (!line.trim()) { closeList(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { closeList(); const level = heading[1].length; output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`); continue; }
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      const next = bullet ? "ul" : "ol";
      if (list !== next) { closeList(); output.push(`<${next}>`); list = next; }
      output.push(`<li>${renderInline((bullet || numbered)[1])}</li>`);
      continue;
    }
    closeList();
    const quote = line.match(/^>\s?(.*)$/);
    output.push(quote ? `<blockquote>${renderInline(quote[1])}</blockquote>` : `<p>${renderInline(line)}</p>`);
  }
  closeList();
  if (code) output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  return output.join("");
}

function applyTheme() {
  try {
    let theme = appStorage.getItem("edi_notes_theme");
    if (!theme) theme = appStorage.getItem("edi_os_theme");
    if (!theme) theme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
}

function snap(value) {
  return Math.round(value / GRID) * GRID;
}

function getFiltered() {
  const q = state.search.trim().toLowerCase();
  if (!q) return state.notes;
  return state.notes.filter((n) => !n.secret && (n.body.toLowerCase().includes(q) || n.title.toLowerCase().includes(q)));
}

function renderAll() {
  const canvas = $("canvas");
  // remove existing sticky nodes
  for (const node of canvas.querySelectorAll(".sticky")) node.remove();

  const filteredIds = new Set(getFiltered().map((n) => n.id));
  $("notesCount").textContent = `${state.notes.length} note${state.notes.length === 1 ? "" : "s"} · Markdown`;
  $("emptyState").hidden = state.notes.length > 0;

  for (const note of state.notes) {
    const el = renderSticky(note);
    el.classList.toggle("dimmed", !filteredIds.has(note.id) && state.search.trim() !== "");
    canvas.append(el);
  }
  renderConnections();
  syncConnectMode();
}

function syncConnectMode() {
  for (const el of document.querySelectorAll(".sticky")) {
    const selected = el.dataset.id === state.connectFrom;
    el.classList.toggle("connect-source", selected);
    el.querySelector(".connect-note")?.setAttribute("aria-pressed", String(selected));
  }
  $("canvas").classList.toggle("connecting", !!state.connectFrom);
}

function connectNotes(a, b) {
  if (!a || !b || a === b) return;
  if (!state.connections.some(link => (link.a === a && link.b === b) || (link.a === b && link.b === a))) {
    state.connections.push({a, b});
    persist();
    renderConnections();
    showToast("Notes connected");
  } else {
    showToast("These notes are already connected");
  }
  state.connectFrom = null;
  syncConnectMode();
}

function renderConnections() {
  const svg = $("connectionsLayer");
  const canvas = $("canvas");
  if (!svg || !canvas) return;
  const width = Math.max(canvas.clientWidth, ...state.notes.map(note => note.x + note.w + 40), 1);
  const height = Math.max(canvas.clientHeight, ...state.notes.map(note => note.y + note.h + 40), 1);
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  const notes = new Map(state.notes.map(note => [note.id, note]));
  for (const link of state.connections) {
    const a = notes.get(link.a), b = notes.get(link.b);
    if (!a || !b) continue;
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2, by = b.y + b.h / 2;
    let path;
    if (Math.abs(bx - ax) >= Math.abs(by - ay)) {
      const sign = bx >= ax ? 1 : -1;
      const x1 = ax + sign * a.w / 2, x2 = bx - sign * b.w / 2;
      path = `M ${x1} ${ay} C ${x1 + sign * 56} ${ay}, ${x2 - sign * 56} ${by}, ${x2} ${by}`;
    } else {
      const sign = by >= ay ? 1 : -1;
      const y1 = ay + sign * a.h / 2, y2 = by - sign * b.h / 2;
      path = `M ${ax} ${y1} C ${ax} ${y1 + sign * 56}, ${bx} ${y2 - sign * 56}, ${bx} ${y2}`;
    }
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", path);
    line.setAttribute("class", "connection-line");
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hit.setAttribute("d", path);
    hit.setAttribute("class", "connection-hit");
    hit.setAttribute("role", "button");
    hit.setAttribute("tabindex", "0");
    hit.setAttribute("aria-label", "Remove connection between notes");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = "Click to remove connection";
    hit.append(title);
    const remove = () => {
      if (!confirm("Remove this connection?")) return;
      state.connections = state.connections.filter(other => other !== link);
      persist();
      renderConnections();
      showToast("Connection removed");
    };
    hit.addEventListener("click", remove);
    hit.addEventListener("mouseenter", () => line.classList.add("connection-hover"));
    hit.addEventListener("mouseleave", () => line.classList.remove("connection-hover"));
    hit.addEventListener("focus", () => line.classList.add("connection-hover"));
    hit.addEventListener("blur", () => line.classList.remove("connection-hover"));
    hit.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); remove(); }
    });
    svg.append(line, hit);
  }
}

function renderSticky(note) {
  const el = document.createElement("article");
  el.className = "sticky";
  el.tabIndex = 0;
  el.title = "Double-click to edit note";
  el.dataset.id = note.id;
  el.dataset.color = note.color;
  el.style.left = note.x + "px";
  el.style.top = note.y + "px";
  el.style.width = note.w + "px";
  el.style.height = note.h + "px";
  el.style.zIndex = note.z;
  el.style.setProperty("--note-font", FONT_FACES[note.fontFace]);
  el.style.setProperty("--note-size", `${note.fontSize}px`);

  const format = document.createElement("div");
  format.className = "note-format";
  const face = document.createElement("select");
  face.setAttribute("aria-label", "Note font face");
  for (const [value, label] of [["sans", "Sans"], ["serif", "Serif"], ["mono", "Mono"]]) {
    const option = document.createElement("option");
    option.value = value; option.textContent = label;
    face.append(option);
  }
  face.value = note.fontFace;
  face.addEventListener("change", () => {
    note.fontFace = face.value;
    el.style.setProperty("--note-font", FONT_FACES[note.fontFace]);
    note.updated = Date.now();
    persist();
  });
  const size = document.createElement("select");
  size.setAttribute("aria-label", "Note font size");
  for (const value of [11, 12, 14, 16, 18, 20, 24, 28]) {
    const option = document.createElement("option");
    option.value = String(value); option.textContent = `${value}px`;
    size.append(option);
  }
  size.value = String(note.fontSize);
  size.addEventListener("change", () => {
    note.fontSize = Number(size.value);
    el.style.setProperty("--note-size", `${note.fontSize}px`);
    note.updated = Date.now();
    persist();
  });
  format.append(face, size);

  const body = document.createElement("textarea");
  body.className = "sticky-body";
  body.spellcheck = true;
  body.value = note.body || (note.title || "");
  body.placeholder = "Write Markdown…";
  body.setAttribute("aria-label", "Markdown source");
  const preview = document.createElement("div");
  preview.className = "markdown-preview";
  preview.innerHTML = renderMarkdown(body.value);
  body.hidden = true;
  const revealBtn = document.createElement("button");
  revealBtn.type = "button";
  revealBtn.className = "reveal-note";
  revealBtn.textContent = "🔒 Reveal note";
  const privacyBtn = document.createElement("button");
  privacyBtn.type = "button";
  privacyBtn.title = "Toggle secret note";
  const hideBtn = document.createElement("button");
  hideBtn.type = "button";
  hideBtn.textContent = "Hide";
  hideBtn.setAttribute("aria-label", "Hide secret note");
  let revealed = false;
  const updatePrivacy = () => {
    const locked = note.secret && !revealed;
    el.classList.toggle("secret-locked", locked);
    el.setAttribute("aria-label", locked ? "Secret note, content hidden" : "Note, double-click or press Enter to edit");
    preview.setAttribute("aria-hidden", String(locked));
    preview.inert = locked;
    revealBtn.hidden = !locked;
    hideBtn.hidden = !note.secret || locked;
    privacyBtn.textContent = note.secret ? "🔒" : "🔓";
    privacyBtn.setAttribute("aria-label", note.secret ? "Turn off secret mode" : "Make note secret");
    privacyBtn.setAttribute("aria-pressed", String(note.secret));
  };
  revealBtn.onclick = () => { revealed = true; updatePrivacy(); };
  hideBtn.onclick = () => {
    el._exitEdit?.();
    revealed = false;
    updatePrivacy();
  };
  privacyBtn.onclick = () => {
    el._exitEdit?.();
    note.secret = !note.secret;
    revealed = false;
    note.updated = Date.now();
    persist();
    updatePrivacy();
  };
  const swatch = document.createElement("div");
  swatch.className = "swatch";
  for (const color of COLORS) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.color = color;
    button.title = `Color ${color}`;
    button.setAttribute("aria-label", `Color ${color}`);
    button.setAttribute("aria-pressed", String(note.color === color));
    button.onclick = () => {
      note.color = color;
      el.dataset.color = color;
      for (const option of swatch.children) option.setAttribute("aria-pressed", String(option === button));
      persist();
    };
    swatch.append(button);
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  const connectBtn = document.createElement("button");
  connectBtn.type = "button";
  connectBtn.className = "connect-note";
  connectBtn.textContent = "↗";
  connectBtn.title = "Connect this note to another";
  connectBtn.setAttribute("aria-label", "Connect this note to another");
  connectBtn.setAttribute("aria-pressed", "false");
  connectBtn.onclick = () => {
    document.querySelectorAll(".sticky.editing").forEach(card => card._exitEdit?.());
    state.connectFrom = state.connectFrom === note.id ? null : note.id;
    syncConnectMode();
    if (state.connectFrom) showToast("Select another note to connect · Esc to cancel");
  };
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.title = "Delete note";
  delBtn.textContent = "×";
  delBtn.setAttribute("aria-label", "Delete note");
  delBtn.onclick = (e) => {
    e.stopPropagation();
    deleteNote(note.id);
  };
  actions.append(connectBtn, privacyBtn, hideBtn, delBtn);

  const resize = document.createElement("div");
  resize.className = "resize-handle";
  resize.setAttribute("aria-label", "Resize note");
  resize.title = "Resize";

  el.append(format, preview, body, revealBtn, swatch, actions, resize);
  bindDrag(el, note);
  bindResize(el, note, resize);
  bindEdit(el, note, body, preview, format);
  el.addEventListener("click", event => {
    if (!state.connectFrom || event.target.closest("button, a, select, textarea, .note-format, .swatch, .resize-handle")) return;
    connectNotes(state.connectFrom, note.id);
  });
  updatePrivacy();

  return el;
}

function deleteNote(id) {
  const idx = state.notes.findIndex((n) => n.id === id);
  if (idx === -1) return;
  if (!confirm("Delete this note?")) return;
  state.notes.splice(idx, 1);
  state.connections = state.connections.filter(link => link.a !== id && link.b !== id);
  if (state.connectFrom === id) state.connectFrom = null;
  persist();
  renderAll();
}

function createNote() {
  const canvas = $("canvas");
  const rect = canvas.getBoundingClientRect();
  const offset = state.notes.length * 18;
  const note = makeNote("", "", {
    x: snap(80 + offset + Math.random() * 60),
    y: snap(80 + offset + Math.random() * 60)
  });
  state.notes.push(note);
  persist();
  renderAll();
  // Focus the new note for immediate editing
  document.querySelector(`.sticky[data-id="${note.id}"]`)?._enterEdit?.();
}

function bindDrag(el, note) {
  let startX, startY, originX, originY;
  let pointerId = null;

  const onDown = (e) => {
    // Only drag when not editing, and ignore clicks on the action/swatch/resize areas
    if (e.target.closest("button, a, textarea, select, .note-format, .swatch, .resize-handle")) return;
    if (state.connectFrom) return;
    if (el.classList.contains("editing")) return;
    e.preventDefault();
    pointerId = e.pointerId;
    el.setPointerCapture(pointerId);
    el.classList.add("dragging");
    startX = e.clientX;
    startY = e.clientY;
    originX = note.x;
    originY = note.y;
    note.z = ++state.zCounter;
    el.style.zIndex = note.z;
  };

  const onMove = (e) => {
    if (pointerId === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    note.x = Math.max(0, originX + dx);
    note.y = Math.max(60, originY + dy);
    el.style.left = note.x + "px";
    el.style.top = note.y + "px";
    renderConnections();
  };

  const onUp = (e) => {
    if (pointerId === null) return;
    pointerId = null;
    el.classList.remove("dragging");
    note.x = snap(note.x);
    note.y = Math.max(60, snap(note.y));
    el.style.left = note.x + "px";
    el.style.top = note.y + "px";
    renderConnections();
    note.updated = Date.now();
    persist();
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
}

function bindResize(el, note, handle) {
  let startX, startY, originW, originH;
  let pointerId = null;

  const onDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    pointerId = e.pointerId;
    handle.setPointerCapture(pointerId);
    el.classList.add("resizing");
    startX = e.clientX;
    startY = e.clientY;
    originW = note.w;
    originH = note.h;
    note.z = ++state.zCounter;
    el.style.zIndex = note.z;
  };

  const onMove = (e) => {
    if (pointerId === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    note.w = Math.max(120, originW + dx);
    note.h = Math.max(80, originH + dy);
    el.style.width = note.w + "px";
    el.style.height = note.h + "px";
    renderConnections();
  };

  const onUp = () => {
    if (pointerId === null) return;
    pointerId = null;
    el.classList.remove("resizing");
    note.w = Math.max(120, snap(note.w));
    note.h = Math.max(80, snap(note.h));
    el.style.width = note.w + "px";
    el.style.height = note.h + "px";
    renderConnections();
    note.updated = Date.now();
    persist();
  };

  handle.addEventListener("pointerdown", onDown);
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  handle.addEventListener("pointercancel", onUp);
}

function bindEdit(el, note, body, preview, format) {
  const enter = () => {
    if (el.classList.contains("secret-locked")) return;
    document.querySelectorAll(".sticky.editing").forEach(other => {
      if (other !== el) other._exitEdit?.();
    });
    el.classList.add("editing");
    body.hidden = false;
    preview.hidden = true;
    body.focus();
    body.setSelectionRange(body.value.length, body.value.length);
  };
  const exit = () => {
    if (!el.classList.contains("editing")) return;
    if (note.body !== body.value) {
      note.body = body.value;
      note.updated = Date.now();
      persist();
    }
    el.classList.remove("editing");
    preview.innerHTML = renderMarkdown(body.value);
    body.hidden = true;
    preview.hidden = false;
  };
  el._enterEdit = enter;
  el._exitEdit = exit;

  el.addEventListener("keydown", (e) => {
    if (e.target === el && (e.key === "Enter" || e.key === "F2")) {
      e.preventDefault();
      if (state.connectFrom) connectNotes(state.connectFrom, note.id);
      else enter();
    }
  });

  el.addEventListener("dblclick", (e) => {
    if (state.connectFrom) return;
    if (e.target.closest(".actions, .swatch, .note-format, .reveal-note, a")) return;
    if (!el.classList.contains("editing")) enter();
  });

  // Save on every input so a re-render (theme change, switch app, etc.) doesn't lose work
  body.addEventListener("input", () => {
    note.body = body.value;
    note.updated = Date.now();
    persist();
  });

  body.addEventListener("blur", (e) => {
    note.body = body.value;
    note.updated = Date.now();
    persist();
    if (!format.contains(e.relatedTarget)) exit();
  });

  format.addEventListener("focusout", (e) => {
    if (!format.contains(e.relatedTarget) && e.relatedTarget !== body) exit();
  });

  body.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      body.blur();
    }
  });
}

function placeCaretAtEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

let searchTimer;
function bindEvents() {
  $("newNoteBtn").addEventListener("click", createNote);

  $("searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value;
      renderAll();
    }, 120);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.connectFrom) {
      state.connectFrom = null;
      syncConnectMode();
      showToast("Connection canceled");
      return;
    }
    if (e.target.matches("input, textarea, [contenteditable='true']")) return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "n") {
      e.preventDefault();
      createNote();
    } else if (meta && e.key === "/") {
      e.preventDefault();
      $("searchInput").focus();
    }
  });

  window.addEventListener("resize", () => {
    renderConnections();
  });
}

function showToast(message, kind) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.toggle("error", kind === "error");
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 1800);
}

document.addEventListener("DOMContentLoaded", async () => {
  await window.appStorageReady;
  applyTheme();
  loadState();
  bindEvents();
  renderAll();
});
