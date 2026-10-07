// `var`, not `const`: addNoteToTab may inject these scripts into a page twice, and a redeclared `const` throws.
var StickyNotes = (() => {
  const KEY_PREFIX = "note:";
  const TRACKING_PARAMS = new Set([
    "fbclid", "gclid", "gbraid", "wbraid", "dclid", "msclkid", "yclid", "igshid", "mc_cid", "mc_eid",
  ]);
  const COLORS = ["yellow", "pink", "green", "blue", "purple"];
  const EDGE_MARGIN = 8;
  const MAX_TITLE_LENGTH = 200;
  const MAX_BADGE_COUNT = 99;

  function isTrackingParam(segment) {
    const rawName = segment.split("=", 1)[0];
    let name;
    try {
      name = decodeURIComponent(rawName).toLowerCase();
    } catch {
      name = rawName.toLowerCase();
    }
    return name.startsWith("utm_") || TRACKING_PARAMS.has(name);
  }

  // Filters the raw query instead of using URLSearchParams, which would re-encode surviving params and orphan existing notes.
  function pageKey(url) {
    const { origin, pathname, search } = new URL(url);
    const query = search.slice(1).split("&").filter((segment) => !isTrackingParam(segment)).join("&");
    return origin + pathname + (query && "?" + query);
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
      const url = pageKey(note.url);
      const page = pages.get(url) ?? { url, notes: [] };
      page.notes.push(note);
      page.title = note.title;
      page.lastNoteAt = note.createdAt;
      pages.set(url, page);
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

  function badgeText(count) {
    if (!Number.isInteger(count) || count < 1) return "";
    return count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(count);
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
    badgeText,
    loadNotes,
    saveNote,
    deleteNote,
  };
})();

if (typeof module !== "undefined") module.exports = StickyNotes;
