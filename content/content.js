(() => {
  if (globalThis.stickyNotesRunning) return;
  globalThis.stickyNotesRunning = true;

  const HOST_ATTRIBUTE = "data-sticky-notes-host";
  const entries = new Map();
  let pageKey = StickyNotes.pageKey(location.href);
  let root;

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

  function update(entry, patch) {
    entry.note = { ...entry.note, ...patch };
    paint(entry);
    StickyNotes.saveNote(entry.note);
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
        StickyNotes.saveNote(entry.note);
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
        () => StickyNotes.deleteNote(note.id),
        () => textarea.value.trim() !== "",
      ),
    );
    const el = h("div", { className: "note" }, bar, textarea);
    el.style.setProperty("--tilt", `${tilt(note.id)}deg`);
    const entry = { note, el, textarea, swatches };

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

  async function showPage() {
    pageKey = StickyNotes.pageKey(location.href);
    for (const id of entries.keys()) sync({ id });
    for (const note of await StickyNotes.loadNotes()) sync({ id: note.id, note });
  }

  function addNote() {
    const cascade = (entries.size % 5) * 28;
    const entry = render(StickyNotes.createNote({ url: location.href, title: document.title, x: 0, y: 0 }));
    const x = document.documentElement.clientWidth - entry.el.offsetWidth - 24 - cascade;
    update(entry, place(entry, { x, y: 24 + cascade }));
    entry.textarea.focus();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") StickyNotes.noteChanges(changes).forEach(sync);
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

  showPage();
})();
