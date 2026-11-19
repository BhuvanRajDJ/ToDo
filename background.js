/**
 * Aurora Companion - Background Service Worker (Manifest V3)
 *
 * Responsibilities (zero ephemeral global state — all state persisted in chrome.storage.local):
 * 1. Side Panel behavior (openPanelOnActionClick + fallback) & Full Tab launch
 * 2. Persistent Focus Timer engine (chrome.alarms + toolbar badge + chrome.notifications)
 * 3. Active Tab Capture (CAPTURE_ACTIVE_TAB)
 * 4. Context Menu ("Add to Aurora Today") with queued captures & immediate user confirmation
 */

const TIMER_STATE_KEY = "aurora_timer_state";
const TIMER_COMPLETIONS_KEY = "aurora_timer_completions";
const PENDING_CAPTURES_KEY = "aurora_pending_captures";

const ALARM_TIMER_COMPLETE = "aurora_timer_complete";
const ALARM_TIMER_BADGE = "aurora_timer_badge";
const ALARM_BADGE_RESTORE = "aurora_badge_restore";

const CONTEXT_MENU_ID = "aurora_add_to_today";
const NOTIF_TIMER_PREFIX = "aurora_timer_done_";
const NOTIF_CAPTURE_PREFIX = "aurora_capture_done_";

const DEFAULT_DURATIONS = {
  pomodoro: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
  stopwatch: 0
};

function createDefaultTimerState(mode = "pomodoro") {
  const validMode = Object.prototype.hasOwnProperty.call(DEFAULT_DURATIONS, mode) ? mode : "pomodoro";
  const dur = DEFAULT_DURATIONS[validMode];
  return {
    isRunning: false,
    type: validMode,
    duration: dur,
    totalDuration: dur,
    activeTaskId: null,
    activeTaskTitle: "",
    targetEndTime: null,
    stopwatchStartTime: null,
    completedSessions: 0,
    alarmActive: false,
    lastCompletedType: null,
    lastCompletedAt: null,
    updatedAt: Date.now()
  };
}

function getDefaultDurationForMode(mode) {
  return Object.prototype.hasOwnProperty.call(DEFAULT_DURATIONS, mode)
    ? DEFAULT_DURATIONS[mode]
    : DEFAULT_DURATIONS.pomodoro;
}

function normalizeTimerState(raw) {
  const base = createDefaultTimerState(raw?.type || "pomodoro");
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    type: Object.prototype.hasOwnProperty.call(DEFAULT_DURATIONS, raw.type) ? raw.type : "pomodoro",
    duration: typeof raw.duration === "number" && Number.isFinite(raw.duration) ? Math.max(0, Math.round(raw.duration)) : base.duration,
    totalDuration: typeof raw.totalDuration === "number" && Number.isFinite(raw.totalDuration) ? Math.max(0, Math.round(raw.totalDuration)) : base.totalDuration,
    completedSessions: typeof raw.completedSessions === "number" && Number.isFinite(raw.completedSessions) ? Math.max(0, Math.floor(raw.completedSessions)) : 0,
    isRunning: Boolean(raw.isRunning),
    alarmActive: Boolean(raw.alarmActive),
    activeTaskTitle: typeof raw.activeTaskTitle === "string" ? raw.activeTaskTitle : ""
  };
}

function computeLiveTimerState(state) {
  if (!state.isRunning) return state;
  const now = Date.now();
  if (state.type === "stopwatch") {
    const start = state.stopwatchStartTime || now;
    return {
      ...state,
      duration: Math.max(0, Math.floor((now - start) / 1000))
    };
  }
  const end = state.targetEndTime || now;
  return {
    ...state,
    duration: Math.max(0, Math.ceil((end - now) / 1000))
  };
}

async function readTimerState() {
  const res = await chrome.storage.local.get(TIMER_STATE_KEY);
  return normalizeTimerState(res[TIMER_STATE_KEY]);
}

async function writeTimerState(state) {
  const next = { ...normalizeTimerState(state), updatedAt: Date.now() };
  await chrome.storage.local.set({ [TIMER_STATE_KEY]: next });
  return next;
}

async function readTimerCompletions() {
  const res = await chrome.storage.local.get(TIMER_COMPLETIONS_KEY);
  return Array.isArray(res[TIMER_COMPLETIONS_KEY]) ? res[TIMER_COMPLETIONS_KEY] : [];
}

async function writeTimerCompletions(list) {
  await chrome.storage.local.set({ [TIMER_COMPLETIONS_KEY]: Array.isArray(list) ? list : [] });
}

async function readPendingCaptures() {
  const res = await chrome.storage.local.get(PENDING_CAPTURES_KEY);
  return Array.isArray(res[PENDING_CAPTURES_KEY]) ? res[PENDING_CAPTURES_KEY] : [];
}

async function writePendingCaptures(list) {
  await chrome.storage.local.set({ [PENDING_CAPTURES_KEY]: Array.isArray(list) ? list : [] });
}

async function broadcastToPanels(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (_) {
    // No open extension UI context is listening; chrome.storage.local remains source of truth.
  }
}

async function clearTimerAlarms() {
  try {
    await chrome.alarms.clear(ALARM_TIMER_COMPLETE);
    await chrome.alarms.clear(ALARM_TIMER_BADGE);
  } catch (err) {
    console.warn("Aurora Companion: Failed to clear timer alarms:", err);
  }
}

async function syncBadgeForTimer(state) {
  if (!chrome.action?.setBadgeText) return;
  try {
    const live = computeLiveTimerState(state);

    if (live.isRunning) {
      let badgeText = "";
      let badgeColor = "#6366f1";

      if (live.type === "stopwatch") {
        const mins = Math.floor(live.duration / 60);
        badgeText = mins < 100 ? `${mins}m` : "99+";
      } else {
        if (live.duration >= 60) {
          badgeText = `${Math.ceil(live.duration / 60)}m`;
        } else {
          badgeText = `${Math.max(1, live.duration)}s`;
        }
        if (live.type === "shortBreak" || live.type === "longBreak") {
          badgeColor = "#10b981";
        }
      }

      await chrome.action.setBadgeText({ text: badgeText });
      await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
      return;
    }

    if (live.alarmActive) {
      await chrome.action.setBadgeText({ text: "✓" });
      await chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
      return;
    }

    if (live.type !== "stopwatch" && live.duration > 0 && live.duration < live.totalDuration) {
      await chrome.action.setBadgeText({ text: "II" });
      await chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
      return;
    }

    await chrome.action.setBadgeText({ text: "" });
  } catch (err) {
    console.warn("Aurora Companion: Failed to update badge:", err);
  }
}

async function scheduleTimerAlarms(state) {
  await clearTimerAlarms();
  if (!state.isRunning) return;

  if (state.type !== "stopwatch" && state.targetEndTime) {
    await chrome.alarms.create(ALARM_TIMER_COMPLETE, { when: state.targetEndTime });
  }
  await chrome.alarms.create(ALARM_TIMER_BADGE, { periodInMinutes: 0.5 });
}

async function startTimerInBackground(payload = {}) {
  const current = await readTimerState();
  const mode = payload.mode && Object.prototype.hasOwnProperty.call(DEFAULT_DURATIONS, payload.mode)
    ? payload.mode
    : current.type;

  const modeChanged = mode !== current.type;
  let durationSec;
  if (typeof payload.durationSec === "number" && Number.isFinite(payload.durationSec) && payload.durationSec >= 0) {
    durationSec = Math.round(payload.durationSec);
  } else if (modeChanged) {
    durationSec = getDefaultDurationForMode(mode);
  } else if (mode !== "stopwatch" && current.duration <= 0) {
    durationSec = getDefaultDurationForMode(mode);
  } else {
    durationSec = current.duration;
  }

  let totalDuration;
  if (typeof payload.durationSec === "number" && Number.isFinite(payload.durationSec) && payload.durationSec >= 0) {
    totalDuration = Math.round(payload.durationSec);
  } else if (modeChanged || current.totalDuration < durationSec || (mode !== "stopwatch" && current.totalDuration <= 0)) {
    totalDuration = durationSec || getDefaultDurationForMode(mode);
  } else {
    totalDuration = current.totalDuration;
  }

  const activeTaskId = payload.taskId !== undefined ? payload.taskId : current.activeTaskId;
  const activeTaskTitle = payload.taskTitle !== undefined ? String(payload.taskTitle || "") : current.activeTaskTitle;

  const now = Date.now();
  const nextState = {
    ...current,
    isRunning: true,
    type: mode,
    duration: durationSec,
    totalDuration,
    activeTaskId,
    activeTaskTitle,
    targetEndTime: mode === "stopwatch" ? null : now + durationSec * 1000,
    stopwatchStartTime: mode === "stopwatch" ? now - durationSec * 1000 : null,
    alarmActive: false
  };

  const saved = await writeTimerState(nextState);
  await scheduleTimerAlarms(saved);
  await syncBadgeForTimer(saved);
  await broadcastToPanels({ type: "TIMER_STATE_UPDATED", state: computeLiveTimerState(saved) });
  return computeLiveTimerState(saved);
}

async function pauseTimerInBackground() {
  const current = await readTimerState();
  const live = computeLiveTimerState(current);
  const nextState = {
    ...live,
    isRunning: false,
    targetEndTime: null,
    stopwatchStartTime: null,
    alarmActive: false
  };

  await clearTimerAlarms();
  const saved = await writeTimerState(nextState);
  await syncBadgeForTimer(saved);
  await broadcastToPanels({ type: "TIMER_STATE_UPDATED", state: saved });
  return saved;
}

async function resumeTimerInBackground() {
  const current = await readTimerState();
  if (current.isRunning) {
    return computeLiveTimerState(current);
  }
  return startTimerInBackground({
    mode: current.type,
    durationSec: current.type === "stopwatch" ? current.duration : (current.duration > 0 ? current.duration : getDefaultDurationForMode(current.type)),
    taskId: current.activeTaskId,
    taskTitle: current.activeTaskTitle
  });
}

async function resetTimerInBackground(payload = {}) {
  const current = await readTimerState();
  const mode = payload.mode && Object.prototype.hasOwnProperty.call(DEFAULT_DURATIONS, payload.mode)
    ? payload.mode
    : current.type;
  const durationSec = typeof payload.durationSec === "number" && Number.isFinite(payload.durationSec) && payload.durationSec >= 0
    ? Math.round(payload.durationSec)
    : getDefaultDurationForMode(mode);
  const clearTask = payload.clearTask !== false;

  const nextState = {
    ...current,
    isRunning: false,
    type: mode,
    duration: durationSec,
    totalDuration: durationSec,
    activeTaskId: clearTask ? null : current.activeTaskId,
    activeTaskTitle: clearTask ? "" : current.activeTaskTitle,
    targetEndTime: null,
    stopwatchStartTime: null,
    alarmActive: false
  };

  await clearTimerAlarms();
  const saved = await writeTimerState(nextState);
  await syncBadgeForTimer(saved);
  await broadcastToPanels({ type: "TIMER_STATE_UPDATED", state: saved });
  return saved;
}

async function skipTimerInBackground(payload = {}) {
  const current = await readTimerState();
  const wasRunning = current.isRunning;
  const autoStart = payload.autoStart !== undefined ? Boolean(payload.autoStart) : true;

  const nextMode = current.type === "pomodoro" ? "shortBreak" : "pomodoro";
  const nextDuration = getDefaultDurationForMode(nextMode);
  const keepTask = nextMode === "pomodoro";

  await clearTimerAlarms();
  const resetState = await writeTimerState({
    ...current,
    isRunning: false,
    type: nextMode,
    duration: nextDuration,
    totalDuration: nextDuration,
    activeTaskId: keepTask ? current.activeTaskId : null,
    activeTaskTitle: keepTask ? current.activeTaskTitle : "",
    targetEndTime: null,
    stopwatchStartTime: null,
    alarmActive: false
  });

  if (wasRunning || autoStart) {
    return startTimerInBackground({
      mode: nextMode,
      durationSec: nextDuration,
      taskId: resetState.activeTaskId,
      taskTitle: resetState.activeTaskTitle
    });
  }

  await syncBadgeForTimer(resetState);
  await broadcastToPanels({ type: "TIMER_STATE_UPDATED", state: resetState });
  return resetState;
}

async function dismissAlarmInBackground() {
  const current = await readTimerState();
  const saved = await writeTimerState({
    ...current,
    alarmActive: false
  });
  await syncBadgeForTimer(saved);
  await broadcastToPanels({ type: "TIMER_STATE_UPDATED", state: saved });
  return saved;
}

async function completeTimerInBackground() {
  const current = await readTimerState();
  if (!current.isRunning || current.type === "stopwatch") {
    return { state: current, completedEvent: null };
  }

  const now = Date.now();
  if (current.targetEndTime && now < current.targetEndTime - 1500) {
    // Alarm fired slightly early; reschedule cleanly.
    await chrome.alarms.create(ALARM_TIMER_COMPLETE, { when: current.targetEndTime });
    return { state: computeLiveTimerState(current), completedEvent: null };
  }

  await clearTimerAlarms();

  const completedType = current.type;
  const completedAt = new Date(now).toISOString();
  let completedSessions = current.completedSessions || 0;
  let completedEvent = null;

  if (completedType === "pomodoro") {
    const minutes = Math.max(1, Math.round((current.totalDuration || DEFAULT_DURATIONS.pomodoro) / 60));
    completedEvent = {
      id: `tc_${now}_${Math.random().toString(36).slice(2, 6)}`,
      taskId: current.activeTaskId || "general_focus",
      minutes,
      type: "pomodoro",
      completedAt
    };

    const completions = await readTimerCompletions();
    completions.push(completedEvent);
    await writeTimerCompletions(completions);
    completedSessions += 1;
  }

  let nextType = "pomodoro";
  if (completedType === "pomodoro") {
    if (completedSessions >= 4) {
      nextType = "longBreak";
      completedSessions = 0;
    } else {
      nextType = "shortBreak";
    }
  }

  const nextDuration = getDefaultDurationForMode(nextType);
  const saved = await writeTimerState({
    ...current,
    isRunning: false,
    type: nextType,
    duration: nextDuration,
    totalDuration: nextDuration,
    activeTaskId: null,
    activeTaskTitle: "",
    targetEndTime: null,
    stopwatchStartTime: null,
    completedSessions,
    alarmActive: true,
    lastCompletedType: completedType,
    lastCompletedAt: completedAt
  });

  await syncBadgeForTimer(saved);

  // Fire native extension notification with real icon file and quick action buttons
  try {
    if (chrome.notifications?.create) {
      const notifTitle = completedType === "pomodoro" ? "Focus Session Complete" : "Break Complete";
      const nextLabel = nextType === "pomodoro"
        ? "Start Focus"
        : (nextType === "longBreak" ? "Start Long Break" : "Start Short Break");
      const taskNote = current.activeTaskTitle ? ` (${current.activeTaskTitle})` : "";
      const notifMsg = completedType === "pomodoro"
        ? `Session logged${taskNote}. Time for a mindful break.`
        : "Recharge complete. Ready to lock into your next block?";

      await new Promise((resolve) => {
        chrome.notifications.create(
          `${NOTIF_TIMER_PREFIX}${now}`,
          {
            type: "basic",
            iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
            title: notifTitle,
            message: notifMsg,
            buttons: [{ title: nextLabel }, { title: "Dismiss" }],
            priority: 2
          },
          () => {
            void chrome.runtime.lastError;
            resolve();
          }
        );
      });
    }
  } catch (err) {
    console.warn("Aurora Companion: Notification failed:", err);
  }

  await broadcastToPanels({
    type: "TIMER_STATE_UPDATED",
    state: saved,
    completedEvent
  });

  return { state: saved, completedEvent };
}

async function getHydratedTimerState() {
  const current = await readTimerState();
  if (current.isRunning && current.type !== "stopwatch" && current.targetEndTime && Date.now() >= current.targetEndTime) {
    await completeTimerInBackground();
  }
  const fresh = await readTimerState();
  const completions = await readTimerCompletions();
  return { state: computeLiveTimerState(fresh), completions };
}

async function captureActiveTab() {
  const extensionOrigin = chrome.runtime.getURL("");
  const pickBestTab = (tabs) => {
    if (!Array.isArray(tabs) || tabs.length === 0) return null;
    return tabs.find((t) => t && t.url && !t.url.startsWith(extensionOrigin)) || null;
  };

  let tab = null;
  try {
    const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = pickBestTab(currentTabs);

    if (!tab) {
      const focusedTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tab = pickBestTab(focusedTabs);
    }

    if (!tab) {
      const allActiveTabs = await chrome.tabs.query({ active: true });
      tab = pickBestTab(allActiveTabs);
    }
  } catch (err) {
    return { success: false, error: `Could not read active tab: ${err.message || String(err)}` };
  }

  if (!tab) {
    return { success: false, error: "Switch to a webpage tab to capture it as a task." };
  }

  return {
    success: true,
    tab: {
      title: (tab.title || tab.url || "Untitled Page").trim(),
      url: tab.url || "",
      favIconUrl: tab.favIconUrl || ""
    }
  };
}

async function setupSidePanelBehavior() {
  try {
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch (err) {
    console.warn("Aurora Companion: Could not set side panel behavior:", err);
  }
}

async function registerContextMenu() {
  if (!chrome.contextMenus) return;
  try {
    await new Promise((resolve) => {
      chrome.contextMenus.removeAll(() => {
        void chrome.runtime.lastError;
        resolve();
      });
    });

    await new Promise((resolve) => {
      chrome.contextMenus.create(
        {
          id: CONTEXT_MENU_ID,
          title: "Add to Aurora Today",
          contexts: ["page", "selection", "link"]
        },
        () => {
          void chrome.runtime.lastError;
          resolve();
        }
      );
    });
  } catch (err) {
    console.warn("Aurora Companion: Context menu setup error:", err);
  }
}

async function restoreRuntimeState() {
  await setupSidePanelBehavior();
  const { state } = await getHydratedTimerState();
  if (state.isRunning) {
    await scheduleTimerAlarms(state);
  }
  await syncBadgeForTimer(state);
}

// ---------------------------------------------------------------------------
// Top-level MV3 Event Listeners (synchronous registration required)
// ---------------------------------------------------------------------------

// Ensure side panel opens on action click on initial SW boot
void setupSidePanelBehavior();

// Fallback click listener only if setPanelBehavior is unavailable
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

chrome.runtime.onInstalled.addListener(() => {
  (async () => {
    await registerContextMenu();
    await restoreRuntimeState();
  })();
});

chrome.runtime.onStartup.addListener(() => {
  (async () => {
    await registerContextMenu();
    await restoreRuntimeState();
  })();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  (async () => {
    try {
      if (alarm.name === ALARM_TIMER_COMPLETE) {
        await completeTimerInBackground();
      } else if (alarm.name === ALARM_TIMER_BADGE) {
        const current = await readTimerState();
        if (!current.isRunning) {
          await chrome.alarms.clear(ALARM_TIMER_BADGE);
        } else if (current.type !== "stopwatch" && current.targetEndTime && Date.now() >= current.targetEndTime) {
          await completeTimerInBackground();
          return;
        }
        await syncBadgeForTimer(current);
      } else if (alarm.name === ALARM_BADGE_RESTORE) {
        const current = await readTimerState();
        await syncBadgeForTimer(current);
      }
    } catch (err) {
      console.error("Aurora Companion: Alarm handler error:", err);
    }
  })();
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;

  (async () => {
    try {
      const selectedText = typeof info.selectionText === "string" ? info.selectionText.trim() : "";
      const targetUrl = info.linkUrl || info.pageUrl || tab?.url || "";
      const rawTitle = selectedText || tab?.title || targetUrl || "Captured Web Item";
      const title = rawTitle.length > 180 ? `${rawTitle.slice(0, 177)}...` : rawTitle;
      const description = selectedText && tab?.title
        ? `From: ${tab.title}`
        : "";

      const captureItem = {
        id: `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        url: targetUrl,
        description,
        createdAt: new Date().toISOString(),
        source: "context_menu"
      };

      const queue = await readPendingCaptures();
      queue.push(captureItem);
      await writePendingCaptures(queue);

      // Immediate user feedback: badge flash + confirmation notification
      if (chrome.action?.setBadgeText) {
        await chrome.action.setBadgeText({ text: "+1" });
        await chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
        await chrome.alarms.create(ALARM_BADGE_RESTORE, { when: Date.now() + 3000 });
      }

      if (chrome.notifications?.create) {
        await new Promise((resolve) => {
          chrome.notifications.create(
            `${NOTIF_CAPTURE_PREFIX}${Date.now()}`,
            {
              type: "basic",
              iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
              title: "Added to Aurora Today",
              message: title,
              priority: 1
            },
            () => {
              void chrome.runtime.lastError;
              resolve();
            }
          );
        });
      }

      await broadcastToPanels({
        type: "PENDING_CAPTURES_UPDATED",
        count: queue.length,
        latest: captureItem
      });
    } catch (err) {
      console.error("Aurora Companion: Context menu capture failed:", err);
    }
  })();
});

chrome.notifications?.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (!notificationId.startsWith(NOTIF_TIMER_PREFIX)) return;

  (async () => {
    try {
      await new Promise((resolve) => {
        chrome.notifications.clear(notificationId, () => resolve());
      });

      if (buttonIndex === 0) {
        const current = await readTimerState();
        await startTimerInBackground({
          mode: current.type,
          durationSec: current.duration || getDefaultDurationForMode(current.type)
        });
      } else {
        await dismissAlarmInBackground();
      }
    } catch (err) {
      console.error("Aurora Companion: Notification action failed:", err);
    }
  })();
});

chrome.notifications?.onClicked.addListener((notificationId) => {
  (async () => {
    try {
      await new Promise((resolve) => {
        chrome.notifications.clear(notificationId, () => resolve());
      });
      if (notificationId.startsWith(NOTIF_TIMER_PREFIX)) {
        await dismissAlarmInBackground();
      }
    } catch (err) {
      console.warn("Aurora Companion: Notification click error:", err);
    }
  })();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  (async () => {
    try {
      switch (message.type) {
        case "OPEN_FULL_TAB": {
          const fullTabUrl = chrome.runtime.getURL("index.html");
          const tab = await chrome.tabs.create({ url: fullTabUrl });
          sendResponse({ success: true, tabId: tab.id });
          break;
        }

        case "CAPTURE_ACTIVE_TAB": {
          const result = await captureActiveTab();
          sendResponse(result);
          break;
        }

        case "GET_PENDING_CAPTURES": {
          const captures = await readPendingCaptures();
          sendResponse({ success: true, captures });
          break;
        }

        case "CONSUME_PENDING_CAPTURES": {
          const ids = Array.isArray(message.payload?.ids) ? new Set(message.payload.ids) : null;
          const queue = await readPendingCaptures();
          const remaining = ids ? queue.filter((item) => !ids.has(item.id)) : [];
          await writePendingCaptures(remaining);
          sendResponse({ success: true, remaining: remaining.length });
          break;
        }

        case "TIMER_GET_STATE": {
          const { state, completions } = await getHydratedTimerState();
          sendResponse({ success: true, state, completions });
          break;
        }

        case "TIMER_START": {
          const state = await startTimerInBackground(message.payload || {});
          sendResponse({ success: true, state });
          break;
        }

        case "TIMER_PAUSE": {
          const state = await pauseTimerInBackground();
          sendResponse({ success: true, state });
          break;
        }

        case "TIMER_RESUME": {
          const state = await resumeTimerInBackground();
          sendResponse({ success: true, state });
          break;
        }

        case "TIMER_RESET": {
          const state = await resetTimerInBackground(message.payload || {});
          sendResponse({ success: true, state });
          break;
        }

        case "TIMER_SKIP": {
          const state = await skipTimerInBackground(message.payload || {});
          sendResponse({ success: true, state });
          break;
        }

        case "TIMER_DISMISS_ALARM": {
          const state = await dismissAlarmInBackground();
          sendResponse({ success: true, state });
          break;
        }

        case "TIMER_ACK_COMPLETIONS": {
          const ackIds = Array.isArray(message.payload?.ids) ? new Set(message.payload.ids) : null;
          const existing = await readTimerCompletions();
          const remaining = ackIds ? existing.filter((item) => !ackIds.has(item.id)) : [];
          await writeTimerCompletions(remaining);
          sendResponse({ success: true, remaining: remaining.length });
          break;
        }

        default: {
          sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
          break;
        }
      }
    } catch (error) {
      console.error(`Aurora Companion: Failed handling ${message.type}:`, error);
      sendResponse({ success: false, error: error?.message || String(error) });
    }
  })();

  return true; // Keep message channel open for async response
});
