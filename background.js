/**
 * Aurora Companion - Background Service Worker (Manifest V3)
 * Handles side panel behavior, extension action click, and inter-context messages.
 */

// Register side panel behavior upon installation
chrome.runtime.onInstalled.addListener(async () => {
  try {
    // Open the side panel when the toolbar action icon is clicked
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      console.log("Aurora Companion: Side panel behavior set to openPanelOnActionClick.");
    }
  } catch (error) {
    console.error("Aurora Companion: Error setting side panel behavior:", error);
  }
});

// Fallback click listener in case setPanelBehavior is unavailable in certain environments
if (chrome.action?.onClicked) {
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
