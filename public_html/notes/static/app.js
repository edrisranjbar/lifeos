const $ = (id) => document.getElementById(id);

const KEY = "edi_notes_v1";
const { t } = window.lifeOsI18n;
const COLORS = ["yellow", "pink", "blue", "green", "lavender", "peach"];
const FONT_FACES = {
  sans: 'Inter, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"JetBrains Mono", ui-monospace, monospace'
};
// Small stroke icons for the card actions (Lucide-style, 24px grid).
const ICONS = {
  connect: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/>',
  hide: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  open: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  delete: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const SVG_NS = "http://www.w3.org/2000/svg";
// Freehand ink palette; "ink" resolves per theme when a stroke starts.
const INKS = [
  { id: "ink", color: () => document.documentElement.dataset.theme === "light" ? "#27251f" : "#f2efe6" },
  { id: "red", color: () => "#e5484d" },
  { id: "blue", color: () => "#4c8dff" },
  { id: "amber", color: () => "#e8a33d" }
];
// The state document stays well under the server's 2 MB request limit.
const MAX_DOC_CHARS = 1400000;
// Compact "3 days ago"; falls back to a short date after a week.
function editedAgo(timestamp) {
  const seconds = (Date.now() - Number(timestamp)) / 1000;
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 45) return t("Just now");
  const relative = new Intl.RelativeTimeFormat(window.lifeOsI18n.locale(), { numeric: "auto", style: "short" });
  if (seconds < 3600) return relative.format(-Math.round(seconds / 60), "minute");
  if (seconds < 86400) return relative.format(-Math.round(seconds / 3600), "hour");
  if (seconds < 604800) return relative.format(-Math.round(seconds / 86400), "day");
  return new Date(Number(timestamp)).toLocaleDateString(window.lifeOsI18n.locale(), { month: "short", day: "numeric" });
}
const NOTE_W = 220;
const NOTE_H = 200;
const GRID = 32;
const viewport = {x: 0, y: 0, scale: 1};
let spaceToPan = false;

function applyViewport() {
  $('canvasScene').style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
  $('canvas').style.backgroundSize = `${24 * viewport.scale}px ${24 * viewport.scale}px`;
  $('canvas').style.backgroundPosition = `${viewport.x}px ${viewport.y}px`;
  $('resetZoom').textContent = `${Math.round(viewport.scale * 100)}%`;
}
function zoomCanvas(scale, x, y) {
  const next = Math.min(4, Math.max(.1, scale));
  const ratio = next / viewport.scale;
  viewport.x = x - (x - viewport.x) * ratio;
  viewport.y = y - (y - viewport.y) * ratio;
  viewport.scale = next;
  applyViewport();
}
function bindCanvasNavigation() {
  const canvas = $('canvas');
  const centeredZoom = factor => zoomCanvas(viewport.scale * factor, canvas.clientWidth / 2, canvas.clientHeight / 2);
  $('zoomIn').onclick = () => centeredZoom(1.2);
  $('zoomOut').onclick = () => centeredZoom(1 / 1.2);
  $('resetZoom').onclick = () => zoomCanvas(1, canvas.clientWidth / 2, canvas.clientHeight / 2);
  $('fitNotes').onclick = () => {
    const rects = getFiltered().map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
    for (const image of state.images) rects.push({ x: image.x, y: image.y, w: image.w, h: image.h });
    for (const stroke of state.strokes) {
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (let i = 0; i < stroke.p.length; i += 2) {
        left = Math.min(left, stroke.p[i]); right = Math.max(right, stroke.p[i]);
        top = Math.min(top, stroke.p[i + 1]); bottom = Math.max(bottom, stroke.p[i + 1]);
      }
      if (Number.isFinite(left)) {
        const pad = stroke.width;
        rects.push({ x: left - pad, y: top - pad, w: right - left + pad * 2, h: bottom - top + pad * 2 });
      }
    }
    if (!rects.length) { Object.assign(viewport, {x: 0, y: 0, scale: 1}); applyViewport(); return; }
    const left = Math.min(...rects.map(r => r.x)), top = Math.min(...rects.map(r => r.y));
    const right = Math.max(...rects.map(r => r.x + r.w)), bottom = Math.max(...rects.map(r => r.y + r.h));
    viewport.scale = Math.max(.1, Math.min(1, (canvas.clientWidth - 80) / (right - left), (canvas.clientHeight - 100) / (bottom - top)));
    viewport.x = (canvas.clientWidth - (right - left) * viewport.scale) / 2 - left * viewport.scale;
    viewport.y = (canvas.clientHeight - (bottom - top) * viewport.scale) / 2 - top * viewport.scale;
    applyViewport();
  };
  canvas.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey && e.target.closest('textarea, .markdown-preview, select')) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
    if (e.ctrlKey || e.metaKey) {
      const rect = canvas.getBoundingClientRect();
      zoomCanvas(viewport.scale * Math.exp(-e.deltaY * unit * .002), e.clientX - rect.left, e.clientY - rect.top);
    } else {
      viewport.x -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
      viewport.y -= (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit;
      applyViewport();
    }
  }, {passive: false});
  let pan = null;
  canvas.addEventListener('pointerdown', e => {
    if (pan) return;
    // Drawing owns the left button; space and the middle button still pan.
    if (draw.mode && e.button === 0 && !spaceToPan) return;
    const blank = e.target === canvas || e.target === $('canvasScene') || e.target === $('connectionsLayer');
    if (!(e.button === 1 || (e.button === 0 && (spaceToPan || blank)))) return;
    e.preventDefault(); e.stopPropagation();
    pan = {id: e.pointerId, x: e.clientX, y: e.clientY, originX: viewport.x, originY: viewport.y};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('panning');
  }, true);
  canvas.addEventListener('pointermove', e => {
    if (!pan || pan.id !== e.pointerId) return;
    viewport.x = pan.originX + e.clientX - pan.x;
    viewport.y = pan.originY + e.clientY - pan.y;
    applyViewport();
  });
  const endPan = e => {
    if (!pan || (e.pointerId !== undefined && e.pointerId !== pan.id)) return;
    if (canvas.hasPointerCapture(pan.id)) canvas.releasePointerCapture(pan.id);
    pan = null; canvas.classList.remove('panning');
  };
  canvas.addEventListener('pointerup', endPan);
  canvas.addEventListener('pointercancel', endPan);
  canvas.addEventListener('lostpointercapture', endPan);
  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || e.target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    e.preventDefault(); spaceToPan = true; canvas.classList.add('pan-ready');
  });
  document.addEventListener('keyup', e => {
    if (e.code === 'Space') { spaceToPan = false; canvas.classList.remove('pan-ready'); }
  });
  window.addEventListener('blur', () => { spaceToPan = false; canvas.classList.remove('pan-ready'); endPan({}); });
  applyViewport();
}

const state = {
  notes: [],
  connections: [],
  images: [],
  strokes: [],
  connectFrom: null,
  zCounter: 1,
  search: ""
};
// Freehand drawing state (mode is toggled from the toolbar or the D key).
const draw = { mode: false, ink: "ink", width: 4, erasing: false };

function loadState() {
  try {
    const saved = JSON.parse(appStorage.getItem(KEY));
    if (saved && Array.isArray(saved.notes)) {
      state.notes = saved.notes.map(normalizeNote).filter(Boolean);
      const ids = new Set(state.notes.map(note => note.id));
      state.connections = Array.isArray(saved.connections)
        ? saved.connections.filter(link => link && typeof link.a === "string" && typeof link.b === "string" && link.a !== link.b && ids.has(link.a) && ids.has(link.b))
        : [];
      state.images = Array.isArray(saved.images) ? saved.images.map(normalizeImage).filter(Boolean) : [];
      state.strokes = Array.isArray(saved.strokes) ? saved.strokes.map(normalizeStroke).filter(Boolean) : [];
    }
  } catch (e) {
    console.error("Failed to load notes:", e);
  }
  let maxZ = 0;
  for (const n of state.notes) if (typeof n.z === "number" && n.z > maxZ) maxZ = n.z;
  for (const image of state.images) if (typeof image.z === "number" && image.z > maxZ) maxZ = image.z;
  state.zCounter = maxZ + 1;

  // Seed a fresh board only when nothing at all is on it yet.
  if (state.notes.length === 0 && state.images.length === 0 && state.strokes.length === 0) {
    const seed1 = makeNote(t("Today list"), t("Capture your first thought.\n\n• What did you ship?\n• What's next?"), { x: 80, y: 80 });
    const seed2 = makeNote(t("Reading"), t("Atomic Habits — ch. 3 takeaways\n\n1) Habit stacking\n2) Environment design"), { x: 340, y: 60 });
    const seed3 = makeNote(t("Idea 💡"), t("What if the timer app linked to notes so you could dump stray thoughts mid-session?"), { x: 600, y: 140 });
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

// Board images are data URLs produced by the browser's own encoder; anything
// else that snuck into storage is dropped on load.
function normalizeImage(image) {
  if (!image || typeof image !== "object" || !image.id) return null;
  if (typeof image.src !== "string" || !image.src.startsWith("data:image/")) return null;
  return {
    id: image.id,
    src: image.src,
    x: typeof image.x === "number" ? image.x : 80,
    y: typeof image.y === "number" ? image.y : 80,
    w: typeof image.w === "number" ? Math.min(4000, Math.max(80, image.w)) : 320,
    h: typeof image.h === "number" ? Math.min(4000, Math.max(60, image.h)) : 240,
    z: typeof image.z === "number" ? image.z : 1,
    updated: typeof image.updated === "number" ? image.updated : Date.now()
  };
}

// Strokes are flat point lists in board coordinates: [x0, y0, x1, y1, …].
function normalizeStroke(stroke) {
  if (!stroke || typeof stroke !== "object" || !Array.isArray(stroke.p)) return null;
  const points = [];
  for (const value of stroke.p) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    points.push(Math.round(value * 10) / 10);
  }
  if (points.length % 2) points.pop();
  if (points.length < 2) return null;
  return {
    color: typeof stroke.color === "string" && /^#[0-9a-f]{6}$/i.test(stroke.color) ? stroke.color : INKS[0].color(),
    width: typeof stroke.width === "number" ? Math.min(24, Math.max(1, stroke.width)) : 4,
    p: points
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
    appStorage.setItem(KEY, JSON.stringify({ notes: state.notes, connections: state.connections, images: state.images, strokes: state.strokes }));
  } catch (e) {
    showToast(t("Unable to save note."), "error");
  }
}

// Approximate stored size of the whole document, used to cap image uploads.
function docSize() {
  return JSON.stringify({ notes: state.notes, connections: state.connections, images: state.images, strokes: state.strokes }).length;
}

const escapeHtml = globalThis.lifeOsHtml.escapeHtml;

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
  if (!source.trim()) return `<p class="preview-empty">${escapeHtml(t("Double-click to write Markdown."))}</p>`;
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

// The drawings layer must sit above every note and image, whose z indexes
// grow each time they are raised.
function syncLayerZ() {
  const layer = $("drawingsLayer");
  if (layer) layer.style.zIndex = String(state.zCounter + 1000);
}

function renderAll() {
  const canvas = $("canvas");
  // remove existing sticky and image nodes
  for (const node of canvas.querySelectorAll(".sticky, .board-image")) node.remove();

  const filteredIds = new Set(getFiltered().map((n) => n.id));
  const searching = state.search.trim() !== "";
  $("notesCount").textContent = searching
    ? t('{count} of {total} match',{count:window.lifeOsI18n.number(filteredIds.size),total:window.lifeOsI18n.number(state.notes.length)})
    : t(state.notes.length===1?'{count} note':'{count} notes',{count:window.lifeOsI18n.number(state.notes.length)});
  $("emptyState").hidden = Boolean(state.notes.length || state.images.length || state.strokes.length);

  for (const note of state.notes) {
    const el = renderSticky(note);
    el.classList.toggle("dimmed", !filteredIds.has(note.id) && state.search.trim() !== "");
    $('canvasScene').append(el);
  }
  for (const image of state.images) $('canvasScene').append(renderImageCard(image));
  renderStrokes();
  sizeDrawingLayer();
  syncLayerZ();
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
    showToast(t("Notes connected"));
  } else {
    showToast(t("These notes are already connected"));
  }
  state.connectFrom = null;
  syncConnectMode();
}

function renderConnections() {
  const svg = $("connectionsLayer");
  const canvas = $("canvas");
  if (!svg || !canvas) return;
  const width = Math.max(canvas.clientWidth, 1);
  const height = Math.max(canvas.clientHeight, 1);
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
    hit.setAttribute("aria-label", t("Remove connection between notes"));
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = t("Click to remove connection");
    hit.append(title);
    const remove = () => {
      if (!confirm(t("Remove this connection?"))) return;
      state.connections = state.connections.filter(other => other !== link);
      persist();
      renderConnections();
      showToast(t("Connection removed"));
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
  el.title = t("Double-click to edit note");
  el.dataset.id = note.id;
  el.dataset.color = note.color;
  el.style.left = note.x + "px";
  el.style.top = note.y + "px";
  el.style.width = note.w + "px";
  el.style.height = note.h + "px";
  el.style.zIndex = note.z;
  el.style.setProperty("--note-font", FONT_FACES[note.fontFace]);
  el.style.setProperty("--note-size", `${note.fontSize}px`);

  // Visible title; edited through the field in the edit bar below.
  const heading = document.createElement("header");
  heading.className = "sticky-head";
  const titleText = document.createElement("h3");
  titleText.className = "sticky-title";
  titleText.dir = "auto";
  const edited = document.createElement("time");
  edited.className = "sticky-edited";
  const syncHeading = () => {
    titleText.textContent = note.title;
    titleText.hidden = !note.title.trim();
    edited.textContent = editedAgo(note.updated);
    edited.title = t('Last edited {date}',{date:new Date(Number(note.updated)||Date.now()).toLocaleString(window.lifeOsI18n.locale())});
    edited.dateTime = new Date(Number(note.updated) || Date.now()).toISOString();
  };
  heading.append(titleText, edited);
  syncHeading();

  const format = document.createElement("div");
  format.className = "note-format";
  const titleInput = document.createElement("input");
  titleInput.className = "sticky-title-input";
  titleInput.dir = "auto";
  titleInput.maxLength = 500;
  titleInput.placeholder = t("Title");
  titleInput.setAttribute("aria-label", t("Note title"));
  titleInput.value = note.title;
  titleInput.addEventListener("input", () => {
    note.title = titleInput.value;
    note.updated = Date.now();
    persist();
  });
  titleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); body.focus(); }
    if (event.key === "Escape") { event.preventDefault(); el._exitEdit?.(); el.focus(); }
  });
  const formatRow = document.createElement("div");
  formatRow.className = "note-format-row";
  const face = document.createElement("select");
  face.setAttribute("aria-label", t("Note font face"));
  for (const [value, label] of [["sans", t("Sans")], ["serif", t("Serif")], ["mono", t("Mono")]]) {
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
  size.setAttribute("aria-label", t("Note font size"));
  for (const value of [11, 12, 14, 16, 18, 20, 24, 28]) {
    const option = document.createElement("option");
    option.value = String(value); option.textContent = t("{size}px", { size: window.lifeOsI18n.number(value) });
    size.append(option);
  }
  size.value = String(note.fontSize);
  size.addEventListener("change", () => {
    note.fontSize = Number(size.value);
    el.style.setProperty("--note-size", `${note.fontSize}px`);
    note.updated = Date.now();
    persist();
  });
  formatRow.append(face, size);
  format.append(titleInput, formatRow);

  const body = document.createElement("textarea");
  body.className = "sticky-body";
  body.spellcheck = true;
  body.value = note.body || "";
  body.placeholder = t("Write Markdown…");
  body.setAttribute("aria-label", t("Markdown source"));
  const voiceButton = window.addVoiceInputButton(body, "sticky-voice-input");
  const preview = document.createElement("div");
  preview.className = "markdown-preview";
  preview.innerHTML = renderMarkdown(body.value);
  body.hidden = true;
  const revealBtn = document.createElement("button");
  revealBtn.type = "button";
  revealBtn.className = "reveal-note";
  revealBtn.innerHTML = `${icon("lock")}<span>${t("Reveal note")}</span>`;
  const privacyBtn = document.createElement("button");
  privacyBtn.type = "button";
  privacyBtn.title = t("Toggle secret note");
  const hideBtn = document.createElement("button");
  hideBtn.type = "button";
  hideBtn.innerHTML = icon("hide");
  hideBtn.title = t("Hide secret note");
  hideBtn.setAttribute("aria-label", t("Hide secret note"));
  let revealed = false;
  const updatePrivacy = () => {
    const locked = note.secret && !revealed;
    el.classList.toggle("secret-locked", locked);
    el.setAttribute("aria-label", t(locked ? "Secret note, content hidden" : "Note, double-click or press Enter to edit"));
    preview.setAttribute("aria-hidden", String(locked));
    titleText.setAttribute("aria-hidden", String(locked));
    preview.inert = locked;
    revealBtn.hidden = !locked;
    hideBtn.hidden = !note.secret || locked;
    privacyBtn.innerHTML = icon(note.secret ? "lock" : "unlock");
    privacyBtn.title = t(note.secret ? "Turn off secret mode" : "Make note secret");
    privacyBtn.setAttribute("aria-label", privacyBtn.title);
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
    button.title = t("Color {color}", { color: t(color) });
    button.setAttribute("aria-label", button.title);
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
  connectBtn.innerHTML = icon("connect");
  connectBtn.title = t("Connect this note to another");
  connectBtn.setAttribute("aria-label", t("Connect this note to another"));
  connectBtn.setAttribute("aria-pressed", "false");
  connectBtn.onclick = () => {
    if (draw.mode) setDrawMode(false);
    document.querySelectorAll(".sticky.editing").forEach(card => card._exitEdit?.());
    state.connectFrom = state.connectFrom === note.id ? null : note.id;
    syncConnectMode();
    if (state.connectFrom) showToast(t("Select another note to connect · Esc to cancel"));
  };
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.title = t("Delete note");
  delBtn.className = "delete-note";
  delBtn.innerHTML = icon("delete");
  delBtn.setAttribute("aria-label", t("Delete note"));
  delBtn.onclick = (e) => {
    e.stopPropagation();
    deleteNote(note.id);
  };
  actions.append(connectBtn, privacyBtn, hideBtn, delBtn);

  const resize = document.createElement("div");
  resize.className = "resize-handle";
  resize.setAttribute("aria-label", t("Resize note"));
  resize.title = t("Resize");

  // Colors on the left, note actions on the right.
  const footer = document.createElement("footer");
  footer.className = "sticky-footer";
  footer.append(swatch, actions);

  el.append(heading, format, preview, body, voiceButton, revealBtn, footer, resize);
  el._syncHeading = syncHeading;
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
  if (!confirm(t("Delete this note?"))) return;
  state.notes.splice(idx, 1);
  state.connections = state.connections.filter(link => link.a !== id && link.b !== id);
  if (state.connectFrom === id) state.connectFrom = null;
  persist();
  renderAll();
}

function createNote() {
  const canvas = $("canvas");
  const note = makeNote("", "", {
    x: snap((canvas.clientWidth / 2 - viewport.x) / viewport.scale - NOTE_W / 2 + Math.random() * 32),
    y: snap((canvas.clientHeight / 2 - viewport.y) / viewport.scale - NOTE_H / 2 + Math.random() * 32)
  });
  state.notes.push(note);
  persist();
  renderAll();
  // Focus the new note for immediate editing
  document.querySelector(`.sticky[data-id="${note.id}"]`)?._enterEdit?.();
}

/* ── Freehand drawing ────────────────────────────────────────── */

// Quadratic smoothing through midpoints keeps handwriting fluid.
function strokePath(points) {
  const count = points.length / 2;
  if (count === 1) return `M ${points[0]} ${points[1]} l 0.01 0`;
  let path = `M ${points[0]} ${points[1]}`;
  if (count === 2) return `${path} L ${points[2]} ${points[3]}`;
  for (let i = 1; i < count - 1; i++) {
    const cx = points[i * 2], cy = points[i * 2 + 1];
    const mx = (cx + points[(i + 1) * 2]) / 2;
    const my = (cy + points[(i + 1) * 2 + 1]) / 2;
    path += ` Q ${cx} ${cy} ${mx} ${my}`;
  }
  return `${path} L ${points[(count - 1) * 2]} ${points[(count - 1) * 2 + 1]}`;
}

function renderStrokes() {
  const svg = $("drawingsLayer");
  if (!svg) return;
  svg.replaceChildren(...state.strokes.map(stroke => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", strokePath(stroke.p));
    path.setAttribute("stroke", stroke.color);
    path.setAttribute("stroke-width", String(stroke.width));
    return path;
  }));
}

function sizeDrawingLayer() {
  const layer = $("drawingsLayer");
  const canvas = $("canvas");
  if (!layer || !canvas) return;
  layer.style.width = `${Math.max(canvas.clientWidth, 1)}px`;
  layer.style.height = `${Math.max(canvas.clientHeight, 1)}px`;
}

function syncDrawPanel() {
  const panel = $("drawPanel");
  panel.hidden = !draw.mode;
  for (const button of panel.querySelectorAll(".draw-ink")) {
    button.setAttribute("aria-pressed", String(button.dataset.ink === draw.ink));
  }
  for (const button of panel.querySelectorAll(".draw-width")) {
    button.setAttribute("aria-pressed", String(Number(button.dataset.width) === draw.width));
  }
  $("eraserBtn").setAttribute("aria-pressed", String(draw.erasing));
}

let activeStroke = null;
let activePath = null;
let erasing = false;

function cancelActiveStroke() {
  if (activePath) activePath.remove();
  activeStroke = null;
  activePath = null;
  erasing = false;
}

function setDrawMode(on) {
  on = Boolean(on);
  if (draw.mode === on) return;
  draw.mode = on;
  if (on) {
    if (state.connectFrom) { state.connectFrom = null; syncConnectMode(); }
    document.querySelectorAll(".sticky.editing").forEach(card => card._exitEdit?.());
    draw.erasing = false;
  }
  cancelActiveStroke();
  $("canvas").classList.toggle("drawing-mode", on);
  $("drawBtn").setAttribute("aria-pressed", String(on));
  syncDrawPanel();
}

function toScenePoint(event) {
  const rect = $("canvas").getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - viewport.x) / viewport.scale,
    y: (event.clientY - rect.top - viewport.y) / viewport.scale
  };
}

function currentInkColor() {
  const ink = INKS.find(item => item.id === draw.ink) || INKS[0];
  return ink.color();
}

function eraseAt(point) {
  const radius = 14 / viewport.scale;
  const radiusSq = radius * radius;
  const before = state.strokes.length;
  state.strokes = state.strokes.filter(stroke => {
    for (let i = 0; i < stroke.p.length; i += 2) {
      const dx = stroke.p[i] - point.x;
      const dy = stroke.p[i + 1] - point.y;
      if (dx * dx + dy * dy <= radiusSq) return false;
    }
    return true;
  });
  if (state.strokes.length !== before) {
    renderStrokes();
    persist();
  }
}

function undoStroke() {
  if (!state.strokes.length) return;
  state.strokes.pop();
  renderStrokes();
  persist();
}

function clearDrawings() {
  if (!state.strokes.length) return;
  if (!confirm(t("Clear all drawings?"))) return;
  state.strokes = [];
  renderStrokes();
  persist();
  showToast(t("Drawing cleared"));
}

function bindDrawing() {
  const canvas = $("canvas");
  const panel = $("drawPanel");
  $("drawBtn").addEventListener("click", () => setDrawMode(!draw.mode));
  for (const button of panel.querySelectorAll(".draw-ink")) {
    button.addEventListener("click", () => {
      draw.ink = button.dataset.ink;
      draw.erasing = false;
      syncDrawPanel();
    });
  }
  for (const button of panel.querySelectorAll(".draw-width")) {
    button.addEventListener("click", () => {
      draw.width = Number(button.dataset.width) || 4;
      draw.erasing = false;
      syncDrawPanel();
    });
  }
  $("eraserBtn").addEventListener("click", () => { draw.erasing = !draw.erasing; syncDrawPanel(); });
  $("undoStroke").addEventListener("click", undoStroke);
  $("clearStrokes").addEventListener("click", clearDrawings);

  // Drawing runs on the canvas itself so strokes can start anywhere — over
  // notes and images included — and still follow the board's pan and zoom.
  canvas.addEventListener("pointerdown", event => {
    if (!draw.mode || event.button !== 0 || spaceToPan) return;
    if (event.target.closest("button, a, input, select, textarea")) return;
    event.preventDefault();
    event.stopPropagation();
    const point = toScenePoint(event);
    canvas.setPointerCapture(event.pointerId);
    if (draw.erasing) {
      erasing = true;
      eraseAt(point);
      return;
    }
    const stroke = {
      color: currentInkColor(),
      width: draw.width,
      p: [Math.round(point.x * 10) / 10, Math.round(point.y * 10) / 10]
    };
    activeStroke = stroke;
    activePath = document.createElementNS(SVG_NS, "path");
    activePath.setAttribute("stroke", stroke.color);
    activePath.setAttribute("stroke-width", String(stroke.width));
    activePath.setAttribute("d", strokePath(stroke.p));
    $("drawingsLayer").append(activePath);
  }, true);

  canvas.addEventListener("pointermove", event => {
    if (erasing) {
      if (event.buttons & 1) eraseAt(toScenePoint(event));
      else erasing = false;
      return;
    }
    if (!activeStroke) return;
    const point = toScenePoint(event);
    const x = Math.round(point.x * 10) / 10;
    const y = Math.round(point.y * 10) / 10;
    const last = activeStroke.p.length;
    if (x === activeStroke.p[last - 2] && y === activeStroke.p[last - 1]) return;
    activeStroke.p.push(x, y);
    activePath.setAttribute("d", strokePath(activeStroke.p));
  });

  const endStroke = event => {
    if (erasing) erasing = false;
    if (activeStroke) {
      const stroke = activeStroke;
      activeStroke = null;
      activePath = null;
      state.strokes.push(stroke);
      persist();
      renderStrokes();
    }
    if (event && event.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  // While the pen is out, clicks on the board itself must not open or edit
  // the notes underneath it.
  const swallow = event => {
    if (!draw.mode || event.target.closest("button, a")) return;
    event.stopPropagation();
    event.preventDefault();
  };
  canvas.addEventListener("click", swallow, true);
  canvas.addEventListener("dblclick", swallow, true);
}

/* ── Board images ────────────────────────────────────────────── */

async function addImageFiles(files) {
  const list = Array.from(files || []).filter(file => file && file.type.startsWith("image/"));
  if (!list.length) {
    showToast(t("Only image files can be added."), "error");
    return;
  }
  for (const file of list) {
    try {
      const sized = await downscaleImage(file);
      if (docSize() + sized.src.length > MAX_DOC_CHARS) {
        showToast(t("Board is full. Remove some images first."), "error");
        return;
      }
      pushImage(sized);
    } catch (error) {
      console.error("Unable to add image:", error);
      showToast(t("That image could not be added."), "error");
    }
  }
}

// Re-encode through a canvas so a board image costs a few hundred KB at most.
async function downscaleImage(file) {
  const MAX_EDGE = 1400;
  let source = null, width, height, revoke = null;
  if (typeof createImageBitmap === "function") {
    try {
      source = await createImageBitmap(file);
      width = source.width;
      height = source.height;
    } catch (error) {
      source = null; // Some formats need the plain <img> path below.
    }
  }
  if (!source) {
    const url = URL.createObjectURL(file);
    revoke = url;
    source = new Image();
    source.src = url;
    await source.decode();
    width = source.naturalWidth;
    height = source.naturalHeight;
  }
  try {
    if (!width || !height) throw new Error("Image has no pixels");
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const surface = document.createElement("canvas");
    surface.width = w;
    surface.height = h;
    const context = surface.getContext("2d");
    context.drawImage(source, 0, 0, w, h);
    let src = surface.toDataURL("image/webp", 0.85);
    if (!src.startsWith("data:image/webp")) src = surface.toDataURL("image/jpeg", 0.82);
    return { src, w, h };
  } finally {
    if (revoke) URL.revokeObjectURL(revoke);
    else if (typeof source.close === "function") source.close();
  }
}

function pushImage(sized) {
  const canvas = $("canvas");
  const fit = Math.min(1, 400 / sized.w, 320 / sized.h);
  const w = Math.max(80, Math.round(sized.w * fit));
  const h = Math.max(60, Math.round(sized.h * fit));
  const offset = (state.images.length % 5) * 24;
  state.images.push({
    id: cryptoId(),
    src: sized.src,
    x: snap((canvas.clientWidth / 2 - viewport.x) / viewport.scale - w / 2 + offset),
    y: snap((canvas.clientHeight / 2 - viewport.y) / viewport.scale - h / 2 + offset),
    w, h,
    z: ++state.zCounter,
    updated: Date.now()
  });
  persist();
  // Entrance animation plays once, on this render only (never persisted).
  state.images[state.images.length - 1]._fresh = true;
  renderAll();
}

function deleteImage(id) {
  const index = state.images.findIndex(image => image.id === id);
  if (index === -1) return;
  if (!confirm(t("Delete this image?"))) return;
  state.images.splice(index, 1);
  persist();
  renderAll();
}

function renderImageCard(image) {
  const el = document.createElement("figure");
  el.className = "board-image";
  el.dataset.id = image.id;
  el.style.left = image.x + "px";
  el.style.top = image.y + "px";
  el.style.width = image.w + "px";
  el.style.height = image.h + "px";
  el.style.zIndex = image.z;
  if (image._fresh) {
    el.classList.add("fresh");
    delete image._fresh;
  }

  const picture = document.createElement("img");
  picture.src = image.src;
  picture.alt = t("Board image");
  picture.draggable = false;

  const bar = document.createElement("div");
  bar.className = "image-bar";
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "open-image";
  openBtn.innerHTML = icon("open");
  openBtn.title = t("Open image");
  openBtn.setAttribute("aria-label", t("Open image"));
  openBtn.addEventListener("click", async event => {
    event.stopPropagation();
    // Browsers refuse to open data: URLs directly, so go through a blob.
    try {
      const blob = await (await fetch(image.src)).blob();
      const url = URL.createObjectURL(blob);
      if (window.open(url, "_blank", "noopener")) {
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      }
      URL.revokeObjectURL(url);
      throw new Error("Popup blocked");
    } catch (error) {
      console.error("Unable to open image:", error);
      const link = document.createElement("a");
      link.href = image.src;
      link.download = "board-image";
      link.click();
    }
  });
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "delete-image";
  delBtn.innerHTML = icon("delete");
  delBtn.title = t("Delete image");
  delBtn.setAttribute("aria-label", t("Delete image"));
  delBtn.addEventListener("click", event => {
    event.stopPropagation();
    deleteImage(image.id);
  });
  bar.append(openBtn, delBtn);

  const resize = document.createElement("div");
  resize.className = "resize-handle";
  resize.setAttribute("aria-label", t("Resize note"));
  resize.title = t("Resize");

  el.append(picture, bar, resize);
  bindDrag(el, image);
  bindImageResize(el, image, resize);
  return el;
}

function bindImageResize(el, image, handle) {
  let startX, startY, originW, originH;
  let pointerId = null;

  const onDown = event => {
    if (event.button !== 0 || spaceToPan) return;
    event.preventDefault();
    event.stopPropagation();
    pointerId = event.pointerId;
    handle.setPointerCapture(pointerId);
    el.classList.add("resizing");
    startX = event.clientX;
    startY = event.clientY;
    originW = image.w;
    originH = image.h;
    image.z = ++state.zCounter;
    el.style.zIndex = image.z;
    syncLayerZ();
  };

  const onMove = event => {
    if (pointerId === null) return;
    const dx = (event.clientX - startX) / viewport.scale;
    const dy = (event.clientY - startY) / viewport.scale;
    // Follow whichever axis moved furthest so the picture keeps its proportions.
    const ratioW = (originW + dx) / originW;
    const ratioH = (originH + dy) / originH;
    const scale = Math.max(0.15, Math.abs(ratioW - 1) >= Math.abs(ratioH - 1) ? ratioW : ratioH);
    image.w = Math.max(80, Math.round(originW * scale));
    image.h = Math.max(60, Math.round(originH * scale));
    el.style.width = image.w + "px";
    el.style.height = image.h + "px";
  };

  const onUp = () => {
    if (pointerId === null) return;
    pointerId = null;
    el.classList.remove("resizing");
    image.updated = Date.now();
    persist();
  };

  handle.addEventListener("pointerdown", onDown);
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  handle.addEventListener("pointercancel", onUp);
}

function bindDrag(el, note) {
  let startX, startY, originX, originY;
  let pointerId = null;

  const onDown = (e) => {
    // Only drag when not editing, and ignore clicks on the action/swatch/resize areas
    if (e.button !== 0 || spaceToPan) return;
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
    syncLayerZ();
  };

  const onMove = (e) => {
    if (pointerId === null) return;
    const dx = (e.clientX - startX) / viewport.scale;
    const dy = (e.clientY - startY) / viewport.scale;
    note.x = originX + dx;
    note.y = originY + dy;
    el.style.left = note.x + "px";
    el.style.top = note.y + "px";
    renderConnections();
  };

  const onUp = (e) => {
    if (pointerId === null) return;
    pointerId = null;
    el.classList.remove("dragging");
    note.x = snap(note.x);
    note.y = snap(note.y);
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
    if (e.button !== 0 || spaceToPan) return;
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
    syncLayerZ();
  };

  const onMove = (e) => {
    if (pointerId === null) return;
    const dx = (e.clientX - startX) / viewport.scale;
    const dy = (e.clientY - startY) / viewport.scale;
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
    el._syncHeading?.();
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
    if (e.target.closest(".actions, .swatch, .sticky-footer, .note-format, .reveal-note, .voice-input, a")) return;
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
  $("emptyNewNote").addEventListener("click", createNote);

  $("searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value;
      renderAll();
    }, 120);
  });

  $("addImageBtn").addEventListener("click", () => $("imageInput").click());
  $("imageInput").addEventListener("change", (e) => {
    addImageFiles(e.target.files);
    e.target.value = "";
  });

  // Screenshots and copied images land straight on the board.
  document.addEventListener("paste", (e) => {
    if (e.target instanceof Element && e.target.closest("textarea, input, [contenteditable='true']")) return;
    const files = Array.from(e.clipboardData?.files || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    addImageFiles(files);
  });

  const canvas = $("canvas");
  canvas.addEventListener("dragover", (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
    e.preventDefault();
    canvas.classList.add("drop-target");
  });
  canvas.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget || !canvas.contains(e.relatedTarget)) canvas.classList.remove("drop-target");
  });
  canvas.addEventListener("drop", (e) => {
    canvas.classList.remove("drop-target");
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    addImageFiles(e.dataTransfer.files);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.connectFrom) {
      state.connectFrom = null;
      syncConnectMode();
      showToast(t("Connection canceled"));
      return;
    }
    if (e.target instanceof Element && e.target.matches("input, textarea, [contenteditable='true']")) return;
    if (e.key === "Escape" && draw.mode) {
      setDrawMode(false);
      return;
    }
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "n") {
      e.preventDefault();
      createNote();
    } else if (meta && e.key.toLowerCase() === "z" && draw.mode) {
      e.preventDefault();
      undoStroke();
    } else if (e.key === "/") {
      e.preventDefault();
      $("searchInput").focus();
    } else if (!meta && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      setDrawMode(!draw.mode);
    }
  });

  window.addEventListener("resize", () => {
    renderConnections();
    sizeDrawingLayer();
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
  bindCanvasNavigation();
  bindDrawing();
  renderAll();
});
