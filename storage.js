/**
 * Aurora Companion - Transactional IndexedDB v2 Storage & Cross-Context Sync Service
 * Standalone MV3-safe classic script exposing window.AuroraStorage.
 *
 * Features:
 * - Schema v2 migration from v1 preserving all existing tasks, routines, habits, journal, preferences
 * - Secondary indexes on tasks: by_completed, by_dueDate, by_completedDate, by_isLater, by_completed_date
 * - Fast store.count() checks (avoids full-table getAll reads at boot)
 * - Lazy active-only loading + reverse-chronological cursor pagination for Completed Archive
 * - Single-transaction putBatch / deleteBatch resolving on tx.oncomplete
 * - Safe closeAndDeleteDatabase() + onversionchange handling for multi-tab safety
 * - Unified Gemini API key sync (chrome.storage.local + localStorage fallback)
 * - BroadcastChannel("aurora_sync") cross-context sync (Side Panel <-> Full Tab)
 */
(function (global) {
  "use strict";

  const DB_NAME = "aurora_companion_db";
  const DB_VERSION = 2;
  const SYNC_CHANNEL_NAME = "aurora_sync";
  const STORAGE_KEY_API_KEY = "aurora_gemini_api_key";
  const STORAGE_KEY_MODELS = "aurora_gemini_models";

  const TAB_ID = `ctx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  let dbPromise = null;
  let activeDb = null;
  let syncChannel = null;
  const syncListeners = new Set();

  function hasChromeLocalStorage() {
    return typeof chrome !== "undefined" && !!(chrome.storage && chrome.storage.local);
  }

  /**
   * Normalize a task record so IndexedDB secondary indexes work reliably.
   * IndexedDB rejects booleans as index keys, so we maintain numeric 0/1 flags
   * alongside the original boolean fields for full backward compatibility.
   */
  function normalizeTask(task) {
    if (!task || typeof task !== "object") return task;
    const completed = Boolean(task.completed);
    const isLater = Boolean(task.isLater);
    const completedDate = typeof task.completedDate === "string" ? task.completedDate : "";
    const dueDate = typeof task.dueDate === "string" ? task.dueDate : "";
    return {
      ...task,
      completed,
      isLater,
      dueDate,
      completedDate: completed ? (completedDate || task.completedDate || "") : null,
      completedFlag: completed ? 1 : 0,
      completedDateIndex: completed ? (completedDate || dueDate || "") : "",
      isLaterFlag: isLater ? 1 : 0
    };
  }

  function prepareRecord(storeName, item) {
    return storeName === "tasks" ? normalizeTask(item) : item;
  }

  function ensureTaskIndexes(tasksStore) {
    if (!tasksStore.indexNames.contains("by_completed")) {
      tasksStore.createIndex("by_completed", "completedFlag", { unique: false });
    }
    if (!tasksStore.indexNames.contains("by_dueDate")) {
      tasksStore.createIndex("by_dueDate", "dueDate", { unique: false });
    }
    if (!tasksStore.indexNames.contains("by_completedDate")) {
      tasksStore.createIndex("by_completedDate", "completedDateIndex", { unique: false });
    }
    if (!tasksStore.indexNames.contains("by_isLater")) {
      tasksStore.createIndex("by_isLater", "isLaterFlag", { unique: false });
    }
    if (!tasksStore.indexNames.contains("by_completed_date")) {
      tasksStore.createIndex("by_completed_date", ["completedFlag", "completedDateIndex"], { unique: false });
    }
  }

  function closeActiveConnection() {
    if (activeDb) {
      try {
        activeDb.close();
      } catch (_) {}
      activeDb = null;
    }
    dbPromise = null;
  }

  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        let request;
        try {
          request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (err) {
          dbPromise = null;
          reject(err);
          return;
        }

        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          const tx = e.target.transaction;
          const oldVersion = e.oldVersion || 0;

          let tasksStore;
          if (!db.objectStoreNames.contains("tasks")) {
            tasksStore = db.createObjectStore("tasks", { keyPath: "id" });
          } else {
            tasksStore = tx.objectStore("tasks");
          }
          ensureTaskIndexes(tasksStore);

          if (!db.objectStoreNames.contains("routines")) {
            db.createObjectStore("routines", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("habits")) {
            db.createObjectStore("habits", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("journal")) {
            db.createObjectStore("journal", { keyPath: "dateStr" });
          }
          if (!db.objectStoreNames.contains("preferences")) {
            db.createObjectStore("preferences", { keyPath: "key" });
          }

          // Migrate existing v1 task records so numeric index flags are populated
          if (oldVersion > 0 && oldVersion < 2) {
            const cursorReq = tasksStore.openCursor();
            cursorReq.onsuccess = (ev) => {
              const cursor = ev.target.result;
              if (!cursor) return;
              const val = cursor.value;
              if (
                val &&
                (typeof val.completedFlag !== "number" ||
                  typeof val.isLaterFlag !== "number" ||
                  typeof val.completedDateIndex !== "string")
              ) {
                cursor.update(normalizeTask(val));
              }
              cursor.continue();
            };
          }
        };

        request.onsuccess = (e) => {
          const db = e.target.result;
          activeDb = db;
          db.onversionchange = () => {
            closeActiveConnection();
          };
          db.onclose = () => {
            if (activeDb === db) {
              activeDb = null;
              dbPromise = null;
            }
          };
          resolve(db);
        };

        request.onerror = (e) => {
          dbPromise = null;
          activeDb = null;
          reject(e.target.error || new Error("IndexedDB open failed"));
        };

        request.onblocked = () => {
          console.warn("AuroraStorage: IndexedDB upgrade blocked by another open context.");
        };
      });
    }
    return dbPromise;
  }

  async function countItems(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.count();
      req.onsuccess = (e) => resolve(e.target.result || 0);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getItem(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = (e) => resolve(e.target.result !== undefined ? e.target.result : null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getAllItems(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function putItem(storeName, item) {
    const db = await openDB();
    const record = prepareRecord(storeName, item);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = (e) => reject(e.target.error || tx.error);
      tx.onabort = (e) => reject(e.target.error || tx.error || new Error("Transaction aborted"));
    });
  }

  async function deleteItem(storeName, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error || tx.error);
      tx.onabort = (e) => reject(e.target.error || tx.error || new Error("Transaction aborted"));
    });
  }

  async function putBatch(storeName, items) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const db = await openDB();
    const prepared = items.map((item) => prepareRecord(storeName, item));
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      for (let i = 0; i < prepared.length; i++) {
        store.put(prepared[i]);
      }
      tx.oncomplete = () => resolve(prepared);
      tx.onerror = (e) => reject(e.target.error || tx.error);
      tx.onabort = (e) => reject(e.target.error || tx.error || new Error("Batch write aborted"));
    });
  }

  async function deleteBatch(storeName, ids) {
    if (!Array.isArray(ids) || ids.length === 0) return true;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      for (let i = 0; i < ids.length; i++) {
        store.delete(ids[i]);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error || tx.error);
      tx.onabort = (e) => reject(e.target.error || tx.error || new Error("Batch delete aborted"));
    });
  }

  /**
   * Check whether all records in `tasks` carry numeric `completedFlag` index keys.
   * Guards against raw external inserts (e.g. direct IDB seeding) lacking `completedFlag`.
   */
  function checkTasksIndexCoverage(tx) {
    return new Promise((resolve, reject) => {
      const store = tx.objectStore("tasks");
      if (!store.indexNames.contains("by_completed")) {
        resolve({ covered: false, total: 0, activeCount: 0, completedCount: 0 });
        return;
      }
      const idx = store.index("by_completed");
      let total = 0;
      let activeCount = 0;
      let completedCount = 0;
      let remaining = 3;

      const done = () => {
        remaining -= 1;
        if (remaining === 0) {
          resolve({
            covered: activeCount + completedCount === total,
            total,
            activeCount,
            completedCount
          });
        }
      };

      const totalReq = store.count();
      totalReq.onsuccess = (e) => { total = e.target.result || 0; done(); };
      totalReq.onerror = (e) => reject(e.target.error);

      const actReq = idx.count(IDBKeyRange.only(0));
      actReq.onsuccess = (e) => { activeCount = e.target.result || 0; done(); };
      actReq.onerror = (e) => reject(e.target.error);

      const compReq = idx.count(IDBKeyRange.only(1));
      compReq.onsuccess = (e) => { completedCount = e.target.result || 0; done(); };
      compReq.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * One-pass repair for any raw task rows missing numeric index flags.
   */
  async function repairUnindexedTasks() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tasks", "readwrite");
      const store = tx.objectStore("tasks");
      let repaired = 0;
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) return;
        const val = cursor.value;
        if (
          val &&
          (typeof val.completedFlag !== "number" ||
            typeof val.isLaterFlag !== "number" ||
            typeof val.completedDateIndex !== "string")
        ) {
          cursor.update(normalizeTask(val));
          repaired += 1;
        }
        cursor.continue();
      };
      req.onerror = (e) => reject(e.target.error);
      tx.oncomplete = () => resolve(repaired);
      tx.onerror = (e) => reject(e.target.error || tx.error);
    });
  }

  /**
   * Load only active (non-completed) tasks via the `by_completed` index.
   * Automatically handles unindexed v1/raw records without dropping data.
   */
  async function getActiveTasks() {
    const db = await openDB();
    const coverage = await new Promise((resolve, reject) => {
      const tx = db.transaction("tasks", "readonly");
      checkTasksIndexCoverage(tx).then(resolve, reject);
    });

    if (!coverage.covered && coverage.total > 0) {
      await repairUnindexedTasks();
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction("tasks", "readonly");
      const store = tx.objectStore("tasks");
      if (store.indexNames.contains("by_completed")) {
        const req = store.index("by_completed").getAll(IDBKeyRange.only(0));
        req.onsuccess = (e) => resolve(e.target.result || []);
        req.onerror = (e) => reject(e.target.error);
      } else {
        const results = [];
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) {
            resolve(results);
            return;
          }
          if (!cursor.value.completed) results.push(cursor.value);
          cursor.continue();
        };
        req.onerror = (e) => reject(e.target.error);
      }
    });
  }

  /**
   * Fast count of completed tasks using the `by_completed` index.
   */
  async function getCompletedCount() {
    const db = await openDB();
    const coverage = await new Promise((resolve, reject) => {
      const tx = db.transaction("tasks", "readonly");
      checkTasksIndexCoverage(tx).then(resolve, reject);
    });

    if (coverage.covered) {
      return coverage.completedCount;
    }

    if (coverage.total > 0) {
      await repairUnindexedTasks();
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction("tasks", "readonly");
      const store = tx.objectStore("tasks");
      const req = store.index("by_completed").count(IDBKeyRange.only(1));
      req.onsuccess = (e) => resolve(e.target.result || 0);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Lazy cursor-paginated fetch of completed tasks ordered newest-completed first.
   * Supports optional search / priority / category filters.
   */
  async function getCompletedTasksPage(options = {}) {
    const offset = Math.max(0, Number(options.offset) || 0);
    const limit = Math.max(1, Number(options.limit) || 50);
    const search = (options.search || "").trim().toLowerCase();
    const priority = options.priority || "All";
    const category = options.category || "All";
    const hasFilters = Boolean(search) || priority !== "All" || category !== "All";

    const db = await openDB();
    const coverage = await new Promise((resolve, reject) => {
      const tx = db.transaction("tasks", "readonly");
      checkTasksIndexCoverage(tx).then(resolve, reject);
    });

    if (!coverage.covered && coverage.total > 0) {
      await repairUnindexedTasks();
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction("tasks", "readonly");
      const store = tx.objectStore("tasks");
      const idx = store.index("by_completed_date");
      const range = IDBKeyRange.bound([1, ""], [1, "\uffff"]);

      let totalCompleted = coverage.covered ? coverage.completedCount : 0;
      if (!coverage.covered) {
        const countReq = store.index("by_completed").count(IDBKeyRange.only(1));
        countReq.onsuccess = (ev) => { totalCompleted = ev.target.result || 0; };
      }

      const items = [];
      let skipped = 0;
      let advanced = false;
      let hasMore = false;

      const cursorReq = idx.openCursor(range, "prev");
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          resolve({
            items,
            total: totalCompleted,
            hasMore,
            nextOffset: offset + items.length
          });
          return;
        }

        const task = cursor.value;

        if (!hasFilters) {
          if (offset > 0 && !advanced) {
            advanced = true;
            cursor.advance(offset);
            return;
          }
          if (task.id === "general_focus") {
            cursor.continue();
            return;
          }
          if (items.length < limit) {
            items.push(task);
            cursor.continue();
          } else {
            hasMore = true;
            resolve({
              items,
              total: totalCompleted,
              hasMore: true,
              nextOffset: offset + items.length
            });
          }
          return;
        }

        // Filtered scan in newest-first order
        if (task.id !== "general_focus") {
          const matchesSearch =
            !search ||
            (task.title && task.title.toLowerCase().includes(search)) ||
            (task.description && task.description.toLowerCase().includes(search));
          const matchesPriority = priority === "All" || task.priority === priority;
          const matchesCategory = category === "All" || task.category === category;

          if (matchesSearch && matchesPriority && matchesCategory) {
            if (skipped < offset) {
              skipped += 1;
            } else if (items.length < limit) {
              items.push(task);
            } else {
              hasMore = true;
              resolve({
                items,
                total: totalCompleted,
                hasMore: true,
                nextOffset: offset + items.length
              });
              return;
            }
          }
        }
        cursor.continue();
      };
      cursorReq.onerror = (e) => reject(e.target.error);
    });
  }

  async function getPreference(key, defaultValue) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("preferences", "readonly");
      const store = tx.objectStore("preferences");
      const req = store.get(key);
      req.onsuccess = (e) => {
        const res = e.target.result;
        resolve(res ? res.value : defaultValue);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function savePreference(key, value) {
    await putItem("preferences", { key, value });
  }

  async function getAllPreferences() {
    const rows = await getAllItems("preferences");
    const map = {};
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].key !== undefined) {
        map[rows[i].key] = rows[i].value;
      }
    }
    return map;
  }

  // -------------------------------------------------------------------------
  // Unified Gemini API Key Sync (chrome.storage.local + localStorage fallback)
  // -------------------------------------------------------------------------
  async function getApiKey() {
    let key = "";
    if (hasChromeLocalStorage()) {
      try {
        const res = await chrome.storage.local.get(STORAGE_KEY_API_KEY);
        if (res && typeof res[STORAGE_KEY_API_KEY] === "string") {
          key = res[STORAGE_KEY_API_KEY].trim();
        }
      } catch (err) {
        console.warn("AuroraStorage: chrome.storage.local getApiKey failed:", err);
      }
    }

    if (!key) {
      try {
        const localKey = (localStorage.getItem(STORAGE_KEY_API_KEY) || "").trim();
        if (localKey) {
          key = localKey;
          // Migrate legacy localStorage key into chrome.storage.local
          if (hasChromeLocalStorage()) {
            chrome.storage.local.set({ [STORAGE_KEY_API_KEY]: key }).catch(() => {});
          }
        }
      } catch (_) {}
    }

    return key;
  }

  async function setApiKey(rawKey) {
    const key = (rawKey || "").trim();
    if (hasChromeLocalStorage()) {
      try {
        await chrome.storage.local.set({ [STORAGE_KEY_API_KEY]: key });
      } catch (err) {
        console.warn("AuroraStorage: chrome.storage.local setApiKey failed:", err);
      }
    }
    try {
      if (key) {
        localStorage.setItem(STORAGE_KEY_API_KEY, key);
      } else {
        localStorage.removeItem(STORAGE_KEY_API_KEY);
      }
    } catch (_) {}
    broadcastSync("API_KEY_CHANGED", { hasKey: Boolean(key) });
    return key;
  }

  async function clearApiKey() {
    if (hasChromeLocalStorage()) {
      try {
        await chrome.storage.local.remove([STORAGE_KEY_API_KEY, STORAGE_KEY_MODELS]);
      } catch (err) {
        console.warn("AuroraStorage: chrome.storage.local clearApiKey failed:", err);
      }
    }
    try {
      localStorage.removeItem(STORAGE_KEY_API_KEY);
      localStorage.removeItem(STORAGE_KEY_MODELS);
    } catch (_) {}
    broadcastSync("API_KEY_CHANGED", { hasKey: false });
    return true;
  }

  async function getExtensionLocal(key, fallback = null) {
    if (hasChromeLocalStorage()) {
      try {
        const res = await chrome.storage.local.get(key);
        if (res && res[key] !== undefined) return res[key];
      } catch (_) {}
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try {
          return JSON.parse(raw);
        } catch (_) {
          return raw;
        }
      }
    } catch (_) {}
    return fallback;
  }

  async function setExtensionLocal(key, value) {
    if (hasChromeLocalStorage()) {
      try {
        await chrome.storage.local.set({ [key]: value });
      } catch (_) {}
    }
    try {
      if (value === undefined || value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    } catch (_) {}
    return value;
  }

  // -------------------------------------------------------------------------
  // Cross-Context Sync via BroadcastChannel("aurora_sync")
  // -------------------------------------------------------------------------
  let chromeStorageBridgeBound = false;

  function ensureSyncChannel() {
    if (!chromeStorageBridgeBound && typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      chromeStorageBridgeBound = true;
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        if (changes[STORAGE_KEY_API_KEY]) {
          const hasKey = Boolean(changes[STORAGE_KEY_API_KEY].newValue);
          syncListeners.forEach((cb) => {
            try {
              cb({ type: "API_KEY_CHANGED", hasKey, sourceId: "chrome_storage", ts: Date.now() });
            } catch (_) {}
          });
        }
        if (changes.aurora_timer_state && changes.aurora_timer_state.newValue) {
          const state = changes.aurora_timer_state.newValue;
          syncListeners.forEach((cb) => {
            try {
              cb({ type: "TIMER_SYNC", state, sourceId: "chrome_storage", ts: Date.now() });
            } catch (_) {}
          });
        }
        if (changes.aurora_pending_captures && Array.isArray(changes.aurora_pending_captures.newValue)) {
          const count = changes.aurora_pending_captures.newValue.length;
          syncListeners.forEach((cb) => {
            try {
              cb({ type: "PENDING_CAPTURES_UPDATED", count, sourceId: "chrome_storage", ts: Date.now() });
            } catch (_) {}
          });
        }
      });
    }

    if (syncChannel || typeof BroadcastChannel === "undefined") return syncChannel;
    try {
      syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      syncChannel.onmessage = (event) => {
        const msg = event.data;
        if (!msg || msg.sourceId === TAB_ID) return;
        syncListeners.forEach((cb) => {
          try {
            cb(msg);
          } catch (err) {
            console.error("AuroraStorage: sync listener error:", err);
          }
        });
      };
    } catch (err) {
      console.warn("AuroraStorage: BroadcastChannel unavailable:", err);
      syncChannel = null;
    }
    return syncChannel;
  }

  function broadcastSync(type, payload = {}) {
    const ch = ensureSyncChannel();
    if (!ch) return;
    try {
      ch.postMessage({
        type,
        ...(payload && typeof payload === "object" ? payload : {}),
        payload,
        sourceId: TAB_ID,
        ts: Date.now()
      });
    } catch (err) {
      console.warn("AuroraStorage: BroadcastChannel post failed:", err);
    }
  }

  function broadcastDataChanged(store = "all") {
    broadcastSync("DATA_CHANGED", { store });
  }

  function onSync(callback) {
    if (typeof callback !== "function") return () => {};
    ensureSyncChannel();
    syncListeners.add(callback);
    return () => {
      syncListeners.delete(callback);
    };
  }

  // -------------------------------------------------------------------------
  // Initialization, Legacy Migration, and Boot Loading
  // -------------------------------------------------------------------------
  async function init() {
    await openDB();

    // 1. One-time legacy localStorage migration (batched transactions)
    let legacyTasksExist = false;
    try {
      legacyTasksExist = localStorage.getItem("aurora_tasks") !== null;
    } catch (_) {}

    if (legacyTasksExist) {
      const parseLocal = (k, fallback) => {
        try {
          const raw = localStorage.getItem(k);
          return raw ? JSON.parse(raw) : fallback;
        } catch (_) {
          return fallback;
        }
      };

      const oldTasks = parseLocal("aurora_tasks", []);
      const oldRoutines = parseLocal("aurora_routines", []);
      const oldHabits = parseLocal("aurora_habits", []);
      const oldJournal = parseLocal("aurora_journal", {});
      const oldNextId = parseInt(localStorage.getItem("aurora_next_id") || "1", 10) || 1;
      const oldPrefs = parseLocal("aurora_routines_prefs", { wakeUpTime: "06:00", sleepTime: "23:00" });
      const oldTheme = localStorage.getItem("aurora_theme") || "dark";
      const oldAccent = localStorage.getItem("aurora_accent") || "indigo";
      const oldSidebarCollapsed = localStorage.getItem("aurora_sidebar_collapsed") === "true";
      const oldNotifsEnabled = localStorage.getItem("aurora_notifications_enabled") !== "false";
      const oldBannerDismissed = localStorage.getItem("aurora_banner_dismissed") === "true";

      const journalRows = Object.keys(oldJournal).map((dateStr) => ({
        dateStr,
        ...oldJournal[dateStr]
      }));

      const prefRows = [
        { key: "next_id", value: oldNextId },
        { key: "routine_prefs", value: oldPrefs },
        { key: "theme", value: oldTheme },
        { key: "accent", value: oldAccent },
        { key: "sidebar_collapsed", value: oldSidebarCollapsed },
        { key: "notifications_enabled", value: oldNotifsEnabled },
        { key: "banner_dismissed", value: oldBannerDismissed }
      ];

      await Promise.all([
        putBatch("tasks", oldTasks),
        putBatch("routines", oldRoutines),
        putBatch("habits", oldHabits),
        putBatch("journal", journalRows),
        putBatch("preferences", prefRows)
      ]);

      const keysToRemove = [
        "aurora_tasks", "aurora_next_id", "aurora_theme", "aurora_accent",
        "aurora_routines", "aurora_routines_prefs", "aurora_habits", "aurora_journal",
        "aurora_sidebar_collapsed", "aurora_notifications_enabled", "aurora_banner_dismissed",
        "indigo_tasks", "indigo_next_id", "indigo_theme", "indigo_accent", "indigo_notifications_enabled"
      ];
      keysToRemove.forEach((k) => {
        try { localStorage.removeItem(k); } catch (_) {}
      });
      return;
    }

    // 2. Fast store.count() checks (replaces duplicate full-table getAll reads)
    const [routineCount, habitCount, existingPrefs] = await Promise.all([
      countItems("routines"),
      countItems("habits"),
      getAllPreferences()
    ]);

    const seedOps = [];

    if (routineCount === 0) {
      seedOps.push(
        putBatch("routines", [
          {
            id: "rout_1",
            title: "Morning Mindfulness",
            startTime: "06:30",
            endTime: "07:00",
            category: "Health",
            color: "emerald",
            icon: "",
            days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
          },
          {
            id: "rout_2",
            title: "Deep Focus Block",
            startTime: "09:00",
            endTime: "11:30",
            category: "Work",
            color: "indigo",
            icon: "",
            days: ["Mon", "Tue", "Wed", "Thu", "Fri"]
          },
          {
            id: "rout_3",
            title: "Strength Training",
            startTime: "17:30",
            endTime: "18:30",
            category: "Health",
            color: "rose",
            icon: "",
            days: ["Mon", "Wed", "Fri"]
          },
          {
            id: "rout_4",
            title: "Read Habit Stacking",
            startTime: "21:30",
            endTime: "22:15",
            category: "Personal",
            color: "amber",
            icon: "",
            days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
          }
        ])
      );
    }

    if (habitCount === 0) {
      const nowISO = new Date().toISOString();
      seedOps.push(
        putBatch("habits", [
          {
            id: "hab_1",
            title: "Wake up before 6:00 AM",
            category: "Routine",
            color: "amber",
            streak: 0,
            maxStreak: 0,
            history: {},
            createdAt: nowISO
          },
          {
            id: "hab_2",
            title: "Daily Meditation Routine",
            category: "Mind",
            color: "emerald",
            streak: 0,
            maxStreak: 0,
            history: {},
            createdAt: nowISO
          },
          {
            id: "hab_3",
            title: "Learn programming daily",
            category: "Skill",
            color: "indigo",
            streak: 0,
            maxStreak: 0,
            history: {},
            createdAt: nowISO
          },
          {
            id: "hab_4",
            title: "50 Push-ups Exercise",
            category: "Health",
            color: "rose",
            streak: 0,
            maxStreak: 0,
            history: {},
            createdAt: nowISO
          }
        ])
      );
    }

    const defaultPrefs = {
      next_id: 1,
      routine_prefs: { wakeUpTime: "06:00", sleepTime: "23:00" },
      theme: "dark",
      accent: "indigo",
      ui_style: "atelier"
    };

    const missingPrefs = [];
    Object.keys(defaultPrefs).forEach((k) => {
      if (existingPrefs[k] === undefined) {
        missingPrefs.push({ key: k, value: defaultPrefs[k] });
      }
    });
    if (missingPrefs.length > 0) {
      seedOps.push(putBatch("preferences", missingPrefs));
    }

    if (seedOps.length > 0) {
      await Promise.all(seedOps);
    }
  }

  function buildPreferencesObject(prefsMap) {
    return {
      nextId: prefsMap.next_id !== undefined ? prefsMap.next_id : 1,
      routinePrefs: prefsMap.routine_prefs || { wakeUpTime: "06:00", sleepTime: "23:00" },
      theme: prefsMap.theme || "dark",
      accent: prefsMap.accent || "indigo",
      sidebarCollapsed: Boolean(prefsMap.sidebar_collapsed),
      notificationsEnabled: prefsMap.notifications_enabled !== false,
      bannerDismissed: Boolean(prefsMap.banner_dismissed),
      uiStyle: prefsMap.ui_style || "atelier",
      alarmSound: prefsMap.alarm_sound || "default_beeps",
      personalityProfile: prefsMap.personality_profile || null,
      welcomeDialogShown: Boolean(prefsMap.welcome_dialog_shown),
      tomorrowPlan: prefsMap.tomorrow_plan || null
    };
  }

  /**
   * Fast boot loader: loads active tasks only + completed count, avoiding full
   * hydration of thousands of archived completed records on startup.
   */
  async function loadInitialData() {
    const [activeTasks, completedCount, routines, habits, journalList, prefsMap] = await Promise.all([
      getActiveTasks(),
      getCompletedCount(),
      getAllItems("routines"),
      getAllItems("habits"),
      getAllItems("journal"),
      getAllPreferences()
    ]);

    const journal = {};
    for (let i = 0; i < journalList.length; i++) {
      const { dateStr, ...entry } = journalList[i];
      if (dateStr) journal[dateStr] = entry;
    }

    return {
      tasks: activeTasks,
      completedCount,
      routines,
      habits,
      journal,
      preferences: buildPreferencesObject(prefsMap)
    };
  }

  /**
   * Full data loader (includes completed tasks) for insights/export/backward compatibility.
   */
  async function loadAllData() {
    const [tasks, routines, habits, journalList, prefsMap] = await Promise.all([
      getAllItems("tasks"),
      getAllItems("routines"),
      getAllItems("habits"),
      getAllItems("journal"),
      getAllPreferences()
    ]);

    const journal = {};
    for (let i = 0; i < journalList.length; i++) {
      const { dateStr, ...entry } = journalList[i];
      if (dateStr) journal[dateStr] = entry;
    }

    return {
      tasks,
      routines,
      habits,
      journal,
      preferences: buildPreferencesObject(prefsMap)
    };
  }

  /**
   * Safely close the active IDB handle before deleting the database so the
   * delete request does not stall on an open connection.
   */
  async function closeAndDeleteDatabase() {
    broadcastSync("DB_RESET", {});
    closeActiveConnection();

    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error || new Error("Failed to delete database"));
      req.onblocked = () => {
        console.warn("AuroraStorage: deleteDatabase blocked by another tab.");
        resolve(false);
      };
    });
  }

  const AuroraStorage = {
    DB_NAME,
    DB_VERSION,
    SYNC_CHANNEL_NAME,
    STORAGE_KEY_API_KEY,
    TAB_ID,
    openDB,
    init,
    loadInitialData,
    loadAllData,
    countItems,
    getItem,
    getAllItems,
    putItem,
    deleteItem,
    putBatch,
    deleteBatch,
    getActiveTasks,
    getCompletedCount,
    getCompletedTasksPage,
    getPreference,
    savePreference,
    getAllPreferences,
    getApiKey,
    setApiKey,
    clearApiKey,
    getExtensionLocal,
    setExtensionLocal,
    broadcastSync,
    broadcastDataChanged,
    onSync,
    normalizeTask,
    closeAndDeleteDatabase
  };

  global.AuroraStorage = AuroraStorage;
})(typeof window !== "undefined" ? window : globalThis);
