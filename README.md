# ChromeStickyNotes

Stick a note on any web page and find it there when you come back.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.

There is no build step. Chrome 123 or newer is required.

## Use

- Press `Alt+Shift+N` (`⌥⇧N` on macOS), or click the toolbar icon and then **New note**, to stick a note on the current page.
- Type in it. Drag it by its top edge. Hover it to change its color or delete it.
- The note stays on that page and shows up again on your next visit.
- The toolbar popup lists every note, grouped by page, with a link back to each page.

A page is identified by its URL without the `#fragment`, so `/watch?v=a` and `/watch?v=b` hold separate notes.

Notes are stored in `chrome.storage.local`. They stay on this machine and are never sent anywhere.

A note lives in the DOM of the page it is stuck on, so that page's scripts can read it (through `window.find`, or by watching keystrokes). Don't put secrets in a note on a site you don't trust.

## Develop

```sh
npm test
```

| Path | What it holds |
| --- | --- |
| `lib/notes.js` | Note model and storage, shared by every context |
| `lib/ui.js` | DOM helpers and styles shared by the page and the popup |
| `lib/tabs.js` | Asking a tab to add a note, injecting the content script if it is missing |
| `content/` | The notes rendered on web pages, inside a closed shadow root |
| `popup/` | The toolbar popup |
| `background.js` | The keyboard shortcut |

After changing code, press the reload button on the extension's card in `chrome://extensions`.
