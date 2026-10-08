(() => {
  if (globalThis.stickyNotesRunning) return;
  globalThis.stickyNotesRunning = true;

  const HOST_ATTRIBUTE = "data-sticky-notes-host";
  const NOTE_WIDTH = 240;
  const NOTE_HEIGHT = 126;
  const NOTE_URL = chrome.runtime.getURL("note/note.html");
  // Chrome may resolve the per-session dynamic URL to the static one when it loads the frame.
  const NOTE_ORIGINS = new Set([new URL(NOTE_URL).origin, `chrome-extension://${chrome.runtime.id}`]);
  const entries = new Map();
  let pageKey = StickyNotes.pageKey(location.href);
  let root;
  let reportedCount;
  let focusNoteId;

  // A reloaded or updated extension injects this script again; drop the UI its dead predecessor left behind.
  document.querySelector(`[${HOST_ATTRIBUTE}]`)?.remove();

  function getRoot() {
    if (root) return root;
    const host = document.createElement("div");
    host.setAttribute(HOST_ATTRIBUTE, "");
    root = host.attachShadow({ mode: "closed" });
    adoptStyles(root, NOTE_CSS);
    document.documentElement.append(host);
    return root;
  }

  function viewport() {
    return { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
  }

  function tilt(id) {
    return (parseInt(id.slice(0, 2), 16) / 255 - 0.5) * 3;
  }

  function place(entry, position = entry.note) {
    const clamped = StickyNotes.clampPosition(position, { width: NOTE_WIDTH, height: entry.el.offsetHeight }, viewport());
    entry.el.style.translate = `${clamped.x}px ${clamped.y}px`;
    return clamped;
  }

  function render(note) {
    // A cross-origin frame never sees the parent's iframe.focus(), so a new note is told to focus itself.
    const focus = note.id === focusNoteId ? "&focus" : "";
    if (focus) focusNoteId = undefined;
    const el = h("iframe", { src: `${NOTE_URL}?id=${encodeURIComponent(note.id)}${focus}`, title: "Sticky note" });
    el.style.setProperty("--tilt", `${tilt(note.id)}deg`);
    const entry = { note, el };
    entries.set(note.id, entry);
    getRoot().append(el);
    place(entry);
    return entry;
  }

  function entryFor(event) {
    if (!NOTE_ORIGINS.has(event.origin)) return;
    for (const entry of entries.values()) {
      if (entry.el.contentWindow === event.source) return entry;
    }
  }

  // The frame reports the grab in its own coordinates; its tilt and scale map that point onto the page.
  function pagePoint(entry, { x, y }) {
    const { rotate, scale } = getComputedStyle(entry.el);
    const center = { x: NOTE_WIDTH / 2, y: entry.el.offsetHeight / 2 };
    return new DOMMatrix()
      .translate(entry.start.x + center.x, entry.start.y + center.y)
      .rotate(parseFloat(rotate) || 0)
      .scale(parseFloat(scale) || 1)
      .transformPoint({ x: x - center.x, y: y - center.y });
  }

  // Pointer events stop reaching a frame that moves under them, so this document runs the drag behind an overlay that
  // keeps the pointer off the frame. A press that began in the frame cannot be captured here: moves outside the viewport
  // are lost and only the release arrives, so the release places the note too. A release outside the window may never
  // arrive at all; the next move with no button held ends the drag instead.
  function drag(entry, grab) {
    if (entry.start) return;
    entry.start = place(entry);
    const down = pagePoint(entry, grab);
    const overlay = h("div", { className: "drag-overlay" });
    const follow = (event) => {
      const position = {
        x: entry.start.x + Math.round(event.clientX - down.x),
        y: entry.start.y + Math.round(event.clientY - down.y),
      };
      entry.note = { ...entry.note, ...place(entry, position) };
    };
    const finish = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", drop, true);
      overlay.remove();
      entry.start = undefined;
      entry.el.classList.remove("dragging");
      StickyNotes.patchNote(entry.note.id, { x: entry.note.x, y: entry.note.y });
    };
    // The page can dispatch pointer events on its own window; only the user moves a note.
    const move = (event) => {
      if (!event.isTrusted) return;
      if (event.buttons) follow(event);
      else finish();
    };
    const drop = (event) => {
      if (!event.isTrusted) return;
      follow(event);
      finish();
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", drop, true);
    getRoot().append(overlay);
    entry.el.classList.add("dragging");
  }

  window.addEventListener("message", (event) => {
    const entry = entryFor(event);
    if (!entry) return;
    const { type, height, x, y } = event.data ?? {};
    if (type === "size" && Number.isFinite(height)) {
      entry.el.style.height = `${height}px`;
      place(entry);
    } else if (type === "grab" && Number.isFinite(x) && Number.isFinite(y)) {
      drag(entry, { x, y });
    }
  });

  function sync({ id, note }) {
    const entry = entries.get(id);
    if (!note || StickyNotes.pageKey(note.url) !== pageKey) {
      entry?.el.remove();
      entries.delete(id);
      return;
    }
    if (!entry) {
      render(note);
      return;
    }
    // The frame patches text and color while a drag is in flight; the position being dragged is the truth.
    entry.note = entry.start ? { ...note, x: entry.note.x, y: entry.note.y } : note;
    if (!entry.start) place(entry);
  }

  // The service worker shows this count on the toolbar icon. Storage echoes of every keystroke land here, so only changes are sent.
  function reportCount() {
    if (entries.size === reportedCount) return;
    reportedCount = entries.size;
    // An orphaned script left by an extension reload can no longer reach the worker.
    try {
      chrome.runtime.sendMessage({ type: "note-count", count: entries.size }).catch(() => {});
    } catch {}
  }

  async function showPage() {
    pageKey = StickyNotes.pageKey(location.href);
    for (const id of entries.keys()) sync({ id });
    for (const note of await StickyNotes.loadNotes()) sync({ id: note.id, note });
    reportCount();
  }

  async function addNote() {
    const cascade = (entries.size % 5) * 28;
    const position = StickyNotes.clampPosition(
      { x: viewport().width - NOTE_WIDTH - 24 - cascade, y: 24 + cascade },
      { width: NOTE_WIDTH, height: NOTE_HEIGHT },
      viewport(),
    );
    const note = StickyNotes.createNote({ url: location.href, title: document.title, ...position });
    // The storage echo of this save may render the frame before addNote does.
    focusNoteId = note.id;
    // The frame reads its record when it loads, so the record must exist before the frame does.
    await StickyNotes.saveNote(note);
    const entry = entries.get(note.id) ?? render(note);
    entry.el.focus();
    entry.el.addEventListener("load", () => entry.el.focus(), { once: true });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    StickyNotes.noteChanges(changes).forEach(sync);
    reportCount();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "add-note") return;
    // The fallback injection can land on about:, blob: or file: tabs, where no script would bring the note back.
    const supported = /^https?:$/.test(location.protocol);
    if (supported) addNote();
    sendResponse({ ok: supported });
  });

  window.navigation?.addEventListener("currententrychange", () => {
    if (StickyNotes.pageKey(location.href) !== pageKey) showPage();
  });
  window.addEventListener("resize", () => entries.forEach((entry) => place(entry)));
  // Chrome clears the tab's badge when a page comes back from the back/forward cache.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    reportedCount = undefined;
    reportCount();
  });

  showPage();
})();
