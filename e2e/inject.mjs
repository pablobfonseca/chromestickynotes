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

assert.deepEqual(errors, []);
console.log("ok  no console or page errors");
await context.close();
server.close();
