// Redirect legacy Completed Archive bookmarks to the unified Aurora Companion SPA
(function () {
  "use strict";
  try {
    localStorage.setItem("indigo_redirect_view", "completed");
    localStorage.setItem("aurora_redirect_view", "completed");
  } catch (_) {}
  window.location.replace("index.html#plan:completed");
})();
