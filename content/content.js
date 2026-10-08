(() => {
  if (globalThis.stickyNotesRunning) return;
  globalThis.stickyNotesRunning = true;

  const HOST_ATTRIBUTE = "data-sticky-notes-host";
  const UNSAVED_MESSAGE = "Not saved. Copy your text before you leave this page.";
  const entries = new Map();
  let pageKey = StickyNotes.pageKey(location.href);
  let root;
  let reportedCount;
  let saving = Promise.resolve();

  // A script orphaned by an extension reload cannot reach the worker; it then behaves as a page with no notes.
  async function broker(message) {
    try {
      return (await chrome.runtime.sendMessage(message)) ?? { ok: false };
    } catch {
      return { ok: false };
    }
  }

  // A reloaded or updated extension injects this script again; drop the UI its dead predecessor left behind.
  document.querySelector(`[${HOST_ATTRIBUTE}]`)?.remove();

  function getRoot() {
    if (root) return root;
    const host = document.createElement("div");
    host.setAttribute(HOST_ATTRIBUTE, "");
    root = host.attachShadow({ mode: "closed" });
    adoptStyles(root, SHARED_CSS + NOTE_CSS);
    // Typing in a note must not trigger the page's own keyboard shortcuts.
    for (const type of ["keydown", "keypress", "keyup"]) {
      root.addEventListener(type, (event) => event.stopPropagation());
    }
    document.documentElement.append(host);
    return root;
  }

  function tilt(id) {
    return (parseInt(id.slice(0, 2), 16) / 255 - 0.5) * 3;
  }

  function place(entry, position = entry.note) {
    const clamped = StickyNotes.clampPosition(
      position,
      { width: entry.el.offsetWidth, height: entry.el.offsetHeight },
      { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
    );
    entry.el.style.translate = `${clamped.x}px ${clamped.y}px`;
    return clamped;
  }

  function paint(entry) {
    entry.el.dataset.color = entry.note.color;
    for (const swatch of entry.swatches) {
      swatch.ariaPressed = String(swatch.dataset.color === entry.note.color);
    }
    place(entry);
  }

  // Writes resolve in order, so only the newest attempt decides.
  function save(entry) {
    const attempt = ++entry.saves;
    saving = broker({ type: "save-note", note: entry.note });
    saving.then(({ ok }) => {
      if (attempt === entry.saves) entry.status.textContent = ok ? "" : UNSAVED_MESSAGE;
    });
  }

  function update(entry, patch) {
    entry.note = { ...entry.note, ...patch };
    paint(entry);
    save(entry);
  }

  function enableDrag(entry, handle) {
    handle.addEventListener("pointerdown", (down) => {
      if (down.button !== 0 || down.target.closest("button")) return;
      down.preventDefault();
      const start = place(entry);
      const drag = (move) => {
        const position = { x: start.x + move.clientX - down.clientX, y: start.y + move.clientY - down.clientY };
        entry.note = { ...entry.note, ...place(entry, position) };
      };
      const drop = () => {
        handle.removeEventListener("pointermove", drag);
        entry.el.classList.remove("dragging");
        save(entry);
      };
      handle.setPointerCapture(down.pointerId);
      entry.el.classList.add("dragging");
      handle.addEventListener("pointermove", drag);
      handle.addEventListener("lostpointercapture", drop, { once: true });
    });
  }

  function render(note) {
    const textarea = h("textarea", { value: note.text, placeholder: "Note to self…", ariaLabel: "Sticky note" });
    const swatches = StickyNotes.COLORS.map((color) =>
      h("button", {
        type: "button",
        className: "swatch",
        ariaLabel: `Make note ${color}`,
        dataset: { color },
        onclick: () => update(entry, { color }),
      }),
    );
    const bar = h(
      "div",
      { className: "bar" },
      h("div", { className: "swatches" }, ...swatches),
      deleteButton(
        () => broker({ type: "delete-note", id: note.id }),
        () => textarea.value.trim() !== "",
      ),
    );
    const status = h("p", { className: "status", role: "alert" });
    const el = h("div", { className: "note" }, bar, textarea, status);
    el.style.setProperty("--tilt", `${tilt(note.id)}deg`);
    const entry = { note, el, textarea, swatches, status, saves: 0 };

    textarea.addEventListener("input", () => update(entry, { text: textarea.value }));
    enableDrag(entry, bar);
    entries.set(note.id, entry);
    getRoot().append(el);
    paint(entry);
    return entry;
  }

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
    // Storage echoes of earlier keystrokes arrive late; while the user types, the textarea is the truth.
    const editing = document.hasFocus() && root.activeElement === entry.textarea;
    entry.note = editing ? { ...note, text: entry.note.text } : note;
    if (!editing) entry.textarea.value = note.text;
    paint(entry);
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

  // A note added while the fetch is in flight is not in the answer yet, so only notes known before it can have been deleted.
  async function refresh() {
    await saving;
    const known = [...entries.keys()];
    const { notes = [] } = await broker({ type: "get-notes", url: location.href });
    const current = new Set(notes.map((note) => note.id));
    for (const id of known) if (!current.has(id)) sync({ id });
    notes.forEach((note) => sync({ id: note.id, note }));
    reportCount();
  }

  function showPage() {
    pageKey = StickyNotes.pageKey(location.href);
    return refresh();
  }

  function addNote() {
    const cascade = (entries.size % 5) * 28;
    const entry = render(StickyNotes.createNote({ url: location.href, title: document.title, x: 0, y: 0 }));
    const x = document.documentElement.clientWidth - entry.el.offsetWidth - 24 - cascade;
    update(entry, place(entry, { x, y: 24 + cascade }));
    entry.textarea.focus();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "notes-changed") refresh();
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
