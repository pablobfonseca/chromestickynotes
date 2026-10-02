const pagesEl = document.getElementById("pages");
const emptyEl = document.getElementById("empty");
const statusEl = document.getElementById("status");
const shortcutEl = document.getElementById("shortcut");
let entering = true;

adoptStyles(document, SHARED_CSS);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function noteItem(note) {
  return h(
    "li",
    { className: "note", dataset: { color: note.color } },
    h("p", { className: note.text ? "" : "blank", textContent: note.text || "Empty note" }),
    deleteButton(
      () => StickyNotes.deleteNote(note.id),
      () => note.text.trim() !== "",
    ),
  );
}

function pageSection({ url, title, notes }, index, isCurrent) {
  const section = h(
    "section",
    { className: entering ? "page entering" : "page" },
    h(
      "a",
      { href: url, target: "_blank", rel: "noreferrer" },
      h("span", { className: "page-title", textContent: title || url }),
      h("span", { className: "page-host", textContent: isCurrent ? "This page" : new URL(url).hostname }),
    ),
    h("ul", {}, ...notes.map(noteItem)),
  );
  section.style.setProperty("--index", index);
  return section;
}

async function render() {
  const [notes, tab] = await Promise.all([StickyNotes.loadNotes(), activeTab()]);
  const currentUrl = tab?.url && StickyNotes.pageKey(tab.url);
  const pages = StickyNotes.groupByPage(notes, currentUrl);

  pagesEl.replaceChildren(...pages.map((page, index) => pageSection(page, index, page.url === currentUrl)));
  emptyEl.hidden = pages.length > 0;
  entering = false;
}

document.getElementById("add").addEventListener("click", async () => {
  const tab = await activeTab();
  if (tab?.id && (await addNoteToTab(tab.id))) window.close();
  else statusEl.hidden = false;
});

async function showShortcut() {
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find((command) => command.name === "add-note")?.shortcut;
  if (!shortcut) return;
  shortcutEl.textContent = shortcut;
  shortcutEl.hidden = false;
}

chrome.storage.onChanged.addListener(render);
showShortcut();
render();
