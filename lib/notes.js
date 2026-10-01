// `var`, not `const`: addNoteToTab may inject these scripts into a page twice, and a redeclared `const` throws.
var StickyNotes = (() => {
  const KEY_PREFIX = "note:";
  const COLORS = ["yellow", "pink", "green", "blue", "purple"];
  const EDGE_MARGIN = 8;
  const MAX_TITLE_LENGTH = 200;

  function pageKey(url) {
    const { origin, pathname, search } = new URL(url);
    return origin + pathname + search;
  }

  function createNote({ url, title, x, y }) {
    return {
      id: crypto.randomUUID(),
      url: pageKey(url),
      title: String(title).slice(0, MAX_TITLE_LENGTH),
      text: "",
      color: COLORS[0],
      x,
      y,
      createdAt: Date.now(),
    };
  }

  function notesFromStorage(items) {
    return Object.entries(items)
      .filter(([key]) => key.startsWith(KEY_PREFIX))
      .map(([, note]) => note)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  function noteChanges(changes) {
    return Object.entries(changes)
      .filter(([key]) => key.startsWith(KEY_PREFIX))
      .map(([key, { newValue }]) => ({ id: key.slice(KEY_PREFIX.length), note: newValue }));
  }

  function groupByPage(notes, currentUrl) {
    const pages = new Map();
    for (const note of notes) {
      const page = pages.get(note.url) ?? { url: note.url, notes: [] };
      page.notes.push(note);
      page.title = note.title;
      page.lastNoteAt = note.createdAt;
      pages.set(note.url, page);
    }
    return [...pages.values()].sort(
      (a, b) => (b.url === currentUrl) - (a.url === currentUrl) || b.lastNoteAt - a.lastNoteAt,
    );
  }

  function clampPosition({ x, y }, size, viewport) {
    const clamp = (value, max) => Math.max(EDGE_MARGIN, Math.min(value, max - EDGE_MARGIN));
    return {
      x: clamp(x, viewport.width - size.width),
      y: clamp(y, viewport.height - size.height),
    };
  }

  async function loadNotes() {
    return notesFromStorage(await chrome.storage.local.get(null));
  }

  function saveNote(note) {
    return chrome.storage.local.set({ [KEY_PREFIX + note.id]: note });
  }

  function deleteNote(id) {
    return chrome.storage.local.remove(KEY_PREFIX + id);
  }

  return {
    COLORS,
    pageKey,
    createNote,
    notesFromStorage,
    noteChanges,
    groupByPage,
    clampPosition,
    loadNotes,
    saveNote,
    deleteNote,
  };
})();

if (typeof module !== "undefined") module.exports = StickyNotes;
