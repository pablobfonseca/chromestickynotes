// Exercises addNoteToTab's fallback injection. activeTab cannot be granted from automation,
// so this runs against a copy of the extension whose manifest also has host_permissions.
import { chromium } from "playwright";
import http from "node:http";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SHOTS = path.join(ROOT, "e2e", "screenshots");
mkdirSync(SHOTS, { recursive: true });
const extension = mkdtempSync(path.join(tmpdir(), "sticky-ext-"));
cpSync(ROOT, extension, {
  recursive: true,
  filter: (source) => !/\/(\.git|node_modules)(\/|$)/.test(source),
});
const manifestPath = path.join(extension, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
writeFileSync(manifestPath, JSON.stringify({ ...manifest, host_permissions: ["<all_urls>"] }));

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<!doctype html><title>Fixture</title><h1>Fixture</h1>");
});
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;

const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "sticky-")), {
  channel: "chromium",
  headless: true,
  viewport: { width: 1000, height: 700 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
let sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
const errors = [];
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));

const store = async () => Object.values(await sw.evaluate(() => chrome.storage.local.get(null)));
const addNote = () =>
  sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return addNoteToTab(tab.id);
  });
const hosts = () => page.evaluate(() => document.querySelectorAll("[data-sticky-notes-host]").length);
const settle = () => page.waitForTimeout(300);

await page.goto(`${base}/`);
await settle();
assert.equal(await addNote(), true);
await settle();
await page.keyboard.type("Written before the reload");
await settle();

// Same isolated world, scripts injected a second time: must stay a single instance.
await sw.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const [{ js }] = chrome.runtime.getManifest().content_scripts;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: js });
});
assert.equal(await addNote(), true);
await settle();
assert.equal((await store()).length, 2);
assert.equal(await hosts(), 1);
console.log("ok  re-injection into a live page stays a single instance");

// Disabling and re-enabling the extension orphans the content script; the next add must inject a fresh one.
// The restarted service worker stays asleep until an event wakes it, so drive this from an extension page.
const extensionId = new URL(sw.url()).host;
const manager = await context.newPage();
await manager.goto("chrome://extensions");
const toggle = manager.locator(`extensions-item#${extensionId} cr-toggle#enableToggle`);
await toggle.click();
await manager.waitForTimeout(800);
await toggle.click();
await manager.waitForTimeout(800);
const extensionPage = await context.newPage();
await extensionPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
const added = await extensionPage.evaluate(async (base) => {
  const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url?.startsWith(base));
  return addNoteToTab(tab.id);
}, base);
assert.equal(added, true);
await page.bringToFront();
await settle();
await page.keyboard.type("Written after the reload");
await settle();
const notes = Object.values(await extensionPage.evaluate(() => chrome.storage.local.get(null)));
assert.equal(notes.length, 3);
assert.deepEqual(notes.map((note) => note.text).sort(), ["", "Written after the reload", "Written before the reload"]);
assert.equal(await hosts(), 1);
await page.screenshot({ path: `${SHOTS}/11-after-reload.png` });
console.log("ok  orphaned page gets a fresh script, stale UI replaced");

// A content script runs in the page's renderer: storage must refuse it, and the worker must hand it only its own origin's notes.
const pageTabId = await extensionPage.evaluate(
  async (base) => (await chrome.tabs.query({})).find((tab) => tab.url?.startsWith(base)).id,
  base,
);
const direct = await extensionPage.evaluate(async (tabId) => {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => chrome.storage.local.get(null).then(() => "readable", (error) => error.message),
  });
  return result;
}, pageTabId);
assert.equal(direct, "Access to storage is not allowed from this context.");
console.log("ok  content script cannot reach storage directly");

const FOREIGN = "11111111-1111-4111-8111-111111111111";
const foreignNote = { id: FOREIGN, url: "https://other.test/", title: "Other", text: "foreign", color: "yellow", x: 0, y: 0, createdAt: 1 };
await extensionPage.evaluate((note) => chrome.storage.local.set({ [`note:${note.id}`]: note }), foreignNote);
const brokered = await extensionPage.evaluate(async ([tabId, foreign]) => {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [foreign],
    func: async (foreign) => {
      const ask = (message) => chrome.runtime.sendMessage(message);
      const note = { url: location.href, title: "", text: "forged", color: "pink", x: 0, y: 0, createdAt: 1 };
      const own = await ask({ type: "get-notes", url: location.href });
      return {
        ownUrls: own.notes.map((entry) => entry.url),
        other: await ask({ type: "get-notes", url: "https://other.test/" }),
        steal: await ask({ type: "save-note", note: { ...note, id: foreign } }),
        plant: await ask({ type: "save-note", note: { ...note, id: "22222222-2222-4222-8222-222222222222", url: "https://other.test/" } }),
        move: await ask({ type: "move-note", id: foreign, x: 5, y: 5 }),
      };
    },
  });
  return result;
}, [pageTabId, FOREIGN]);
assert.deepEqual(brokered, {
  ownUrls: [`${base}/`, `${base}/`, `${base}/`],
  other: { ok: false },
  steal: { ok: false },
  plant: { ok: false },
  move: { ok: false },
});
const stored = await extensionPage.evaluate(() => chrome.storage.local.get(null));
assert.equal(Object.keys(stored).length, 4);
assert.deepEqual(stored[`note:${FOREIGN}`], foreignNote);
await extensionPage.evaluate((id) => chrome.storage.local.remove(`note:${id}`), FOREIGN);
console.log("ok  worker hands a content script only its origin's notes");

// The content script's http(s) guard: an about:blank tab accepts the injection (so Chrome is not the one
// refusing) but must answer the message with ok: false and keep the note out of storage.
// The extension cannot see this tab's url, so the tab is found by what a script sees there.
const opener = await context.newPage();
await opener.goto(`${base}/`);
await Promise.all([context.waitForEvent("page"), opener.evaluate(() => window.open("about:blank"))]);
const noteCount = () => extensionPage.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).length);
const before = await noteCount();
const probe = await extensionPage.evaluate(async () => {
  for (const tab of await chrome.tabs.query({})) {
    const [injection] = await chrome.scripting
      .executeScript({ target: { tabId: tab.id }, func: () => location.protocol })
      .catch(() => []);
    if (injection?.result === "about:") return { protocol: injection.result, added: await addNoteToTab(tab.id) };
  }
});
assert.deepEqual(probe, { protocol: "about:", added: false });
assert.equal(await noteCount(), before);
console.log("ok  non-http tab refuses a note");

assert.deepEqual(errors, []);
console.log("ok  no console or page errors");
await context.close();
server.close();
