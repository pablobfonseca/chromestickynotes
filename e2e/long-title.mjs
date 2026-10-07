import { chromium } from "playwright";
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
const widths = await popup.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  body: document.body.offsetWidth,
  pages: [...document.querySelectorAll(".page")].map((page) => page.offsetWidth),
}));
console.log(JSON.stringify(widths));
await popup.screenshot({ path: `${SHOTS}/12-long-title.png` });
await context.close();
process.exit(widths.scrollWidth === 360 && widths.pages.every((width) => width === 328) ? 0 : 1);
