(async () => {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const embedder = location.ancestorOrigins[0];
  let note = id && (await StickyNotes.loadNote(id));
  // Only the page a note is stuck on may show it, and only inside a frame.
  if (!embedder || !note || new URL(note.url).origin !== embedder) return;

  adoptStyles(document, SHARED_CSS);

  const send = (message) => window.parent.postMessage(message, embedder);

  const textarea = h("textarea", { value: note.text, placeholder: "Note to self…", ariaLabel: "Sticky note" });
  const swatches = StickyNotes.COLORS.map((color) =>
    h("button", {
      type: "button",
      className: "swatch",
      ariaLabel: `Make note ${color}`,
      dataset: { color },
      onclick: () => update({ color }),
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

  function paint() {
    el.dataset.color = note.color;
    for (const swatch of swatches) {
      swatch.ariaPressed = String(swatch.dataset.color === note.color);
    }
  }

  function update(patch) {
    note = { ...note, ...patch };
    paint();
    StickyNotes.patchNote(note.id, patch);
  }

  textarea.addEventListener("input", () => update({ text: textarea.value }));

  bar.addEventListener("pointerdown", (down) => {
    if (down.button !== 0 || down.target.closest("button")) return;
    down.preventDefault();
    // Pointer events stop reaching a frame that moves under them, so the parent runs the drag.
    send({ type: "grab", x: down.clientX, y: down.clientY });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const change = StickyNotes.noteChanges(changes).find((change) => change.id === note.id);
    if (!change?.note) return;
    // Storage echoes of earlier keystrokes arrive late; while the user types, the textarea is the truth.
    const editing = document.hasFocus() && document.activeElement === textarea;
    note = editing ? { ...change.note, text: note.text } : change.note;
    if (!editing) textarea.value = note.text;
    paint();
  });

  // The parent focuses the frame when it adds a note; autofocus is ignored in cross-origin frames.
  const focusTextarea = () => {
    if (document.activeElement === document.body) textarea.focus();
  };
  window.addEventListener("focus", focusTextarea);

  document.body.append(el);
  paint();
  new ResizeObserver(() => send({ type: "size", height: el.offsetHeight })).observe(el);
  if (params.has("focus")) textarea.focus();
})();
