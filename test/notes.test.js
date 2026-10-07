const { test } = require("node:test");
const assert = require("node:assert/strict");
const StickyNotes = require("../lib/notes.js");

test("pageKey keeps the query and drops the hash", () => {
  assert.equal(
    StickyNotes.pageKey("https://example.com/watch?v=abc#t=10"),
    "https://example.com/watch?v=abc",
  );
  assert.equal(StickyNotes.pageKey("https://example.com"), "https://example.com/");
});

test("pageKey drops tracking parameters and keeps the rest", () => {
  assert.equal(
    StickyNotes.pageKey("https://example.com/a?id=1&utm_source=a&fbclid=b&gclid=c"),
    "https://example.com/a?id=1",
  );
  assert.equal(StickyNotes.pageKey("https://example.com/a?utm_medium=x"), "https://example.com/a");
  assert.equal(StickyNotes.pageKey("https://example.com/a?q=a%20b&utm_source=x"), "https://example.com/a?q=a%20b");
  assert.equal(StickyNotes.pageKey("https://example.com/a?UTM_Source=x&b=2"), "https://example.com/a?b=2");
  assert.equal(StickyNotes.pageKey("https://example.com/a?z=1&utm_x=1&a=2"), "https://example.com/a?z=1&a=2");
});

test("pageKey is idempotent", () => {
  const tracked = "https://example.com/a?q=a%20b&utm_source=x&gclid=y#top";
  assert.equal(StickyNotes.pageKey(StickyNotes.pageKey(tracked)), StickyNotes.pageKey(tracked));
});

test("createNote starts empty, keyed to its page", () => {
  const note = StickyNotes.createNote({
    url: "https://example.com/docs#intro",
    title: "Docs",
    x: 10,
    y: 20,
  });

  assert.equal(note.url, "https://example.com/docs");
  assert.equal(note.title, "Docs");
  assert.equal(note.text, "");
  assert.equal(note.color, StickyNotes.COLORS[0]);
  assert.deepEqual([note.x, note.y], [10, 20]);
  assert.notEqual(note.id, StickyNotes.createNote({ url: note.url, title: "", x: 0, y: 0 }).id);
});

test("createNote bounds the page-controlled title", () => {
  const note = StickyNotes.createNote({ url: "https://example.com/", title: "x".repeat(5000), x: 0, y: 0 });
  assert.equal(note.title.length, 200);

  const clobbered = StickyNotes.createNote({ url: "https://example.com/", title: {}, x: 0, y: 0 });
  assert.equal(typeof clobbered.title, "string");
});

test("notesFromStorage ignores foreign keys and sorts oldest first", () => {
  const notes = StickyNotes.notesFromStorage({
    "note:b": { id: "b", createdAt: 2 },
    settings: { theme: "dark" },
    "note:a": { id: "a", createdAt: 1 },
  });

  assert.deepEqual(notes.map((note) => note.id), ["a", "b"]);
});

test("noteChanges maps storage changes to note ids", () => {
  const changes = StickyNotes.noteChanges({
    "note:a": { newValue: { id: "a", text: "hi" } },
    "note:b": { oldValue: { id: "b" } },
    settings: { newValue: {} },
  });

  assert.deepEqual(changes, [
    { id: "a", note: { id: "a", text: "hi" } },
    { id: "b", note: undefined },
  ]);
});

test("groupByPage puts the current page first, then the most recently noted", () => {
  const pages = StickyNotes.groupByPage(
    [
      { id: "a", url: "https://a.test/", title: "A", createdAt: 1 },
      { id: "b", url: "https://b.test/", title: "B", createdAt: 2 },
      { id: "c", url: "https://c.test/", title: "C", createdAt: 3 },
      { id: "d", url: "https://a.test/", title: "A renamed", createdAt: 4 },
    ],
    "https://b.test/",
  );

  assert.deepEqual(
    pages.map((page) => [page.url, page.title, page.notes.map((note) => note.id)]),
    [
      ["https://b.test/", "B", ["b"]],
      ["https://a.test/", "A renamed", ["a", "d"]],
      ["https://c.test/", "C", ["c"]],
    ],
  );
});

test("groupByPage merges a legacy tracked URL into its page", () => {
  const pages = StickyNotes.groupByPage(
    [
      { id: "a", url: "https://a.test/?utm_source=x", title: "A", createdAt: 1 },
      { id: "b", url: "https://b.test/", title: "B", createdAt: 4 },
      { id: "c", url: "https://a.test/", title: "A", createdAt: 3 },
    ],
    "https://a.test/",
  );

  assert.deepEqual(
    pages.map((page) => [page.url, page.notes.map((note) => note.id)]),
    [
      ["https://a.test/", ["a", "c"]],
      ["https://b.test/", ["b"]],
    ],
  );
});

test("clampPosition keeps a note inside the viewport", () => {
  const size = { width: 240, height: 120 };
  const viewport = { width: 1000, height: 600 };

  assert.deepEqual(StickyNotes.clampPosition({ x: 300, y: 200 }, size, viewport), { x: 300, y: 200 });
  assert.deepEqual(StickyNotes.clampPosition({ x: -50, y: -50 }, size, viewport), { x: 8, y: 8 });
  assert.deepEqual(StickyNotes.clampPosition({ x: 2000, y: 2000 }, size, viewport), { x: 752, y: 472 });
});

test("clampPosition pins to the top-left edge when the viewport is smaller than the note", () => {
  const position = StickyNotes.clampPosition(
    { x: 100, y: 100 },
    { width: 240, height: 120 },
    { width: 200, height: 100 },
  );

  assert.deepEqual(position, { x: 8, y: 8 });
});

test("badgeText shows the count, blank for none, capped at 99+", () => {
  assert.equal(StickyNotes.badgeText(0), "");
  assert.equal(StickyNotes.badgeText(3), "3");
  assert.equal(StickyNotes.badgeText(99), "99");
  assert.equal(StickyNotes.badgeText(100), "99+");
  for (const invalid of [-1, 1.5, "3", undefined]) assert.equal(StickyNotes.badgeText(invalid), "");
});
