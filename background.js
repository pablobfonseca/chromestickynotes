importScripts("lib/notes.js", "lib/tabs.js");

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "add-note" && tab?.id) addNoteToTab(tab.id);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "note-count" || !sender.tab?.id) return;
  chrome.action.setBadgeText({ tabId: sender.tab.id, text: StickyNotes.badgeText(message.count) });
});
