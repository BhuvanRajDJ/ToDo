(function () {
  "use strict";

  const openBtn = document.getElementById("open_side_panel_btn");
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      try {
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }, () => {});
        }
      } catch (_) {}
      window.location.href = "index.html";
    });
  }
})();
