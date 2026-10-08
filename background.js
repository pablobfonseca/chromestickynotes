importScripts("lib/notes.js", "lib/tabs.js");

// Content scripts run in the page's renderer; a restricted area refuses them and sends them no storage.onChanged, so they go through the broker below.
chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

function trusted(sender) {
  return sender.tab?.id !== undefined && sender.frameId === 0 && /^https?:\/\//.test(sender.origin ?? "");
}

// The sender's url is frozen at injection and goes stale after same-document navigation; its origin does not.
async function ownsNote(sender, id) {
  const stored = await StickyNotes.loadNote(id);
  return !stored || StickyNotes.sameOrigin(stored.url, sender.origin);
}

const broker = {
  async "get-notes"({ url }, sender) {
    if (typeof url !== "string" || !StickyNotes.sameOrigin(url, sender.origin)) return { ok: false };
    const items = await chrome.storage.local.get(null);
    return { ok: true, notes: StickyNotes.notesForPage(items, StickyNotes.pageKey(url)) };
  },
  async "save-note"({ note }, sender) {
    const valid = StickyNotes.validNote(note);
    if (!valid || !StickyNotes.sameOrigin(valid.url, sender.origin) || !(await ownsNote(sender, valid.id))) {
      return { ok: false };
    }
    await StickyNotes.saveNote(valid);
    return { ok: true };
  },
  async "delete-note"({ id }, sender) {
    if (typeof id !== "string" || !(await ownsNote(sender, id))) return { ok: false };
    await StickyNotes.deleteNote(id);
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!Object.hasOwn(broker, message?.type) || !trusted(sender)) return;
  broker[message.type](message, sender).then(sendResponse, () => sendResponse({ ok: false }));
  return true;
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || StickyNotes.noteChanges(changes).length === 0) return;
  for (const { id } of await chrome.tabs.query({})) {
    chrome.tabs.sendMessage(id, { type: "notes-changed" }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "add-note" && tab?.id) addNoteToTab(tab.id);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "note-count" || !sender.tab?.id) return;
  chrome.action.setBadgeText({ tabId: sender.tab.id, text: StickyNotes.badgeText(message.count) });
});
