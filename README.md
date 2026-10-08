# ChromeStickyNotes

Stick a note on any web page and find it there when you come back.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.

There is no build step. Chrome 140 or newer is required.

## Use

- Press `Alt+Shift+N` (`⌥⇧N` on macOS), or click the toolbar icon and then **New note**, to stick a note on the current page.
- Type in it. Drag it by its top edge. Hover it to change its color or delete it.
- The note stays on that page and shows up again on your next visit.
- If a note can't be saved (for example, the extension's storage is full), it says **Not saved** until a later save works. Copy its text before leaving the page.
- The toolbar icon shows how many notes the current page has.
- The toolbar popup lists every note, grouped by page, with a link back to each page.

A page is identified by its URL without the `#fragment` and tracking parameters (`utm_*`, `fbclid`, `gclid` and similar), so `/watch?v=a` and `/watch?v=b` hold separate notes.

Notes are stored in `chrome.storage.local`. They stay on this machine and are never sent anywhere. The script that runs on a web page cannot read that storage: it asks the extension's service worker, which hands a page only the notes on its own origin and accepts only notes for it.

A note lives in the DOM of the page it is stuck on, so that page's scripts can read it (through `window.find`, or by watching keystrokes). Don't put secrets in a note on a site you don't trust.

## Develop

```sh
npm test
```

The browser checks drive a real Chromium through Playwright. After `npm install`, download the browser once, then run them:

```sh
npx playwright install chromium
npm run e2e
```

| Path | What it holds |
| --- | --- |
| `lib/notes.js` | Note model, validation and storage, shared by every context |
| `lib/ui.js` | DOM helpers and styles shared by the page and the popup |
| `lib/tabs.js` | Asking a tab to add a note, injecting the content script if it is missing |
| `content/` | The notes rendered on web pages, inside a closed shadow root |
| `popup/` | The toolbar popup |
| `background.js` | The keyboard shortcut, the toolbar badge and the storage broker |

After changing code, press the reload button on the extension's card in `chrome://extensions`.
