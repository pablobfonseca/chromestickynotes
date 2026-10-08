import { chromium } from "playwright";
import http from "node:http";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SHOTS = path.join(ROOT, "e2e", "screenshots");
mkdirSync(SHOTS, { recursive: true });

const server = http.createServer((req, res) => {
  const name = req.url.split("?")[0];
  const headers = { "content-type": "text/html" };
  if (name === "/csp") headers["content-security-policy"] = "default-src 'none'; require-trusted-types-for 'script'";
  res.writeHead(200, headers);
  const style = (css) => (name === "/csp" ? "" : `style="${css}"`);
  res.end(`<!doctype html><title>Page ${name}</title>
    <body ${style("margin:0;background:#fff;font:16px system-ui")}>
    <h1 ${style("margin:40px")}>Page ${name}</h1><p ${style("margin:40px;height:2000px")}>Lorem ipsum</p>
    ${name === "/csp" ? "" : `<script>window.__keys=[];document.addEventListener("keydown",e=>__keys.push(e.key),true)</script>`}`);
});
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;

const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "sticky-")), {
  channel: "chromium",
  headless: true,
  viewport: { width: 1000, height: 700 },
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
});
const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
const extensionId = new URL(sw.url()).host;
const errors = [];
const watch = (page) => {
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
};

const store = async () => Object.values(await sw.evaluate(() => chrome.storage.local.get(null)));
const addNote = async (page) => {
  await page.bringToFront();
  return sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return addNoteToTab(tab.id);
  });
};
const hostAt = (page, x, y) =>
  page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.hasAttribute("data-sticky-notes-host") ?? false, [x, y]);
const noteFrame = (page, id) => page.frames().find((frame) => frame.url().includes(`id=${id}`));
const hasHost = (page) => page.evaluate(() => !!document.querySelector("[data-sticky-notes-host]"));
const settle = (page) => page.waitForTimeout(250);
const step = (name) => console.log(`ok  ${name}`);

const page = await context.newPage();
watch(page);
await page.goto(`${base}/a`);
await settle(page);
assert.equal(await hasHost(page), false);
step("page without notes is left untouched");

assert.equal(await addNote(page), true);
await settle(page);
await page.keyboard.type("Buy milk\nand reply to the PR");
await settle(page);
let [note] = await store();
assert.equal(note.text, "Buy milk\nand reply to the PR");
assert.equal(note.url, `${base}/a`);
assert.equal(note.title, "Page /a");
assert.deepEqual([note.x, note.y], [736, 24]);
assert.deepEqual(await page.evaluate(() => window.__keys), []);
await page.screenshot({ path: `${SHOTS}/1-added.png` });
step("add note, type, persisted; page saw no keydown events");
await page.mouse.click(100, 400);
assert.equal(await page.evaluate(() => window.find("Buy milk")), false);
assert.equal(await page.evaluate(() => document.documentElement.innerText.includes("Buy milk")), false);
assert.equal(
  page.frames().some((frame) => frame.url().startsWith("chrome-extension://")),
  true,
  "note renders in an extension frame",
);
step("page cannot find note text; note lives in an extension frame");

await page.mouse.move(note.x + 170, note.y + 17);
await page.mouse.down();
await page.mouse.move(500, 300, { steps: 8 });
await page.screenshot({ path: `${SHOTS}/2-dragging.png` });
await page.mouse.up();
await settle(page);
[note] = await store();
assert.deepEqual([note.x, note.y], [330, 283]);
step("drag moves and saves position");

await page.mouse.move(-3000, -3000);
await page.mouse.move(note.x + 170, note.y + 17);
await page.mouse.down();
await page.mouse.move(-500, 5000, { steps: 4 });
await page.mouse.up();
await settle(page);
[note] = await store();
assert.equal(note.x, 8);
assert.ok(note.y > 500 && note.y < 700 - 8, `clamped y, got ${note.y}`);
step("drag is clamped to the viewport");

await page.mouse.move(note.x + 170, note.y + 17);
await page.mouse.down();
await page.mouse.move(500, 300, { steps: 4 });
await page.mouse.up();
[note] = await store();

await page.mouse.click(note.x + 6 + 22 + 11, note.y + 17);
await settle(page);
[note] = await store();
assert.equal(note.color, "pink");
step("swatch changes color");

await page.reload();
await settle(page);
assert.equal(await hostAt(page, note.x + 120, note.y + 60), true);
await page.screenshot({ path: `${SHOTS}/3-reloaded.png` });
step("note is back after reload");

await page.goto(`${base}/b`);
await settle(page);
assert.equal(await hasHost(page), false);
await page.evaluate(() => history.pushState({}, "", "/a"));
await settle(page);
assert.equal(await hostAt(page, note.x + 120, note.y + 60), true);
await page.evaluate(() => history.pushState({}, "", "/b#section"));
await settle(page);
assert.equal(await hostAt(page, note.x + 120, note.y + 60), false);
step("other page has no notes; SPA navigation shows and hides them");

const csp = await context.newPage();
watch(csp);
await csp.goto(`${base}/csp`);
await settle(csp);
assert.equal(await addNote(csp), true);
await settle(csp);
await csp.keyboard.type("Works under a strict CSP");
assert.equal(await addNote(csp), true);
await settle(csp);
await csp.keyboard.type("Second note cascades");
await settle(csp);
await csp.screenshot({ path: `${SHOTS}/4-csp.png` });
assert.equal((await store()).length, 3);
step("strict CSP + Trusted Types page renders styled notes");

const twin = await context.newPage();
watch(twin);
await twin.goto(`${base}/csp`);
await settle(twin);
await csp.bringToFront();
await csp.keyboard.type(", synced live");
await settle(twin);
await twin.screenshot({ path: `${SHOTS}/5-twin.png` });
step("second tab on the same page (see 5-twin.png)");

const popup = await context.newPage();
watch(popup);
await popup.setViewportSize({ width: 360, height: 520 });
await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
await popup.waitForSelector(".page");
assert.deepEqual(await popup.locator(".page-title").allTextContents(), ["Page /csp", "Page /a"]);
assert.deepEqual(await popup.locator(".page a").evaluateAll((links) => links.map((a) => a.href)), [`${base}/csp`, `${base}/a`]);
assert.equal(await popup.locator("#empty").isHidden(), true);
console.log("    shortcut hint:", JSON.stringify(await popup.locator("#shortcut").textContent()));
await popup.waitForTimeout(700);
await popup.screenshot({ path: `${SHOTS}/6-popup-light.png` });
await popup.emulateMedia({ colorScheme: "dark" });
await popup.screenshot({ path: `${SHOTS}/7-popup-dark.png` });
await popup.emulateMedia({ colorScheme: "light" });
step("popup lists notes grouped by page, newest page first");

const firstDelete = popup.locator(".page").nth(1).locator(".delete");
await popup.locator(".page").nth(1).locator(".note").hover();
await firstDelete.click();
assert.equal(await firstDelete.getAttribute("aria-label"), "Confirm delete");
assert.equal((await store()).length, 3);
await popup.screenshot({ path: `${SHOTS}/8-popup-armed.png` });
await firstDelete.click();
await settle(popup);
assert.equal((await store()).length, 2);
assert.deepEqual(await popup.locator(".page-title").allTextContents(), ["Page /csp"]);
step("popup delete asks once, then deletes");

await popup.locator("#add").click();
await settle(popup);
assert.equal(await popup.locator("#status").isVisible(), true);
step("popup reports pages that cannot hold notes");

await csp.bringToFront();
// Headless Chromium misroutes clicks into note frames once their tab has been in the background; real Chrome does not.
await csp.reload();
await settle(csp);
let notes = (await store()).sort((a, b) => a.createdAt - b.createdAt);
const target = notes[0];
const targetDelete = noteFrame(csp, target.id).locator(".delete");
await targetDelete.click();
await settle(csp);
assert.equal(await targetDelete.getAttribute("aria-label"), "Confirm delete");
assert.equal((await store()).length, 2);
await csp.screenshot({ path: `${SHOTS}/9-armed.png` });
await targetDelete.click();
await settle(csp);
notes = await store();
assert.deepEqual(notes.map((n) => n.id), [notes[0].id]);
assert.notEqual(notes[0].id, target.id);
step("on-page delete asks once, then deletes");

assert.equal(await addNote(csp), true);
await settle(csp);
const blank = (await store()).find((n) => n.text === "");
await noteFrame(csp, blank.id).locator(".delete").click();
await settle(csp);
assert.equal((await store()).some((n) => n.id === blank.id), false);
step("empty note deletes without confirmation");

await popup.bringToFront();
await popup.locator(".note").hover();
await popup.locator(".delete").click();
await popup.locator(".delete").click();
await settle(popup);
assert.equal(await popup.locator("#empty").isVisible(), true);
await popup.screenshot({ path: `${SHOTS}/10-popup-empty.png` });
step("popup empty state");

const full = await context.newPage();
watch(full);
await full.goto(`${base}/full`);
await settle(full);
const freeBytes = await sw.evaluate(async () => {
  const { QUOTA_BYTES } = chrome.storage.local;
  const used = await chrome.storage.local.getBytesInUse(null);
  await chrome.storage.local.set({ filler: "x".repeat(QUOTA_BYTES - used - 64) });
  return QUOTA_BYTES - (await chrome.storage.local.getBytesInUse(null));
});
assert.ok(freeBytes < 100, `storage should be nearly full, ${freeBytes} bytes free`);
const cdp = await context.newCDPSession(full);
const showsUnsaved = async () => {
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  return nodes.some((node) => String(node.name?.value ?? "").includes("Not saved."));
};
const storedNotes = async () => (await store()).filter((item) => typeof item === "object");
assert.equal(await addNote(full), true);
await settle(full);
await full.keyboard.type("Kept after a failed save");
await settle(full);
assert.equal((await storedNotes()).length, 0);
assert.equal(await showsUnsaved(), true);
await full.screenshot({ path: `${SHOTS}/11-not-saved.png` });
await sw.evaluate(() => chrome.storage.local.remove("filler"));
await full.keyboard.type(", then saved");
await settle(full);
assert.deepEqual((await storedNotes()).map((n) => n.text), ["Kept after a failed save, then saved"]);
assert.equal(await showsUnsaved(), false);
step("failed save shows on the note and clears once a save succeeds");

assert.deepEqual(errors, []);
step("no console or page errors");

await context.close();
server.close();
