async function addNoteToTab(tabId) {
  const requestNote = async () => (await chrome.tabs.sendMessage(tabId, { type: "add-note" })).ok;
  try {
    return await requestNote();
  } catch {
    // Tabs opened before the extension was installed or updated have no live content script.
  }
  try {
    const [{ js }] = chrome.runtime.getManifest().content_scripts;
    await chrome.scripting.executeScript({ target: { tabId }, files: js });
    return await requestNote();
  } catch {
    return false;
  }
}
