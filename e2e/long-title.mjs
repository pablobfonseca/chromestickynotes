import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SHOTS = path.join(ROOT, "e2e", "screenshots");
mkdirSync(SHOTS, { recursive: true });

const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "sticky-")), {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
});
const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
await sw.evaluate(() =>
  chrome.storage.local.set({
    "note:a": {
      id: "a",
      url: "https://claude.dev/blog/automating-eval-design",
      title: "Automating eval design and hillclimbing with Claude / claude.dev Blog",
      text: "Check this later",
      color: "yellow",
      x: 0,
      y: 0,
      createdAt: 1,
    },
    "note:b": {
      id: "b",
      url: "https://a-very-long-subdomain-name.example-of-a-long-hostname.com/",
      title: "Short",
      text: "averyveryveryverylongunbrokenwordthatcouldpushthelayoutwiderthanthepopup-averyveryverylongunbrokenword",
      color: "blue",
      x: 0,
      y: 0,
      createdAt: 2,
    },
  }),
);

const popup = await context.newPage();
await popup.setViewportSize({ width: 360, height: 420 });
await popup.goto(`chrome-extension://${new URL(sw.url()).host}/popup/popup.html`);
await popup.waitForSelector(".page");
await popup.waitForTimeout(700);
const measured = await popup.evaluate(() => {
  const root = document.documentElement;
  const bodyRect = document.body.getBoundingClientRect();
  const bodyStyle = getComputedStyle(document.body);
  return {
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    contentLeft: bodyRect.left + parseFloat(bodyStyle.paddingLeft),
    contentRight: bodyRect.right - parseFloat(bodyStyle.paddingRight),
    pages: [...document.querySelectorAll(".page")].map((page) => {
      const { left, right } = page.getBoundingClientRect();
      return { left, right };
    }),
  };
});
await popup.screenshot({ path: `${SHOTS}/12-long-title.png` });
await context.close();

assert.ok(measured.pages.length > 0, "popup rendered no .page elements");
assert.equal(
  measured.scrollWidth,
  measured.clientWidth,
  `popup scrolls horizontally: scrollWidth ${measured.scrollWidth} > clientWidth ${measured.clientWidth}`,
);
for (const [index, page] of measured.pages.entries()) {
  assert.ok(
    page.left >= measured.contentLeft && page.right <= measured.contentRight,
    `.page ${index} spans ${page.left}-${page.right}, outside the body content box ${measured.contentLeft}-${measured.contentRight}`,
  );
}
console.log("ok  long titles and hosts do not widen the popup");
