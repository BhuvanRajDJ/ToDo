/**
 * Aurora Companion - Background Service Worker (Manifest V3)
 * Handles side panel behavior, extension action click, and inter-context messages.
 */

// Enable opening side panel on action click
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.warn("Aurora Companion: Could not set panel behavior:", err);
  });
}

// Fallback click listener if setPanelBehavior is not supported
if (chrome.action?.onClicked && !chrome.sidePanel?.setPanelBehavior) {
  chrome.action.onClicked.addListener(async (tab) => {
    try {
      if (chrome.sidePanel?.open && tab?.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch (error) {
      console.error("Aurora Companion: Error opening side panel on click:", error);
    }
  });
}

// Handle cross-context messages (e.g. from side panel requesting a full browser tab)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_FULL_TAB") {
    (async () => {
      try {
        const fullTabUrl = chrome.runtime.getURL("index.html");
        const tab = await chrome.tabs.create({ url: fullTabUrl });
        sendResponse({ success: true, tabId: tab.id });
      } catch (error) {
        console.error("Aurora Companion: Failed to create full tab:", error);
        sendResponse({ success: false, error: String(error) });
      }
    })();
    return true; // Keep message channel open for async response
  }
});
