importScripts("lib/tabs.js");

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "add-note" && tab?.id) addNoteToTab(tab.id);
});
