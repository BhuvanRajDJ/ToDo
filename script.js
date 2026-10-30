/**
 * Aurora Companion - Premium Psychology-Driven Productivity SPA Engine
 * Architecture: Central Event-Driven State Store, Touch Swipe, SVG Analytics & Habit Streaks
 * Storage Engine: Transactional IndexedDB with Synchronous Memory Caching
 */

document.addEventListener("DOMContentLoaded", async function () {
  // =========================================================================
  // 0. DATE HELPER (LOCAL CALENDAR CONSISTENCY)
  // =========================================================================
  function getLocalDateString(d = new Date()) {
    if (typeof d === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
      d = new Date(d);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // =========================================================================
  // 0. SYSTEM CONFIGURATIONS (DYNAMIC DATA DRIVERS)
  // =========================================================================
  const CONFIG_CAPTURE_NEW_GOAL = {
    priorities: [
      { value: "Low", label: "Low Priority" },
      { value: "Medium", label: "Medium Priority" },
      { value: "High", label: "High Priority" }
    ],
    categories: ["Inbox", "Work", "Personal", "Health", "Finance"],
    durations: [
      { value: "15", label: "15 mins" },
      { value: "25", label: "25 mins" },
      { value: "40", label: "40 mins" },
      { value: "60", label: "60 mins" },
      { value: "90", label: "90 mins" }
    ],
    recurrences: [
      { value: "none", label: "Do not repeat" },
      { value: "daily", label: "Repeat Daily" },
      { value: "weekly", label: "Repeat Weekly" },
      { value: "monthly", label: "Repeat Monthly" }
    ]
  };

  const CONFIG_SCHEDULE_ROUTINE = {
    categories: ["Routine", "Work", "Health", "Personal"],
    colors: [
      { value: "indigo", label: "Indigo" },
      { value: "emerald", label: "Emerald" },
      { value: "rose", label: "Rose" },
      { value: "amber", label: "Amber" }
    ],
    weekdays: [
      { value: "Mon", label: "M" },
      { value: "Tue", label: "T" },
      { value: "Wed", label: "W" },
      { value: "Thu", label: "T" },
      { value: "Fri", label: "F" },
      { value: "Sat", label: "S" },
      { value: "Sun", label: "S" }
    ]
  };

  const CONFIG_CREATE_HABIT = {
    categories: ["Routine", "Mind", "Health", "Skill", "Work"],
    colors: [
      { value: "indigo", label: "Indigo" },
      { value: "emerald", label: "Emerald" },
      { value: "rose", label: "Rose" },
      { value: "amber", label: "Amber" }
    ],
    templates: [
      {
        title: "Drink 3L Water",
        cat: "Health",
        color: "emerald",
        label: "Hydrate",
        svg: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`
      },
      {
        title: "15m Mindful Breathing",
        cat: "Mind",
        color: "indigo",
        label: "Meditate",
        svg: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>`
      },
      {
        title: "Read 10 Pages",
        cat: "Skill",
        color: "amber",
        label: "Read",
        svg: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5z"/></svg>`
      },
      {
        title: "Stretch & Mobility",
        cat: "Health",
        color: "rose",
        label: "Stretch",
        svg: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 10.5h11M18.5 6.5v8M5.5 6.5v8M12 5.5v13"/></svg>`
      },
      {
        title: "Write Evening Journal",
        cat: "Mind",
        color: "indigo",
        label: "Reflect",
        svg: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`
      }
    ]
  };

  // =========================================================================
  // 1. TRANSACTIONAL INDEXEDDB STORAGE SERVICE
  // =========================================================================
  class StorageService {
    static DB_NAME = "aurora_companion_db";
    static DB_VERSION = 1;
    static dbPromise = null;

    static openDB() {
      if (!StorageService.dbPromise) {
        StorageService.dbPromise = new Promise((resolve, reject) => {
          const request = indexedDB.open(StorageService.DB_NAME, StorageService.DB_VERSION);
          
          request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("tasks")) {
              db.createObjectStore("tasks", { keyPath: "id" });
            }
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
          };

          request.onsuccess = (e) => resolve(e.target.result);
          request.onerror = (e) => {
            StorageService.dbPromise = null;
            reject(e.target.error);
          };
        });
      }
      return StorageService.dbPromise;
    }

    static async putItem(storeName, item) {
      const db = await StorageService.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const request = store.put(item);
        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(e.target.error);
      });
    }

    static async deleteItem(storeName, id) {
      const db = await StorageService.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(e.target.error);
      });
    }

    static async getAllItems(storeName) {
      const db = await StorageService.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
      });
    }

    static async getPreference(key, defaultValue) {
      const db = await StorageService.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("preferences", "readonly");
        const store = tx.objectStore("preferences");
        const request = store.get(key);
        request.onsuccess = (e) => {
          const res = e.target.result;
          resolve(res ? res.value : defaultValue);
        };
        request.onerror = (e) => reject(e.target.error);
      });
    }

    static async savePreference(key, value) {
      await StorageService.putItem("preferences", { key, value });
    }

    static async init() {
      await StorageService.openDB();

      // Check for legacy migration from Local Storage
      const legacyTasksExist = localStorage.getItem("aurora_tasks") !== null;
      if (legacyTasksExist) {
        console.log("Migrating Local Storage tables to IndexedDB...");
        
        const oldTasks = JSON.parse(localStorage.getItem("aurora_tasks")) || [];
        const oldRoutines = JSON.parse(localStorage.getItem("aurora_routines")) || [];
        const oldHabits = JSON.parse(localStorage.getItem("aurora_habits")) || [];
        const oldJournal = JSON.parse(localStorage.getItem("aurora_journal")) || {};
        const oldNextId = parseInt(localStorage.getItem("aurora_next_id") || 1);
        const oldPrefs = JSON.parse(localStorage.getItem("aurora_routines_prefs")) || { wakeUpTime: "06:00", sleepTime: "23:00" };
        const oldTheme = localStorage.getItem("aurora_theme") || "dark";
        const oldAccent = localStorage.getItem("aurora_accent") || "indigo";
        const oldSidebarCollapsed = localStorage.getItem("aurora_sidebar_collapsed") === "true";
        const oldNotifsEnabled = localStorage.getItem("aurora_notifications_enabled") !== "false";
        const oldBannerDismissed = localStorage.getItem("aurora_banner_dismissed") === "true";

        // Write batch
        for (const t of oldTasks) await StorageService.putItem("tasks", t);
        for (const r of oldRoutines) await StorageService.putItem("routines", r);
        for (const h of oldHabits) await StorageService.putItem("habits", h);
        for (const dateStr of Object.keys(oldJournal)) {
          await StorageService.putItem("journal", { dateStr, ...oldJournal[dateStr] });
        }

        // Save preferences
        await StorageService.savePreference("next_id", oldNextId);
        await StorageService.savePreference("routine_prefs", oldPrefs);
        await StorageService.savePreference("theme", oldTheme);
        await StorageService.savePreference("accent", oldAccent);
        await StorageService.savePreference("sidebar_collapsed", oldSidebarCollapsed);
        await StorageService.savePreference("notifications_enabled", oldNotifsEnabled);
        await StorageService.savePreference("banner_dismissed", oldBannerDismissed);

        // Cleanup Local Storage so migrator only triggers once
        const keysToRemove = [
          "aurora_tasks", "aurora_next_id", "aurora_theme", "aurora_accent", 
          "aurora_routines", "aurora_routines_prefs", "aurora_habits", "aurora_journal", 
          "aurora_sidebar_collapsed", "aurora_notifications_enabled", "aurora_banner_dismissed",
          "indigo_tasks", "indigo_next_id", "indigo_theme", "indigo_accent", "indigo_notifications_enabled"
        ];
        keysToRemove.forEach(k => localStorage.removeItem(k));
        console.log("IndexedDB Migration Successful! Local Storage cleaned up.");
        return;
      }

      // Check if DB stores are fully empty, and initialize default data if so
      const routineCount = (await StorageService.getAllItems("routines")).length;
      const habitCount = (await StorageService.getAllItems("habits")).length;

      if (routineCount === 0) {
        const defaultRoutines = [
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
        ];
        for (const r of defaultRoutines) {
          await StorageService.putItem("routines", r);
        }
      }

      if (habitCount === 0) {
        const defaultHabits = [
          {
            id: "hab_1",
            title: "Wake up before 6:00 AM",
            category: "Routine",
            color: "amber",
            streak: 0,
            maxStreak: 0,
            history: {},
            createdAt: new Date().toISOString()
          },
          {
            id: "hab_2",
            title: "Daily Meditation Routine",
            category: "Mind",
            color: "emerald",
            streak: 0,
            maxStreak: 0,
            history: {},
            createdAt: new Date().toISOString()
          },
          {
            id: "hab_3",
            title: "Learn programming daily",
            category: "Skill",
            color: "indigo",
            streak: 0,
            maxStreak: 0,
            history: {},
            createdAt: new Date().toISOString()
          },
          {
            id: "hab_4",
            title: "50 Push-ups Exercise",
            category: "Health",
            color: "rose",
            streak: 0,
            maxStreak: 0,
            history: {},
            createdAt: new Date().toISOString()
          }
        ];
        for (const h of defaultHabits) {
          await StorageService.putItem("habits", h);
        }
      }

      // Initialize system default preferences
      const nextId = await StorageService.getPreference("next_id", null);
      if (nextId === null) await StorageService.savePreference("next_id", 1);

      const routinePrefs = await StorageService.getPreference("routine_prefs", null);
      if (routinePrefs === null) {
        await StorageService.savePreference("routine_prefs", { wakeUpTime: "06:00", sleepTime: "23:00" });
      }

      const theme = await StorageService.getPreference("theme", null);
      if (theme === null) await StorageService.savePreference("theme", "dark");

      const accent = await StorageService.getPreference("accent", null);
      if (accent === null) await StorageService.savePreference("accent", "indigo");

      const uiStyle = await StorageService.getPreference("ui_style", null);
      if (uiStyle === null) await StorageService.savePreference("ui_style", "neo-brutalism");
    }

    static async loadAllData() {
      const [
        tasks,
        routines,
        habits,
        journalList,
        nextId,
        routinePrefs,
        theme,
        accent,
        sidebarCollapsed,
        notificationsEnabled,
        bannerDismissed,
        uiStyle,
        alarmSound
      ] = await Promise.all([
        StorageService.getAllItems("tasks"),
        StorageService.getAllItems("routines"),
        StorageService.getAllItems("habits"),
        StorageService.getAllItems("journal"),
        StorageService.getPreference("next_id", 1),
        StorageService.getPreference("routine_prefs", { wakeUpTime: "06:00", sleepTime: "23:00" }),
        StorageService.getPreference("theme", "dark"),
        StorageService.getPreference("accent", "indigo"),
        StorageService.getPreference("sidebar_collapsed", false),
        StorageService.getPreference("notifications_enabled", true),
        StorageService.getPreference("banner_dismissed", false),
        StorageService.getPreference("ui_style", "neo-brutalism"),
        StorageService.getPreference("alarm_sound", "default_beeps")
      ]);

      const journal = {};
      journalList.forEach(item => {
        const { dateStr, ...entry } = item;
        journal[dateStr] = entry;
      });

      return {
        tasks,
        routines,
        habits,
        journal,
        preferences: {
          nextId,
          routinePrefs,
          theme,
          accent,
          sidebarCollapsed,
          notificationsEnabled,
          bannerDismissed,
          uiStyle,
          alarmSound
        }
      };
    }
  }

  // =========================================================================
  // 2. CENTRAL REACTIVE STATE STORE
  // =========================================================================
  class TaskStore {
    constructor(dbData) {
      this.tasks = dbData.tasks;
      this.routines = dbData.routines;
      this.routinePrefs = dbData.preferences.routinePrefs;
      this.habits = dbData.habits;
      this.journal = dbData.journal;
      this.nextId = dbData.preferences.nextId;

      this.currentView = localStorage.getItem("indigo_redirect_view") || "dashboard";
      localStorage.removeItem("indigo_redirect_view");

      this.theme = dbData.preferences.theme;
      this.accent = dbData.preferences.accent;
      this.uiStyle = dbData.preferences.uiStyle || "neo-brutalism";
      this.sidebarCollapsed = dbData.preferences.sidebarCollapsed;
      this.alarmSound = dbData.preferences.alarmSound || "default_beeps";
      console.log("State Store Loaded Visual Vibe Style:", this.uiStyle);

      this.timer = {
        isRunning: false,
        type: "pomodoro", // pomodoro, shortBreak, longBreak, stopwatch
        duration: 25 * 60,
        totalDuration: 25 * 60,
        activeTaskId: null,
        targetEndTime: null,
        stopwatchStartTime: null,
        elapsedSeconds: 0,
        completedSessions: 0
      };

      this.filters = { search: "", priority: "All", category: "All" };
      this.listeners = {};
      this.timerInterval = null;
      this.isAlarmActive = false;
      this.alarmInterval = null;
      this.audioCtx = null;

      // Update streaks on boot
      this.verifyHabitsStreaksOnBoot();
    }

    subscribe(event, callback) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(callback);
      return () => this.unsubscribe(event, callback);
    }

    unsubscribe(event, callback) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      }
    }

    emit(event, data) {
      if (this.listeners[event]) {
        this.listeners[event].forEach(cb => cb(data));
      }
    }

    // -------------------------------------------------------------------------
    // Tasks Operations
    // -------------------------------------------------------------------------
    addTask(data) {
      const task = {
        id: this.nextId,
        title: data.title.trim(),
        description: (data.description || "").trim(),
        dueDate: data.dueDate || getLocalDateString(),
        priority: data.priority || "Medium",
        category: data.category || "Inbox",
        isLater: data.isLater || false,
        subtasks: data.subtasks || [],
        completed: false,
        completedDate: null,
        recurring: data.recurring || "none",
        estimatedDuration: parseInt(data.estimatedDuration) || 25,
        focusSessions: [],
        createdAt: new Date().toISOString()
      };
      
      this.nextId += 1;
      StorageService.savePreference("next_id", this.nextId);

      this.tasks.push(task);
      
      // Async Background Persist
      StorageService.putItem("tasks", task);
      
      this.emit("tasksUpdated", this.tasks);
      this.emit("notification", { message: `"${task.title}" captured!`, type: "success" });
      return task;
    }

    updateTask(id, updatedData) {
      const index = this.tasks.findIndex(t => t.id === id);
      if (index !== -1) {
        this.tasks[index] = { ...this.tasks[index], ...updatedData };
        
        // Async Background Persist
        StorageService.putItem("tasks", this.tasks[index]);

        this.emit("tasksUpdated", this.tasks);
        this.emit("notification", { message: "Task successfully saved", type: "success" });
      }
    }

    deleteTask(id) {
      const task = this.tasks.find(t => t.id === id);
      this.tasks = this.tasks.filter(t => t.id !== id);
      if (this.timer.activeTaskId === id) this.resetTimer();
      
      // Async Background Persist
      StorageService.deleteItem("tasks", id);

      this.emit("tasksUpdated", this.tasks);
      this.emit("notification", { message: `Deleted "${task ? task.title : 'task'}"`, type: "info" });
    }

    toggleTaskComplete(id) {
      const task = this.tasks.find(t => t.id === id);
      if (task) {
        task.completed = !task.completed;
        if (task.completed) {
          task.completedDate = new Date().toISOString();
          this.emit("celebrate", { taskId: id });
          if (task.recurring !== "none") this.handleRecurringRecreation(task);
        } else {
          task.completedDate = null;
        }

        // Async Background Persist
        StorageService.putItem("tasks", task);

        this.emit("tasksUpdated", this.tasks);
        this.emit("notification", {
          message: task.completed ? "Goal completed! Keep going!" : "Goal marked as pending",
          type: task.completed ? "success" : "info"
        });
      }
    }

    handleRecurringRecreation(task) {
      const parts = (task.dueDate || "").split("-").map(Number);
      const nextDate = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date();
      if (task.recurring === "daily") nextDate.setDate(nextDate.getDate() + 1);
      else if (task.recurring === "weekly") nextDate.setDate(nextDate.getDate() + 7);
      else if (task.recurring === "monthly") nextDate.setMonth(nextDate.getMonth() + 1);

      setTimeout(() => {
        this.addTask({
          title: task.title,
          description: task.description,
          dueDate: getLocalDateString(nextDate),
          priority: task.priority,
          category: task.category,
          recurring: task.recurring,
          estimatedDuration: task.estimatedDuration,
          subtasks: task.subtasks.map(s => ({ ...s, completed: false }))
        });
      }, 500);
    }

    addSubtask(taskId, title) {
      const task = this.tasks.find(t => t.id == taskId);
      if (task && title.trim()) {
        if (!task.subtasks) task.subtasks = [];
        task.subtasks.push({
          id: `${taskId}_sub_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          title: title.trim(),
          completed: false
        });

        // Async Background Persist
        StorageService.putItem("tasks", task);

        this.emit("tasksUpdated", this.tasks);
      }
    }

    addSubtasks(taskId, titlesArray) {
      const task = this.tasks.find(t => t.id == taskId);
      if (task && Array.isArray(titlesArray)) {
        if (!task.subtasks) task.subtasks = [];
        titlesArray.forEach((title, idx) => {
          if (title && title.trim()) {
            task.subtasks.push({
              id: `${taskId}_sub_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
              title: title.trim(),
              completed: false
            });
          }
        });

        // Async Background Persist
        StorageService.putItem("tasks", task);

        this.emit("tasksUpdated", this.tasks);
      }
    }

    toggleSubtask(taskId, subtaskId) {
      const task = this.tasks.find(t => t.id === taskId);
      if (task) {
        const sub = task.subtasks.find(s => s.id === subtaskId);
        if (sub) {
          sub.completed = !sub.completed;

          // Async Background Persist
          StorageService.putItem("tasks", task);

          this.emit("tasksUpdated", this.tasks);
        }
      }
    }

    deleteSubtask(taskId, subtaskId) {
      const task = this.tasks.find(t => t.id === taskId);
      if (task) {
        task.subtasks = task.subtasks.filter(s => s.id !== subtaskId);

        // Async Background Persist
        StorageService.putItem("tasks", task);

        this.emit("tasksUpdated", this.tasks);
      }
    }

    // -------------------------------------------------------------------------
    // Routines & Timetables
    // -------------------------------------------------------------------------
    addRoutineBlock(data) {
      const routine = {
        id: `rout_${Date.now()}`,
        title: data.title.trim(),
        startTime: data.startTime,
        endTime: data.endTime,
        category: data.category || "Routine",
        color: data.color || "indigo",
        icon: data.icon || "",
        days: data.days || ["Mon", "Tue", "Wed", "Thu", "Fri"]
      };
      this.routines.push(routine);

      // Async Background Persist
      StorageService.putItem("routines", routine);

      this.emit("routinesUpdated", this.routines);
      this.emit("notification", { message: `Routine block "${routine.title}" scheduled!`, type: "success" });
    }

    updateRoutineBlock(id, data) {
      const idx = this.routines.findIndex(r => r.id === id);
      if (idx !== -1) {
        this.routines[idx] = {
          ...this.routines[idx],
          title: data.title.trim(),
          startTime: data.startTime,
          endTime: data.endTime,
          category: data.category || "Routine",
          color: data.color || "indigo",
          icon: data.icon || "",
          days: data.days || ["Mon", "Tue", "Wed", "Thu", "Fri"]
        };

        // Async Background Persist
        StorageService.putItem("routines", this.routines[idx]);

        this.emit("routinesUpdated", this.routines);
        this.emit("notification", { message: "Routine block updated successfully!", type: "success" });
      }
    }

    checkRoutineOverlap(startTime, endTime, days, ignoreId = null) {
      const [shA, smA] = startTime.split(":").map(Number);
      const [ehA, emA] = endTime.split(":").map(Number);
      const startMinA = shA * 60 + smA;
      const endMinA = ehA * 60 + emA;

      const overlappingBlocks = [];

      this.routines.forEach(r => {
        if (r.id === ignoreId) return;

        // Check shared days
        const sharedDays = r.days.filter(d => days.includes(d));
        if (sharedDays.length === 0) return;

        const [shB, smB] = r.startTime.split(":").map(Number);
        const [ehB, emB] = r.endTime.split(":").map(Number);
        const startMinB = shB * 60 + smB;
        const endMinB = ehB * 60 + emB;

        if (startMinA < endMinB && endMinA > startMinB) {
          overlappingBlocks.push({
            block: r,
            days: sharedDays
          });
        }
      });

      return overlappingBlocks;
    }

    deleteRoutineBlock(id) {
      this.routines = this.routines.filter(r => r.id !== id);

      // Async Background Persist
      StorageService.deleteItem("routines", id);

      this.emit("routinesUpdated", this.routines);
      this.emit("notification", { message: "Routine block removed", type: "info" });
    }

    // -------------------------------------------------------------------------
    // Habits & Consistency
    // -------------------------------------------------------------------------
    addHabit(title, category = "Routine", color = "indigo") {
      const habit = {
        id: `hab_${Date.now()}`,
        title: title.trim(),
        category,
        color,
        streak: 0,
        maxStreak: 0,
        history: {},
        createdAt: new Date().toISOString()
      };
      this.habits.push(habit);

      // Async Background Persist
      StorageService.putItem("habits", habit);

      this.emit("habitsUpdated", this.habits);
      this.emit("notification", { message: `New atomic habit "${habit.title}" active!`, type: "success" });
      return habit;
    }

    deleteHabit(id) {
      this.habits = this.habits.filter(h => h.id !== id);

      // Async Background Persist
      StorageService.deleteItem("habits", id);

      this.emit("habitsUpdated", this.habits);
    }

    updateHabit(id, data) {
      const idx = this.habits.findIndex(h => h.id === id);
      if (idx !== -1) {
        this.habits[idx] = {
          ...this.habits[idx],
          title: data.title.trim(),
          category: data.category || "Routine",
          color: data.color || "indigo"
        };

        // Async Background Persist
        StorageService.putItem("habits", this.habits[idx]);

        this.emit("habitsUpdated", this.habits);
        this.emit("notification", { message: `Habit "${data.title}" updated!`, type: "success" });
      }
    }

    toggleHabitCompletion(id, dateStr) {
      const habit = this.habits.find(h => h.id === id);
      if (habit) {
        if (!habit.history) habit.history = {};

        const todayStr = getLocalDateString();
        if (dateStr > todayStr) {
          this.emit("notification", { message: "Cannot complete habits for future dates!", type: "error" });
          return;
        }

        habit.history[dateStr] = !habit.history[dateStr];
        this.recalculateHabitStreaks(habit);

        // Async Background Persist
        StorageService.putItem("habits", habit);

        this.emit("habitsUpdated", this.habits);
        
        if (habit.history[dateStr]) {
          this.emit("celebrate", { elementId: `habit_checkbox_${id}_${dateStr}` });
          this.emit("notification", { message: `Habit "${habit.title}" checked! Keep it up!`, type: "success" });
        }
      }
    }

    recalculateHabitStreaks(habit) {
      const history = habit.history || {};
      const sortedDates = Object.keys(history)
        .filter(d => history[d] === true)
        .sort((a, b) => new Date(b) - new Date(a)); // Newest first

      if (sortedDates.length === 0) {
        habit.streak = 0;
        return;
      }

      const todayStr = getLocalDateString();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);

      const latestDate = sortedDates[0];
      if (latestDate !== todayStr && latestDate !== yesterdayStr) {
        habit.streak = 0;
        return;
      }

      let currentStreak = 1;
      let checkDate = new Date(latestDate);

      for (let i = 1; i < sortedDates.length; i++) {
        const prevDate = new Date(sortedDates[i]);
        const diffDays = (checkDate - prevDate) / (1000 * 60 * 60 * 24);

        if (Math.round(diffDays) === 1) {
          currentStreak++;
          checkDate = prevDate;
        } else if (Math.round(diffDays) > 1) {
          break;
        }
      }

      habit.streak = currentStreak;
      if (habit.streak > (habit.maxStreak || 0)) {
        habit.maxStreak = habit.streak;
      }
    }

    verifyHabitsStreaksOnBoot() {
      this.habits.forEach(h => this.recalculateHabitStreaks(h));
      this.habits.forEach(h => StorageService.putItem("habits", h));
    }

    // -------------------------------------------------------------------------
    // Bullet Journal & Reflections
    // -------------------------------------------------------------------------
    saveJournalEntry(dateStr, data) {
      if (!this.journal[dateStr]) this.journal[dateStr] = {};
      this.journal[dateStr] = {
        ...this.journal[dateStr],
        ...data
      };

      // Async Background Persist
      StorageService.putItem("journal", { dateStr, ...this.journal[dateStr] });

      this.emit("journalUpdated", this.journal);
    }

    // -------------------------------------------------------------------------
    // Pomodoro Productivity Focus Engine
    // -------------------------------------------------------------------------
    startTimer(taskId = null) {
      this.stopAlarm();
      if (taskId !== null) this.timer.activeTaskId = taskId;
      this.timer.isRunning = true;
      if (this.timer.type !== "stopwatch") {
        this.timer.targetEndTime = Date.now() + (this.timer.duration * 1000);
      } else {
        this.timer.stopwatchStartTime = Date.now() - (this.timer.duration * 1000);
      }
      this.emit("timerStateChanged", this.timer);

      if (this.timerInterval) clearInterval(this.timerInterval);
      this.timerInterval = setInterval(() => this.tickTimer(), 1000);
    }

    pauseTimer() {
      this.stopAlarm();
      this.timer.isRunning = false;
      clearInterval(this.timerInterval);
      if (this.timer.type !== "stopwatch" && this.timer.targetEndTime) {
        this.timer.duration = Math.max(0, Math.round((this.timer.targetEndTime - Date.now()) / 1000));
        this.timer.targetEndTime = null;
      } else if (this.timer.type === "stopwatch" && this.timer.stopwatchStartTime) {
        this.timer.duration = Math.floor((Date.now() - this.timer.stopwatchStartTime) / 1000);
        this.timer.stopwatchStartTime = null;
      }
      this.emit("timerStateChanged", this.timer);
    }

    resetTimer() {
      this.stopAlarm();
      this.timer.isRunning = false;
      clearInterval(this.timerInterval);
      this.timer.targetEndTime = null;
      this.timer.stopwatchStartTime = null;
      this.timer.activeTaskId = null;
      this.setTimerDuration();
      this.emit("timerStateChanged", this.timer);
    }

    restartTimer() {
      this.stopAlarm();
      this.timer.isRunning = false;
      clearInterval(this.timerInterval);
      this.timer.targetEndTime = null;
      this.timer.stopwatchStartTime = null;
      this.setTimerDuration();
      this.startTimer(this.timer.activeTaskId);
    }

    setTimerDuration() {
      if (this.timer.type === "pomodoro") this.timer.duration = 25 * 60;
      else if (this.timer.type === "shortBreak") this.timer.duration = 5 * 60;
      else if (this.timer.type === "longBreak") this.timer.duration = 15 * 60;
      else if (this.timer.type === "stopwatch") this.timer.duration = 0;
      this.timer.totalDuration = this.timer.duration;
    }

    changeTimerType(type) {
      if (this.timer.isRunning) {
        this.emit("notification", { message: "Cannot change timer type while a session is active!", type: "info" });
        return;
      }
      this.timer.type = type;
      this.resetTimer();
    }

    skipTimerInterval(autoStart = true) {
      const wasRunning = this.timer.isRunning;
      const currentTaskId = this.timer.activeTaskId;
      this.pauseTimer();

      if (this.timer.type === "pomodoro") {
        this.savedFocusTaskId = currentTaskId;
        this.timer.type = "shortBreak";
        this.resetTimer();
        this.emit("notification", { message: "Focus skipped · Break started", type: "info" });
      } else {
        const taskIdToRestore = currentTaskId || this.savedFocusTaskId;
        this.timer.type = "pomodoro";
        this.resetTimer();
        if (taskIdToRestore) {
          this.timer.activeTaskId = taskIdToRestore;
        }
        this.emit("notification", { message: "Break skipped · Focus started", type: "info" });
      }

      if (wasRunning || autoStart) {
        this.startTimer(this.timer.activeTaskId);
      }
    }

    tickTimer() {
      if (!this.timer.isRunning) return;

      if (this.timer.type === "stopwatch") {
        if (this.timer.stopwatchStartTime) {
          this.timer.duration = Math.floor((Date.now() - this.timer.stopwatchStartTime) / 1000);
        } else {
          this.timer.duration += 1;
        }
        this.timer.elapsedSeconds = this.timer.duration;
      } else {
        if (this.timer.targetEndTime) {
          const remaining = Math.round((this.timer.targetEndTime - Date.now()) / 1000);
          this.timer.duration = Math.max(0, remaining);
        } else {
          this.timer.duration -= 1;
        }
        this.timer.elapsedSeconds += 1;

        if (this.timer.duration <= 0) {
          this.timer.duration = 0;
          this.timerComplete();
          return;
        }
      }
      this.emit("timerTick", this.timer);
    }

    timerComplete() {
      const completedType = this.timer.type;
      this.pauseTimer();

      NotificationService.send("Session Achieved!", {
        body: completedType === "pomodoro" ? "Focus session cleared! Take a breather." : "Break completed! Ready to lock in?"
      });

      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

      if (completedType === "pomodoro") {
        const minutes = Math.round(this.timer.totalDuration / 60) || 25;
        this.logFocusSession(this.timer.activeTaskId || "general_focus", minutes);
        this.timer.completedSessions = (this.timer.completedSessions || 0) + 1;
      }

      this.playAlarmLoop();

      // Determine next timer type based on the Pomodoro cycle:
      // Focus -> Short Break -> Focus -> Short Break -> Focus -> Short Break -> Focus -> Long Break
      if (completedType === "pomodoro") {
        if (this.timer.completedSessions >= 4) {
          this.timer.type = "longBreak";
          this.timer.completedSessions = 0; // reset cycle
        } else {
          this.timer.type = "shortBreak";
        }
      } else {
        this.timer.type = "pomodoro";
      }

      this.timer.activeTaskId = null;
      this.setTimerDuration();
      this.emit("timerStateChanged", this.timer);

      this.emit("timerComplete", this.timer);
    }

    logFocusSession(taskId, minutes) {
      let task;
      if (!taskId || taskId === "general_focus") {
        task = this.tasks.find(t => t.id === "general_focus");
        if (!task) {
          task = {
            id: "general_focus",
            title: "General Focus",
            description: "Accumulated unlinked focus sessions",
            category: "Inbox",
            completed: false,
            focusSessions: [],
            createdAt: new Date().toISOString()
          };
          this.tasks.push(task);
        }
      } else {
        task = this.tasks.find(t => t.id === taskId);
      }

      if (task) {
        if (!task.focusSessions) task.focusSessions = [];
        task.focusSessions.push({
          startTime: new Date().toISOString(),
          duration: minutes
        });
        
        // Async Background Persist
        StorageService.putItem("tasks", task);

        this.emit("tasksUpdated", this.tasks);
        this.emit("notification", { message: `Logged ${minutes}m focus time on "${task.title}"!`, type: "success" });
      }
    }

    playAlarmLoop() {
      // First stop any existing alarm
      this.stopAlarm();
      
      this.isAlarmActive = true;
      this.emit("alarmStateChanged", true);

      if (this.alarmSound === "steady_ascent") {
        try {
          if (!this.alarmAudio) {
            this.alarmAudio = new Audio("A_Steady_Ascent.mp3");
            this.alarmAudio.loop = true;
          }
          this.alarmAudio.currentTime = 0;
          this.alarmAudio.play().catch(err => {
            console.warn("Audio play failed, falling back to beeps:", err);
            this.playDefaultBeeps();
          });
        } catch (e) {
          console.warn("Audio element creation failed, falling back to beeps:", e);
          this.playDefaultBeeps();
        }
      } else {
        this.playDefaultBeeps();
      }
    }

    playDefaultBeeps() {
      try {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        const playBeep = () => {
          if (!this.isAlarmActive || !this.audioCtx) return;
          
          try {
            const now = this.audioCtx.currentTime;
            
            const playTone = (freq, startTime, duration) => {
              if (!this.audioCtx) return;
              const osc = this.audioCtx.createOscillator();
              const gain = this.audioCtx.createGain();
              osc.connect(gain);
              gain.connect(this.audioCtx.destination);
              
              osc.type = "sine";
              osc.frequency.setValueAtTime(freq, startTime);
              
              gain.gain.setValueAtTime(0, startTime);
              gain.gain.linearRampToValueAtTime(0.15, startTime + 0.05); // Attack
              gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration); // Decay
              
              osc.start(startTime);
              osc.stop(startTime + duration);
            };

            // Play a double beep sequence
            playTone(880, now, 0.15); // A5 note
            playTone(880, now + 0.25, 0.15);
          } catch (e) {
            console.warn("Error playing alarm beep:", e);
          }
        };

        // Play immediately, then every 1.5 seconds
        playBeep();
        this.alarmInterval = setInterval(playBeep, 1500);

      } catch (err) {
        console.warn("Web Audio Context blocked/failed:", err);
      }
    }

    stopAlarm() {
      if (!this.isAlarmActive) return;
      this.isAlarmActive = false;
      if (this.alarmInterval) {
        clearInterval(this.alarmInterval);
        this.alarmInterval = null;
      }
      if (this.audioCtx) {
        try {
          this.audioCtx.close();
        } catch (e) {
          console.warn("Error closing AudioContext:", e);
        }
        this.audioCtx = null;
      }
      if (this.alarmAudio) {
        try {
          this.alarmAudio.pause();
          this.alarmAudio.currentTime = 0;
        } catch (e) {
          console.warn("Error pausing alarm audio:", e);
        }
      }
      this.emit("alarmStateChanged", false);
    }

    // -------------------------------------------------------------------------
    // Preferences & Sidebars
    // -------------------------------------------------------------------------
    setView(view) {
      this.currentView = view;
      localStorage.setItem("indigo_redirect_view", view);
      this.emit("viewChanged", view);
    }

    setTheme(theme) {
      this.theme = theme;
      StorageService.savePreference("theme", theme);
      this.emit("preferenceChanged", { theme });
    }

    setUiStyle(style) {
      this.uiStyle = style;
      StorageService.savePreference("ui_style", style);
      this.emit("preferenceChanged", { uiStyle: style });
    }

    setAccent(accent) {
      this.accent = accent;
      StorageService.savePreference("accent", accent);
      this.emit("preferenceChanged", { accent });
    }

    setAlarmSound(sound) {
      this.alarmSound = sound;
      StorageService.savePreference("alarm_sound", sound);
      this.emit("preferenceChanged", { alarmSound: sound });
    }

    setSidebarCollapsed(collapsed) {
      this.sidebarCollapsed = collapsed;
      StorageService.savePreference("sidebar_collapsed", collapsed);
      this.emit("sidebarToggled", collapsed);
    }

    setFilters(search, priority, category) {
      this.filters.search = search;
      this.filters.priority = priority;
      this.filters.category = category;
      this.emit("filtersChanged", this.filters);
    }
  }

  // =========================================================================
  // 3. SMART NOTIFICATIONS
  // =========================================================================
  class NotificationService {
    static isSupported() {
      return "Notification" in window;
    }

    static async requestPermission() {
      if (NotificationService.isSupported() && Notification.permission !== "granted") {
        const res = await Notification.requestPermission();
        return res === "granted";
      }
      return Notification.permission === "granted";
    }

    static send(title, options = {}) {
      const enabledSetting = localStorage.getItem("aurora_notifications_enabled") !== "false";
      if (NotificationService.isSupported() && Notification.permission === "granted" && enabledSetting) {
        new Notification(title, {
          ...options
        });
      }
    }
  }

  // =========================================================================
  // 4. UI RENDERER & INTERACTION CONTROLLER
  // =========================================================================
  class AppController {
    constructor(store) {
      this.store = store;
      this.activeEditingTaskId = null;
      this.activeEditingRoutineId = null;
      this.activeEditingHabitId = null;
      this.isSubmitting = false;
      this.selectedRoutineDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
      this.routineLayoutMode = "timeline";
      this.cachedQuote = null;
      this.lastQuoteFetchTime = 0;
      this.selectedJournalDate = getLocalDateString();
      this.habitWeekOffset = 0;
      this.habitHeatmapMonthOffset = 0;
      this.geminiApiKey = localStorage.getItem("aurora_gemini_api_key") || "";
      this.pendingUnhealthyHabit = null;
      this.todayAIPlan = null;
      this.todayAITaskOrder = null;
      this.focusAITab = "today";
      this.tomorrowPlan = this.loadTomorrowPlan();
      this.tomorrowPlanDraft = null;
      this.eveningPlanningStreak = parseInt(localStorage.getItem("aurora_evening_streak") || "0", 10);
      this.quickAddState = {
        dateMode: "today",
        priority: "Medium",
        category: "Inbox"
      };

      // Touch coordinates for swipe-to-complete
      this.touchStartX = 0;
      this.touchStartY = 0;

      this.cacheDOMElements();
      this.bindStoreEvents();
      this.bindUserInteractions();
      this.populateCreationFormsFromConfigs();

      // Refresh layout on boot
      this.updateThemeClasses();
      this.updateSidebarClass();
      this.render();
      this.checkOverdueDeadlines();
    }

    cacheDOMElements() {
      this.appContainer = document.getElementById("app");
      
      // Global Sidebar elements
      this.sidebarToggleBtn = document.getElementById("sidebar_toggle_trigger");
      this.hamburgerTrigger = document.getElementById("mobile_hamburger_trigger");
      this.desktopSidebar = document.querySelector(".desktop_sidebar");
      
      // Sidebar + Bottom Navigation anchors
      this.navButtons = document.querySelectorAll(".nav_tab");
      
      // Screen views anchors
      this.viewTitle = document.getElementById("active_view_title");
      this.viewCount = document.getElementById("active_view_count");
      
      // Panels Wrapper Blocks
      this.dashboardPanel = document.getElementById("dashboard_panel");
      this.taskSection = document.getElementById("tasks_panel");
      this.taskListContainer = document.getElementById("task_list_container");
      this.routinePanel = document.getElementById("routine_panel");
      this.consistencyPanel = document.getElementById("consistency_panel");
      this.consistencyHistoryPanel = document.getElementById("consistency_history_panel");
      this.timerSection = document.getElementById("timer_panel");
      this.insightsSection = document.getElementById("insights_panel");
      this.journalPanel = document.getElementById("journal_panel");
      this.settingsSection = document.getElementById("settings_panel");

      // Shared FAB and Sheets
      this.fabButton = document.getElementById("fab_add");
      this.bottomSheet = document.getElementById("bottom_sheet");
      this.bottomSheetOverlay = document.getElementById("bottom_sheet_overlay");
      this.sheetForm = document.getElementById("sheet_form");
      this.sheetTitle = document.getElementById("sheet_form_title");
      this.sheetSubmitBtn = document.getElementById("sheet_submit");
      this.closeSheetBtn = document.getElementById("close_sheet");
      this.sheetDeleteBtn = document.getElementById("sheet_delete_btn");

      // Quick Add Task Elements
      this.quickAddContainer = document.getElementById("quick_add_container");
      this.quickAddInput = document.getElementById("quick_add_input");
      this.qaChipDate = document.getElementById("qa_chip_date");
      this.qaDateText = document.getElementById("qa_date_text");
      this.qaChipPriority = document.getElementById("qa_chip_priority");
      this.qaPriorityText = document.getElementById("qa_priority_text");
      this.qaChipCategory = document.getElementById("qa_chip_category");
      this.qaCategoryText = document.getElementById("qa_category_text");
      this.qaBtnAdvanced = document.getElementById("qa_btn_advanced");
      this.qaBtnCommit = document.getElementById("qa_btn_commit");

      // Routine Sheet specifically
      this.routineSheet = document.getElementById("routine_sheet");
      this.routineSheetOverlay = document.getElementById("routine_sheet_overlay");
      this.routineForm = document.getElementById("routine_sheet_form");
      this.closeRoutineSheetBtn = document.getElementById("close_routine_sheet");

      // Habit Sheet specifically
      this.habitSheet = document.getElementById("habit_sheet");
      this.habitSheetOverlay = document.getElementById("habit_sheet_overlay");
      this.habitForm = document.getElementById("habit_sheet_form");
      this.closeHabitSheetBtn = document.getElementById("close_habit_sheet");

      // Filter Nodes
      this.searchInput = document.getElementById("search_bar");
      this.filterPriority = document.getElementById("filter_priority");
      this.filterCategory = document.getElementById("filter_category");

      // Notifications banner nodes
      this.notifBanner = document.getElementById("notification_banner");
      this.grantNotifBtn = document.getElementById("grant_notifications");
      this.closeNotifBtn = document.getElementById("close_notification_banner");

      // Picture-in-Picture controls
      this.timerPipToggleBtn = document.getElementById("timer_pip_toggle_btn");

      // Streak flame indicators
      this.streakCountEl = document.getElementById("streak_count");
    }

    bindStoreEvents() {
      // Direct render triggers on state mutations
      this.store.subscribe("tasksUpdated", () => this.render());
      this.store.subscribe("routinesUpdated", () => this.render());
      this.store.subscribe("habitsUpdated", () => this.render());
      this.store.subscribe("journalUpdated", () => this.render());
      
      this.store.subscribe("viewChanged", (view) => {
        this.updateActiveTabUI(view);
        this.render();
      });

      this.store.subscribe("filtersChanged", () => this.render());
      this.store.subscribe("preferenceChanged", () => this.updateThemeClasses());
      
      this.store.subscribe("sidebarToggled", () => {
        this.updateSidebarClass();
      });

      // Focus screen triggers
      this.store.subscribe("timerStateChanged", (t) => this.renderTimerUI(t));
      this.store.subscribe("timerTick", (t) => this.updateTimerCountdown(t));
      this.store.subscribe("timerComplete", () => this.render());
      this.store.subscribe("alarmStateChanged", (active) => this.toggleAlarmUI(active));

      // Animations and feedbacks
      this.store.subscribe("celebrate", ({ taskId, elementId }) => {
        if (taskId) this.triggerCelebration(taskId);
        if (elementId) this.triggerElementCelebration(elementId);
      });
      this.store.subscribe("notification", ({ message, type }) => this.showToast(message, type));
    }

    bindUserInteractions() {
      // Sidebar Collapse triggers
      if (this.sidebarToggleBtn) {
        this.sidebarToggleBtn.addEventListener("click", () => {
          this.store.setSidebarCollapsed(!this.store.sidebarCollapsed);
        });
      }

      // Mobile Hamburger drawer opener
      if (this.hamburgerTrigger) {
        this.hamburgerTrigger.addEventListener("click", () => {
          this.desktopSidebar.classList.add("mobile_reveal");
          this.bottomSheetOverlay.classList.add("visible");
        });
      }

      // Close mobile drawer on overlay click
      if (this.bottomSheetOverlay) {
        this.bottomSheetOverlay.addEventListener("click", () => {
          this.desktopSidebar.classList.remove("mobile_reveal");
          if (this.bottomSheet && this.bottomSheet.classList.contains("visible")) {
            this.closeBottomSheet();
          } else {
            this.bottomSheetOverlay.classList.remove("visible");
          }
        });
      }

      // View anchors navigation click binds
      this.navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
          const target = btn.getAttribute("data-view");
          this.store.setView(target);
          this.desktopSidebar.classList.remove("mobile_reveal");
          if (this.bottomSheet && this.bottomSheet.classList.contains("visible")) {
            this.closeBottomSheet();
          } else {
            this.bottomSheetOverlay.classList.remove("visible");
          }
        });
      });

      // Quick-Add FAB sheets trigger
      if (this.fabButton) {
        this.fabButton.addEventListener("click", () => {
          if (this.store.currentView === "routine") {
            this.openRoutineSheet();
          } else {
            this.openBottomSheet();
          }
        });
      }

      // Routine quick add button
      const routineQuickAddBtn = document.getElementById("routine_quick_add_btn");
      if (routineQuickAddBtn) {
        routineQuickAddBtn.addEventListener("click", () => this.openRoutineSheet());
      }

      // Dismissal anchor controllers
      if (this.closeSheetBtn) this.closeSheetBtn.addEventListener("click", () => this.closeBottomSheet());
      const cancelSheetBtn = document.getElementById("btn_cancel_sheet");
      if (cancelSheetBtn) cancelSheetBtn.addEventListener("click", () => this.closeBottomSheet());
      if (this.sheetDeleteBtn) {
        this.sheetDeleteBtn.addEventListener("click", () => {
          if (this.activeEditingTaskId) {
            const task = this.store.tasks.find(t => t.id === this.activeEditingTaskId);
            if (confirm(`Delete "${task ? task.title : 'task'}"?`)) {
              this.store.deleteTask(this.activeEditingTaskId);
              this.closeBottomSheet();
            }
          }
        });
      }
      if (this.closeRoutineSheetBtn) this.closeRoutineSheetBtn.addEventListener("click", () => this.closeRoutineSheet());
      if (this.routineSheetOverlay) this.routineSheetOverlay.addEventListener("click", () => this.closeRoutineSheet());

      // Quick-Add Task Deck & Redesigned Modal Handlers
      this.bindQuickAddInteractions();
      this.bindPriorityPills();
      this.bindSheetAdvancedToggle();

      // Forms commit handlers
      if (this.sheetForm) {
        this.sheetForm.addEventListener("submit", (e) => {
          e.preventDefault();
          this.handleFormSubmission();
        });

        // Add Category creation trigger
        const taskCategorySelect = document.getElementById("task_category");
        let previousCategoryValue = "Inbox";

        if (taskCategorySelect) {
          taskCategorySelect.addEventListener("focus", () => {
            if (taskCategorySelect.value !== "custom") {
              previousCategoryValue = taskCategorySelect.value;
            }
          });

          taskCategorySelect.addEventListener("change", () => {
            if (taskCategorySelect.value === "custom") {
              const newTagRaw = prompt("Enter a custom category tag name:");
              const newTag = newTagRaw ? newTagRaw.trim() : null;
              if (newTag) {
                const capitalizedTag = newTag.charAt(0).toUpperCase() + newTag.slice(1);
                let existingOption = Array.from(taskCategorySelect.options).find(opt => opt.value === capitalizedTag);
                if (!existingOption) {
                  const opt = document.createElement("option");
                  opt.value = capitalizedTag;
                  opt.textContent = capitalizedTag;
                  taskCategorySelect.insertBefore(opt, taskCategorySelect.options[taskCategorySelect.options.length - 1]);
                  
                  const filterCatSelect = document.getElementById("filter_category");
                  if (filterCatSelect) {
                    const existsInFilter = Array.from(filterCatSelect.options).some(opt => opt.value === capitalizedTag);
                    if (!existsInFilter) {
                      const filterOpt = document.createElement("option");
                      filterOpt.value = capitalizedTag;
                      filterOpt.textContent = capitalizedTag;
                      filterCatSelect.appendChild(filterOpt);
                    }
                  }
                }
                taskCategorySelect.value = capitalizedTag;
                previousCategoryValue = capitalizedTag;
              } else {
                taskCategorySelect.value = previousCategoryValue;
              }
            } else {
              previousCategoryValue = taskCategorySelect.value;
            }
          });
        }

        // Quick Date scheduler chips inside creator sheet
        const dateChips = this.sheetForm.querySelectorAll(".date_chip");
        const dateInput = document.getElementById("task_due_date");
        
        dateChips.forEach(chip => {
          chip.addEventListener("click", () => {
            dateChips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");

            const daysStr = chip.getAttribute("data-days");
            if (daysStr !== null) {
              const days = parseInt(daysStr || 0);
              const d = new Date();
              d.setDate(d.getDate() + days);

              const Y = d.getFullYear();
              const M = String(d.getMonth() + 1).padStart(2, "0");
              const D = String(d.getDate()).padStart(2, "0");
              dateInput.value = `${Y}-${M}-${D}`;
              dateInput.style.display = "none";
            } else if (chip.id === "chip_custom_date") {
              dateInput.style.display = "block";
              if (!dateInput.value) {
                dateInput.value = getLocalDateString();
              }
              dateInput.focus();
            } else {
              // Clicked "Do Later" chip!
              dateInput.value = "";
              dateInput.style.display = "none";
            }
          });
        });

        dateInput.addEventListener("change", () => {
          dateChips.forEach(c => c.classList.remove("active"));
          const val = dateInput.value;
          if (val) {
            const todayStr = getLocalDateString();
            const tom = new Date(); tom.setDate(tom.getDate() + 1); const tomStr = getLocalDateString(tom);
            const nW = new Date(); nW.setDate(nW.getDate() + 7); const nWStr = getLocalDateString(nW);

            let matched = false;
            dateChips.forEach(c => {
              const offsetStr = c.getAttribute("data-days");
              if (offsetStr) {
                const offset = parseInt(offsetStr);
                if (offset === 0 && val === todayStr) { c.classList.add("active"); matched = true; }
                if (offset === 1 && val === tomStr) { c.classList.add("active"); matched = true; }
                if (offset === 7 && val === nWStr) { c.classList.add("active"); matched = true; }
              }
            });
            if (!matched) {
              const customChip = document.getElementById("chip_custom_date");
              if (customChip) customChip.classList.add("active");
              dateInput.style.display = "block";
            }
          } else {
            const doLater = document.getElementById("chip_do_later");
            if (doLater) doLater.classList.add("active");
            dateInput.style.display = "none";
          }
        });
      }

      // Routine Add form handler
      if (this.routineForm) {
        this.routineForm.addEventListener("submit", (e) => {
          e.preventDefault();
          this.handleRoutineFormSubmission();
        });
      }

      // Inline checklists subtasks capture keydown listener
      document.addEventListener("keydown", (e) => {
        if (e.target.classList.contains("subtask_input") && e.key === "Enter") {
          e.preventDefault();
          const taskId = parseInt(e.target.getAttribute("data-task-id"));
          const txt = e.target.value.trim();
          if (txt) {
            this.store.addSubtask(taskId, txt);
            e.target.value = "";
          }
        }
      });

      // Filters changes triggers
      let debounceTimeout;
      const handleFilters = (debounce = false) => {
        if (debounceTimeout) clearTimeout(debounceTimeout);
        
        const run = () => {
          this.store.setFilters(
            this.searchInput.value,
            this.filterPriority.value,
            this.filterCategory.value
          );
        };

        if (debounce) {
          debounceTimeout = setTimeout(run, 250);
        } else {
          run();
        }
      };
      if (this.searchInput) this.searchInput.addEventListener("input", () => handleFilters(true));
      if (this.filterPriority) this.filterPriority.addEventListener("change", () => handleFilters(false));
      if (this.filterCategory) this.filterCategory.addEventListener("change", () => handleFilters(false));

      // Keyboard Shortcuts setup
      document.addEventListener("keydown", (e) => {
        const tag = e.target.tagName.toLowerCase();
        const activeEditing = ["input", "textarea", "select"].includes(tag) || e.target.isContentEditable;

        if (!activeEditing) {
          // "+" or "=" or "n" focuses quick-add input or opens task creator (or routine creator)
          if (e.key === "+" || e.key === "=" || e.key === "n" || e.key === "N") {
            e.preventDefault();
            if (this.store.currentView === "routine") {
              this.openRoutineSheet();
            } else if (this.quickAddInput && this.quickAddContainer && this.quickAddContainer.style.display !== "none") {
              this.quickAddInput.focus();
              this.quickAddInput.select();
            } else {
              this.openBottomSheet();
            }
          }

          // Timer keyboard shortcuts (always active globally when timer is visible)
          if (this.store.currentView === "timer") {
            if (e.key === " " || e.code === "Space") {
              e.preventDefault();
              if (this.store.timer.isRunning) {
                this.store.pauseTimer();
              } else {
                this.store.startTimer();
              }
            } else if (e.key === "r" || e.key === "R") {
              e.preventDefault();
              this.store.restartTimer();
            }
          }
        }

        // "Escape" - dismiss sheets, close mobile sidebar, stop timer alarm, exit DF mode
        if (e.key === "Escape") {
          // If alarm is active, dismiss alarm first
          if (this.store.isAlarmActive) {
            this.dismissTimerAlarm();
            return;
          }

          // If timer is running in stopwatch/pomodoro, stop it
          if (this.store.currentView === "timer" && this.store.timer.isRunning) {
            this.store.resetTimer();
            this.closeDocumentPiP();
            return;
          }

          this.closeBottomSheet();
          this.closeRoutineSheet();
          this.desktopSidebar.classList.remove("mobile_reveal");
          if (document.body.classList.contains("journal-distraction-free")) {
            document.body.classList.remove("journal-distraction-free");
            this.render();
          }
        }
      });

      // Browser permissions alerts banner
      const bannerDismissed = localStorage.getItem("aurora_banner_dismissed") === "true";
      const notifsEnabled = localStorage.getItem("aurora_notifications_enabled") !== "false";

      if (NotificationService.isSupported() && Notification.permission === "default" && !bannerDismissed && notifsEnabled) {
        this.notifBanner.classList.add("visible");
      }
      if (this.grantNotifBtn) {
        this.grantNotifBtn.addEventListener("click", async () => {
          const granted = await NotificationService.requestPermission();
          localStorage.setItem("aurora_banner_dismissed", "true");
          localStorage.setItem("aurora_notifications_enabled", granted ? "true" : "false");
          this.notifBanner.classList.remove("visible");
          if (granted) {
            this.showToast("Notifications enabled!", "success");
            this.checkOverdueDeadlines();
          }
        });
      }
      if (this.closeNotifBtn) {
        this.closeNotifBtn.addEventListener("click", () => {
          localStorage.setItem("aurora_banner_dismissed", "true");
          localStorage.setItem("aurora_notifications_enabled", "false");
          this.notifBanner.classList.remove("visible");
        });
      }

      // -------------------------------------------------------------------------
      // FIRST-TIME BOOT WELCOME PRIVACY DIALOG
      // -------------------------------------------------------------------------
      StorageService.getPreference("welcome_dialog_shown", false).then(shown => {
        if (!shown) {
          const welcomeDialog = document.getElementById("welcome_dialog");
          if (welcomeDialog) {
            welcomeDialog.style.display = "flex";
            const dismissBtn = document.getElementById("welcome_dismiss_btn");
            if (dismissBtn) {
              dismissBtn.addEventListener("click", () => {
                welcomeDialog.style.display = "none";
                StorageService.savePreference("welcome_dialog_shown", true);
              });
            }
          }
        }
      });

      // -------------------------------------------------------------------------
      // POMODORO TIMER EVENT BINDINGS
      // -------------------------------------------------------------------------
      const playBtn = document.getElementById("timer_play_btn");
      if (playBtn) {
        playBtn.addEventListener("click", () => {
          this.store.startTimer();
          // Auto-open PiP when starting a focus session
          if (!this.pipWindow && 'documentPictureInPicture' in window) {
            this.openDocumentPiP();
          }
        });
      }

      const pauseBtn = document.getElementById("timer_pause_btn");
      if (pauseBtn) {
        pauseBtn.addEventListener("click", () => {
          this.store.pauseTimer();
        });
      }

      const stopBtn = document.getElementById("timer_stop_btn");
      if (stopBtn) {
        stopBtn.addEventListener("click", () => {
          this.store.resetTimer();
          // Auto-close PiP when stopping
          this.closeDocumentPiP();
        });
      }

      const restartBtn = document.getElementById("timer_restart_btn");
      if (restartBtn) {
        restartBtn.addEventListener("click", () => {
          this.store.restartTimer();
        });
      }

      if (this.timerPipToggleBtn) {
        this.timerPipToggleBtn.addEventListener("click", () => {
          if (this.pipWindow) {
            this.closeDocumentPiP();
          } else {
            this.openDocumentPiP();
          }
        });
      }

      const skipBtn = document.getElementById("timer_skip_btn");
      if (skipBtn) {
        skipBtn.addEventListener("click", () => {
          this.store.skipTimerInterval();
        });
      }

      const pomoBtn = document.getElementById("timer_pomo_btn");
      if (pomoBtn) {
        pomoBtn.addEventListener("click", () => this.store.changeTimerType("pomodoro"));
      }

      const shortBtn = document.getElementById("timer_short_btn");
      if (shortBtn) {
        shortBtn.addEventListener("click", () => this.store.changeTimerType("shortBreak"));
      }

      const longBtn = document.getElementById("timer_long_btn");
      if (longBtn) {
        longBtn.addEventListener("click", () => this.store.changeTimerType("longBreak"));
      }

      const stopwatchBtn = document.getElementById("timer_stopwatch_btn");
      if (stopwatchBtn) {
        stopwatchBtn.addEventListener("click", () => this.store.changeTimerType("stopwatch"));
      }

      // Focus Timer duration increment/decrement adjusters
      const btnDec = document.getElementById("btn_timer_dec");
      const btnInc = document.getElementById("btn_timer_inc");
      
      if (btnDec) {
        btnDec.addEventListener("click", () => {
          if (this.store.timer.isRunning) {
            this.showToast("Cannot adjust time during an active session!", "info");
            return;
          }
          // Decrease by 5 minutes, minimum 5 minutes
          const newDur = Math.max(300, this.store.timer.duration - 300);
          this.store.timer.duration = newDur;
          this.store.timer.totalDuration = newDur;
          this.updateTimerCountdown(this.store.timer);
        });
      }

      if (btnInc) {
        btnInc.addEventListener("click", () => {
          if (this.store.timer.isRunning) {
            this.showToast("Cannot adjust time during an active session!", "info");
            return;
          }
          // Increase by 5 minutes, max 120 minutes
          const newDur = Math.min(7200, this.store.timer.duration + 300);
          this.store.timer.duration = newDur;
          this.store.timer.totalDuration = newDur;
          this.updateTimerCountdown(this.store.timer);
        });
      }

      const timerCountdownText = document.getElementById("timer_countdown_text");
      if (timerCountdownText) {
        timerCountdownText.style.cursor = "pointer";
        timerCountdownText.title = "Click to set custom minutes";
        timerCountdownText.addEventListener("click", () => {
          if (this.store.timer.isRunning) {
            this.showToast("Cannot adjust time during an active session!", "info");
            return;
          }
          
          const currentMins = Math.round(this.store.timer.duration / 60);
          const input = prompt("Enter custom duration in minutes (1 to 180):", currentMins);
          if (input === null) return; // User cancelled
          
          const mins = parseInt(input.trim(), 10);
          if (isNaN(mins) || mins <= 0 || mins > 180) {
            this.showToast("Please enter a valid number of minutes between 1 and 180.", "error");
            return;
          }
          
          const seconds = mins * 60;
          this.store.timer.duration = seconds;
          this.store.timer.totalDuration = seconds;
          this.updateTimerCountdown(this.store.timer);
          this.showToast(`Timer duration set to ${mins} minutes!`, "success");
        });
      }

      // Alarm Dismiss Button Bindings
      const dismissAlarmBtn = document.getElementById("timer_dismiss_alarm_btn");
      if (dismissAlarmBtn) {
        dismissAlarmBtn.addEventListener("click", () => this.dismissTimerAlarm());
      }

      const startNextBtn = document.getElementById("timer_start_next_btn");
      if (startNextBtn) {
        startNextBtn.addEventListener("click", () => {
          this.dismissTimerAlarm();
          this.store.startTimer();
        });
      }

      // -------------------------------------------------------------------------
      // HABITS SLIDE-UP BOTTOM SHEET DRAWER BINDINGS
      // -------------------------------------------------------------------------
      if (this.closeHabitSheetBtn) this.closeHabitSheetBtn.addEventListener("click", () => this.closeHabitSheet());
      if (this.habitSheetOverlay) this.habitSheetOverlay.addEventListener("click", () => this.closeHabitSheet());

      if (this.habitForm) {
        this.habitForm.addEventListener("submit", (e) => {
          e.preventDefault();
          if (this.isSubmitting) return;
          const title = document.getElementById("habit_title").value.trim();
          const cat = document.getElementById("habit_category").value;
          const color = document.getElementById("habit_color").value;
          if (title) {
            this.isSubmitting = true;
            const habitSubmitBtn = this.habitForm.querySelector("button[type='submit']");
            if (habitSubmitBtn) habitSubmitBtn.disabled = true;

            if (this.activeEditingHabitId !== null) {
              this.store.updateHabit(this.activeEditingHabitId, { title, category: cat, color });
              this.evaluateHabitWithAI(title, this.activeEditingHabitId);
            } else {
              const newHabit = this.store.addHabit(title, cat, color);
              if (newHabit) this.evaluateHabitWithAI(title, newHabit.id);
            }
            this.closeHabitSheet();
          }
        });
      }

      this.bindConsistencyInteractions();

      // -------------------------------------------------------------------------
      // WEEKDAY TABS & ROUTINE VIEW TOGGLE BINDINGS
      // -------------------------------------------------------------------------
      const dayTabsBar = document.getElementById("routine_day_tabs_bar");
      if (dayTabsBar) {
        dayTabsBar.addEventListener("click", (e) => {
          const tab = e.target.closest(".routine_day_tab");
          if (tab) {
            this.selectedRoutineDay = tab.getAttribute("data-day");
            this.renderRoutineUI();
          }
        });
      }

      const layoutPills = document.getElementById("routine_layout_pills");
      if (layoutPills) {
        layoutPills.addEventListener("click", (e) => {
          const btn = e.target.closest(".pill_btn");
          if (btn) {
            this.routineLayoutMode = btn.getAttribute("data-layout");
            this.renderRoutineUI();
          }
        });
      }

      this.store.subscribe("tasksUpdated", () => this.populateCategoryDropdowns());
    }

    updateThemeClasses() {
      document.body.className = `theme-${this.store.theme} accent-${this.store.accent}`;
      document.body.setAttribute("data-style", this.store.uiStyle || "neo-brutalism");

      // Dynamically sync SVG gradients to match theme accent in real-time
      const ringGradient = document.getElementById("ringGradient");
      if (ringGradient) {
        const accentColor = getComputedStyle(document.body).getPropertyValue("--accent-primary").trim();
        if (accentColor) {
          const stops = ringGradient.querySelectorAll("stop");
          stops.forEach(s => {
            s.setAttribute("stop-color", accentColor);
            s.style.stopColor = accentColor;
          });
        }
      }
    }

    updateSidebarClass() {
      this.appContainer.classList.toggle("collapsed", this.store.sidebarCollapsed);
    }

    updateActiveTabUI(view) {
      this.navButtons.forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-view") === view);
      });
    }

    populateCategoryDropdowns() {
      const cats = ["All", "Inbox", "Work", "Personal", "Health", "Finance"];
      this.store.tasks.filter(t => t.id !== "general_focus").forEach(t => {
        if (t.category && !cats.includes(t.category)) cats.push(t.category);
      });

      const current = this.filterCategory.value;
      this.filterCategory.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join("");
      this.filterCategory.value = cats.includes(current) ? current : "All";

      const taskCatSelect = document.getElementById("task_category");
      if (taskCatSelect) {
        const optionSet = cats.filter(c => c !== "All");
        taskCatSelect.innerHTML = optionSet.map(c => `<option value="${c}">${c}</option>`).join("") + `<option value="custom">+ Create Tag...</option>`;
      }
    }

    populateCreationFormsFromConfigs() {
      // 1. Capture New Goal (Task) Form Select Options
      const taskPriority = document.getElementById("task_priority");
      if (taskPriority && CONFIG_CAPTURE_NEW_GOAL.priorities) {
        taskPriority.innerHTML = CONFIG_CAPTURE_NEW_GOAL.priorities.map(p => 
          `<option value="${p.value}">${p.label}</option>`
        ).join("");
      }

      const taskCategory = document.getElementById("task_category");
      if (taskCategory && CONFIG_CAPTURE_NEW_GOAL.categories) {
        const optionSet = CONFIG_CAPTURE_NEW_GOAL.categories;
        taskCategory.innerHTML = optionSet.map(c => 
          `<option value="${c}">${c}</option>`
        ).join("") + `<option value="custom">+ Create Tag...</option>`;
      }

      const taskDuration = document.getElementById("task_duration");
      if (taskDuration && CONFIG_CAPTURE_NEW_GOAL.durations) {
        taskDuration.innerHTML = CONFIG_CAPTURE_NEW_GOAL.durations.map(d => 
          `<option value="${d.value}">${d.label}</option>`
        ).join("");
      }

      const taskRecurring = document.getElementById("task_recurring");
      if (taskRecurring && CONFIG_CAPTURE_NEW_GOAL.recurrences) {
        taskRecurring.innerHTML = CONFIG_CAPTURE_NEW_GOAL.recurrences.map(r => 
          `<option value="${r.value}">${r.label}</option>`
        ).join("");
      }

      // 2. Schedule Routine Form Select Options
      const routineCategory = document.getElementById("routine_category");
      if (routineCategory && CONFIG_SCHEDULE_ROUTINE.categories) {
        routineCategory.innerHTML = CONFIG_SCHEDULE_ROUTINE.categories.map(c => 
          `<option value="${c}">${c}</option>`
        ).join("");
      }

      const routineColor = document.getElementById("routine_color");
      if (routineColor && CONFIG_SCHEDULE_ROUTINE.colors) {
        routineColor.innerHTML = CONFIG_SCHEDULE_ROUTINE.colors.map(col => 
          `<option value="${col.value}">${col.label}</option>`
        ).join("");
      }

      // 3. Create Habit Form Select Options
      const habitCategory = document.getElementById("habit_category");
      if (habitCategory && CONFIG_CREATE_HABIT.categories) {
        habitCategory.innerHTML = CONFIG_CREATE_HABIT.categories.map(c => 
          `<option value="${c}">${c}</option>`
        ).join("");
      }

      const habitColor = document.getElementById("habit_color");
      if (habitColor && CONFIG_CREATE_HABIT.colors) {
        habitColor.innerHTML = CONFIG_CREATE_HABIT.colors.map(col => 
          `<option value="${col.value}">${col.label}</option>`
        ).join("");
      }

      // 4. Recommended Habit Templates Chips in index.html dynamically
      const templatesBox = document.getElementById("habit_templates");
      if (templatesBox && CONFIG_CREATE_HABIT.templates) {
        templatesBox.innerHTML = CONFIG_CREATE_HABIT.templates.map(tpl => 
          `<button type="button" class="template_chip" data-title="${tpl.title}" data-cat="${tpl.cat}" data-color="${tpl.color}">
            ${tpl.svg ? tpl.svg : ""} ${tpl.label}
          </button>`
        ).join("");

        // Bind click events to dynamically populated templates chips
        templatesBox.querySelectorAll(".template_chip").forEach(chip => {
          chip.addEventListener("click", () => {
            document.getElementById("habit_title").value = chip.getAttribute("data-title");
            document.getElementById("habit_category").value = chip.getAttribute("data-cat");
            document.getElementById("habit_color").value = chip.getAttribute("data-color");
            
            // Toggle highlight
            templatesBox.querySelectorAll(".template_chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
          });
        });
      }
    }

    // =========================================================================
    // RENDERING CORE VIEWPORTS (SPA DIRECTING)
    // =========================================================================
    render() {
      const active = this.store.currentView;

      // Reset displayed elements visibility states
      this.dashboardPanel.style.display = (active === "dashboard") ? "block" : "none";
      this.taskSection.style.display = (["all", "today", "tomorrow", "upcoming", "overdue", "completed", "later"].includes(active)) ? "block" : "none";
      this.routinePanel.style.display = (active === "routine") ? "block" : "none";
      this.consistencyPanel.style.display = (active === "consistency") ? "block" : "none";
      this.consistencyHistoryPanel.style.display = (active === "consistency_history") ? "block" : "none";
      this.timerSection.style.display = (active === "timer") ? "flex" : "none";
      document.body.classList.toggle("view-timer-active", active === "timer");
      this.insightsSection.style.display = (active === "insights") ? "block" : "none";
      this.journalPanel.style.display = (active === "journal") ? "block" : "none";
      this.settingsSection.style.display = (active === "settings") ? "block" : "none";

      this.streakCountEl.textContent = this.store.habits.reduce((acc, h) => Math.max(acc, h.streak || 0), 0);

      // Update active view header title
      const viewTitles = {
        dashboard: "Dashboard",
        routine: "Daily Schedule",
        consistency: "Habit Tracker",
        consistency_history: "Consistency History",
        timer: "Focus Timer",
        insights: "Performance Analytics",
        journal: "Mindful Journal",
        settings: "Settings",
        all: "All Tasks",
        today: "Today's Focus",
        tomorrow: "Tomorrow's Focus",
        upcoming: "Upcoming Tasks",
        overdue: "Overdue Tasks",
        completed: "Completed Tasks",
        later: "Do It Later"
      };

      if (viewTitles[active]) {
        this.viewTitle.textContent = viewTitles[active];
      }

      // Show/hide view count badge
      if (["all", "today", "tomorrow", "upcoming", "overdue", "completed", "later"].includes(active)) {
        this.viewCount.style.display = "inline-block";
      } else {
        this.viewCount.style.display = "none";
      }

      if (active === "dashboard") this.renderDashboardUI();
      else if (active === "routine") this.renderRoutineUI();
      else if (active === "consistency") this.renderConsistencyUI();
      else if (active === "consistency_history") this.renderConsistencyHistoryUI();
      else if (active === "timer") this.renderTimerUI(this.store.timer);
      else if (active === "insights") this.renderInsightsUI();
      else if (active === "journal") this.renderJournalUI();
      else if (active === "settings") this.renderSettingsUI();
      else this.renderTaskListUI(active);
    }

    // -------------------------------------------------------------------------
    // 1. DASHBOARD VIEW (PSYCHOLOGICAL COMMAND CENTER)
    // -------------------------------------------------------------------------
    renderDashboardUI() {
      const nowNode = document.getElementById("dash_now_block");
      const nextNode = document.getElementById("dash_next_block");

      const routineMap = this.getNowNextRoutine();
      
      if (routineMap.now) {
        nowNode.innerHTML = `
          <div class="dash_rout_card border-${routineMap.now.color}">
            <span class="dash_rout_icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </span>
            <div class="dash_rout_text">
              <h4>${this.escapeHTML(routineMap.now.title)}</h4>
              <p>${routineMap.now.startTime} - ${routineMap.now.endTime} (${routineMap.now.category})</p>
            </div>
          </div>
        `;
      } else {
        nowNode.innerHTML = `<div class="dash_rout_empty">Free Breathing Space</div>`;
      }

      if (routineMap.next) {
        nextNode.innerHTML = `
          <div class="dash_rout_card next border-${routineMap.next.color}">
            <span class="dash_rout_icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </span>
            <div class="dash_rout_text">
              <h4>${this.escapeHTML(routineMap.next.title)}</h4>
              <p>Upcoming at ${routineMap.next.startTime}</p>
            </div>
          </div>
        `;
      } else {
        nextNode.innerHTML = `<div class="dash_rout_empty">No further activities today</div>`;
      }

      const listSummaryBox = document.getElementById("dash_urgent_tasks");
      const pendingTasks = this.store.tasks.filter(t => t.id !== "general_focus" && !t.completed);
      
      const todayStr = getLocalDateString();
      const urgentTasks = pendingTasks.filter(t => t.dueDate <= todayStr || t.priority === "High")
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 3);

      if (urgentTasks.length === 0) {
        listSummaryBox.innerHTML = `
          <div class="dash_tasks_clear_card">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--accent-secondary)" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>Your mental space is fully clear! No urgent deadlines.</p>
          </div>
        `;
      } else {
        listSummaryBox.innerHTML = "";
        urgentTasks.forEach(task => {
          const card = this.createTaskCardDOM(task);
          listSummaryBox.appendChild(card);
        });
      }

      const focusNudgeBox = document.getElementById("dash_focus_nudge_area");

      // If timer is actively running, show live session status
      if (this.store.timer.isRunning) {
        const activeTask = this.store.timer.activeTaskId
          ? this.store.tasks.find(tk => tk.id === this.store.timer.activeTaskId)
          : null;
        const mins = Math.floor(Math.abs(this.store.timer.duration) / 60);
        const secs = Math.abs(this.store.timer.duration) % 60;
        const timeLeft = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

        focusNudgeBox.innerHTML = `
          <div class="dash_nudge_prompt_card">
            <div class="nudge_text">
              <span>🔴 FOCUS SESSION ACTIVE</span>
              <h3>${activeTask ? this.escapeHTML(activeTask.title) : 'Deep Work'}</h3>
              <p>${timeLeft} remaining · ${this.store.timer.type === 'pomodoro' ? 'Focus Block' : this.store.timer.type === 'shortBreak' ? 'Short Break' : this.store.timer.type === 'longBreak' ? 'Long Break' : 'Stopwatch'}</p>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="nudge_focus_btn" id="btn_nudge_goto_timer">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                View Timer
              </button>
              <button class="nudge_focus_btn secondary" id="btn_nudge_stop_focus" style="background-color: rgba(239,68,68,0.15); color: #ef4444; box-shadow: none;">
                Stop
              </button>
            </div>
          </div>
        `;

        document.getElementById("btn_nudge_goto_timer").addEventListener("click", () => {
          this.store.setView("timer");
        });
        document.getElementById("btn_nudge_stop_focus").addEventListener("click", () => {
          this.store.resetTimer();
        });
      } else {
        // Show today's focus summary
        const todayStr = getLocalDateString();
        let todayFocusMin = 0;
        let todaySessions = 0;
        this.store.tasks.forEach(t => {
          if (t.focusSessions) {
            t.focusSessions.forEach(fs => {
              const fsDate = fs.startTime ? fs.startTime.split("T")[0] : null;
              if (fsDate === todayStr) {
                todayFocusMin += fs.duration || 0;
                todaySessions++;
              }
            });
          }
        });

        const focusSummaryText = todaySessions > 0
          ? `${todaySessions} session${todaySessions > 1 ? 's' : ''} · ${(todayFocusMin / 60).toFixed(1)}h focused today`
          : "No focus sessions today yet";

        const highPriorityTask = pendingTasks.find(t => t.priority === "High") || pendingTasks[0];

        if (highPriorityTask) {
          focusNudgeBox.innerHTML = `
            <div class="dash_nudge_prompt_card">
              <div class="nudge_text">
                <span>RECOMMENDED ATOMIC TARGET · ${focusSummaryText}</span>
                <h3>${this.escapeHTML(highPriorityTask.title)}</h3>
                <p>${highPriorityTask.description ? this.escapeHTML(highPriorityTask.description) : 'Locked focus block'}</p>
              </div>
              <button class="nudge_focus_btn" id="btn_nudge_launch_focus">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Focus (${highPriorityTask.estimatedDuration || 25}m)
              </button>
            </div>
          `;

          document.getElementById("btn_nudge_launch_focus").addEventListener("click", () => {
            this.store.setView("timer");
            this.store.startTimer(highPriorityTask.id);
          });
        } else {
          focusNudgeBox.innerHTML = `
            <div class="dash_nudge_prompt_card clean_slate">
              <div class="nudge_text">
                <span>SYSTEM COMPANION · ${focusSummaryText}</span>
                <h3>All actions accomplished!</h3>
                <p>Consider reading, stretching, or scheduling upcoming objectives.</p>
              </div>
              <button class="nudge_focus_btn secondary" id="btn_nudge_quick_add">+ Capture Goal</button>
            </div>
          `;

          document.getElementById("btn_nudge_quick_add").addEventListener("click", () => this.openBottomSheet());
        }
      }

      const completedTodayCount = this.getCompletedTodayCount();
      const totalTodayTasks = this.store.tasks.filter(t => t.dueDate === todayStr).length;
      const taskRingPct = totalTodayTasks > 0 ? (completedTodayCount / totalTodayTasks) : (this.store.tasks.length > 0 ? (this.store.tasks.filter(t => t.completed).length / this.store.tasks.length) : 0);

      const completedHabits = this.store.habits.filter(h => h.history && h.history[todayStr] === true).length;
      const habitRingPct = this.store.habits.length > 0 ? (completedHabits / this.store.habits.length) : 0;

      this.updateCircularProgressRing("ring_tasks_today", taskRingPct);
      this.updateCircularProgressRing("ring_habits_today", habitRingPct);
      document.getElementById("dash_tasks_pct_label").textContent = `${Math.round(taskRingPct * 100)}%`;
      document.getElementById("dash_habits_pct_label").textContent = `${Math.round(habitRingPct * 100)}%`;

      this.loadInspirationalQuote();
    }

    async loadInspirationalQuote() {
      const quoteEl = document.getElementById("dash_wisdom_prompt_quote");
      if (!quoteEl) return;

      const offlineQuotes = [
        { quote: "Simplify. Focus on the single next action.", author: "Don Norman" },
        { quote: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun" },
        { quote: "If you want to build a habit, make it obvious and make it easy.", author: "James Clear" },
        { quote: "Productivity is about clearing clutter to protect your creative energy.", author: "Gleb Kuznetsov" },
        { quote: "You do not rise to the level of your goals. You fall to the level of your systems.", author: "James Clear" },
        { quote: "Atomic habits compound over calendar blocks. Brick by brick, momentum rises.", author: "James Clear" },
        { quote: "Deep work is the superpower of the 21st century. Protect your blocks.", author: "Cal Newport" },
        { quote: "Clear your evening. Mindful shutdowns restore tomorrow's baseline.", author: "Cal Newport" }
      ];

      const now = Date.now();
      if (this.cachedQuote && (now - this.lastQuoteFetchTime < 3600000)) {
        quoteEl.innerHTML = this.cachedQuote;
        return;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch("https://quoteslate.vercel.app/api/quotes/random", { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          if (data && data.quote && data.author) {
            this.cachedQuote = `"${this.escapeHTML(data.quote)}" <span class="quote_author" style="font-size: 0.85em; opacity: 0.75; font-style: italic;">— ${this.escapeHTML(data.author)}</span>`;
            this.lastQuoteFetchTime = now;
            quoteEl.innerHTML = this.cachedQuote;
            return;
          }
        }
      } catch (err) {
        console.warn("Failed to fetch random quote from API, using offline fallback.", err);
      }

      const dateIndex = new Date().getDate() % offlineQuotes.length;
      const q = offlineQuotes[dateIndex];
      this.cachedQuote = `"${this.escapeHTML(q.quote)}" <span class="quote_author" style="font-size: 0.85em; opacity: 0.75; font-style: italic;">— ${this.escapeHTML(q.author)}</span>`;
      this.lastQuoteFetchTime = now;
      quoteEl.innerHTML = this.cachedQuote;
    }

    getNowNextRoutine() {
      const now = new Date();
      const currentMin = now.getHours() * 60 + now.getMinutes();
      const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const currentDayLabel = weekdayLabels[now.getDay()];

      const todayRoutines = this.store.routines.filter(r => r.days.includes(currentDayLabel));

      let activeBlock = null;
      let upcomingBlock = null;
      let minUpcomingDiff = Infinity;

      todayRoutines.forEach(rout => {
        const [startH, startM] = rout.startTime.split(":").map(Number);
        const [endH, endM] = rout.endTime.split(":").map(Number);
        const startMin = startH * 60 + startM;
        const endMin = endH * 60 + endM;

        if (currentMin >= startMin && currentMin <= endMin) {
          activeBlock = rout;
        } else if (startMin > currentMin) {
          const diff = startMin - currentMin;
          if (diff < minUpcomingDiff) {
            minUpcomingDiff = diff;
            upcomingBlock = rout;
          }
        }
      });

      if (!upcomingBlock && todayRoutines.length > 0) {
        todayRoutines.sort((a, b) => a.startTime.localeCompare(b.startTime));
        upcomingBlock = todayRoutines[0];
      }

      return { now: activeBlock, next: upcomingBlock };
    }

    updateCircularProgressRing(elementId, percentage) {
      const ring = document.getElementById(elementId);
      if (ring) {
        const radius = ring.r.baseVal.value;
        const circ = 2 * Math.PI * radius;
        const cappedPct = Math.min(Math.max(percentage, 0), 1);
        const offset = circ - (cappedPct * circ);
        ring.style.strokeDasharray = `${circ} ${circ}`;
        ring.style.strokeDashoffset = offset;
      }
    }

    // -------------------------------------------------------------------------
    // 2. DAILY ROUTINE VIEW (WAKING TIME-BLOCK PLANNERS)
    // -------------------------------------------------------------------------
    renderRoutineUI() {
      const wrapper = document.getElementById("routine_timetable_scroller");
      if (!wrapper) return;

      // Update switcher highlights
      const tabs = document.querySelectorAll("#routine_day_tabs_bar .routine_day_tab");
      tabs.forEach(t => {
        t.classList.toggle("active", t.getAttribute("data-day") === this.selectedRoutineDay);
      });

      const pills = document.querySelectorAll("#routine_layout_pills .pill_btn");
      pills.forEach(p => {
        p.classList.toggle("active", p.getAttribute("data-layout") === this.routineLayoutMode);
      });

      const [wakeH, wakeM] = this.store.routinePrefs.wakeUpTime.split(":").map(Number);
      const [sleepH, sleepM] = this.store.routinePrefs.sleepTime.split(":").map(Number);

      const now = new Date();
      const currentHour = now.getHours();
      const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const currentDayLabel = weekdayLabels[now.getDay()];

      const dayRoutines = this.store.routines.filter(r => r.days.includes(this.selectedRoutineDay));
      dayRoutines.sort((a, b) => a.startTime.localeCompare(b.startTime));

      if (this.routineLayoutMode === "timeline") {
        let cardsHtml = "";
        if (dayRoutines.length === 0) {
          cardsHtml = `
            <div class="agenda_empty_card">
              <p>No routine blocks scheduled for ${this.selectedRoutineDay}. Enjoy a clear canvas, or capture a new scheduled block!</p>
            </div>
          `;
        } else {
          dayRoutines.forEach(rout => {
            const [sH, sM] = rout.startTime.split(":").map(Number);
            const [eH, eM] = rout.endTime.split(":").map(Number);
            const durationMin = (eH * 60 + eM) - (sH * 60 + sM);

            let activeNowHtml = "";
            let activeClass = "";
            const isToday = this.selectedRoutineDay === currentDayLabel;
            
            if (isToday) {
              const currentMin = now.getHours() * 60 + now.getMinutes();
              const startMin = sH * 60 + sM;
              const endMin = eH * 60 + eM;
              
              if (currentMin >= startMin && currentMin <= endMin) {
                activeClass = "active_now_item";
                const elapsedPct = Math.round(((currentMin - startMin) / (endMin - startMin)) * 100);
                const remainingMin = endMin - currentMin;
                activeNowHtml = `
                  <div class="agenda_active_beacon" style="margin-top: 8px;">
                    <span class="beacon_dot"></span>
                    Active Now
                  </div>
                  <div class="agenda_progress_wrapper">
                    <div class="agenda_progress_labels">
                      <span>Progress: ${elapsedPct}%</span>
                      <span>${remainingMin}m left</span>
                    </div>
                    <div class="agenda_progress_track">
                      <div class="agenda_progress_bar bg-${rout.color}" style="width: ${elapsedPct}%"></div>
                    </div>
                  </div>
                `;
              }
            }

            cardsHtml += `
              <div class="agenda_timeline_item ${activeClass}" data-id="${rout.id}">
                <div class="agenda_timeline_header">
                  <div class="agenda_block_title_area">
                    <span class="agenda_block_indicator bg-${rout.color}"></span>
                    <h4>${this.escapeHTML(rout.title)}</h4>
                  </div>
                  <div class="agenda_block_actions">
                    <button class="agenda_block_btn edit" title="Edit block">Edit</button>
                    <button class="agenda_block_btn delete" title="Delete block">✕</button>
                  </div>
                </div>
                <div class="agenda_timeline_meta">
                  <span class="agenda_time_badge">${rout.startTime} - ${rout.endTime}</span>
                  <span class="agenda_category_badge">${rout.category}</span>
                  <span class="agenda_duration_badge">${durationMin}m</span>
                </div>
                ${activeNowHtml}
              </div>
            `;
          });
        }

        wrapper.innerHTML = `
          <div class="timeline_agenda_wrapper">
            ${cardsHtml}
          </div>
        `;

        wrapper.querySelectorAll(".agenda_timeline_item").forEach(card => {
          const id = card.getAttribute("data-id");
          
          const openEdit = () => {
            const block = this.store.routines.find(r => r.id === id);
            if (block) {
              this.openRoutineSheet(block);
            }
          };

          card.querySelector(".edit").addEventListener("click", (e) => {
            e.stopPropagation();
            openEdit();
          });

          card.addEventListener("click", (e) => {
            if (e.target.closest(".agenda_block_btn")) return;
            openEdit();
          });

          card.querySelector(".delete").addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm("Permanently unschedule this routine block?")) {
              this.store.deleteRoutineBlock(id);
            }
          });
        });

      } else {
        // Hourly Waking Grid mode
        let hours = [];
        if (wakeH <= sleepH) {
          for (let h = wakeH; h <= sleepH; h++) hours.push(h);
        } else {
          for (let h = wakeH; h < 24; h++) hours.push(h);
          for (let h = 0; h <= sleepH; h++) hours.push(h);
        }

        let tableRowsHtml = "";

        hours.forEach(h => {
          const formattedHour = `${h.toString().padStart(2, "0")}:00`;
          const isCurrentHour = h === currentHour && this.selectedRoutineDay === currentDayLabel;

          const matches = dayRoutines.filter(rout => {
            const startHour = parseInt(rout.startTime.split(":")[0]);
            return startHour === h;
          });

          if (matches.length === 0) {
            tableRowsHtml += `
              <tr class="routine_table_row ${isCurrentHour ? 'active_hour' : ''}">
                <td class="routine_time_col">${formattedHour}</td>
                <td class="routine_block_col empty_block" colspan="4">Free Space</td>
              </tr>
            `;
          } else {
            matches.forEach((rout, index) => {
              const [sH, sM] = rout.startTime.split(":").map(Number);
              const [eH, eM] = rout.endTime.split(":").map(Number);
              const durationMin = (eH * 60 + eM) - (sH * 60 + sM);
              
              tableRowsHtml += `
                <tr class="routine_table_row ${isCurrentHour ? 'active_hour' : ''}" data-id="${rout.id}">
                  ${index === 0 ? `<td class="routine_time_col" rowspan="${matches.length}">${formattedHour}</td>` : ''}
                  <td class="routine_block_col">
                    <div class="routine_block_indicator bg-${rout.color}"></div>
                    <div class="routine_block_details">
                      <span class="routine_block_title">${this.escapeHTML(rout.title)}</span>
                      <span class="routine_block_time_span">${rout.startTime} - ${rout.endTime}</span>
                    </div>
                  </td>
                  <td class="routine_category_col">
                    <span class="category_badge">${rout.category}</span>
                  </td>
                  <td class="routine_duration_col">${durationMin}m</td>
                  <td class="routine_action_col">
                    <button class="routine_block_delete_btn" aria-label="Remove routine" title="Delete block">✕</button>
                  </td>
                </tr>
              `;
            });
          }
        });

        wrapper.innerHTML = `
          <div class="routine_table_responsive_wrapper">
            <table class="routine_table">
              <thead>
                <tr>
                  <th>Hour</th>
                  <th>Activity Block</th>
                  <th>Category</th>
                  <th>Duration</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
              </tbody>
            </table>
          </div>
        `;

        wrapper.querySelectorAll(".routine_table_row").forEach(row => {
          const id = row.getAttribute("data-id");
          if (!id) return;

          row.addEventListener("click", (e) => {
            if (e.target.closest(".routine_block_delete_btn")) return;
            const block = this.store.routines.find(r => r.id === id);
            if (block) {
              this.openRoutineSheet(block);
            }
          });
        });

        wrapper.querySelectorAll(".routine_block_delete_btn").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const row = btn.closest(".routine_table_row");
            const blockId = row.getAttribute("data-id");
            if (confirm("Permanently unschedule this routine block?")) {
              this.store.deleteRoutineBlock(blockId);
            }
          });
        });
      }
    }

    openRoutineSheet(block = null) {
      this.routineSheet.classList.add("visible");
      this.routineSheetOverlay.classList.add("visible");
      document.body.classList.add("modal-open");

      const formTitle = document.getElementById("routine_sheet_title");
      const submitBtn = document.getElementById("routine_sheet_submit");

      if (block) {
        this.activeEditingRoutineId = block.id;
        if (formTitle) formTitle.textContent = "Refine Scheduled Block";
        if (submitBtn) submitBtn.textContent = "Save Changes";

        document.getElementById("routine_title").value = block.title;
        document.getElementById("routine_start_time").value = block.startTime;
        document.getElementById("routine_end_time").value = block.endTime;
        document.getElementById("routine_category").value = block.category || "Routine";
        document.getElementById("routine_color").value = block.color || "indigo";
        document.getElementById("routine_icon").value = block.icon || "";

        // Uncheck all days first
        this.routineForm.querySelectorAll("input[name='routine_days']").forEach(cb => {
          cb.checked = block.days.includes(cb.value);
        });
      } else {
        this.activeEditingRoutineId = null;
        if (formTitle) formTitle.textContent = "Schedule Routine Block";
        if (submitBtn) submitBtn.textContent = "Schedule Block";

        this.routineForm.reset();
        
        // Default check all days
        this.routineForm.querySelectorAll("input[name='routine_days']").forEach(cb => {
          cb.checked = true;
        });
      }

      setTimeout(() => document.getElementById("routine_title").focus(), 200);
    }

    closeRoutineSheet() {
      this.routineSheet.classList.remove("visible");
      this.routineSheetOverlay.classList.remove("visible");
      document.body.classList.remove("modal-open");
      this.activeEditingRoutineId = null;
      this.isSubmitting = false;
      const routineSubmitBtn = document.getElementById("routine_sheet_submit");
      if (routineSubmitBtn) routineSubmitBtn.disabled = false;
    }

    openHabitSheet(habit = null) {
      this.habitSheet.classList.add("visible");
      this.habitSheetOverlay.classList.add("visible");
      document.body.classList.add("modal-open");

      const formTitle = document.getElementById("habit_sheet_title");
      const submitBtn = this.habitForm.querySelector("button[type='submit']");

      if (habit) {
        this.activeEditingHabitId = habit.id;
        if (formTitle) formTitle.textContent = "Edit Habit";
        if (submitBtn) submitBtn.textContent = "Save Changes";

        document.getElementById("habit_title").value = habit.title;
        document.getElementById("habit_category").value = habit.category || "Routine";
        document.getElementById("habit_color").value = habit.color || "indigo";
      } else {
        this.activeEditingHabitId = null;
        if (formTitle) formTitle.textContent = "Create Atomic Habit";
        if (submitBtn) submitBtn.textContent = "Save Habit";
        this.habitForm.reset();
      }

      setTimeout(() => document.getElementById("habit_title").focus(), 200);
    }

    closeHabitSheet() {
      this.habitSheet.classList.remove("visible");
      this.habitSheetOverlay.classList.remove("visible");
      document.body.classList.remove("modal-open");
      this.isSubmitting = false;
      const habitSubmitBtn = this.habitForm.querySelector("button[type='submit']");
      if (habitSubmitBtn) habitSubmitBtn.disabled = false;
    }

    handleRoutineFormSubmission() {
      if (this.isSubmitting) return;
      const title = document.getElementById("routine_title").value.trim();
      const startTime = document.getElementById("routine_start_time").value;
      const endTime = document.getElementById("routine_end_time").value;
      const category = document.getElementById("routine_category").value;
      const color = document.getElementById("routine_color").value;
      const icon = document.getElementById("routine_icon").value.trim() || "";

      const days = [];
      this.routineForm.querySelectorAll("input[name='routine_days']:checked").forEach(cb => {
        days.push(cb.value);
      });

      if (!title || !startTime || !endTime || days.length === 0) {
        alert("Please specify routine objective, schedule times, and active weekdays!");
        return;
      }

      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      if (sh * 60 + sm >= eh * 60 + em) {
        alert("Routine start time must precede the scheduled completion time!");
        return;
      }

      this.isSubmitting = true;
      const routineSubmitBtn = document.getElementById("routine_sheet_submit");
      if (routineSubmitBtn) routineSubmitBtn.disabled = true;

      // Check soft overlaps
      const overlaps = this.store.checkRoutineOverlap(startTime, endTime, days, this.activeEditingRoutineId);
      if (overlaps.length > 0) {
        const names = overlaps.map(o => `"${o.block.title}" on ${o.days.join(", ")}`).join(", ");
        this.showToast(`Warning: Intersects with ${names}!`, "info");
      }

      const blockData = { title, startTime, endTime, category, color, icon, days };

      if (this.activeEditingRoutineId !== null) {
        this.store.updateRoutineBlock(this.activeEditingRoutineId, blockData);
      } else {
        this.store.addRoutineBlock(blockData);
      }

      this.closeRoutineSheet();
    }

    // -------------------------------------------------------------------------
    // 3. CONSISTENCY VIEW (GRID MATRICES & HEATMAPS)
    // -------------------------------------------------------------------------
    bindConsistencyInteractions() {
      // Week Navigation
      const prevWeekBtn = document.getElementById("btn_habit_prev_week");
      const thisWeekBtn = document.getElementById("btn_habit_this_week");
      const nextWeekBtn = document.getElementById("btn_habit_next_week");

      if (prevWeekBtn && !prevWeekBtn.dataset.bound) {
        prevWeekBtn.dataset.bound = "true";
        prevWeekBtn.addEventListener("click", () => {
          this.habitWeekOffset -= 1;
          this.renderConsistencyUI();
        });
      }

      if (thisWeekBtn && !thisWeekBtn.dataset.bound) {
        thisWeekBtn.dataset.bound = "true";
        thisWeekBtn.addEventListener("click", () => {
          this.habitWeekOffset = 0;
          this.renderConsistencyUI();
        });
      }

      if (nextWeekBtn && !nextWeekBtn.dataset.bound) {
        nextWeekBtn.dataset.bound = "true";
        nextWeekBtn.addEventListener("click", () => {
          this.habitWeekOffset += 1;
          this.renderConsistencyUI();
        });
      }

      // Heatmap Month Navigation
      const prevMonthBtn = document.getElementById("btn_heatmap_prev_month");
      const thisMonthBtn = document.getElementById("btn_heatmap_this_month");
      const nextMonthBtn = document.getElementById("btn_heatmap_next_month");

      if (prevMonthBtn && !prevMonthBtn.dataset.bound) {
        prevMonthBtn.dataset.bound = "true";
        prevMonthBtn.addEventListener("click", () => {
          this.habitHeatmapMonthOffset -= 1;
          this.renderMonthlyHeatmapSVG();
        });
      }

      if (thisMonthBtn && !thisMonthBtn.dataset.bound) {
        thisMonthBtn.dataset.bound = "true";
        thisMonthBtn.addEventListener("click", () => {
          this.habitHeatmapMonthOffset = 0;
          this.renderMonthlyHeatmapSVG();
        });
      }

      if (nextMonthBtn && !nextMonthBtn.dataset.bound) {
        nextMonthBtn.dataset.bound = "true";
        nextMonthBtn.addEventListener("click", () => {
          this.habitHeatmapMonthOffset += 1;
          this.renderMonthlyHeatmapSVG();
        });
      }

      // Spontaneous Quick Add Form
      const quickForm = document.getElementById("habit_quick_add_form");
      if (quickForm && !quickForm.dataset.bound) {
        quickForm.dataset.bound = "true";
        quickForm.addEventListener("submit", (e) => {
          e.preventDefault();
          const input = document.getElementById("habit_quick_input");
          const catSelect = document.getElementById("habit_quick_cat");
          const title = input ? input.value.trim() : "";
          const cat = catSelect ? catSelect.value : "Routine";
          if (!title) return;

          const newHabit = this.store.addHabit(title, cat, "indigo");
          if (input) input.value = "";
          if (newHabit) {
            this.evaluateHabitWithAI(title, newHabit.id);
          }
        });
      }

      // Spontaneous 1-Click Preset Chips
      document.querySelectorAll(".habit_preset_chip").forEach(chip => {
        if (!chip.dataset.bound) {
          chip.dataset.bound = "true";
          chip.addEventListener("click", () => {
            const title = chip.dataset.title;
            const cat = chip.dataset.cat || "Routine";
            const color = chip.dataset.color || "indigo";
            if (!title) return;

            const newHabit = this.store.addHabit(title, cat, color);
            if (newHabit) {
              this.evaluateHabitWithAI(title, newHabit.id);
            }
          });
        }
      });

      // Custom Detailed Dialog Trigger
      const customBtn = document.getElementById("btn_consistency_add_habit");
      if (customBtn && !customBtn.dataset.bound) {
        customBtn.dataset.bound = "true";
        customBtn.addEventListener("click", () => this.openHabitSheet());
      }

      // AI Health Advisory Alert Card Actions
      const dismissAdvisoryBtn = document.getElementById("btn_dismiss_ai_advisory");
      const keepHabitBtn = document.getElementById("btn_ai_keep_habit");
      const adoptAltBtn = document.getElementById("btn_ai_adopt_alternative");
      const advisoryCard = document.getElementById("habit_ai_advisory_card");

      if (dismissAdvisoryBtn && !dismissAdvisoryBtn.dataset.bound) {
        dismissAdvisoryBtn.dataset.bound = "true";
        dismissAdvisoryBtn.addEventListener("click", () => {
          if (advisoryCard) advisoryCard.style.display = "none";
          this.pendingUnhealthyHabit = null;
        });
      }

      if (keepHabitBtn && !keepHabitBtn.dataset.bound) {
        keepHabitBtn.dataset.bound = "true";
        keepHabitBtn.addEventListener("click", () => {
          if (advisoryCard) advisoryCard.style.display = "none";
          this.pendingUnhealthyHabit = null;
        });
      }

      if (adoptAltBtn && !adoptAltBtn.dataset.bound) {
        adoptAltBtn.dataset.bound = "true";
        adoptAltBtn.addEventListener("click", () => {
          if (this.pendingUnhealthyHabit) {
            const { id, alternativeTitle, category } = this.pendingUnhealthyHabit;
            this.store.updateHabit(id, {
              title: alternativeTitle,
              category: category || "Health",
              color: "emerald"
            });
            if (advisoryCard) advisoryCard.style.display = "none";
            this.showToast(`Switched to "${alternativeTitle}"!`, "success");
            this.pendingUnhealthyHabit = null;
          }
        });
      }

      // Gemini AI Habit Coach Trigger
      const coachBtn = document.getElementById("btn_ai_analyze_habits");
      if (coachBtn && !coachBtn.dataset.bound) {
        coachBtn.dataset.bound = "true";
        coachBtn.addEventListener("click", () => this.analyzeHabitsWithAI());
      }

      // Gemini AI Prompt Chips
      document.querySelectorAll(".ai_prompt_chip").forEach(chip => {
        if (!chip.dataset.bound) {
          chip.dataset.bound = "true";
          chip.addEventListener("click", () => {
            this.analyzeHabitsWithAI(chip.dataset.prompt);
          });
        }
      });
    }

    renderConsistencyUI() {
      const matrixBox = document.getElementById("habit_matrix_tbody");
      if (!matrixBox) return;

      const today = new Date();
      const todayISO = getLocalDateString(today);

      // Calculate Monday of target week factoring in this.habitWeekOffset
      const dayOfWeekIdx = today.getDay(); // 0 is Sun, 1 is Mon
      const diffToMon = dayOfWeekIdx === 0 ? -6 : 1 - dayOfWeekIdx;
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() + diffToMon + (this.habitWeekOffset * 7));

      const weekdays = [];
      const weekdaysShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthsFull = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

      for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        const iso = getLocalDateString(d);
        weekdays.push({
          iso,
          dayName: weekdaysShort[i],
          dateNum: d.getDate(),
          monthShort: monthsShort[d.getMonth()],
          monthFull: monthsFull[d.getMonth()],
          year: d.getFullYear(),
          isToday: iso === todayISO,
          isFuture: iso > todayISO
        });
      }

      // Update Week Range Badge (#habit_week_range_badge)
      const weekBadge = document.getElementById("habit_week_range_badge");
      if (weekBadge) {
        const startDay = weekdays[0];
        const endDay = weekdays[6];
        let offsetTag = "";
        if (this.habitWeekOffset === 0) offsetTag = " · This Week";
        else if (this.habitWeekOffset === -1) offsetTag = " · Last Week";
        else if (this.habitWeekOffset < -1) offsetTag = ` · ${Math.abs(this.habitWeekOffset)}w Ago`;
        else if (this.habitWeekOffset === 1) offsetTag = " · Next Week";
        else offsetTag = ` · In ${this.habitWeekOffset}w`;

        let rangeText = "";
        if (startDay.monthShort === endDay.monthShort && startDay.year === endDay.year) {
          rangeText = `${startDay.monthShort} ${startDay.dateNum} – ${endDay.dateNum}, ${startDay.year}${offsetTag}`;
        } else if (startDay.year === endDay.year) {
          rangeText = `${startDay.monthShort} ${startDay.dateNum} – ${endDay.monthShort} ${endDay.dateNum}, ${startDay.year}${offsetTag}`;
        } else {
          rangeText = `${startDay.monthShort} ${startDay.dateNum}, ${startDay.year} – ${endDay.monthShort} ${endDay.dateNum}, ${endDay.year}${offsetTag}`;
        }
        weekBadge.textContent = rangeText;
      }

      // Render Dynamic thead row (#habit_matrix_thead_row)
      const theadRow = document.getElementById("habit_matrix_thead_row");
      if (theadRow) {
        let thHtml = `<th style="text-align: left;">Atomic Habit</th>`;
        weekdays.forEach(w => {
          thHtml += `
            <th class="${w.isToday ? "active_today" : ""}">
              <div class="matrix_th_content">
                <span class="matrix_th_day">${w.dayName}</span>
                <span class="matrix_th_date">${w.dateNum}</span>
                <span class="matrix_th_month">${w.monthShort}</span>
                ${w.isToday ? `<span class="matrix_today_indicator">TODAY</span>` : ""}
              </div>
            </th>
          `;
        });
        theadRow.innerHTML = thHtml;
      }

      // Calculate Motivation Deck Metrics
      const totalHabits = this.store.habits.length;
      let completedToday = 0;
      let actual7DayCompletions = 0;
      let maxActiveStreak = 0;

      // Last 7 calendar dates ending today
      const past7Dates = [];
      for (let j = 0; j < 7; j++) {
        const pd = new Date(today);
        pd.setDate(today.getDate() - j);
        past7Dates.push(getLocalDateString(pd));
      }

      this.store.habits.forEach(h => {
        if (h.history && h.history[todayISO] === true) completedToday++;
        if ((h.streak || 0) > maxActiveStreak) maxActiveStreak = h.streak || 0;
        if (h.history) {
          past7Dates.forEach(d => {
            if (h.history[d] === true) actual7DayCompletions++;
          });
        }
      });

      const todayPct = totalHabits > 0 ? Math.round((completedToday / totalHabits) * 100) : 0;
      const totalPossible7 = totalHabits * 7;
      const weeklyRatePct = totalPossible7 > 0 ? Math.round((actual7DayCompletions / totalPossible7) * 100) : 0;

      const todayScoreEl = document.getElementById("habit_today_score");
      const todayPctEl = document.getElementById("habit_today_pct");
      const progressBarEl = document.getElementById("habit_today_progress_bar");
      const weeklyRateEl = document.getElementById("habit_weekly_rate");
      const topStreakEl = document.getElementById("habit_top_streak");
      const motivationQuoteEl = document.getElementById("habit_motivation_quote");

      if (todayScoreEl) todayScoreEl.textContent = `${completedToday} / ${totalHabits}`;
      if (todayPctEl) todayPctEl.textContent = `${todayPct}%`;
      if (progressBarEl) progressBarEl.style.width = `${todayPct}%`;
      if (weeklyRateEl) weeklyRateEl.textContent = `${weeklyRatePct}%`;
      if (topStreakEl) topStreakEl.textContent = `${maxActiveStreak}d`;

      if (motivationQuoteEl) {
        if (totalHabits === 0) {
          motivationQuoteEl.textContent = '"Build the identity you want. Add your first atomic habit below to start compounding."';
        } else if (todayPct === 100) {
          motivationQuoteEl.textContent = '"Flawless execution! You checked off every habit for today. Consistency is an unstoppable flywheel."';
        } else if (todayPct >= 50) {
          motivationQuoteEl.textContent = `"${completedToday} down, ${totalHabits - completedToday} remaining today. Finish strong to protect your momentum!"`;
        } else if (completedToday > 0) {
          motivationQuoteEl.textContent = '"Strong start today. Check off your next atomic habit to keep your streak burning."';
        } else {
          motivationQuoteEl.textContent = '"Small daily disciplines compound into massive life transformations. Tap 1 habit to ignite today\'s streak."';
        }
      }

      // Render Matrix Table Body
      if (this.store.habits.length === 0) {
        matrixBox.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 32px 16px; color: var(--text-muted);">
              <div style="font-size: 28px; margin-bottom: 8px;">🌱</div>
              <h4 style="font-size: 14px; font-weight: 800; color: var(--text-primary); margin-bottom: 4px;">No habits tracked yet</h4>
              <p style="font-size: 12px; margin-bottom: 12px;">Type a habit in the quick-add bar above, or click any 1-Click Preset to begin.</p>
            </td>
          </tr>
        `;
      } else {
        let matrixHtml = "";
        this.store.habits.forEach(habit => {
          let cellsHtml = "";
          
          weekdays.forEach(w => {
            const isCompleted = habit.history && habit.history[w.iso] === true;

            cellsHtml += `
              <td class="${w.isToday ? "active_today" : ""}">
                <button class="habit_matrix_check_pill bg-${habit.color || "indigo"} ${isCompleted ? "completed" : ""} ${w.isFuture ? "future_pill" : ""}" 
                  id="habit_checkbox_${habit.id}_${w.iso}"
                  data-id="${habit.id}" data-date="${w.iso}"
                  ${w.isFuture ? "disabled title=\"Cannot log habits for future dates\"" : `title="${w.dayName}, ${w.monthShort} ${w.dateNum}: ${isCompleted ? "Completed (Click to undo)" : "Click to complete"}"`}
                  aria-label="Toggle ${habit.title} on ${w.dayName} ${w.monthShort} ${w.dateNum}">
                  ${isCompleted ? "✓" : (w.isFuture ? "–" : "•")}
                </button>
              </td>
            `;
          });

          matrixHtml += `
            <tr>
              <td class="habit_row_title_cell">
                <div class="habit_row_title">
                  <span class="habit_tag_indicator bg-${habit.color || "indigo"}"></span>
                  <div style="flex: 1; display: flex; flex-direction: column;">
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                      <h4>${this.escapeHTML(habit.title)}</h4>
                      <div style="display: flex; gap: 8px;">
                        <button class="habit_edit_btn" data-id="${habit.id}" title="Edit Habit">Edit</button>
                        <button class="habit_delete_btn" data-id="${habit.id}" title="Remove Habit">✕</button>
                      </div>
                    </div>
                    <p>Streak: <span>${habit.streak || 0}d</span> (PB: ${habit.maxStreak || 0}d) · <span class="habit_cat_pill">${this.escapeHTML(habit.category || "Routine")}</span></p>
                  </div>
                </div>
              </td>
              ${cellsHtml}
            </tr>
          `;
        });

        matrixBox.innerHTML = matrixHtml;

        matrixBox.querySelectorAll(".habit_matrix_check_pill:not([disabled])").forEach(btn => {
          btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            const dStr = btn.getAttribute("data-date");
            this.store.toggleHabitCompletion(id, dStr);
          });
        });

        matrixBox.querySelectorAll(".habit_edit_btn").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = btn.getAttribute("data-id");
            const h = this.store.habits.find(hb => hb.id === id);
            if (h) {
              this.openHabitSheet(h);
            }
          });
        });

        matrixBox.querySelectorAll(".habit_delete_btn").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = btn.getAttribute("data-id");
            const h = this.store.habits.find(hb => hb.id === id);
            if (confirm(`Permanently delete the habit "${h ? h.title : "habit"}" and all its historical consistency data?`)) {
              this.store.deleteHabit(id);
            }
          });
        });
      }

      this.renderMonthlyHeatmapSVG();
    }

    renderMonthlyHeatmapSVG() {
      const container = document.getElementById("chart_heatmap_grid");
      if (!container) return;

      const today = new Date();
      const todayISO = getLocalDateString(today);
      const targetDate = new Date(today.getFullYear(), today.getMonth() + this.habitHeatmapMonthOffset, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      const monthDaysCount = new Date(year, month + 1, 0).getDate();

      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const monthBadge = document.getElementById("heatmap_month_badge");
      if (monthBadge) {
        const currentTag = this.habitHeatmapMonthOffset === 0 ? " (Current)" : "";
        monthBadge.textContent = `${monthNames[month]} ${year}${currentTag}`;
      }

      const habitCount = this.store.habits.length;
      const firstDayIdx = new Date(year, month, 1).getDay(); // 0 is Sun, 1 is Mon
      const leadingEmptyDays = firstDayIdx === 0 ? 6 : firstDayIdx - 1; // Align to Mon-Sun

      const weekdaysShort = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
      let headerCellsHtml = weekdaysShort.map(d => `<div class="cal_th">${d}</div>`).join("");

      let emptyCellsHtml = "";
      for (let i = 0; i < leadingEmptyDays; i++) {
        emptyCellsHtml += `<div class="cal_cell empty"></div>`;
      }

      let dayCellsHtml = "";
      for (let dayNum = 1; dayNum <= monthDaysCount; dayNum++) {
        const dateStr = `${year}-${(month + 1).toString().padStart(2, "0")}-${dayNum.toString().padStart(2, "0")}`;
        
        let completions = 0;
        this.store.habits.forEach(h => {
          if (h.history && h.history[dateStr] === true) completions++;
        });

        let density = 0;
        if (habitCount > 0 && completions > 0) {
          const pct = completions / habitCount;
          if (pct >= 0.75) density = 3;
          else if (pct >= 0.4) density = 2;
          else density = 1;
        }

        const isToday = dateStr === todayISO;
        const dayFormatted = `${monthNames[month].slice(0, 3)} ${dayNum}, ${year}`;
        const titleText = `${dayFormatted}: ${completions} of ${habitCount} habits completed${isToday ? " (Today)" : ""}`;

        dayCellsHtml += `
          <div class="cal_cell density-${density} ${isToday ? "active_today" : ""}" 
               data-date="${dateStr}" 
               data-count="${completions}" 
               title="${titleText}">
            <span class="cal_day_num">${dayNum}</span>
          </div>
        `;
      }

      container.innerHTML = `
        <div class="cal_heatmap_grid">
          ${headerCellsHtml}
          ${emptyCellsHtml}
          ${dayCellsHtml}
        </div>
      `;
    }

    async callGeminiWithFallback(bodyPayload) {
      if (!this.geminiApiKey) {
        throw new Error("Gemini API key is not configured.");
      }

      const models = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash"
      ];

      let lastError = null;

      for (const model of models) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload)
          });

          if (response.ok) {
            const data = await response.json();
            return { data, model };
          }

          const errText = await response.text().catch(() => "");
          console.warn(`[Gemini] ${model} returned status ${response.status}:`, errText);
          lastError = new Error(`Model ${model} returned status ${response.status}`);
        } catch (err) {
          console.warn(`[Gemini] Request failed for model ${model}:`, err);
          lastError = err;
        }
      }

      throw lastError || new Error("All Gemini models in fallback sequence failed.");
    }

    async evaluateHabitWithAI(habitTitle, habitId) {
      const advisoryCard = document.getElementById("habit_ai_advisory_card");
      if (!advisoryCard) return;

      const lower = habitTitle.toLowerCase();
      const suspiciousTerms = ["smoke", "smoking", "cigarette", "vape", "vaping", "doomscroll", "junk food", "binge drink", "skip meal", "sleep past 3", "procrastinat", "gambling", "sugar binge"];
      const containsSuspicious = suspiciousTerms.some(term => lower.includes(term));

      if (!this.geminiApiKey) {
        if (containsSuspicious) {
          this.showAIAdvisoryCard(habitId, habitTitle, "This habit may negatively impact your physical health and focus.", "Take a 5-minute fresh air break or hydration.", "Substitute the craving with a positive cue.");
        }
        return;
      }

      try {
        const prompt = `You are a behavioral psychology and health expert. Analyze this habit: "${habitTitle}". Determine if this habit is UNHEALTHY, counterproductive, detrimental to health or productivity (e.g. smoking, doomscrolling, skipping meals, binge drinking, junk food binge, late sleeping). If healthy or neutral, isUnhealthy is false. Return ONLY valid JSON: {"isUnhealthy": boolean, "risk": "1-sentence risk explanation", "alternative": "constructive replacement habit", "tip": "atomic habit cue"}`;

        const { data } = await this.callGeminiWithFallback({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
          }
        });

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return;

        const parsed = JSON.parse(text);
        if (parsed.isUnhealthy) {
          this.showAIAdvisoryCard(habitId, habitTitle, parsed.risk, parsed.alternative, parsed.tip);
        } else {
          advisoryCard.style.display = "none";
        }
      } catch (err) {
        if (containsSuspicious) {
          this.showAIAdvisoryCard(habitId, habitTitle, "This habit may negatively impact your physical health and focus.", "Take a 5-minute fresh air break or stretch.", "Substitute the craving with a positive cue.");
        }
      }
    }

    showAIAdvisoryCard(habitId, title, risk, alternative, tip) {
      const advisoryCard = document.getElementById("habit_ai_advisory_card");
      if (!advisoryCard) return;

      this.pendingUnhealthyHabit = {
        id: habitId,
        oldTitle: title,
        alternativeTitle: alternative,
        category: "Health"
      };

      const titleEl = document.getElementById("ai_advisory_title");
      const reasonEl = document.getElementById("ai_advisory_reason");
      const altEl = document.getElementById("ai_advisory_alternative");
      const tipEl = document.getElementById("ai_advisory_tip");

      if (titleEl) titleEl.textContent = `Unhealthy Habit Detected: "${title}"`;
      if (reasonEl) reasonEl.textContent = risk || "This habit may undermine your long-term focus or well-being.";
      if (altEl) altEl.textContent = alternative || "5-minute mindful breathing or hydration";
      if (tipEl) tipEl.textContent = tip ? `💡 Habit Loop Tip: ${tip}` : "";

      advisoryCard.style.display = "block";
      advisoryCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    async analyzeHabitsWithAI(customPrompt = null) {
      const resultsContainer = document.getElementById("habit_ai_coach_results");
      if (!resultsContainer) return;

      if (!this.geminiApiKey) {
        resultsContainer.innerHTML = `
          <div class="ai_coach_placeholder" style="border-left: 3px solid var(--accent-primary); padding-left: 14px;">
            <p style="font-size: 13.5px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">Gemini API Key Required</p>
            <p style="margin-bottom: 8px;">To activate consistency analysis, habit stacking strategies, and health alerts, add your free Google Gemini API key in Settings.</p>
            <div style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 8px 12px; margin-bottom: 12px; font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px;">🔒</span>
              <span><strong>Privacy Guarantee:</strong> Your key is stored 100% locally on this device in your browser's private storage. It is never sent to any external server or database.</span>
            </div>
            <button type="button" class="habit_quick_submit_btn" id="btn_goto_settings_key" style="height: 34px; font-size: 11.5px;">Configure Key in Settings</button>
          </div>
        `;
        const gotoBtn = document.getElementById("btn_goto_settings_key");
        if (gotoBtn) {
          gotoBtn.addEventListener("click", () => {
            this.store.setView("settings");
          });
        }
        return;
      }

      if (!this.store.habits || this.store.habits.length === 0) {
        resultsContainer.innerHTML = `
          <div class="ai_coach_placeholder">
            <p><strong>No tracked habits yet!</strong> Add at least 1 atomic habit above to unlock personalized Gemini AI habit stacking and consistency coaching.</p>
          </div>
        `;
        return;
      }

      resultsContainer.innerHTML = `
        <div class="ai_coach_loading">
          <div class="ai_coach_spinner"></div>
          <span>Gemini AI is analyzing your consistency data and habit stacks...</span>
        </div>
      `;

      const habitsData = this.store.habits.map(h => {
        const hist = h.history || {};
        const completedDates = Object.keys(hist).filter(d => hist[d] === true);
        return {
          title: h.title,
          category: h.category,
          currentStreak: h.streak || 0,
          maxStreak: h.maxStreak || 0,
          totalCompletions: completedDates.length
        };
      });

      const userGoal = customPrompt || "Analyze my habits consistency, diagnose potential friction points, give habit stacking advice, and give a 7-day challenge.";

      const prompt = `You are a world-class habit formation coach grounded in James Clear's Atomic Habits.
User tracked habits:
${JSON.stringify(habitsData, null, 2)}

User focus:
"${userGoal}"

Provide a structured, inspiring habit coaching plan. Return HTML markup (use <h4>, <p>, <ul>, <li>, <strong>) with:
1. <h4>⚡ Consistency Diagnosis</h4>: Concise assessment of current momentum.
2. <h4>🔗 Habit Stacking Blueprint</h4>: Practical 'After [Current Habit], I will [New Habit]' formulas using their habits.
3. <h4>🎯 7-Day Momentum Challenge</h4>: One high-leverage atomic action to focus on this week.
Keep the prose punchy, encouraging, and actionable. Do not wrap in markdown backticks or html code blocks, return raw HTML tags only.`;

      try {
        const { data, model } = await this.callGeminiWithFallback({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3
          }
        });

        let content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        content = content.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

        resultsContainer.innerHTML = `
          <div class="ai_coach_content_rendered">
            ${content}
            <div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <span style="font-size: 11px; color: var(--text-muted);">✨ Powered by ${model}</span>
              <button type="button" class="ai_prompt_chip" id="btn_reask_ai_coach" style="font-size: 11px;">Ask Another Question</button>
            </div>
          </div>
        `;

        const reaskBtn = document.getElementById("btn_reask_ai_coach");
        if (reaskBtn) {
          reaskBtn.addEventListener("click", () => {
            const newPrompt = prompt("Ask Gemini Habit Coach (e.g. 'How can I stay consistent while traveling?'):");
            if (newPrompt && newPrompt.trim()) {
              this.analyzeHabitsWithAI(newPrompt.trim());
            }
          });
        }
      } catch (err) {
        resultsContainer.innerHTML = `
          <div class="ai_coach_placeholder" style="color: #ef4444;">
            <p><strong>AI Coach connection error:</strong> ${this.escapeHTML(err.message)}</p>
            <button type="button" class="habit_quick_submit_btn" id="btn_retry_ai_coach" style="margin-top: 8px; font-size: 11.5px; height: 32px;">Retry Analysis</button>
          </div>
        `;
        const retryBtn = document.getElementById("btn_retry_ai_coach");
        if (retryBtn) {
          retryBtn.addEventListener("click", () => this.analyzeHabitsWithAI(customPrompt));
        }
      }
    }

    // -------------------------------------------------------------------------
    // 3B. DEDICATED CONSISTENCY HISTORY VIEW
    // -------------------------------------------------------------------------
    renderConsistencyHistoryUI() {
      const habits = this.store.habits;
      
      // Update Summary metrics
      const activeCountNode = document.getElementById("history_active_habits_count");
      if (activeCountNode) activeCountNode.textContent = habits.length;
      
      const totalStreak = habits.reduce((acc, h) => acc + (h.streak || 0), 0);
      const avgStreak = habits.length > 0 ? Math.round(totalStreak / habits.length) : 0;
      const avgStreakNode = document.getElementById("history_avg_streak");
      if (avgStreakNode) avgStreakNode.textContent = `${avgStreak}d`;
      
      let totalCompletions = 0;
      habits.forEach(h => {
        if (h.history) {
          Object.values(h.history).forEach(val => {
            if (val === true) totalCompletions++;
          });
        }
      });
      const totalCompletionsNode = document.getElementById("history_total_completions");
      if (totalCompletionsNode) totalCompletionsNode.textContent = totalCompletions;
      
      const today = new Date();
      let possibleCompletions30 = habits.length * 30;
      let actualCompletions30 = 0;
      for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = getLocalDateString(d);
        habits.forEach(h => {
          if (h.history && h.history[dateStr] === true) actualCompletions30++;
        });
      }
      const overallRate = possibleCompletions30 > 0 ? Math.round((actualCompletions30 / possibleCompletions30) * 100) : 0;
      const overallRateNode = document.getElementById("history_overall_rate");
      if (overallRateNode) overallRateNode.textContent = `${overallRate}%`;

      // Render Streaks List
      const streaksContainer = document.getElementById("history_streaks_container");
      if (streaksContainer) {
        if (habits.length === 0) {
          streaksContainer.innerHTML = `<div class="empty_state_text">No habits tracked yet. Create a habit to start building streaks!</div>`;
        } else {
          streaksContainer.innerHTML = habits.map(h => {
            let compCount30 = 0;
            for (let i = 0; i < 30; i++) {
              const d = new Date(today);
              d.setDate(today.getDate() - i);
              const dateStr = getLocalDateString(d);
              if (h.history && h.history[dateStr] === true) compCount30++;
            }
            const completionPct = Math.round((compCount30 / 30) * 100);

            return `
              <div class="history_streak_item">
                <div class="habit_info_row">
                  <span class="habit_dot bg-${h.color}"></span>
                  <div class="habit_title_meta">
                    <h4>${this.escapeHTML(h.title)}</h4>
                    <span class="category_label">${h.category}</span>
                  </div>
                </div>
                <div class="streak_pills_progress">
                  <div class="streak_stat">
                    <span class="label">Current</span>
                    <span class="val">${h.streak || 0}d</span>
                  </div>
                  <div class="streak_stat">
                    <span class="label">Best</span>
                    <span class="val">${h.maxStreak || 0}d</span>
                  </div>
                  <div class="streak_stat">
                    <span class="label">30d Consistency</span>
                    <span class="val">${completionPct}%</span>
                  </div>
                </div>
              </div>
            `;
          }).join("");
        }
      }

      // Render 7-Day Completion Trend Chart (SVG)
      this.renderWeeklyConsistencyTrendChart();

      // Render Category Mastery Chart (SVG)
      this.renderCategoryConsistencyChart();

      // Render Chronological Timeline Log
      this.renderChronologicalLogTimeline();
    }

    renderWeeklyConsistencyTrendChart() {
      const wrapper = document.getElementById("chart_weekly_consistency_trend");
      if (!wrapper) return;

      const days = [];
      const counts = [];
      const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dateStr = getLocalDateString(d);
        days.push(dateStr);

        let completions = 0;
        this.store.habits.forEach(h => {
          if (h.history && h.history[dateStr] === true) completions++;
        });
        counts.push(completions);
      }

      const maxCount = Math.max(...counts, 4);
      const labels = days.map(ds => weekdayLabels[new Date(ds).getDay()]);

      const chartWidth = 160;
      const chartHeight = 90;
      const xStart = 35;
      const yStart = 20;
      const stepX = chartWidth / 6;

      const points = counts.map((c, idx) => {
        const x = xStart + (idx * stepX);
        const y = yStart + chartHeight - (c / maxCount * chartHeight);
        return { x, y, value: c };
      });

      const polylinePoints = points.map(p => `${p.x},${p.y}`).join(" ");
      
      const gridLines = [0, 0.5, 1].map(pct => {
        const val = Math.round(pct * maxCount);
        const y = yStart + chartHeight - (pct * chartHeight);
        return `
          <line x1="${xStart}" y1="${y}" x2="${xStart + chartWidth}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="2,2" stroke-width="0.5" />
          <text x="${xStart - 8}" y="${y + 3}" fill="var(--text-muted)" font-size="8" text-anchor="end">${val}</text>
        `;
      }).join("");

      const dotsHtml = points.map(p => `
        <circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--accent-primary)" stroke="var(--card-bg)" stroke-width="1" />
        <text x="${p.x}" y="${p.y - 6}" fill="var(--text-primary)" font-size="8" font-weight="600" text-anchor="middle">${p.value}</text>
      `).join("");

      const labelsHtml = labels.map((lbl, idx) => {
        const x = xStart + (idx * stepX);
        return `<text x="${x}" y="${yStart + chartHeight + 14}" fill="var(--text-secondary)" font-size="8" text-anchor="middle">${lbl}</text>`;
      }).join("");

      wrapper.innerHTML = `
        <svg viewBox="0 0 210 130" width="100%" height="100%">
          ${gridLines}
          <polyline fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${polylinePoints}" />
          ${dotsHtml}
          ${labelsHtml}
        </svg>
      `;
    }

    renderCategoryConsistencyChart() {
      const wrapper = document.getElementById("chart_category_consistency");
      if (!wrapper) return;

      const categories = ["Routine", "Mind", "Health", "Skill", "Work"];
      const categoryCounts = { Routine: 0, Mind: 0, Health: 0, Skill: 0, Work: 0 };
      
      this.store.habits.forEach(h => {
        const cat = h.category;
        if (categoryCounts[cat] !== undefined && h.history) {
          for (const key in h.history) {
            if (h.history[key] === true) {
              categoryCounts[cat]++;
            }
          }
        }
      });
      const counts = categories.map(cat => categoryCounts[cat]);

      const maxVal = Math.max(...counts, 4);

      const chartWidth = 120;
      const barHeight = 10;
      const barSpacing = 8;
      const xStart = 50;
      const yStart = 15;

      const barsHtml = categories.map((cat, idx) => {
        const y = yStart + idx * (barHeight + barSpacing);
        const c = counts[idx];
        const computedWidth = (c / maxVal) * chartWidth;
        const width = Math.max(computedWidth, 2);

        let colorHex = "#6366f1";
        if (cat === "Health") colorHex = "#f43f5e";
        else if (cat === "Routine") colorHex = "#f59e0b";
        else if (cat === "Mind") colorHex = "#10b981";
        else if (cat === "Skill") colorHex = "#a855f7";

        return `
          <text x="${xStart - 8}" y="${y + 8}" fill="var(--text-secondary)" font-size="8" text-anchor="end">${cat}</text>
          <rect x="${xStart}" y="${y}" width="${width}" height="${barHeight}" rx="2" fill="${colorHex}" />
          <text x="${xStart + width + 6}" y="${y + 8}" fill="var(--text-primary)" font-size="8" font-weight="600" text-anchor="start">${c}</text>
        `;
      }).join("");

      wrapper.innerHTML = `
        <svg viewBox="0 0 210 130" width="100%" height="100%">
          ${barsHtml}
        </svg>
      `;
    }

    renderChronologicalLogTimeline() {
      const container = document.getElementById("history_chronological_log");
      if (!container) return;

      const habits = this.store.habits;
      const today = new Date();
      let html = "";

      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = getLocalDateString(d);
        
        const completedToday = [];
        habits.forEach(h => {
          if (h.history && h.history[dateStr] === true) {
            completedToday.push(h);
          }
        });

        const formattedDate = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
        
        let completionsList = "";
        if (completedToday.length === 0) {
          completionsList = `<span class="empty_log_item">No habits completed.</span>`;
        } else {
          completionsList = completedToday.map(h => `
            <span class="history_log_badge border-${h.color}">${this.escapeHTML(h.title)}</span>
          `).join(" ");
        }

        html += `
          <div class="history_log_day_row">
            <div class="history_log_date">${formattedDate}</div>
            <div class="history_log_completions_list">
              ${completionsList}
            </div>
          </div>
        `;
      }

      container.innerHTML = html;
    }

    // -------------------------------------------------------------------------
    // 4. REFLECTIVE JOURNAL VIEW (HABIT STACKS & MORNING/EVENING PROMPTS)
    // -------------------------------------------------------------------------
    renderMarkdownLite(text) {
      if (!text) return `<p style="color: var(--text-muted); font-style: italic;">Nothing to preview yet. Start writing in the Write tab!</p>`;
      
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        // Headings
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Italics
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Bullet points
        .replace(/^\- (.*$)/gim, '<li>$1</li>')
        // Wrapping lines
        .split('\n')
        .map(line => {
          const trimmed = line.trim();
          if (!trimmed) return "";
          if (trimmed.startsWith('<h') || trimmed.startsWith('<li>') || trimmed.startsWith('<ul>') || trimmed.startsWith('<ol>')) return line;
          return `<p>${line}</p>`;
        })
        .join('\n');
    }

    renderJournalUI() {
      const activeDate = this.selectedJournalDate;
      const entry = this.store.journal[activeDate] || {
        morningIntention: "",
        morningMood: "",
        eveningReflection: "",
        shutdownComplete: false
      };

      const wrapper = document.getElementById("journal_entries_container");
      if (!wrapper) return;

      // Calculate recent 7 days
      const dates = [];
      const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(getLocalDateString(d));
      }

      // Add selected date if it's older than 7 days
      if (!dates.includes(activeDate)) {
        dates.push(activeDate);
        dates.sort((a, b) => b.localeCompare(a)); // Sort newest first
      }

      const formattedActiveDate = (() => {
        const d = new Date(activeDate + "T12:00:00");
        return `${weekdays[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      })();

      const isDFActive = document.body.classList.contains("journal-distraction-free");

      const navItemsHtml = dates.map(dStr => {
        const d = new Date(dStr + "T12:00:00");
        const todayStr = getLocalDateString();
        const yesterdayStr = (() => {
          const yes = new Date(); yes.setDate(yes.getDate() - 1);
          return getLocalDateString(yes);
        })();

        let label = `${months[d.getMonth()]} ${d.getDate()}`;
        let sub = weekdays[d.getDay()];
        
        if (dStr === todayStr) {
          label = "Today";
          sub = "Current Entry";
        } else if (dStr === yesterdayStr) {
          label = "Yesterday";
        }

        const isActive = dStr === activeDate;
        const entryExists = this.store.journal[dStr] && (this.store.journal[dStr].morningIntention || this.store.journal[dStr].eveningReflection);

        return `
          <button class="journal_nav_item ${isActive ? "active" : ""} ${entryExists ? "has_entry" : ""}" data-date="${dStr}">
            <div class="nav_item_main">
              <span class="nav_item_label">${label}</span>
              <span class="nav_item_sub">${sub}</span>
            </div>
            ${entryExists ? '<span class="nav_entry_dot" title="Has written reflection">•</span>' : ''}
          </button>
        `;
      }).join("");

      wrapper.innerHTML = `
        <div class="journal_layout_split">
          <!-- Left Side: Navigation Pane -->
          <aside class="journal_sidebar_nav">
            <div class="journal_nav_section_title">Recent Reflections</div>
            <div class="journal_nav_list">
              ${navItemsHtml}
            </div>
            
            <div class="journal_date_picker_block">
              <div class="journal_nav_section_title">Jump to Date</div>
              <input type="date" id="journal_date_picker" class="journal_date_picker_input" value="${activeDate}">
            </div>
          </aside>

          <!-- Right Side: Writing Workspace -->
          <main class="journal_editor_view">
            <div class="journal_workspace_header">
              <div class="journal_date_details">
                <h3>${formattedActiveDate}</h3>
                <span class="journal_autosave_status" id="journal_autosave_status">✓ Saved</span>
              </div>
              <div class="journal_header_actions">
                <button class="journal_action_btn distraction_free_toggle" id="btn_journal_df_toggle" title="Toggle distraction-free mode (Esc to exit)">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="3" x2="9" y2="21"></line>
                  </svg>
                  <span>${isDFActive ? "Exit focus mode" : "Distraction-free"}</span>
                </button>
              </div>
            </div>

            <div class="journal_workspace_content">
              <!-- 1. Morning Intention Section -->
              <section class="journal_editor_section">
                <div class="section_header">
                  <span class="section_number">1</span>
                  <h4>Morning Intention</h4>
                </div>
                <div class="form_group">
                  <input type="text" id="j_intent" class="journal_text_input" placeholder="What is my primary focus priority today?" value="${this.escapeHTML(entry.morningIntention || "")}">
                </div>
              </section>

              <!-- 2. Mood Vibe Section -->
              <section class="journal_editor_section">
                <div class="section_header">
                  <span class="section_number">2</span>
                  <h4>Focus Mood Vibe</h4>
                </div>
                <div class="journal_mood_pills" id="j_mood_row">
                  <button class="mood_pill ${entry.morningMood === "calm" ? "active" : ""}" data-mood="calm">Calm</button>
                  <button class="mood_pill ${entry.morningMood === "energized" ? "active" : ""}" data-mood="energized">Charged</button>
                  <button class="mood_pill ${entry.morningMood === "peaceful" ? "active" : ""}" data-mood="peaceful">Peaceful</button>
                  <button class="mood_pill ${entry.morningMood === "tired" ? "active" : ""}" data-mood="tired">Fatigue</button>
                </div>
              </section>

              <!-- 3. Evening Reflection Section -->
              <section class="journal_editor_section">
                <div class="section_header">
                  <span class="section_number">3</span>
                  <h4>Evening Reflection</h4>
                </div>
                
                <div class="journal_tabs_bar">
                  <button class="journal_tab_btn active" id="tab_journal_write">Write</button>
                  <button class="journal_tab_btn" id="tab_journal_preview">Preview</button>
                </div>

                <div class="form_group editor_pane_wrapper">
                  <textarea id="j_gratitude" class="journal_textarea" rows="8" placeholder="Reflect on today's positive elements or deep work progress... Use Markdown if desired.">${this.escapeHTML(entry.eveningReflection || "")}</textarea>
                  <div id="j_gratitude_preview" class="journal_preview_pane markdown-body" style="display: none;"></div>
                </div>
              </section>

              <!-- 4. Mindful Work Shutdown Checklist -->
              <section class="journal_editor_section">
                <div class="section_header">
                  <span class="section_number">4</span>
                  <h4>Mindful Shutdown</h4>
                </div>
                <div class="shutdown_checklist_wrapper">
                  <label class="shutdown_check_label">
                    <input type="checkbox" id="btn_j_shutdown_trigger" class="shutdown_native_checkbox" ${entry.shutdownComplete ? "checked" : ""}>
                    <span class="custom_checkbox_visual"></span>
                    <span class="checkbox_text_label">Log focus blocks, close browser tabs, clear workspace baseline. Clear for the night!</span>
                  </label>
                </div>
              </section>

              <!-- Footer Manual Save Trigger -->
              <div class="journal_footer_actions">
                <button class="journal_submit_btn" id="btn_journal_commit_save">Commit Reflection</button>
              </div>
            </div>
          </main>
        </div>
      `;

      // Cache elements
      const intentInput = document.getElementById("j_intent");
      const gratitudeTextarea = document.getElementById("j_gratitude");
      const shutdownCheckbox = document.getElementById("btn_j_shutdown_trigger");
      const autosaveStatus = document.getElementById("journal_autosave_status");
      const writeTabBtn = document.getElementById("tab_journal_write");
      const previewTabBtn = document.getElementById("tab_journal_preview");
      const previewPane = document.getElementById("j_gratitude_preview");
      const saveBtn = document.getElementById("btn_journal_commit_save");

      // Mood Selection
      const moodBtns = wrapper.querySelectorAll("#j_mood_row .mood_pill");
      let selectedMood = entry.morningMood;

      moodBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          moodBtns.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          selectedMood = btn.getAttribute("data-mood");
          triggerAutosave();
        });
      });

      // Write vs Preview Tabs
      if (writeTabBtn && previewTabBtn) {
        writeTabBtn.addEventListener("click", () => {
          writeTabBtn.classList.add("active");
          previewTabBtn.classList.remove("active");
          gratitudeTextarea.style.display = "block";
          previewPane.style.display = "none";
        });

        previewTabBtn.addEventListener("click", () => {
          previewTabBtn.classList.add("active");
          writeTabBtn.classList.remove("active");
          gratitudeTextarea.style.display = "none";
          previewPane.style.display = "block";
          previewPane.innerHTML = this.renderMarkdownLite(gratitudeTextarea.value);
        });
      }

      // Sidebar Dates Selection Click binds
      wrapper.querySelectorAll(".journal_nav_item").forEach(item => {
        item.addEventListener("click", () => {
          const nextDate = item.getAttribute("data-date");
          if (nextDate !== this.selectedJournalDate) {
            this.selectedJournalDate = nextDate;
            this.renderJournalUI();
          }
        });
      });

      // Date Picker handler
      const pickerInput = document.getElementById("journal_date_picker");
      if (pickerInput) {
        pickerInput.addEventListener("change", (e) => {
          const val = e.target.value;
          if (val && val !== this.selectedJournalDate) {
            this.selectedJournalDate = val;
            this.renderJournalUI();
          }
        });
      }

      // Distraction-Free Toggle
      const dfToggle = document.getElementById("btn_journal_df_toggle");
      if (dfToggle) {
        dfToggle.addEventListener("click", () => {
          document.body.classList.toggle("journal-distraction-free");
          this.renderJournalUI();
        });
      }

      // Autosave Engine
      let autosaveTimeout;
      const triggerAutosave = () => {
        if (autosaveStatus) {
          autosaveStatus.textContent = "Saving...";
          autosaveStatus.classList.add("saving");
        }
        if (autosaveTimeout) clearTimeout(autosaveTimeout);
        autosaveTimeout = setTimeout(() => {
          commitSave(true);
        }, 1000);
      };

      const commitSave = (isAutosave = false) => {
        const morningIntention = intentInput ? intentInput.value.trim() : "";
        const eveningReflection = gratitudeTextarea ? gratitudeTextarea.value.trim() : "";
        const shutdownComplete = shutdownCheckbox ? shutdownCheckbox.checked : false;

        this.store.saveJournalEntry(activeDate, {
          morningIntention,
          morningMood: selectedMood,
          eveningReflection,
          shutdownComplete
        });

        if (autosaveStatus) {
          autosaveStatus.textContent = "✓ Saved";
          autosaveStatus.classList.remove("saving");
        }

        if (!isAutosave) {
          this.showToast("Reflection logged successfully!", "success");
        }
      };

      // Input changes for autosave
      if (intentInput) {
        intentInput.addEventListener("input", triggerAutosave);
      }
      if (gratitudeTextarea) {
        gratitudeTextarea.addEventListener("input", triggerAutosave);
      }
      if (shutdownCheckbox) {
        shutdownCheckbox.addEventListener("change", () => {
          triggerAutosave();
          if (shutdownCheckbox.checked) {
            this.store.emit("celebrate", { elementId: "btn_j_shutdown_trigger" });
          }
        });
      }

      // Manual commit save trigger
      if (saveBtn) {
        saveBtn.addEventListener("click", () => {
          commitSave(false);
        });
      }
    }

    // -------------------------------------------------------------------------
    // RENDER TASK LIST VIEWPORTS (INBOX, TODAY, TOMORROW...)
    // -------------------------------------------------------------------------
    renderTaskListUI(view) {
      const titles = {
        all: "Inbox Archive",
        today: "Focus Today",
        tomorrow: "Focus Tomorrow",
        upcoming: "Upcoming Tasks",
        overdue: "Overdue Alerts",
        completed: "Done Achievements",
        later: "Do It Later"
      };
      this.viewTitle.textContent = titles[view] || "My Tasks";

      const filtered = this.getFilteredTasks(view);
      this.viewCount.textContent = `(${filtered.length})`;

      // Update context and visibility for quick add deck
      this.updateQuickAddContext(view);

      // Manage AI Strategy Banner for Focus Today View
      const bannerContainer = document.getElementById("today_ai_banner_container");
      if (view === "today") {
        if (bannerContainer) {
          bannerContainer.style.display = "block";
          this.renderTodayAIBanner(filtered);
        }
      } else {
        if (bannerContainer) {
          bannerContainer.style.display = "none";
          bannerContainer.innerHTML = "";
        }
      }

      if (filtered.length === 0) {
        this.taskListContainer.innerHTML = `
          <div class="empty_state">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 16px; color: var(--text-muted);">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3>All caught up</h3>
            <p>Your task list is perfectly clear. Take a breather or capture a new goal!</p>
            <button class="sheet_primary_commit" id="empty_state_add_task" style="display: inline-flex; align-items: center; justify-content: center; padding: 0 20px; height: 40px; width: auto; font-weight: 600; font-size: 14px; margin-top: 16px; border-radius: 6px;">+ Add First Task</button>
          </div>
        `;
        setTimeout(() => {
          const btn = document.getElementById("empty_state_add_task");
          if (btn) btn.addEventListener("click", () => this.openBottomSheet());
        }, 50);
        return;
      }

      this.taskListContainer.innerHTML = "";

      if (view === "completed") {
        // Group completed tasks by completion date (or fallback to dueDate)
        const groups = {};
        filtered.forEach(task => {
          let dateKey = "No Date";
          if (task.completedDate) {
            dateKey = task.completedDate.split("T")[0];
          } else if (task.dueDate) {
            dateKey = task.dueDate;
          }
          if (!groups[dateKey]) groups[dateKey] = [];
          groups[dateKey].push(task);
        });

        const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

        const getFriendlyDateLabel = (dateStr) => {
          if (dateStr === "No Date") return "Completed (Unscheduled)";
          const todayStr = getLocalDateString();
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = getLocalDateString(yesterday);

          if (dateStr === todayStr) return "Today";
          if (dateStr === yesterdayStr) return "Yesterday";
          
          const d = new Date(dateStr + "T12:00:00");
          return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        };

        const fragment = document.createDocumentFragment();
        sortedDates.forEach((dateStr, idx) => {
          const groupTasks = groups[dateStr];
          const label = getFriendlyDateLabel(dateStr);
          const isCollapsed = idx > 0; // Collapse older than today/newest group by default

          const section = document.createElement("div");
          section.className = `completed_group_section ${isCollapsed ? "collapsed" : ""}`;
          section.setAttribute("data-date", dateStr);

          section.innerHTML = `
            <div class="completed_group_header">
              <div class="completed_group_title">
                <svg class="chevron_icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
                <h3>${label}</h3>
                <span class="count_badge">${groupTasks.length} ${groupTasks.length === 1 ? 'task' : 'tasks'}</span>
              </div>
            </div>
            <div class="completed_group_content"></div>
          `;

          const contentArea = section.querySelector(".completed_group_content");
          groupTasks.forEach(task => {
            const card = this.createTaskCardDOM(task);
            contentArea.appendChild(card);
          });

          const header = section.querySelector(".completed_group_header");
          header.addEventListener("click", () => {
            section.classList.toggle("collapsed");
          });

          fragment.appendChild(section);
        });
        this.taskListContainer.appendChild(fragment);
      } else {
        // Group pending/active tasks by priority (High, Medium, Low)
        const priorityGroups = {
          High: [],
          Medium: [],
          Low: []
        };
        
        filtered.forEach(task => {
          const p = task.priority || "Medium";
          if (priorityGroups[p]) {
            priorityGroups[p].push(task);
          } else {
            priorityGroups["Medium"].push(task);
          }
        });

        const fragment = document.createDocumentFragment();
        ["High", "Medium", "Low"].forEach(pKey => {
          const groupTasks = priorityGroups[pKey];
          if (groupTasks.length > 0) {
            const section = document.createElement("div");
            section.className = `priority_group_section priority-${pKey.toLowerCase()}`;
            section.setAttribute("data-priority", pKey);
            
            section.innerHTML = `
              <div class="priority_group_header">
                <div class="priority_group_title">
                  <svg class="chevron_icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                  <h3>${pKey} Priority</h3>
                  <span class="count_badge">${groupTasks.length} ${groupTasks.length === 1 ? 'task' : 'tasks'}</span>
                </div>
              </div>
              <div class="priority_group_content"></div>
            `;
            
            const contentArea = section.querySelector(".priority_group_content");
            groupTasks.forEach(task => {
              const card = this.createTaskCardDOM(task);
              contentArea.appendChild(card);
            });
            
            const header = section.querySelector(".priority_group_header");
            header.addEventListener("click", () => {
              section.classList.toggle("collapsed");
            });
            
            fragment.appendChild(section);
          }
        });
        this.taskListContainer.appendChild(fragment);
      }
    }

    getFilteredTasks(view) {
      const nowStr = getLocalDateString();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getLocalDateString(tomorrow);

      let list = this.store.tasks.filter(t => t.id !== "general_focus");

      if (view === "completed") {
        list = list.filter(t => t.completed);
      } else if (view === "later") {
        list = list.filter(t => !t.completed && t.isLater);
      } else {
        list = list.filter(t => !t.completed && !t.isLater);
        if (view === "today") list = list.filter(t => t.dueDate <= nowStr);
        else if (view === "tomorrow") list = list.filter(t => t.dueDate === tomorrowStr);
        else if (view === "upcoming") list = list.filter(t => t.dueDate > nowStr && t.dueDate <= this.getNDaysFromNow(7));
        else if (view === "overdue") list = list.filter(t => t.dueDate < nowStr);
      }

      if (view === "completed") {
        list.sort((a, b) => {
          const ad = a.completedDate || "";
          const bd = b.completedDate || "";
          return bd.localeCompare(ad); // Newest completed first!
        });
      } else {
        if (view === "today" && this.todayAITaskOrder && this.todayAITaskOrder.length > 0) {
          list.sort((a, b) => {
            const indexA = this.todayAITaskOrder.indexOf(a.id);
            const indexB = this.todayAITaskOrder.indexOf(b.id);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : a.id;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : b.id;
            return timeB - timeA;
          });
        } else {
          list.sort((a, b) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : a.id;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : b.id;
            return timeB - timeA;
          });
        }
      }

      const search = this.store.filters.search.toLowerCase().trim();
      const priority = this.store.filters.priority;
      const category = this.store.filters.category;

      return list.filter(t => {
        const matchesSearch = t.title.toLowerCase().includes(search) || t.description.toLowerCase().includes(search);
        const matchesPriority = priority === "All" || t.priority === priority;
        const matchesCategory = category === "All" || t.category === category;
        return matchesSearch && matchesPriority && matchesCategory;
      });
    }

    getNDaysFromNow(n) {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return getLocalDateString(d);
    }

    // -------------------------------------------------------------------------
    // DYNAMIC TASK CARD CREATOR AND SWIPE HANDLERS
    // -------------------------------------------------------------------------
    createTaskCardDOM(task) {
      const card = document.createElement("div");
      card.className = `task_card priority-${task.priority.toLowerCase()} ${task.completed ? "completed" : ""}`;
      card.setAttribute("data-id", task.id);

      let remainingBadge = "";
      if (!task.completed) {
        if (task.isLater) {
          remainingBadge = `<span class="badge later">Flexible</span>`;
        } else {
          const now = new Date();
          const due = new Date(task.dueDate + "T23:59:59");
          const diffMs = due - now;
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

          if (diffDays < 0) remainingBadge = `<span class="badge overdue">Overdue by ${Math.abs(diffDays)}d</span>`;
          else if (diffDays === 0) remainingBadge = `<span class="badge today">Due Today</span>`;
          else if (diffDays === 1) remainingBadge = `<span class="badge tomorrow">Due Tomorrow</span>`;
          else remainingBadge = `<span class="badge upcoming">In ${diffDays} days</span>`;
        }
      }

      const hasSub = task.subtasks && task.subtasks.length > 0;
      const completedSub = hasSub ? task.subtasks.filter(s => s.completed).length : 0;
      const subPct = hasSub ? Math.round((completedSub / task.subtasks.length) * 100) : 0;

      let aiOrderBadge = "";
      if (this.todayAITaskOrder && this.todayAITaskOrder.length > 0) {
        const rank = this.todayAITaskOrder.indexOf(task.id);
        if (rank === 0) {
          aiOrderBadge = `<span class="badge ai_rank top" title="AI Ranked #1 Focus"><svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" style="display:inline-block; vertical-align:middle; margin-right:3px;"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/></svg>#1 Priority</span>`;
        } else if (rank > 0) {
          aiOrderBadge = `<span class="badge ai_rank" title="AI Ranked Sequence #${rank + 1}">#${rank + 1} Sequence</span>`;
        }
      }

      card.innerHTML = `
        <div class="card_swipe_bg left_bg">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>Complete</span>
        </div>
        <div class="card_swipe_bg right_bg">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>Delete</span>
        </div>
        
        <div class="card_content">
          <div class="card_main_row">
            <button class="checkbox_btn" aria-label="Toggle Complete">
              <svg class="check_icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
            <div class="card_text">
              <div class="card_title_row">
                <h3 class="card_title">${this.escapeHTML(task.title)}</h3>
                ${aiOrderBadge}
                ${task.recurring !== "none" ? `<span class="recurring_icon" title="Repeats ${task.recurring}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;"><path d="M17 2.1l4 4-4 4"></path><path d="M3 12.2v-2a4 4 0 0 1 4-4h14"></path><path d="M7 21.9l-4-4 4-4"></path><path d="M21 11.8v2a4 4 0 0 1-4 4H3"></path></svg></span>` : ""}
              </div>
              ${task.description ? `<p class="card_desc">${this.escapeHTML(task.description)}</p>` : ""}
            </div>
            <button type="button" class="quick_delete_task_btn" title="Delete task" aria-label="Delete task">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>

          <div class="card_meta_row">
            <span class="meta_item priority_badge priority-${task.priority.toLowerCase()}">${task.priority.toUpperCase()}</span>
            <span class="meta_item category_badge">${this.escapeHTML(task.category)}</span>
            <span class="meta_item date_badge">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              ${task.isLater ? "Someday / Later" : task.dueDate}
            </span>
            ${remainingBadge}
            ${task.estimatedDuration ? `<span class="meta_item duration_badge"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${task.estimatedDuration}m</span>` : ""}
            ${task.focusSessions && task.focusSessions.length > 0 ? `<span class="meta_item focus_badge"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"></path></svg>${task.focusSessions.reduce((s, fs) => s + (fs.duration || 0), 0)}m focused</span>` : ""}
            <span class="meta_item xp_badge"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>+${(task.estimatedDuration || 25) * 4} XP</span>
          </div>

          ${hasSub ? `
            <div class="card_subtasks_summary">
              <div class="progress_track">
                <div class="progress_bar" style="width: ${subPct}%"></div>
              </div>
              <span class="subtask_ratio">${completedSub}/${task.subtasks.length} subtasks</span>
            </div>
          ` : ""}

          <div class="card_actions_expanded">
            <div class="divider"></div>
            <div class="subtasks_wrapper">
              <div class="subtask_list">
                ${(task.subtasks || []).map(sub => `
                  <div class="subtask_item" data-sub-id="${sub.id}">
                    <button class="sub_check_btn ${sub.completed ? "checked" : ""}">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </button>
                    <span class="subtask_title">${this.escapeHTML(sub.title)}</span>
                    <button class="sub_delete_btn" aria-label="Delete subtask">✕</button>
                  </div>
                `).join("")}
              </div>
              <div class="add_subtask_row">
                <input type="text" class="subtask_input" data-task-id="${task.id}" placeholder="+ Add subtask checklist, press Enter...">
              </div>
            </div>

            <!-- Inline AI Subtask Breakdown Slot -->
            <div class="task_ai_drawer_slot"></div>
            
            <div class="card_control_buttons">
              <button class="action_btn edit_btn" aria-label="Edit Task">
                Edit
              </button>
              ${!task.completed ? `
                <button class="action_btn ai_breakdown_btn" aria-label="Break down task with AI">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; color: var(--accent-primary);">
                    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/>
                  </svg>
                  AI Breakdown
                </button>
                <button class="action_btn play_btn" aria-label="Focus on task">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  Focus
                </button>
                <button class="action_btn later_btn" aria-label="${task.isLater ? 'Activate' : 'Do Later'}">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  ${task.isLater ? "Activate" : "Do Later"}
                </button>
              ` : ""}
              <button class="action_btn delete_btn_manual" aria-label="Delete Task">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      `;

      const content = card.querySelector(".card_content");
      content.addEventListener("click", (e) => {
        const ignores = [".checkbox_btn", ".quick_delete_task_btn", "polyline", "svg", "rect", "line", ".recurring_icon", ".subtask_item", ".sub_check_btn", ".sub_delete_btn", ".subtask_input", "button", "input", ".task_ai_breakdown_deck"];
        if (ignores.some(sel => e.target.closest(sel))) return;
        card.classList.toggle("expanded");
      });

      card.querySelector(".checkbox_btn").addEventListener("click", (e) => {
        e.stopPropagation();
        this.store.toggleTaskComplete(task.id);
      });

      const quickDelBtn = card.querySelector(".quick_delete_task_btn");
      if (quickDelBtn) {
        quickDelBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm(`Delete "${task.title}"?`)) {
            this.store.deleteTask(task.id);
          }
        });
      }

      const playBtn = card.querySelector(".play_btn");
      if (playBtn) {
        playBtn.addEventListener("click", () => {
          this.store.setView("timer");
          this.store.startTimer(task.id);
        });
      }

      const aiBreakdownBtn = card.querySelector(".ai_breakdown_btn");
      if (aiBreakdownBtn) {
        aiBreakdownBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openAIBreakdownDrawer(task, card);
        });
      }

      const laterBtn = card.querySelector(".later_btn");
      if (laterBtn) {
        laterBtn.addEventListener("click", () => {
          if (task.isLater) {
            const todayStr = getLocalDateString();
            this.store.updateTask(task.id, { isLater: false, dueDate: todayStr });
          } else {
            this.store.updateTask(task.id, { isLater: true });
          }
        });
      }

      card.querySelector(".edit_btn").addEventListener("click", () => this.openBottomSheet(task));
      
      card.querySelector(".delete_btn_manual").addEventListener("click", () => {
        if (confirm(`Unschedule "${task.title}"?`)) this.store.deleteTask(task.id);
      });

      card.querySelectorAll(".subtask_item").forEach(item => {
        const subId = item.getAttribute("data-sub-id");
        item.querySelector(".sub_check_btn").addEventListener("click", () => {
          this.store.toggleSubtask(task.id, subId);
        });
        item.querySelector(".sub_delete_btn").addEventListener("click", () => {
          this.store.deleteSubtask(task.id, subId);
        });
      });

      this.attachSwipeGestures(card);
      return card;
    }

    attachSwipeGestures(card) {
      const content = card.querySelector(".card_content");
      const leftBg = card.querySelector(".left_bg");
      const rightBg = card.querySelector(".right_bg");
      let startX = 0;
      let startY = 0;
      let isSwiping = false;

      content.addEventListener("touchstart", (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        content.style.transition = "none";
        isSwiping = false;
      }, { passive: true });

      content.addEventListener("touchmove", (e) => {
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - startX;
        const diffY = currentY - startY;

        if (Math.abs(diffX) > Math.abs(diffY)) {
          if (Math.abs(diffX) > 10) {
            isSwiping = true;
            if (e.cancelable) e.preventDefault();

            let trans = diffX;
            if (diffX > 0) {
              leftBg.style.opacity = Math.min(Math.abs(diffX) / 80, 1);
              rightBg.style.opacity = 0;
              trans = Math.min(diffX, 120);
            } else {
              rightBg.style.opacity = Math.min(Math.abs(diffX) / 80, 1);
              leftBg.style.opacity = 0;
              trans = Math.max(diffX, -120);
            }
            content.style.transform = `translateX(${trans}px)`;
          }
        }
      }, { passive: false });

      content.addEventListener("touchend", (e) => {
        if (!isSwiping) return;

        const currentX = e.changedTouches[0].clientX;
        const diffX = currentX - startX;
        const threshold = 100;

        content.style.transition = "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
        
        if (diffX > threshold) {
          content.style.transform = "translateX(100%)";
          setTimeout(() => {
            const taskId = parseInt(card.getAttribute("data-id"));
            this.store.toggleTaskComplete(taskId);
          }, 200);
        } else if (diffX < -threshold) {
          content.style.transform = "translateX(-100%)";
          setTimeout(() => {
            const taskId = parseInt(card.getAttribute("data-id"));
            if (confirm("Are you sure you want to delete this task?")) {
              this.store.deleteTask(taskId);
            } else {
              content.style.transform = "translateX(0)";
              leftBg.style.opacity = 0;
              rightBg.style.opacity = 0;
            }
          }, 200);
        } else {
          content.style.transform = "translateX(0)";
          leftBg.style.opacity = 0;
          rightBg.style.opacity = 0;
        }
      });
    }

    // =========================================================================
    // FOCUS TODAY AI STRATEGIST & SUBTASK BREAKDOWN ENGINE
    // =========================================================================
    // =========================================================================
    // FOCUS TODAY: PSYCHOLOGICAL MOMENTUM & TOMORROW PLANNING ENGINE
    // =========================================================================
    loadTomorrowPlan() {
      try {
        const raw = localStorage.getItem("aurora_tomorrow_plan");
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    saveTomorrowPlan(plan) {
      this.tomorrowPlan = plan;
      try {
        if (plan) {
          localStorage.setItem("aurora_tomorrow_plan", JSON.stringify(plan));
          StorageService.savePreference("tomorrow_plan", plan);
        } else {
          localStorage.removeItem("aurora_tomorrow_plan");
          StorageService.savePreference("tomorrow_plan", null);
        }
      } catch (e) {
        console.error("Failed to save tomorrow plan:", e);
      }
    }

    getMorningMomentumPlan() {
      if (!this.tomorrowPlan) return null;
      const nowStr = getLocalDateString();
      if (this.tomorrowPlan.targetDate === nowStr && !this.tomorrowPlan.dismissed) {
        return this.tomorrowPlan;
      }
      return null;
    }

    getPastTodosPsychologyMetrics() {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const sevenDaysAgoStr = getLocalDateString(sevenDaysAgo);
      const nowStr = getLocalDateString(now);

      const allCompleted = this.store.tasks.filter(t => t.completed && t.id !== "general_focus");
      const recentCompleted = allCompleted.filter(t => {
        if (!t.completedDate) return false;
        const dStr = t.completedDate.substring(0, 10);
        return dStr >= sevenDaysAgoStr && dStr <= nowStr;
      });

      const activeDaysSet = new Set(recentCompleted.map(t => t.completedDate.substring(0, 10)));
      const activeDaysCount = Math.max(1, activeDaysSet.size);

      const dailyVelocity = activeDaysSet.size > 0 
        ? +(recentCompleted.length / activeDaysCount).toFixed(1)
        : (allCompleted.length > 0 ? +(allCompleted.length / 5).toFixed(1) : 2.5);

      const recommendedTaskCap = Math.min(4, Math.max(2, Math.round(dailyVelocity) || 3));

      const categoryCounts = {};
      allCompleted.forEach(t => {
        const cat = t.category || "General";
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });

      let topCategory = "Focus";
      let maxCatCount = 0;
      Object.entries(categoryCounts).forEach(([cat, count]) => {
        if (count > maxCatCount) {
          maxCatCount = count;
          topCategory = cat;
        }
      });

      const overdueTasks = this.store.tasks.filter(t => 
        !t.completed && !t.isLater && t.id !== "general_focus" && t.dueDate < nowStr
      );

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getLocalDateString(tomorrow);
      const alreadyScheduledTomorrow = this.store.tasks.filter(t => 
        !t.completed && !t.isLater && t.id !== "general_focus" && t.dueDate === tomorrowStr
      );

      const todayPending = this.store.tasks.filter(t => 
        !t.completed && !t.isLater && t.id !== "general_focus" && t.dueDate === nowStr
      );

      return {
        totalCompletedAllTime: allCompleted.length,
        recentCompletedCount: recentCompleted.length,
        dailyVelocity,
        recommendedTaskCap,
        topCategory,
        maxCatCount,
        overdueCount: overdueTasks.length,
        overdueTasks,
        alreadyScheduledTomorrow,
        todayPending,
        activeDaysCount
      };
    }

    synthesizeMicroStarter(title = "") {
      const t = title.toLowerCase();
      if (/write|draft|doc|report|blog|article|content|essay|journal/.test(t)) {
        return "Open the document and write 1 sentence or bullet outline.";
      }
      if (/code|bug|feature|fix|dev|implement|refactor|test|pr|commit|repo|pull request|review/.test(t)) {
        return "Open the project in your editor and locate the first file.";
      }
      if (/read|study|book|learn|course|lecture|research/.test(t)) {
        return "Open page 1 and read the first 3 headings or 1 paragraph.";
      }
      if (/email|message|call|contact|reach|slack|reply|invoice/.test(t)) {
        return "Open the message box and draft the greeting line.";
      }
      if (/gym|workout|exercise|run|walk|fitness|stretch/.test(t)) {
        return "Put on workout shoes and drink a glass of water.";
      }
      if (/clean|organize|tidy|desk|room/.test(t)) {
        return "Pick up 1 single item from your desk and put it in place.";
      }
      return `Open the workspace for "${title}" and write down the single first physical step.`;
    }

    generateAlgorithmicTomorrowBlueprint(metrics) {
      const nowStr = getLocalDateString();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getLocalDateString(tomorrow);

      let keystone = metrics.overdueTasks.find(t => t.priority === "High") 
        || metrics.overdueTasks[0] 
        || metrics.todayPending.find(t => t.priority === "High")
        || metrics.todayPending[0]
        || metrics.alreadyScheduledTomorrow[0]
        || this.store.tasks.find(t => !t.completed && !t.isLater && t.id !== "general_focus")
        || { id: 0, title: "Deep Focus Keystone Milestone", priority: "High", category: metrics.topCategory };

      const microStarter = this.synthesizeMicroStarter(keystone.title);

      const morningRoutine = (this.store.routines || []).find(r => r.startTime && r.startTime <= "10:00");
      const intentionTime = morningRoutine ? `${morningRoutine.startTime} (after "${morningRoutine.title}")` : "09:00 AM";
      const implementationIntention = `When ${intentionTime} arrives, I will sit at my desk and spend 2 minutes executing the starter step.`;

      const cap = Math.max(1, metrics.recommendedTaskCap - 1);
      const candidates = this.store.tasks.filter(t => 
        !t.completed && !t.isLater && t.id !== "general_focus" && t.id !== keystone.id
      );

      const supporting = candidates.slice(0, cap).map(t => ({
        taskId: t.id,
        title: t.title,
        priority: t.priority,
        category: t.category,
        estimatedDuration: t.estimatedDuration || 25,
        role: t.priority === "High" ? "Core Milestone" : "Quick-Win Stepping Stone"
      }));

      let diagnosis = "";
      if (metrics.recentCompletedCount > 0) {
        diagnosis = `Your past to-dos show a proven velocity of ${metrics.dailyVelocity} tasks/day with strong momentum in ${metrics.topCategory}. To protect against the planning fallacy, tomorrow is capped at ${metrics.recommendedTaskCap} high-impact goals so you maintain an unbroken winning streak.`;
      } else {
        diagnosis = `Starting fresh requires low activation friction. We selected 1 Keystone Frog with an effortless 2-minute starter to build immediate dopamine momentum tomorrow morning.`;
      }

      if (metrics.overdueCount > 0) {
        diagnosis += ` Note: ${metrics.overdueCount} task carried over; we converted it into your primary frog so it no longer drains your mental energy.`;
      }

      const affirmation = "Cognitive closure established. Your tomorrow is decided. Put down your task list tonight with peace of mind.";

      return {
        psychologicalDiagnosis: diagnosis,
        keystoneTaskId: keystone.id,
        keystoneTitle: keystone.title,
        keystoneCategory: keystone.category || metrics.topCategory,
        keystonePriority: keystone.priority || "High",
        keystoneReason: metrics.overdueTasks.includes(keystone) 
          ? "Carrying over from earlier; conquering this first eliminates subconscious procrastination dread." 
          : "Highest leverage objective to guarantee the day is an absolute win.",
        microStarter,
        implementationIntention,
        supportingTasks: supporting,
        closureAffirmation: affirmation,
        source: "Behavioral Science Heuristics"
      };
    }

    renderMorningMomentumCardHTML(morningPlan) {
      return `
        <div class="morning_momentum_bridge_card">
          <div class="morning_bridge_badge_row">
            <div class="morning_bridge_title_group">
              <span class="morning_bridge_pill">🌅 Morning Momentum Bridge</span>
              <span class="morning_bridge_streak">🔥 ${this.eveningPlanningStreak}-Day Planning Streak</span>
            </div>
            <button type="button" class="morning_bridge_dismiss_btn" id="btn_dismiss_morning_bridge" title="Dismiss Morning Bridge">✕</button>
          </div>
          <div class="morning_bridge_content">
            <div class="morning_bridge_text">
              <div class="morning_bridge_eyebrow">Pre-Committed Yesterday · Zero Morning Friction</div>
              <h4 class="morning_bridge_title">Anchor Goal: <strong>${this.escapeHTML(morningPlan.keystoneTitle || "Keystone Task")}</strong></h4>
              <div class="morning_bridge_starter_box">
                <span class="micro_icon">⚡</span>
                <div>
                  <strong>2-Minute Micro-Starter:</strong>
                  <span>${this.escapeHTML(morningPlan.microStarter || "Take 2 minutes to start the first action.")}</span>
                </div>
              </div>
              ${morningPlan.implementationIntention ? `
                <div class="morning_bridge_cue_row">
                  <span class="cue_icon">⏰</span>
                  <span>${this.escapeHTML(morningPlan.implementationIntention)}</span>
                </div>
              ` : ""}
            </div>
            <div class="morning_bridge_actions">
              ${morningPlan.microStarterDone ? `
                <div class="morning_bridge_done_badge">✓ 2-Min Starter Conquered</div>
              ` : `
                <button type="button" class="today_ai_btn primary" id="btn_launch_morning_micro_start">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <span>Launch 2-Min Focus</span>
                </button>
                <button type="button" class="today_ai_btn secondary" id="btn_complete_morning_micro_start">
                  <span>✓ Started!</span>
                </button>
              `}
            </div>
          </div>
        </div>
      `;
    }

    bindMorningCardEvents(morningPlan) {
      const dismissBtn = document.getElementById("btn_dismiss_morning_bridge");
      const launchBtn = document.getElementById("btn_launch_morning_micro_start");
      const completeBtn = document.getElementById("btn_complete_morning_micro_start");

      if (dismissBtn) {
        dismissBtn.addEventListener("click", () => {
          morningPlan.dismissed = true;
          this.saveTomorrowPlan(morningPlan);
          const filtered = this.getFilteredTasks("today");
          this.renderTodayAIBanner(filtered);
        });
      }

      if (launchBtn) {
        launchBtn.addEventListener("click", () => {
          this.launchMorningMicroStart(morningPlan.keystoneTitle, morningPlan.keystoneTaskId);
        });
      }

      if (completeBtn) {
        completeBtn.addEventListener("click", () => {
          morningPlan.microStarterDone = true;
          this.saveTomorrowPlan(morningPlan);
          this.store.emit("celebrate", { elementId: "btn_complete_morning_micro_start" });
          this.showToast("Morning momentum starter conquered! Your brain is now in flow.", "success");
          const filtered = this.getFilteredTasks("today");
          this.renderTodayAIBanner(filtered);
        });
      }
    }

    launchMorningMicroStart(taskTitle, taskId) {
      let task = null;
      if (taskId) task = this.store.tasks.find(t => t.id === taskId);
      if (!task && taskTitle) {
        task = this.store.tasks.find(t => t.title.toLowerCase() === taskTitle.toLowerCase());
      }

      this.store.setView("timer");
      if (task) {
        this.store.timer.activeTaskId = task.id;
      }
      this.store.timer.duration = 120; // 2-minute starter sprint
      this.store.timer.totalDuration = 120;
      this.store.startTimer(task ? task.id : null);
      this.showToast("⚡ 2-Minute Micro-Starter Timer Launched! Zero friction, just start.", "success");
    }

    renderTodayExecutionContent(container, todayTasks) {
      container.innerHTML = `
        <div class="today_ai_header">
          <div class="today_ai_title_group">
            <div class="today_ai_sparkle_icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/>
              </svg>
            </div>
            <div>
              <div class="today_ai_title_with_badge">
                <h3>AI Focus Strategist</h3>
                <span class="today_ai_tag">Daily Plan</span>
              </div>
              <p class="today_ai_subtitle">Intelligent prioritization, anti-procrastination cues & time blocking</p>
            </div>
          </div>

          <div class="today_ai_actions">
            <button type="button" id="btn_today_ai_plan" class="today_ai_btn primary">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              <span>Plan Today's Focus</span>
            </button>
            <button type="button" id="btn_today_ai_prioritize" class="today_ai_btn secondary">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
              <span>⚡ Smart Order</span>
            </button>
            ${this.todayAIPlan || (this.todayAITaskOrder && this.todayAITaskOrder.length > 0) ? `
              <button type="button" id="btn_today_ai_reset" class="today_ai_btn text_only" title="Reset AI Ordering">Reset</button>
            ` : ""}
          </div>
        </div>

        <div id="today_ai_plan_result" class="today_ai_plan_result"></div>
      `;

      if (this.todayAIPlan) {
        this.renderTodayAIPlanDetails(this.todayAIPlan, todayTasks);
      }

      const planBtn = document.getElementById("btn_today_ai_plan");
      const prioritizeBtn = document.getElementById("btn_today_ai_prioritize");
      const resetBtn = document.getElementById("btn_today_ai_reset");

      if (planBtn) {
        planBtn.addEventListener("click", () => this.generateTodayAIPlan(todayTasks));
      }
      if (prioritizeBtn) {
        prioritizeBtn.addEventListener("click", () => this.autoPrioritizeTodayTasks(todayTasks));
      }
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          this.todayAIPlan = null;
          this.todayAITaskOrder = null;
          this.renderTaskListUI("today");
          this.showToast("Reset AI daily plan and ordering.", "info");
        });
      }
    }

    renderTomorrowMomentumContent(container) {
      const metrics = this.getPastTodosPsychologyMetrics();
      const plan = this.tomorrowPlanDraft || (this.tomorrowPlan && this.tomorrowPlan.targetDate === this.getNDaysFromNow(1) ? this.tomorrowPlan : null);

      container.innerHTML = `
        <div class="today_ai_header">
          <div class="today_ai_title_group">
            <div class="today_ai_sparkle_icon" style="background: rgba(245, 158, 11, 0.12); color: #f59e0b;">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            </div>
            <div>
              <div class="today_ai_title_with_badge">
                <h3>Tomorrow Momentum Bridge</h3>
                <span class="today_ai_tag" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">Psychological Setup</span>
              </div>
              <p class="today_ai_subtitle">Past to-dos analysis · Planning fallacy shield · Zero morning friction</p>
            </div>
          </div>

          <div class="today_ai_actions">
            <button type="button" id="btn_generate_tomorrow_blueprint" class="today_ai_btn primary">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/></svg>
              <span>✨ Plan Tomorrow</span>
            </button>
            <button type="button" id="btn_heuristic_tomorrow" class="today_ai_btn secondary">
              <span>⚡ Fast Heuristic</span>
            </button>
            ${plan ? `
              <button type="button" id="btn_reset_tomorrow_draft" class="today_ai_btn text_only" title="Reset Blueprint">Reset</button>
            ` : ""}
          </div>
        </div>

        <!-- 3-Pillar Evidence Grid from Past To-Dos -->
        <div class="tomorrow_psych_stats_grid">
          <div class="psych_stat_card">
            <span class="psych_stat_badge">Proven Velocity</span>
            <span class="psych_stat_val">${metrics.dailyVelocity} / day</span>
            <span class="psych_stat_desc">Based on past 7 days</span>
          </div>
          <div class="psych_stat_card">
            <span class="psych_stat_badge">${this.escapeHTML(metrics.topCategory)} Leader</span>
            <span class="psych_stat_val">${metrics.recentCompletedCount} Won</span>
            <span class="psych_stat_desc">Self-efficacy domain</span>
          </div>
          <div class="psych_stat_card">
            <span class="psych_stat_badge">Fallacy Guard</span>
            <span class="psych_stat_val">Max ${metrics.recommendedTaskCap} Goals</span>
            <span class="psych_stat_desc">Optimal cognitive capacity</span>
          </div>
          <div class="psych_stat_card">
            <span class="psych_stat_badge">Evening Habit</span>
            <span class="psych_stat_val">🔥 ${this.eveningPlanningStreak}d Streak</span>
            <span class="psych_stat_desc">Nightly shutdown ritual</span>
          </div>
        </div>

        <div id="tomorrow_blueprint_result_slot"></div>
      `;

      const resultSlot = document.getElementById("tomorrow_blueprint_result_slot");
      if (plan && resultSlot) {
        this.renderTomorrowBlueprintDetails(resultSlot, plan, metrics);
      } else if (resultSlot) {
        resultSlot.innerHTML = `
          <div class="tomorrow_starter_prompt">
            <div class="starter_prompt_icon">🌙</div>
            <div class="starter_prompt_text">
              <h4>Establish Cognitive Closure for Tonight</h4>
              <p>Planning tomorrow based on your past completion velocity prevents morning hesitation and protects sleep quality. Click <strong>Plan Tomorrow</strong> to generate your psychological setup.</p>
            </div>
          </div>
        `;
      }

      const generateBtn = document.getElementById("btn_generate_tomorrow_blueprint");
      const heuristicBtn = document.getElementById("btn_heuristic_tomorrow");
      const resetBtn = document.getElementById("btn_reset_tomorrow_draft");

      if (generateBtn) {
        generateBtn.addEventListener("click", () => this.generateTomorrowAIPlan(metrics));
      }
      if (heuristicBtn) {
        heuristicBtn.addEventListener("click", () => {
          const draft = this.generateAlgorithmicTomorrowBlueprint(metrics);
          this.tomorrowPlanDraft = draft;
          const slot = document.getElementById("tomorrow_blueprint_result_slot");
          if (slot) this.renderTomorrowBlueprintDetails(slot, draft, metrics);
        });
      }
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          this.tomorrowPlanDraft = null;
          this.saveTomorrowPlan(null);
          const filtered = this.getFilteredTasks("today");
          this.renderTodayAIBanner(filtered);
          this.showToast("Reset tomorrow's planning blueprint.", "info");
        });
      }
    }

    renderTomorrowBlueprintDetails(slot, plan, metrics) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getLocalDateString(tomorrow);
      const isCommitted = plan.committed && plan.targetDate === tomorrowStr;

      slot.innerHTML = `
        <div class="tomorrow_plan_card">
          <!-- 1. Behavioral Psychology Diagnosis -->
          <div class="tomorrow_diagnosis_box">
            <div class="diagnosis_header">
              <span class="diagnosis_icon">🧠</span>
              <strong>Behavioral Analysis & Velocity Alignment:</strong>
            </div>
            <p class="diagnosis_text">${this.escapeHTML(plan.psychologicalDiagnosis || "")}</p>
          </div>

          <!-- 2. Keystone Frog (The Anchor Goal) -->
          <div class="tomorrow_keystone_box">
            <div class="keystone_badge_row">
              <span class="keystone_badge">🎯 #1 Keystone Frog · The Anchor Goal</span>
              <span class="keystone_priority_tag ${String(plan.keystonePriority || 'High').toLowerCase()}">${this.escapeHTML(plan.keystonePriority || "High")}</span>
            </div>
            <h4 class="keystone_title">${this.escapeHTML(plan.keystoneTitle)}</h4>
            <p class="keystone_reason">${this.escapeHTML(plan.keystoneReason || "Highest leverage goal.")}</p>

            <!-- 2-Minute Micro-Starter Friction Destroyer -->
            <div class="tomorrow_micro_starter_box">
              <span class="micro_icon">⚡</span>
              <div class="micro_content">
                <strong>2-Minute Micro-Starter (Anti-Avoidance Cue):</strong>
                <p id="micro_starter_display" class="micro_text">${this.escapeHTML(plan.microStarter)}</p>
              </div>
            </div>

            <!-- Implementation Intention Anchor (Gollwitzer If-Then) -->
            ${plan.implementationIntention ? `
              <div class="tomorrow_intention_box">
                <span class="intention_icon">⏰</span>
                <div class="intention_content">
                  <strong>Implementation Intention (If-Then Habit):</strong>
                  <p class="intention_text">${this.escapeHTML(plan.implementationIntention)}</p>
                </div>
              </div>
            ` : ""}
          </div>

          <!-- 3. Supporting Stepping Stones (Capped by Velocity) -->
          ${plan.supportingTasks && plan.supportingTasks.length > 0 ? `
            <div class="tomorrow_supporting_section">
              <div class="supporting_section_header">
                <span class="section_label">Supporting Stepping Stones (Velocity Guard: ${plan.supportingTasks.length} added)</span>
              </div>
              <div class="tomorrow_supporting_list">
                ${plan.supportingTasks.map((t) => `
                  <div class="tomorrow_supporting_item">
                    <label class="supporting_checkbox_label">
                      <input type="checkbox" class="supporting_task_cb" data-task-id="${t.taskId || ''}" data-task-title="${this.escapeHTML(t.title)}" checked />
                      <span class="supporting_task_title">${this.escapeHTML(t.title)}</span>
                    </label>
                    <div class="supporting_meta">
                      <span class="supporting_role_badge">${this.escapeHTML(t.role || 'Quick Win')}</span>
                      <span class="step_slot">${t.estimatedDuration || 25}m</span>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ""}

          <!-- 4. Zeigarnik Evening Shutdown Affirmation -->
          <div class="tomorrow_zeigarnik_box">
            <span class="shutdown_moon">🌙</span>
            <span>"${this.escapeHTML(plan.closureAffirmation || "Tomorrow is set. Shutdown complete. Rest your executive control.")}"</span>
          </div>

          <!-- 5. Commit & Lock-in Button -->
          <div class="tomorrow_action_row">
            ${isCommitted ? `
              <div class="tomorrow_committed_banner">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Locked in for Tomorrow (${tomorrowStr})! Morning launchpad primed.</span>
              </div>
            ` : `
              <button type="button" class="today_ai_btn primary lock_tomorrow_btn" id="btn_lock_tomorrow_blueprint">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <span>🔒 Lock In & Schedule to Tomorrow</span>
              </button>
            `}
          </div>
        </div>
      `;

      const lockBtn = document.getElementById("btn_lock_tomorrow_blueprint");
      if (lockBtn) {
        lockBtn.addEventListener("click", () => this.lockInTomorrowPlan(plan));
      }
    }

    lockInTomorrowPlan(plan) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getLocalDateString(tomorrow);
      const nowStr = getLocalDateString();

      let keystoneTask = null;
      if (plan.keystoneTaskId) {
        keystoneTask = this.store.tasks.find(t => t.id === plan.keystoneTaskId);
      }
      if (!keystoneTask && plan.keystoneTitle) {
        keystoneTask = this.store.tasks.find(t => t.title.toLowerCase() === plan.keystoneTitle.toLowerCase());
      }

      if (keystoneTask) {
        this.store.updateTask(keystoneTask.id, { dueDate: tomorrowStr, isLater: false });
      } else if (plan.keystoneTitle) {
        keystoneTask = this.store.addTask({
          title: plan.keystoneTitle,
          dueDate: tomorrowStr,
          priority: plan.keystonePriority || "High",
          category: plan.keystoneCategory || "Focus"
        });
        plan.keystoneTaskId = keystoneTask.id;
      }

      const checkboxes = document.querySelectorAll(".supporting_task_cb:checked");
      const selectedSupportingIds = [];
      checkboxes.forEach(cb => {
        const taskId = cb.getAttribute("data-task-id");
        const taskTitle = cb.getAttribute("data-task-title");
        let task = null;
        if (taskId) task = this.store.tasks.find(t => String(t.id) === String(taskId));
        if (!task && taskTitle) task = this.store.tasks.find(t => t.title === taskTitle);

        if (task) {
          this.store.updateTask(task.id, { dueDate: tomorrowStr, isLater: false });
          selectedSupportingIds.push(task.id);
        }
      });

      const planRecord = {
        createdDate: nowStr,
        targetDate: tomorrowStr,
        keystoneTaskId: keystoneTask ? keystoneTask.id : plan.keystoneTaskId,
        keystoneTitle: plan.keystoneTitle,
        keystoneCategory: plan.keystoneCategory || "Focus",
        keystonePriority: plan.keystonePriority || "High",
        microStarter: plan.microStarter,
        implementationIntention: plan.implementationIntention,
        supportingTaskIds: selectedSupportingIds,
        psychologicalDiagnosis: plan.psychologicalDiagnosis,
        closureAffirmation: plan.closureAffirmation,
        committed: true,
        dismissed: false,
        microStarterDone: false
      };

      this.saveTomorrowPlan(planRecord);
      this.tomorrowPlanDraft = planRecord;

      const lastPlanDate = localStorage.getItem("aurora_last_plan_date");
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);

      if (lastPlanDate === yesterdayStr) {
        this.eveningPlanningStreak += 1;
      } else if (lastPlanDate !== nowStr) {
        this.eveningPlanningStreak = 1;
      }
      localStorage.setItem("aurora_last_plan_date", nowStr);
      localStorage.setItem("aurora_evening_streak", this.eveningPlanningStreak.toString());

      this.store.emit("celebrate", { elementId: "btn_lock_tomorrow_blueprint" });
      this.showToast("🌙 Tomorrow's Momentum Blueprint locked in! Sleep with peace of mind.", "success");

      const filtered = this.getFilteredTasks("today");
      this.renderTodayAIBanner(filtered);
    }

    async generateTomorrowAIPlan(metrics) {
      const resultSlot = document.getElementById("tomorrow_blueprint_result_slot");
      if (!resultSlot) return;

      if (!this.geminiApiKey) {
        const draft = this.generateAlgorithmicTomorrowBlueprint(metrics);
        this.tomorrowPlanDraft = draft;
        this.renderTomorrowBlueprintDetails(resultSlot, draft, metrics);
        this.showToast("Generated with Behavioral Science heuristics! Add Gemini API Key for deep AI coaching.", "info");
        return;
      }

      resultSlot.innerHTML = `
        <div class="ai_coach_loading" style="padding: 20px 0;">
          <div class="ai_coach_spinner"></div>
          <span>Analyzing historical velocity, category balance, and anti-friction cues for tomorrow...</span>
        </div>
      `;

      const candidateTasks = this.store.tasks
        .filter(t => !t.completed && t.id !== "general_focus")
        .slice(0, 10)
        .map(t => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          category: t.category,
          dueDate: t.dueDate,
          isOverdue: t.dueDate < getLocalDateString(),
          estimatedDuration: t.estimatedDuration || 25
        }));

      const routinesBrief = (this.store.routines || [])
        .filter(r => r.startTime <= "12:00")
        .map(r => `${r.startTime} (${r.title})`)
        .join(", ");

      const prompt = `You are a world-class behavioral psychologist and productivity strategist (James Clear, BJ Fogg, Peter Gollwitzer).
Analyze the user's past todo history and current backlog to create a psychological TOMORROW BLUEPRINT.

PAST TODOS PERFORMANCE:
- Proven daily velocity: ${metrics.dailyVelocity} tasks/day
- Completed in past 7 days: ${metrics.recentCompletedCount} tasks
- Top momentum category: ${metrics.topCategory}
- Overdue friction tasks count: ${metrics.overdueCount}
- Evening planning streak: ${this.eveningPlanningStreak} days
- Morning routine schedule: ${routinesBrief || "09:00 AM start"}

CURRENT CANDIDATE TASKS:
${JSON.stringify(candidateTasks, null, 2)}

PSYCHOLOGICAL RULES:
1. Prevent the Planning Fallacy: Capped at maximum ${metrics.recommendedTaskCap} total tasks for tomorrow.
2. Select 1 Keystone Frog (highest leverage anchor goal).
3. Provide an effortless 2-Minute Micro-Starter (first physical movement to eliminate morning cold-start resistance).
4. Provide an 'If-Then' Implementation Intention anchored to their morning routine or 09:00 AM.
5. Provide up to ${Math.max(1, metrics.recommendedTaskCap - 1)} Supporting Stepping Stones (quick wins / momentum maintainers).
6. Provide an evening cognitive closure affirmation (Zeigarnik shutdown).

Return ONLY a valid JSON object matching this schema:
{
  "psychologicalDiagnosis": "2 sentences analyzing momentum, velocity alignment, and anti-procrastination reasoning.",
  "keystoneTaskId": ${candidateTasks[0] ? candidateTasks[0].id : 0},
  "keystoneTitle": "Task title",
  "keystoneCategory": "Category",
  "keystonePriority": "High",
  "keystoneReason": "Why this is the #1 highest leverage frog for tomorrow.",
  "microStarter": "A microscopic 2-minute starter physical action.",
  "implementationIntention": "When [time or routine cue], I will sit down and execute the 2-minute starter.",
  "supportingTasks": [
    {
      "taskId": ${candidateTasks[1] ? candidateTasks[1].id : 0},
      "title": "Supporting task title",
      "priority": "Medium",
      "category": "Work",
      "estimatedDuration": 25,
      "role": "Quick-Win Stepping Stone"
    }
  ],
  "closureAffirmation": "Evening shutdown statement to clear mental bandwidth."
}`;

      try {
        const { data } = await this.callGeminiWithFallback({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        });

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Empty response from AI");

        const plan = JSON.parse(text);
        plan.source = "Gemini AI";
        this.tomorrowPlanDraft = plan;
        this.renderTomorrowBlueprintDetails(resultSlot, plan, metrics);
      } catch (err) {
        console.error("AI Tomorrow Plan error, falling back to heuristics:", err);
        const draft = this.generateAlgorithmicTomorrowBlueprint(metrics);
        this.tomorrowPlanDraft = draft;
        this.renderTomorrowBlueprintDetails(resultSlot, draft, metrics);
        this.showToast("Generated blueprint with Behavioral Science engine!", "info");
      }
    }

    renderTodayAIBanner(todayTasks) {
      const container = document.getElementById("today_ai_banner_container");
      if (!container) return;

      const morningPlan = this.getMorningMomentumPlan();
      const hasLockedPlan = this.tomorrowPlan && this.tomorrowPlan.targetDate === this.getNDaysFromNow(1) && this.tomorrowPlan.committed;

      container.innerHTML = `
        ${morningPlan ? this.renderMorningMomentumCardHTML(morningPlan) : ""}

        <div class="today_ai_deck">
          <div class="focus_mode_tabs_bar">
            <button type="button" class="focus_mode_tab ${this.focusAITab === 'today' ? 'active' : ''}" id="tab_focus_today_mode">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              <span>Today's Execution (${todayTasks.length})</span>
            </button>
            <button type="button" class="focus_mode_tab ${this.focusAITab === 'tomorrow' ? 'active' : ''}" id="tab_focus_tomorrow_mode">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              <span>Plan Tomorrow's Momentum</span>
              ${hasLockedPlan ? `<span class="focus_tab_badge locked">Locked In ✓</span>` : `<span class="focus_tab_badge">Evening Setup</span>`}
            </button>
          </div>

          <div id="focus_ai_content_area"></div>
        </div>
      `;

      if (morningPlan) {
        this.bindMorningCardEvents(morningPlan);
      }

      const todayTabBtn = document.getElementById("tab_focus_today_mode");
      const tomorrowTabBtn = document.getElementById("tab_focus_tomorrow_mode");
      if (todayTabBtn) {
        todayTabBtn.addEventListener("click", () => {
          this.focusAITab = "today";
          this.renderTodayAIBanner(todayTasks);
        });
      }
      if (tomorrowTabBtn) {
        tomorrowTabBtn.addEventListener("click", () => {
          this.focusAITab = "tomorrow";
          this.renderTodayAIBanner(todayTasks);
        });
      }

      const contentArea = document.getElementById("focus_ai_content_area");
      if (!contentArea) return;

      if (this.focusAITab === "today") {
        this.renderTodayExecutionContent(contentArea, todayTasks);
      } else {
        this.renderTomorrowMomentumContent(contentArea);
      }
    }

    renderTodayAIPlanDetails(plan, todayTasks) {
      const resultEl = document.getElementById("today_ai_plan_result");
      if (!resultEl) return;

      const topTask = todayTasks.find(t => t.id === plan.topFocusTaskId) || todayTasks[0];

      resultEl.innerHTML = `
        <div class="today_ai_plan_card">
          <p class="today_ai_summary">"${this.escapeHTML(plan.executiveSummary || "")}"</p>

          ${topTask ? `
            <div class="today_ai_conquer_box">
              <div class="conquer_info">
                <span class="conquer_badge">🎯 Start Here · #1 Priority Focus</span>
                <strong class="conquer_title">${this.escapeHTML(topTask.title)}</strong>
                <p class="conquer_reason">${this.escapeHTML(plan.topFocusReason || "Highest leverage goal for today.")}</p>
              </div>
              <button type="button" class="today_ai_btn primary" id="btn_ai_launch_top_task">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>Focus in Timer</span>
              </button>
            </div>
          ` : ""}

          ${plan.antiProcrastinationTip ? `
            <div class="today_ai_inertia_box">
              <span class="micro_icon" style="font-size: 16px;">⚡</span>
              <div>
                <strong>Anti-Procrastination Starter Step:</strong>
                <span>${this.escapeHTML(plan.antiProcrastinationTip)}</span>
              </div>
            </div>
          ` : ""}

          <div class="today_ai_timeline_section">
            <span class="timeline_section_label">Recommended Flow (${plan.totalEstimatedMinutes || 50}m Total)</span>
            <div class="today_ai_timeline_list">
              ${(plan.recommendedOrder || []).map((step, idx) => {
                const task = todayTasks.find(t => t.id === step.taskId);
                const taskTitle = task ? task.title : (step.taskTitle || "Task");
                return `
                  <div class="today_ai_timeline_item">
                    <div class="step_left">
                      <span class="step_number">#${idx + 1}</span>
                      <strong class="step_task_title">${this.escapeHTML(taskTitle)}</strong>
                    </div>
                    <div class="step_meta">
                      ${step.timeSlot ? `<span class="step_slot">${this.escapeHTML(step.timeSlot)}</span>` : ""}
                      ${step.energyTag ? `<span class="step_energy">${this.escapeHTML(step.energyTag)}</span>` : ""}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        </div>
      `;

      const launchBtn = document.getElementById("btn_ai_launch_top_task");
      if (launchBtn && topTask) {
        launchBtn.addEventListener("click", () => {
          this.store.setView("timer");
          this.store.startTimer(topTask.id);
        });
      }
    }

    async generateTodayAIPlan(todayTasks) {
      const resultEl = document.getElementById("today_ai_plan_result");
      if (!resultEl) return;

      if (!this.geminiApiKey) {
        resultEl.innerHTML = `
          <div class="ai_coach_placeholder" style="border-left: 3px solid var(--accent-primary); padding-left: 14px; margin-top: 14px;">
            <p style="font-size: 13.5px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">Gemini API Key Required</p>
            <p style="margin-bottom: 8px;">To activate intelligent daily game plans, smart task ranking, and subtask generation, add your free Google Gemini API key in Settings.</p>
            <div style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 8px 12px; margin-bottom: 12px; font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px;">🔒</span>
              <span><strong>Privacy Guarantee:</strong> Your key is stored 100% locally on this device in your browser's private storage. It is never sent to any external server.</span>
            </div>
            <button type="button" class="habit_quick_submit_btn" id="btn_goto_settings_plan" style="height: 34px; font-size: 11.5px;">Configure Key in Settings</button>
          </div>
        `;
        const gotoBtn = document.getElementById("btn_goto_settings_plan");
        if (gotoBtn) gotoBtn.addEventListener("click", () => this.store.setView("settings"));
        return;
      }

      if (todayTasks.length === 0) {
        resultEl.innerHTML = `
          <div class="ai_coach_placeholder" style="margin-top: 12px;">
            <p><strong>No active tasks in Today's list!</strong> Add tasks using the + button to generate your personalized AI daily focus plan.</p>
          </div>
        `;
        return;
      }

      resultEl.innerHTML = `
        <div class="ai_coach_loading" style="padding: 16px 0;">
          <div class="ai_coach_spinner"></div>
          <span>Gemini AI is analyzing your goals, overdue inertia, and cognitive workload...</span>
        </div>
      `;

      const now = new Date();
      const tasksPayload = todayTasks.map(t => {
        const due = new Date(t.dueDate + "T23:59:59");
        const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
        return {
          id: t.id,
          title: t.title,
          priority: t.priority,
          category: t.category,
          estimatedDuration: t.estimatedDuration || 25,
          isOverdue: diffDays < 0,
          overdueDays: diffDays < 0 ? Math.abs(diffDays) : 0,
          subtasksCount: t.subtasks ? t.subtasks.length : 0
        };
      });

      const prompt = `You are an elite productivity strategist and behavioral psychologist.
Analyze these tasks scheduled for the user's TODAY focus view:
${JSON.stringify(tasksPayload, null, 2)}

Provide a sharp, motivating, anti-procrastination daily focus strategy.
Notice if any tasks are severely overdue (high friction/procrastination trap) or compound goals.
Return ONLY a valid JSON object with these keys:
{
  "executiveSummary": "1-2 punchy sentences assessing today's momentum and cognitive workload.",
  "topFocusTaskId": ${tasksPayload[0].id},
  "topFocusReason": "Why this task should be conquered first (e.g. Eat the Frog or quick win)",
  "antiProcrastinationTip": "A microscopic 2-minute starter cue for the most overdue or daunting task",
  "recommendedOrder": [
    {
      "taskId": ${tasksPayload[0].id},
      "order": 1,
      "timeSlot": "Morning Session (09:00 - 09:30)",
      "energyTag": "Deep Work / Quick Win",
      "strategyNote": "Execution tip in 1 short sentence"
    }
  ],
  "totalEstimatedMinutes": 50
}`;

      try {
        const { data } = await this.callGeminiWithFallback({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        });

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Empty response from AI");

        const plan = JSON.parse(text);
        this.todayAIPlan = plan;
        if (plan.recommendedOrder && Array.isArray(plan.recommendedOrder)) {
          this.todayAITaskOrder = plan.recommendedOrder.map(r => r.taskId);
        }
        this.renderTodayAIPlanDetails(plan, todayTasks);
        this.renderTaskListUI("today");
      } catch (err) {
        console.error("AI Daily Plan error:", err);
        resultEl.innerHTML = `
          <div class="key_feedback_msg error" style="display: block; margin-top: 12px;">
            Failed to generate AI daily plan. Please check your network connection or Gemini API key in Settings.
          </div>
        `;
      }
    }

    async autoPrioritizeTodayTasks(todayTasks) {
      if (!this.geminiApiKey) {
        this.generateTodayAIPlan(todayTasks);
        return;
      }
      if (todayTasks.length <= 1) {
        this.showToast("Only 1 task scheduled for today — already #1 priority!", "info");
        this.todayAITaskOrder = todayTasks.map(t => t.id);
        this.renderTaskListUI("today");
        return;
      }

      const prioritizeBtn = document.getElementById("btn_today_ai_prioritize");
      if (prioritizeBtn) {
        prioritizeBtn.disabled = true;
        prioritizeBtn.innerHTML = `<span>Ordering...</span>`;
      }

      const now = new Date();
      const payload = todayTasks.map(t => {
        const due = new Date(t.dueDate + "T23:59:59");
        const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
        return {
          id: t.id,
          title: t.title,
          priority: t.priority,
          overdueDays: diffDays < 0 ? Math.abs(diffDays) : 0,
          estimatedDuration: t.estimatedDuration || 25
        };
      });

      const prompt = `Rank these today tasks from highest leverage/impact to lowest:
${JSON.stringify(payload, null, 2)}
Return ONLY a JSON array of task IDs in recommended execution order: [${payload.map(p => p.id).join(", ")}]`;

      try {
        const { data } = await this.callGeminiWithFallback({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
          }
        });

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const orderedIds = JSON.parse(text);

        if (Array.isArray(orderedIds)) {
          this.todayAITaskOrder = orderedIds;
          this.showToast("Tasks prioritized by AI! #1 Priority highlighted.", "success");
          this.renderTaskListUI("today");
        }
      } catch (err) {
        console.error("Prioritization error:", err);
        this.showToast("Unable to prioritize tasks with AI.", "error");
      } finally {
        if (prioritizeBtn) {
          prioritizeBtn.disabled = false;
          prioritizeBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
            <span>⚡ Smart Order</span>
          `;
        }
      }
    }

    async openAIBreakdownDrawer(task, card) {
      const slot = card.querySelector(".task_ai_drawer_slot");
      if (!slot) return;

      if (slot.innerHTML.trim() !== "") {
        slot.innerHTML = "";
        return;
      }

      if (!this.geminiApiKey) {
        slot.innerHTML = `
          <div class="task_ai_breakdown_deck">
            <p style="font-size: 12px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">Gemini API Key Required</p>
            <p style="font-size: 11.5px; color: var(--text-secondary); margin-bottom: 8px;">Configure your free Google Gemini API key in Settings to activate AI subtask breakdowns.</p>
            <button type="button" class="today_ai_btn primary btn_slot_settings" style="height: 30px; font-size: 11px;">Go to Settings</button>
          </div>
        `;
        slot.querySelector(".btn_slot_settings").addEventListener("click", (e) => {
          e.stopPropagation();
          this.store.setView("settings");
        });
        return;
      }

      slot.innerHTML = `
        <div class="task_ai_breakdown_deck">
          <div class="ai_coach_loading" style="padding: 10px 0;">
            <div class="ai_coach_spinner"></div>
            <span>Gemini AI is generating subtasks & action cues...</span>
          </div>
        </div>
      `;

      const prompt = `You are an expert productivity engineer. Break down this task into 3 to 5 concrete, actionable, small subtasks (each taking 5-30 minutes).
If the title has typos, misspellings (e.g. 'domin' -> 'domain', 'EMail' -> 'Email'), or is compound/vague, provide a clean, professional refinedTitle.
Task Title: "${task.title}"
Task Description: "${task.description || "None"}"
Estimated Duration: ${task.estimatedDuration || 25} minutes.

Return ONLY a valid JSON object matching this schema:
{
  "refinedTitle": "Corrected and concise title",
  "firstMicroStep": "A microscopic 2-minute starter action to overcome inertia",
  "subtasks": [
    "Concrete actionable step 1",
    "Concrete actionable step 2",
    "Concrete actionable step 3"
  ]
}`;

      try {
        const { data } = await this.callGeminiWithFallback({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        });

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const result = JSON.parse(text);

        const hasRefined = result.refinedTitle && result.refinedTitle.toLowerCase().trim() !== task.title.toLowerCase().trim();

        slot.innerHTML = `
          <div class="task_ai_breakdown_deck">
            <div class="task_ai_header_row">
              <div class="task_ai_title_group">
                <span class="task_ai_sparkle">✨</span>
                <strong>AI Action Steps & Subtasks</strong>
              </div>
              <button type="button" class="task_ai_close_btn" title="Close">✕</button>
            </div>

            ${result.firstMicroStep ? `
              <div class="task_ai_micro_step">
                <span class="micro_icon">⚡</span>
                <span><strong>2-Min Starter:</strong> ${this.escapeHTML(result.firstMicroStep)}</span>
              </div>
            ` : ""}

            ${hasRefined ? `
              <div class="task_ai_refined_title_row">
                <span>Clean Title: <em>"${this.escapeHTML(result.refinedTitle)}"</em></span>
                <button type="button" class="task_ai_apply_title_btn">Apply Title</button>
              </div>
            ` : ""}

            <div class="task_ai_subtasks_list">
              ${(result.subtasks || []).map(sub => `
                <div class="task_ai_subtask_row">
                  <span class="check_bullet">✓</span>
                  <span class="subtask_text">${this.escapeHTML(sub)}</span>
                </div>
              `).join("")}
            </div>

            <div class="task_ai_actions_row">
              <button type="button" class="today_ai_btn primary task_ai_commit_btn">
                <span>✓ Add All (${result.subtasks ? result.subtasks.length : 0}) to Checklist</span>
              </button>
              <button type="button" class="today_ai_btn secondary task_ai_dismiss_btn">Dismiss</button>
            </div>
          </div>
        `;

        slot.querySelector(".task_ai_close_btn").addEventListener("click", (e) => {
          e.stopPropagation();
          slot.innerHTML = "";
        });

        slot.querySelector(".task_ai_dismiss_btn").addEventListener("click", (e) => {
          e.stopPropagation();
          slot.innerHTML = "";
        });

        const applyTitleBtn = slot.querySelector(".task_ai_apply_title_btn");
        if (applyTitleBtn) {
          applyTitleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.store.updateTask(task.id, { title: result.refinedTitle });
            this.showToast(`Updated task title to "${result.refinedTitle}"`, "success");
            applyTitleBtn.disabled = true;
            applyTitleBtn.textContent = "Applied ✓";
          });
        }

        slot.querySelector(".task_ai_commit_btn").addEventListener("click", (e) => {
          e.stopPropagation();
          if (result.subtasks && result.subtasks.length > 0) {
            this.store.addSubtasks(task.id, result.subtasks);
            this.showToast(`Added ${result.subtasks.length} subtasks to task checklist!`, "success");
          }
          slot.innerHTML = "";
          setTimeout(() => {
            const reRenderedCard = document.querySelector(`.task_card[data-id="${task.id}"]`);
            if (reRenderedCard) reRenderedCard.classList.add("expanded");
          }, 60);
        });
      } catch (err) {
        console.error("Subtask generation error:", err);
        slot.innerHTML = `
          <div class="task_ai_breakdown_deck">
            <p style="color: #ef4444; font-size: 11.5px; font-weight: 600;">Failed to generate subtasks. Please check API key.</p>
          </div>
        `;
      }
    }

    // -------------------------------------------------------------------------
    // SYSTEM BOTTOM SHEET EDITORS (TASKS)
    // -------------------------------------------------------------------------
    openBottomSheet(task = null, initialData = null) {
      this.bottomSheet.classList.add("visible");
      this.bottomSheetOverlay.classList.add("visible");
      document.body.classList.add("modal-open");

      const dateChips = this.sheetForm.querySelectorAll(".date_chip");
      const dateInput = document.getElementById("task_due_date");
      const sheetSubtitle = document.getElementById("sheet_subtitle");
      const advContent = document.getElementById("sheet_adv_content");
      const advChevron = document.getElementById("sheet_adv_chevron");

      if (task) {
        this.activeEditingTaskId = task.id;
        this.sheetTitle.textContent = "Refine Task Details";
        if (sheetSubtitle) sheetSubtitle.textContent = "Update deadline, category, or recurrence parameters.";
        this.sheetSubmitBtn.textContent = "Save Changes";
        if (this.sheetDeleteBtn) this.sheetDeleteBtn.style.display = "inline-flex";

        document.getElementById("task_title").value = task.title;
        document.getElementById("task_desc").value = task.description || "";
        document.getElementById("task_due_date").value = task.isLater ? "" : task.dueDate;
        document.getElementById("task_priority").value = task.priority;
        this.updatePriorityPillsUI(task.priority);
        document.getElementById("task_category").value = task.category || "Inbox";
        document.getElementById("task_duration").value = task.estimatedDuration || 25;
        document.getElementById("task_recurring").value = task.recurring || "none";

        // Handle accordion state for recurring tasks
        if (advContent && advChevron) {
          const hasRecurrence = task.recurring && task.recurring !== "none";
          advContent.style.display = hasRecurrence ? "block" : "none";
          advChevron.textContent = hasRecurrence ? "▴" : "▾";
        }

        const todayStr = getLocalDateString();
        const tom = new Date(); tom.setDate(tom.getDate() + 1); const tomStr = getLocalDateString(tom);
        const nW = new Date(); nW.setDate(nW.getDate() + 7); const nWStr = getLocalDateString(nW);

        let chipMatched = false;
        dateChips.forEach(c => {
          c.classList.remove("active");
          const offsetStr = c.getAttribute("data-days");
          if (offsetStr) {
            const offset = parseInt(offsetStr);
            if (offset === 0 && task.dueDate === todayStr && !task.isLater) { c.classList.add("active"); chipMatched = true; }
            if (offset === 1 && task.dueDate === tomStr && !task.isLater) { c.classList.add("active"); chipMatched = true; }
            if (offset === 7 && task.dueDate === nWStr && !task.isLater) { c.classList.add("active"); chipMatched = true; }
          } else if (task.isLater && c.id === "chip_do_later") {
            c.classList.add("active");
            chipMatched = true;
          }
        });

        if (!chipMatched && !task.isLater && task.dueDate) {
          const customChip = document.getElementById("chip_custom_date");
          if (customChip) customChip.classList.add("active");
          if (dateInput) dateInput.style.display = "block";
        } else {
          if (dateInput) dateInput.style.display = "none";
        }
      } else {
        this.activeEditingTaskId = null;
        this.sheetTitle.textContent = "Capture New Goal";
        if (sheetSubtitle) sheetSubtitle.textContent = "Configure task objective and execution parameters.";
        this.sheetSubmitBtn.textContent = "Commit Task";
        if (this.sheetDeleteBtn) this.sheetDeleteBtn.style.display = "none";

        this.sheetForm.reset();

        // Collapse advanced accordion by default for compact view
        if (advContent && advChevron) {
          advContent.style.display = "none";
          advChevron.textContent = "▾";
        }

        const initialTitle = initialData?.title || "";
        const initialPriority = initialData?.priority || this.quickAddState?.priority || "Medium";
        const initialCategory = initialData?.category || this.quickAddState?.category || "Inbox";
        const dateMode = initialData?.dateMode || this.quickAddState?.dateMode || "today";

        document.getElementById("task_title").value = initialTitle;
        document.getElementById("task_desc").value = "";
        document.getElementById("task_priority").value = initialPriority;
        this.updatePriorityPillsUI(initialPriority);
        document.getElementById("task_category").value = initialCategory;
        document.getElementById("task_duration").value = 25;
        document.getElementById("task_recurring").value = "none";

        dateChips.forEach(c => c.classList.remove("active"));
        if (dateInput) dateInput.style.display = "none";

        if (dateMode === "tomorrow") {
          const tom = new Date(); tom.setDate(tom.getDate() + 1);
          document.getElementById("task_due_date").value = getLocalDateString(tom);
          const tomChip = Array.from(dateChips).find(c => c.getAttribute("data-days") === "1");
          if (tomChip) tomChip.classList.add("active");
        } else if (dateMode === "later") {
          document.getElementById("task_due_date").value = "";
          const laterChip = document.getElementById("chip_do_later");
          if (laterChip) laterChip.classList.add("active");
        } else {
          document.getElementById("task_due_date").value = getLocalDateString();
          const todayChip = Array.from(dateChips).find(c => c.getAttribute("data-days") === "0");
          if (todayChip) todayChip.classList.add("active");
        }
      }

      setTimeout(() => document.getElementById("task_title").focus(), 200);
    }

    closeBottomSheet() {
      this.bottomSheet.classList.remove("visible");
      this.bottomSheetOverlay.classList.remove("visible");
      document.body.classList.remove("modal-open");
      if (this.sheetDeleteBtn) this.sheetDeleteBtn.style.display = "none";
      const dateInput = document.getElementById("task_due_date");
      if (dateInput) dateInput.style.display = "none";
      this.activeEditingTaskId = null;
      this.isSubmitting = false;
      if (this.sheetSubmitBtn) this.sheetSubmitBtn.disabled = false;
    }

    // -------------------------------------------------------------------------
    // QUICK-ADD TASK DECK & ADVANCED MODAL CONTROLLERS
    // -------------------------------------------------------------------------
    bindQuickAddInteractions() {
      if (!this.quickAddInput) return;

      // Pressing Enter inside input creates task immediately
      this.quickAddInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.submitQuickAdd();
        } else if (e.key === "Escape") {
          this.quickAddInput.blur();
        }
      });

      // Save button click
      if (this.qaBtnCommit) {
        this.qaBtnCommit.addEventListener("click", () => this.submitQuickAdd());
      }

      // Date Chip Cycle: Today -> Tomorrow -> Later -> Today
      if (this.qaChipDate) {
        this.qaChipDate.addEventListener("click", () => {
          const modes = ["today", "tomorrow", "later"];
          const currentIdx = modes.indexOf(this.quickAddState.dateMode);
          const nextMode = modes[(currentIdx + 1) % modes.length];
          this.quickAddState.dateMode = nextMode;
          const labels = { today: "Today", tomorrow: "Tomorrow", later: "Later" };
          if (this.qaDateText) this.qaDateText.textContent = labels[nextMode];
        });
      }

      // Priority Chip Cycle: Med -> High -> Low -> Med
      if (this.qaChipPriority) {
        this.qaChipPriority.addEventListener("click", () => {
          const priOrder = ["Medium", "High", "Low"];
          const currentIdx = priOrder.indexOf(this.quickAddState.priority);
          const nextPri = priOrder[(currentIdx + 1) % priOrder.length];
          this.quickAddState.priority = nextPri;
          if (this.qaPriorityText) this.qaPriorityText.textContent = nextPri === "Medium" ? "Med" : nextPri;
          const dot = this.qaChipPriority.querySelector(".qa_p_dot");
          if (dot) {
            dot.className = "qa_p_dot " + (nextPri === "Medium" ? "med" : nextPri.toLowerCase());
          }
        });
      }

      // Category Chip Cycle
      if (this.qaChipCategory) {
        this.qaChipCategory.addEventListener("click", () => {
          const cats = ["Inbox", "Work", "Personal", "Health", "Finance"];
          const currentIdx = cats.indexOf(this.quickAddState.category);
          const nextCat = cats[(currentIdx + 1) % cats.length];
          this.quickAddState.category = nextCat;
          if (this.qaCategoryText) this.qaCategoryText.textContent = nextCat;
        });
      }

      // Advanced Setup Button -> opens redesigned bottom sheet with typed title pre-filled
      if (this.qaBtnAdvanced) {
        this.qaBtnAdvanced.addEventListener("click", () => {
          const title = this.quickAddInput.value.trim();
          this.openBottomSheet(null, {
            title,
            priority: this.quickAddState.priority,
            category: this.quickAddState.category,
            dateMode: this.quickAddState.dateMode
          });
          this.quickAddInput.value = "";
        });
      }
    }

    submitQuickAdd() {
      if (!this.quickAddInput) return;
      const title = this.quickAddInput.value.trim();
      if (!title) {
        this.quickAddInput.focus();
        return;
      }

      let dueDate = getLocalDateString();
      let isLater = false;

      if (this.quickAddState.dateMode === "tomorrow") {
        const tom = new Date();
        tom.setDate(tom.getDate() + 1);
        dueDate = getLocalDateString(tom);
      } else if (this.quickAddState.dateMode === "later") {
        isLater = true;
        dueDate = getLocalDateString();
      }

      const taskData = {
        title,
        description: "",
        dueDate,
        priority: this.quickAddState.priority || "Medium",
        category: this.quickAddState.category || "Inbox",
        estimatedDuration: 25,
        recurring: "none",
        isLater
      };

      const newTask = this.store.addTask(taskData);
      this.quickAddInput.value = "";
      this.quickAddInput.focus();

      if (newTask) {
        // Highlight created task card with celebration particles
        setTimeout(() => {
          this.triggerCelebration(newTask.id);
        }, 150);
      }
    }

    updateQuickAddContext(view) {
      if (!this.quickAddContainer) return;
      if (view === "completed") {
        this.quickAddContainer.style.display = "none";
        return;
      }
      this.quickAddContainer.style.display = "block";

      if (view === "today") {
        this.quickAddState.dateMode = "today";
        if (this.qaDateText) this.qaDateText.textContent = "Today";
        if (this.quickAddInput) this.quickAddInput.placeholder = "＋ Quick add a goal for Today... (Press Enter)";
      } else if (view === "tomorrow") {
        this.quickAddState.dateMode = "tomorrow";
        if (this.qaDateText) this.qaDateText.textContent = "Tomorrow";
        if (this.quickAddInput) this.quickAddInput.placeholder = "＋ Quick add a goal for Tomorrow... (Press Enter)";
      } else if (view === "later") {
        this.quickAddState.dateMode = "later";
        if (this.qaDateText) this.qaDateText.textContent = "Later";
        if (this.quickAddInput) this.quickAddInput.placeholder = "＋ Quick add a goal to Do Later... (Press Enter)";
      } else if (view === "upcoming") {
        this.quickAddState.dateMode = "tomorrow";
        if (this.qaDateText) this.qaDateText.textContent = "Tomorrow";
        if (this.quickAddInput) this.quickAddInput.placeholder = "＋ Quick add an upcoming goal... (Press Enter)";
      } else {
        this.quickAddState.dateMode = "today";
        if (this.qaDateText) this.qaDateText.textContent = "Today";
        if (this.quickAddInput) this.quickAddInput.placeholder = "＋ Quick add a new goal... (Type and press Enter)";
      }
    }

    bindPriorityPills() {
      const pillGroup = document.getElementById("priority_pill_group");
      const prioritySelect = document.getElementById("task_priority");
      if (!pillGroup || !prioritySelect) return;

      pillGroup.addEventListener("click", (e) => {
        const pill = e.target.closest(".priority_pill_option");
        if (!pill) return;
        const val = pill.getAttribute("data-priority");
        if (!val) return;
        prioritySelect.value = val;
        this.updatePriorityPillsUI(val);
      });
    }

    updatePriorityPillsUI(selectedVal) {
      const pills = document.querySelectorAll("#priority_pill_group .priority_pill_option");
      pills.forEach(p => {
        p.classList.toggle("active", p.getAttribute("data-priority") === selectedVal);
      });
    }

    bindSheetAdvancedToggle() {
      const btn = document.getElementById("btn_toggle_sheet_adv");
      const content = document.getElementById("sheet_adv_content");
      const chevron = document.getElementById("sheet_adv_chevron");
      if (!btn || !content) return;

      btn.addEventListener("click", () => {
        const isHidden = content.style.display === "none";
        content.style.display = isHidden ? "block" : "none";
        if (chevron) chevron.textContent = isHidden ? "▴" : "▾";
      });
    }

    handleFormSubmission() {
      if (this.isSubmitting) return;

      const title = document.getElementById("task_title").value.trim();
      const description = document.getElementById("task_desc").value.trim();
      let dueDate = document.getElementById("task_due_date").value;
      const priority = document.getElementById("task_priority").value;
      const category = document.getElementById("task_category").value;
      const estimatedDuration = parseInt(document.getElementById("task_duration").value) || 25;
      const recurring = document.getElementById("task_recurring").value;

      if (!title) return;

      this.isSubmitting = true;
      if (this.sheetSubmitBtn) this.sheetSubmitBtn.disabled = true;

      const doLaterChip = this.sheetForm.querySelector("#chip_do_later");
      const isLater = (doLaterChip && doLaterChip.classList.contains("active")) || !dueDate;

      if (isLater && !dueDate) {
        dueDate = getLocalDateString(); // default safe date fallback
      }

      const formData = { title, description, dueDate, priority, category, estimatedDuration, recurring, isLater };

      if (this.activeEditingTaskId !== null) {
        this.store.updateTask(this.activeEditingTaskId, formData);
        this.closeBottomSheet();
      } else {
        const newTask = this.store.addTask(formData);
        this.closeBottomSheet();

        if (newTask) {
          // If we are not currently in a task list view, redirect to "all" (Inbox Archive) so we can see the task
          if (!["all", "today", "tomorrow", "upcoming", "overdue", "later"].includes(this.store.currentView)) {
            this.store.setView("all");
          }
          // Highlight the newly created task card with celebration particles
          setTimeout(() => {
            this.triggerCelebration(newTask.id);
          }, 300);
        }
      }
    }

    // -------------------------------------------------------------------------
    // POMODORO FOCUS PANEL
    // -------------------------------------------------------------------------
    renderTimerUI(t) {
      const detailsBox = document.getElementById("timer_task_details");
      if (detailsBox) {
        if (t.activeTaskId) {
          const task = this.store.tasks.find(tk => tk.id === t.activeTaskId);
          if (task) {
            detailsBox.style.display = "block";
            detailsBox.innerHTML = `
              <div class="active_focus_task">
                <span class="focus_tag">${task.category}</span>
                <h3>${this.escapeHTML(task.title)}</h3>
                <p>${task.description ? this.escapeHTML(task.description) : 'Deep working session...'}</p>
              </div>
            `;
          } else {
            detailsBox.style.display = "none";
            detailsBox.innerHTML = "";
          }
        } else {
          detailsBox.style.display = "none";
          detailsBox.innerHTML = "";
        }
      }

      this.updateTimerCountdown(t);

      // Update timer state label
      const subMsg = document.getElementById("timer_sub_msg");
      if (subMsg) {
        const labels = {
          pomodoro: "Deep Focus",
          shortBreak: "Micro Break",
          longBreak: "Restoration",
          stopwatch: "Free Flow"
        };
        subMsg.textContent = labels[t.type] || "Ready";
      }

      document.getElementById("timer_panel").classList.toggle("ticking", t.isRunning);

      // Update mode pills
      document.getElementById("timer_pomo_btn").className = `timer_mode_pill ${t.type === "pomodoro" ? "active" : ""}`;
      document.getElementById("timer_short_btn").className = `timer_mode_pill ${t.type === "shortBreak" ? "active" : ""}`;
      document.getElementById("timer_long_btn").className = `timer_mode_pill ${t.type === "longBreak" ? "active" : ""}`;
      document.getElementById("timer_stopwatch_btn").className = `timer_mode_pill ${t.type === "stopwatch" ? "active" : ""}`;

      // Update session cycle dots
      this.updateSessionCycle(t);

      // Toggle play/pause button visibility
      const playBtn = document.getElementById("timer_play_btn");
      const pauseBtn = document.getElementById("timer_pause_btn");

      if (playBtn && pauseBtn) {
        if (t.isRunning) {
          playBtn.style.display = "none";
          pauseBtn.style.display = "flex";
        } else {
          playBtn.style.display = "flex";
          pauseBtn.style.display = "none";
        }
      }

      // Show/hide alarm dismiss card
      this.renderAlarmUI();
    }

    updateSessionCycle(t) {
      const sessionCount = t.completedSessions || 0;
      const dots = document.querySelectorAll("#timer_mini_cycle .mini_dot");
      const counter = document.getElementById("cycle_counter_text");

      dots.forEach((dot, idx) => {
        dot.classList.remove("active", "completed");
        if (idx < sessionCount) dot.classList.add("completed");
        if (idx === sessionCount && (t.type === "pomodoro" || t.type === "shortBreak")) dot.classList.add("active");
      });

      if (counter) {
        if (!t.isRunning && sessionCount === 0 && t.type !== "pomodoro") {
          counter.textContent = "Ready to focus";
        } else if (t.type === "pomodoro") {
          counter.textContent = `Focus ${sessionCount + 1}/4 · ${sessionCount >= 4 ? 'Long break earned!' : 'Keep pushing'}`;
        } else if (t.type === "shortBreak") {
          counter.textContent = `Break · Session ${sessionCount} done`;
        } else if (t.type === "longBreak") {
          counter.textContent = "Full restoration break";
        } else {
          counter.textContent = "Free timing mode";
        }
      }
    }

    renderAlarmUI() {
      const alarmCard = document.getElementById("timer_alarm_dismiss");
      const alarmTitle = document.getElementById("alarm_dismiss_title");
      const alarmDesc = document.getElementById("alarm_dismiss_desc");
      const startNextBtn = document.getElementById("timer_start_next_btn");

      if (!alarmCard) return;

      if (this.store.isAlarmActive) {
        const t = this.store.timer;
        const nextType = t.type;
        const nextLabels = {
          pomodoro: "Ready for another focus session?",
          shortBreak: "Break time! Rest your mind.",
          longBreak: "Long break! You've earned it."
        };

        alarmCard.style.display = "flex";
        if (alarmTitle) alarmTitle.textContent = "Session Complete!";
        if (alarmDesc) alarmDesc.textContent = nextLabels[nextType] || "Take a moment to recharge.";
        if (startNextBtn) {
          startNextBtn.style.display = "inline-block";
          startNextBtn.textContent = "Start " + (nextType === "pomodoro" ? "Focus" : "Break");
        }
      } else {
        alarmCard.style.display = "none";
      }
    }

    dismissTimerAlarm() {
      this.store.stopAlarm();
      const alarmCard = document.getElementById("timer_alarm_dismiss");
      if (alarmCard) alarmCard.style.display = "none";
    }

    updateTimerCountdown(t) {
      const display = document.getElementById("timer_countdown_text");
      if (!display) return;

      const mins = Math.floor(Math.abs(t.duration) / 60);
      const secs = Math.abs(t.duration) % 60;
      const formatted = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
      display.textContent = formatted;

      document.title = t.isRunning ? `(${formatted}) Focused Work` : "Aurora Companion";

      // Urgent pulse in last 60 seconds for pomodoro/breaks
      const timerPanel = document.getElementById("timer_panel");
      if (timerPanel) {
        const isUrgent = t.isRunning && t.type !== "stopwatch" && t.duration <= 60 && t.duration > 0;
        timerPanel.classList.toggle("urgent", isUrgent);
      }

      // Update SVG ring progress
      const ring = document.getElementById("timer_ring_progress");
      if (ring) {
        if (!this._newRingCirc) {
          const radius = ring.r.baseVal.value || 125;
          this._newRingCirc = 2 * Math.PI * radius;
        }
        const circ = this._newRingCirc;

        let percentage = 1;
        if (t.type !== "stopwatch" && t.totalDuration > 0) {
          percentage = t.duration / t.totalDuration;
        } else if (t.type === "stopwatch") {
          percentage = 0;
        }

        const offset = circ * (1 - percentage);
        ring.style.strokeDasharray = `${circ} ${circ}`;
        ring.style.strokeDashoffset = offset;

        // Switch to red gradient when urgent
        if (t.isRunning && t.type !== "stopwatch" && t.duration <= 60 && t.duration > 0) {
          ring.setAttribute("stroke", "url(#ringGradientUrgent)");
        } else {
          ring.setAttribute("stroke", "url(#ringGradient)");
        }
      }
    }

    // -------------------------------------------------------------------------
    // ADVANCED SVG ANALYTICS VIEW
    // -------------------------------------------------------------------------
    renderInsightsUI() {
      const completed = this.store.tasks.filter(t => t.id !== "general_focus" && t.completed);
      const pending = this.store.tasks.filter(t => t.id !== "general_focus" && !t.completed);
      const total = this.store.tasks.filter(t => t.id !== "general_focus").length;
      const completionRate = total > 0 ? Math.round((completed.length / total) * 100) : 0;

      const todayStr = getLocalDateString();
      let totalFocusMin = 0;
      let todayFocusMin = 0;
      let totalSessions = 0;
      let todaySessions = 0;

      this.store.tasks.forEach(t => {
        if (t.focusSessions) {
          t.focusSessions.forEach(fs => {
            totalFocusMin += fs.duration || 0;
            totalSessions++;
            const fsDate = fs.startTime ? fs.startTime.split("T")[0] : null;
            if (fsDate === todayStr) {
              todayFocusMin += fs.duration || 0;
              todaySessions++;
            }
          });
        }
      });

      document.getElementById("stat_completed_today").textContent = this.getCompletedTodayCount();
      document.getElementById("stat_total_focus_hours").textContent = `${(todayFocusMin / 60).toFixed(1)}h`;
      document.getElementById("stat_weekly_completion_pct").textContent = `${completionRate}%`;
      const maxStreak = this.store.habits.reduce((max, h) => Math.max(max, h.streak || 0), 0);
      document.getElementById("stat_total_active_streak").textContent = `${maxStreak}d`;

      // Update stat labels to be more descriptive
      const focusLabel = document.querySelector("#stat_total_focus_hours").previousElementSibling;
      if (focusLabel) focusLabel.textContent = `Focus Hrs Today (${todaySessions} sessions)`;

      this.renderCompletionLineChart(completed);
      this.renderFocusTimeBarChart();
      this.renderCategoryDonutChart(completed, pending);

      // Render focus sessions table
      this.renderFocusSessionsTable();
    }

    renderFocusSessionsTable() {
      const wrapper = document.getElementById("chart_focus_distribution");
      if (!wrapper) return;

      const todayStr = getLocalDateString();
      const tasksWithFocusToday = this.store.tasks
        .filter(t => t.focusSessions && t.focusSessions.some(fs => fs.startTime && fs.startTime.startsWith(todayStr)))
        .sort((a, b) => {
          const aMin = a.focusSessions.reduce((s, fs) => s + (fs.duration || 0), 0);
          const bMin = b.focusSessions.reduce((s, fs) => s + (fs.duration || 0), 0);
          return bMin - aMin;
        });

      if (tasksWithFocusToday.length === 0) {
        wrapper.innerHTML = `<div class="empty_state_text" style="text-align: center; padding: 30px 10px; color: var(--text-muted);">No focus sessions logged today. Start the timer!</div>`;
        return;
      }

      wrapper.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color);">
              <th style="text-align: left; padding: 8px 4px; color: var(--text-muted); font-size: 11px; font-weight: 800;">Task</th>
              <th style="text-align: right; padding: 8px 4px; color: var(--text-muted); font-size: 11px; font-weight: 800;">Sessions</th>
              <th style="text-align: right; padding: 8px 4px; color: var(--text-muted); font-size: 11px; font-weight: 800;">Time</th>
            </tr>
          </thead>
          <tbody>
            ${tasksWithFocusToday.map(t => {
              const todaySessions = t.focusSessions.filter(fs => fs.startTime && fs.startTime.startsWith(todayStr));
              const sessions = todaySessions.length;
              const totalMin = todaySessions.reduce((s, fs) => s + (fs.duration || 0), 0);
              return `
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 10px 4px; color: var(--text-primary); font-weight: 600;">${this.escapeHTML(t.title)}</td>
                  <td style="padding: 10px 4px; text-align: right; color: var(--accent-primary); font-weight: 700;">${sessions}</td>
                  <td style="padding: 10px 4px; text-align: right; color: var(--text-secondary); font-weight: 600;">${totalMin}m</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
    }

    getCompletedTodayCount() {
      const todayStr = getLocalDateString();
      return this.store.tasks.filter(t => t.id !== "general_focus" && t.completed && t.completedDate && t.completedDate.startsWith(todayStr)).length;
    }

    renderCompletionLineChart(completed) {
      const wrapper = document.getElementById("chart_weekly_productivity");
      if (!wrapper) return;

      const days = [];
      const counts = [];
      const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      const completedCountMap = {};
      completed.forEach(t => {
        if (t.completedDate) {
          const dateStr = t.completedDate.split("T")[0];
          completedCountMap[dateStr] = (completedCountMap[dateStr] || 0) + 1;
        }
      });

      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dateStr = getLocalDateString(d);
        days.push(dateStr);
        counts.push(completedCountMap[dateStr] || 0);
      }

      const maxCount = Math.max(...counts, 4);
      const labels = days.map(ds => weekdayLabels[new Date(ds).getDay()]);

      const chartWidth = 440;
      const chartHeight = 130;
      const xStart = 40;
      const yStart = 20;
      const stepX = chartWidth / 6;

      const points = counts.map((c, idx) => {
        const x = xStart + (idx * stepX);
        const y = yStart + chartHeight - (c / maxCount * chartHeight);
        return { x, y, value: c };
      });

      const polylinePoints = points.map(p => `${p.x},${p.y}`).join(" ");
      const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => {
        const val = Math.round(pct * maxCount);
        const y = yStart + chartHeight - (pct * chartHeight);
        return `
          <line x1="${xStart}" y1="${y}" x2="${xStart + chartWidth}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="3,3" stroke-width="0.5" />
          <text x="${xStart - 10}" y="${y + 4}" fill="var(--text-muted)" font-size="10" text-anchor="end">${val}</text>
        `;
      }).join("");

      const dotsHtml = points.map(p => `
        <circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--accent-primary)" stroke="var(--card-bg)" stroke-width="1.5" />
        <text x="${p.x}" y="${p.y - 8}" fill="var(--text-primary)" font-size="10" font-weight="600" text-anchor="middle">${p.value}</text>
      `).join("");

      const labelsHtml = labels.map((lbl, idx) => {
        const x = xStart + (idx * stepX);
        return `<text x="${x}" y="${yStart + chartHeight + 18}" fill="var(--text-secondary)" font-size="11" text-anchor="middle">${lbl}</text>`;
      }).join("");

      wrapper.innerHTML = `
        <svg viewBox="0 0 500 200" width="100%" height="100%">
          ${gridLines}
          <polyline fill="none" stroke="var(--accent-primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${polylinePoints}" />
          ${dotsHtml}
          ${labelsHtml}
        </svg>
      `;
    }

    renderFocusTimeBarChart() {
      const wrapper = document.getElementById("chart_focus_distribution");
      if (!wrapper) return;

      const days = [];
      const mins = [];
      const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      const dailyFocusMap = {};
      this.store.tasks.forEach(t => {
        if (t.focusSessions) {
          t.focusSessions.forEach(fs => {
            if (fs.startTime) {
              const dateStr = fs.startTime.split("T")[0];
              dailyFocusMap[dateStr] = (dailyFocusMap[dateStr] || 0) + (fs.duration || 0);
            }
          });
        }
      });

      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dateStr = getLocalDateString(d);
        days.push(dateStr);
        mins.push(dailyFocusMap[dateStr] || 0);
      }

      const maxMins = Math.max(...mins, 50);
      const labels = days.map(ds => weekdayLabels[new Date(ds).getDay()]);

      const chartWidth = 440;
      const chartHeight = 130;
      const xStart = 40;
      const yStart = 20;
      const stepX = chartWidth / 7;
      const barWidth = 24;

      const barsHtml = mins.map((m, idx) => {
        const x = xStart + (idx * stepX) + (stepX - barWidth) / 2;
        const barHeight = (m / maxMins) * chartHeight;
        const y = yStart + chartHeight - barHeight;
        return `
          <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, 2)}" rx="4" fill="url(#indigoGradient)" />
          <text x="${x + barWidth/2}" y="${y - 6}" fill="var(--text-primary)" font-size="10" font-weight="600" text-anchor="middle">${m > 0 ? m + 'm' : ''}</text>
        `;
      }).join("");

      const labelsHtml = labels.map((lbl, idx) => {
        const x = xStart + (idx * stepX) + stepX/2;
        return `<text x="${x}" y="${yStart + chartHeight + 18}" fill="var(--text-secondary)" font-size="11" text-anchor="middle">${lbl}</text>`;
      }).join("");

      wrapper.innerHTML = `
        <svg viewBox="0 0 500 200" width="100%" height="100%">
          <defs>
            <linearGradient id="indigoGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="var(--accent-primary)" />
              <stop offset="100%" stop-color="rgba(99, 102, 241, 0.4)" />
            </linearGradient>
          </defs>
          <line x1="${xStart}" y1="${yStart + chartHeight}" x2="${xStart + chartWidth}" y2="${yStart + chartHeight}" stroke="var(--border-color)" stroke-width="1" />
          ${barsHtml}
          ${labelsHtml}
        </svg>
      `;
    }

    renderCategoryDonutChart(completed, pending) {
      const wrapper = document.getElementById("chart_category_breakdown");
      if (!wrapper) return;

      const all = [...completed, ...pending];
      const categoriesMap = {};
      all.forEach(t => {
        const cat = t.category || "Inbox";
        categoriesMap[cat] = (categoriesMap[cat] || 0) + 1;
      });

      const categories = Object.keys(categoriesMap);
      const data = categories.map(cat => ({ label: cat, value: categoriesMap[cat] }));
      const total = all.length;

      if (total === 0) {
        wrapper.innerHTML = `<div style="text-align:center; padding: 40px; color:var(--text-muted)">Empty distributions</div>`;
        return;
      }

      let accumulatedPercent = 0;
      const radius = 60;
      const cx = 100;
      const cy = 100;
      const strokeWidth = 16;
      const circumference = 2 * Math.PI * radius;

      const colors = ["var(--accent-primary)", "var(--accent-secondary)", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];

      const slicesHtml = data.map((item, idx) => {
        const percentage = item.value / total;
        const strokeDash = percentage * circumference;
        const strokeOffset = circumference - (accumulatedPercent * circumference);
        accumulatedPercent += percentage;
        const color = colors[idx % colors.length];

        return `
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
            stroke-dasharray="${strokeDash} ${circumference}" stroke-dashoffset="${strokeOffset}" transform="rotate(-90 ${cx} ${cy})" />
        `;
      }).join("");

      const legendHtml = data.map((item, idx) => {
        const color = colors[idx % colors.length];
        const pct = Math.round((item.value / total) * 100);
        return `
          <div class="legend_item">
            <span class="legend_dot" style="background-color: ${color}"></span>
            <span class="legend_label">${item.label}</span>
            <span class="legend_value">${item.value} (${pct}%)</span>
          </div>
        `;
      }).join("");

      wrapper.innerHTML = `
        <div class="donut_layout_wrapper">
          <div class="donut_canvas">
            <svg viewBox="0 0 200 200" width="100%" height="100%">
              <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="var(--border-color)" stroke-width="${strokeWidth + 2}" />
              ${slicesHtml}
              <circle cx="${cx}" cy="${cy}" r="${radius - strokeWidth/2 - 2}" fill="var(--card-bg)" />
              <text x="${cx}" y="${cy - 2}" fill="var(--text-primary)" font-size="20" font-weight="700" text-anchor="middle">${total}</text>
              <text x="${cx}" y="${cy + 16}" fill="var(--text-secondary)" font-size="11" text-anchor="middle">Total Tasks</text>
            </svg>
          </div>
          <div class="donut_legend">
            ${legendHtml}
          </div>
        </div>
      `;
    }

    previewAlarmSound(sound) {
      if (this.previewAudio) {
        try { this.previewAudio.pause(); } catch(e){}
        this.previewAudio = null;
      }
      if (this.previewOscillators) {
        this.previewOscillators.forEach(o => { try{ o.stop(); }catch(e){} });
        this.previewOscillators = [];
      }
      if (this.previewCtx) {
        try { this.previewCtx.close(); } catch(e){}
        this.previewCtx = null;
      }
      if (this.previewTimeout) {
        clearTimeout(this.previewTimeout);
        this.previewTimeout = null;
      }

      if (sound === "steady_ascent") {
        try {
          this.previewAudio = new Audio("A_Steady_Ascent.mp3");
          this.previewAudio.play().catch(e => console.warn(e));
          this.previewTimeout = setTimeout(() => {
            if (this.previewAudio) this.previewAudio.pause();
          }, 2500);
        } catch(e) {
          console.warn(e);
        }
      } else {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          this.previewCtx = ctx;
          this.previewOscillators = [];
          const now = ctx.currentTime;
          
          const playTone = (freq, startTime, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.15, startTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.start(startTime);
            osc.stop(startTime + duration);
            this.previewOscillators.push(osc);
          };
          
          playTone(880, now, 0.15);
          playTone(880, now + 0.25, 0.15);
          
          this.previewTimeout = setTimeout(() => {
            ctx.close();
            this.previewCtx = null;
          }, 2000);
        } catch(e) {
          console.warn(e);
        }
      }
    }

    // -------------------------------------------------------------------------
    // PERSONALIZATION SETTINGS VIEW (WAKING TIMES INPUTS)
    // -------------------------------------------------------------------------
    renderSettingsUI() {
      const currentTheme = this.store.theme;
      const currentAccent = this.store.accent;
      const notifEnabled = localStorage.getItem("aurora_notifications_enabled") !== "false";

      this.settingsSection.innerHTML = `
        <div class="settings_group">
          <h2>Personal Vibe Style</h2>
          <p class="group_desc">Customize themes and color schemes to match your work space style.</p>
          
          <div class="setting_row">
            <span class="setting_label">Visual Vibe Theme</span>
            <div class="theme_toggle_pills" id="settings_theme_toggle">
              <button class="pill_btn ${currentTheme === "dark" ? "active" : ""}" data-theme="dark">Dark Aura</button>
              <button class="pill_btn ${currentTheme === "light" ? "active" : ""}" data-theme="light">Light Aurora</button>
            </div>
          </div>

          <div class="setting_row">
            <span class="setting_label">UI Visual Style</span>
            <div class="theme_toggle_pills" id="settings_style_toggle">
              <button class="pill_btn ${this.store.uiStyle === "minimalism" ? "active" : ""}" data-style="minimalism">Minimalism</button>
              <button class="pill_btn ${this.store.uiStyle === "neo-brutalism" ? "active" : ""}" data-style="neo-brutalism">Neo-Brutalism</button>
            </div>
          </div>

          <div class="setting_row">
            <span class="setting_label">Accent Signature Color</span>
            <div class="accent_pills_grid">
              <button class="accent_pill ${currentAccent === "indigo" ? "active" : ""}" style="background-color:#6366f1" data-accent="indigo" title="Indigo"></button>
              <button class="accent_pill ${currentAccent === "emerald" ? "active" : ""}" style="background-color:#10b981" data-accent="emerald" title="Emerald"></button>
              <button class="accent_pill ${currentAccent === "rose" ? "active" : ""}" style="background-color:#f43f5e" data-accent="rose" title="Rose"></button>
              <button class="accent_pill ${currentAccent === "amber" ? "active" : ""}" style="background-color:#f59e0b" data-accent="amber" title="Amber"></button>
            </div>
          </div>
        </div>

        <div class="settings_group">
          <h2>Routine Configurations</h2>
          <p class="group_desc">Set up waking hour boundaries to hide sleeping hours from planners.</p>
          <div class="setting_row">
            <span class="setting_label">Wake-up Hour</span>
            <input type="time" id="set_wake_time" class="settings_dropdown" value="${this.store.routinePrefs.wakeUpTime}">
          </div>
          <div class="setting_row">
            <span class="setting_label">Bedtime Sleep Hour</span>
            <input type="time" id="set_sleep_time" class="settings_dropdown" value="${this.store.routinePrefs.sleepTime}">
          </div>
        </div>

        <div class="settings_group">
          <div class="settings_header_with_badge">
            <div>
              <h2>Gemini AI & Local Security</h2>
              <p class="group_desc">Power your personalized Habit Coach and health checks with your own Google Gemini API key.</p>
            </div>
            <span class="badge_key_status ${this.geminiApiKey ? "active" : "inactive"}">
              ${this.geminiApiKey ? "● Stored Locally on Device" : "○ No Key Configured"}
            </span>
          </div>

          <!-- Strict Privacy & Trust Assurance Box -->
          <div class="ai_security_guarantee_box">
            <div class="security_badge_row">
              <div class="security_icon_shield">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <polyline points="9 12 11 14 15 10"/>
                </svg>
              </div>
              <div class="security_text_col">
                <strong>100% Private, Device-Local Storage Guarantee</strong>
                <p>Your API key is saved solely inside this browser's private local storage (<code>localStorage</code>). It never leaves your device and is never sent to our servers, analytics, or any third-party databases. Every request connects directly and securely from your browser to Google's official Gemini API via HTTPS.</p>
              </div>
            </div>
            <div class="security_guarantee_checklist">
              <div class="sec_check_item">
                <span class="check_icon">✓</span>
                <span>Zero intermediate servers or loggers</span>
              </div>
              <div class="sec_check_item">
                <span class="check_icon">✓</span>
                <span>Encrypted direct-to-Google HTTPS connection</span>
              </div>
              <div class="sec_check_item">
                <span class="check_icon">✓</span>
                <span>Wipe from your device anytime in 1 click</span>
              </div>
            </div>
          </div>

          <!-- Key Input Row -->
          <div class="setting_row key_setting_row">
            <div class="key_label_col">
              <span class="setting_label">Google Gemini API Key</span>
              <p class="key_sublabel">Free from Google AI Studio. Stored strictly in your browser.</p>
            </div>
            <div class="key_input_container">
              <div class="key_input_wrapper">
                <input type="password" id="input_gemini_api_key" class="settings_key_input" placeholder="Paste your API key (AQ... or AIza...)" value="${this.geminiApiKey ? this.escapeHTML(this.geminiApiKey) : ""}" autocomplete="off" spellcheck="false" />
                <button type="button" id="btn_toggle_key_visibility" class="key_toggle_vis_btn" title="Toggle visibility">👁</button>
              </div>
              <div class="key_action_buttons">
                <button type="button" id="btn_save_gemini_key" class="setting_primary_btn">Save & Verify Key</button>
                ${this.geminiApiKey ? '<button type="button" id="btn_clear_gemini_key" class="setting_secondary_btn danger">Remove Key</button>' : ""}
              </div>
              <div id="gemini_key_feedback" class="key_feedback_msg"></div>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="get_api_key_link">
                <span>Get a free Gemini API Key from Google AI Studio</span>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              </a>
            </div>
          </div>
        </div>

        <div class="settings_group">
          <h2>Productivity Reminders</h2>
          <p class="group_desc">Tweak focus rules and alert configurations.</p>
          <div class="setting_row">
            <span class="setting_label">System Notifications</span>
            <div class="theme_toggle_pills" id="settings_notif_toggle">
              <button class="pill_btn ${notifEnabled ? "active" : ""}" data-notif="true">Enabled</button>
              <button class="pill_btn ${!notifEnabled ? "active" : ""}" data-notif="false">Disabled</button>
            </div>
          </div>
          <div class="setting_row">
            <span class="setting_label">Alarm Sound</span>
            <div class="theme_toggle_pills" id="settings_alarm_sound_toggle">
              <button class="pill_btn ${this.store.alarmSound === "default_beeps" ? "active" : ""}" data-sound="default_beeps">Default Beeps</button>
              <button class="pill_btn ${this.store.alarmSound === "steady_ascent" ? "active" : ""}" data-sound="steady_ascent">A Steady Ascent</button>
            </div>
          </div>
          <div class="setting_row">
            <span class="setting_label">Backup Archive</span>
            <button class="setting_secondary_btn danger" id="btn_clear_data">Wipe Local Storage</button>
          </div>
        </div>

        <div class="credits_footer">
          <p>Aurora Companion • Psychology-Driven SPA System</p>
          <p class="credits_sub">Mindfully built offline productivity engine</p>
        </div>
      `;

      // Bind settings click listeners for theme
      this.settingsSection.querySelectorAll("#settings_theme_toggle button").forEach(btn => {
        btn.addEventListener("click", () => {
          this.store.setTheme(btn.getAttribute("data-theme"));
          this.renderSettingsUI();
        });
      });

      // Bind settings click listeners for UI Style
      this.settingsSection.querySelectorAll("#settings_style_toggle button").forEach(btn => {
        btn.addEventListener("click", () => {
          this.store.setUiStyle(btn.getAttribute("data-style"));
          this.renderSettingsUI();
        });
      });

      this.settingsSection.querySelectorAll(".accent_pill").forEach(btn => {
        btn.addEventListener("click", () => {
          this.store.setAccent(btn.getAttribute("data-accent"));
          this.renderSettingsUI();
        });
      });

      const wakeInput = document.getElementById("set_wake_time");
      const sleepInput = document.getElementById("set_sleep_time");

      const saveRoutinePrefs = () => {
        const prefs = { wakeUpTime: wakeInput.value, sleepTime: sleepInput.value };
        this.store.routinePrefs = prefs;
        StorageService.savePreference("routine_prefs", prefs);
      };
      wakeInput.addEventListener("change", saveRoutinePrefs);
      sleepInput.addEventListener("change", saveRoutinePrefs);

      this.settingsSection.querySelectorAll("#settings_notif_toggle button").forEach(btn => {
        btn.addEventListener("click", async () => {
          const val = btn.getAttribute("data-notif") === "true";
          localStorage.setItem("aurora_banner_dismissed", "true");
          localStorage.setItem("aurora_notifications_enabled", val ? "true" : "false");
          StorageService.savePreference("notifications_enabled", val);
          StorageService.savePreference("banner_dismissed", true);
          if (val) await NotificationService.requestPermission();
          this.renderSettingsUI();
        });
      });

      this.settingsSection.querySelectorAll("#settings_alarm_sound_toggle button").forEach(btn => {
        btn.addEventListener("click", () => {
          const sound = btn.getAttribute("data-sound");
          this.store.setAlarmSound(sound);
          this.renderSettingsUI();
          this.previewAlarmSound(sound);
        });
      });

      // Gemini API Key Management
      const keyInput = document.getElementById("input_gemini_api_key");
      const toggleVisBtn = document.getElementById("btn_toggle_key_visibility");
      const saveKeyBtn = document.getElementById("btn_save_gemini_key");
      const clearKeyBtn = document.getElementById("btn_clear_gemini_key");
      const feedbackEl = document.getElementById("gemini_key_feedback");

      if (toggleVisBtn && keyInput) {
        toggleVisBtn.addEventListener("click", () => {
          if (keyInput.type === "password") {
            keyInput.type = "text";
            toggleVisBtn.textContent = "🔒";
            toggleVisBtn.setAttribute("title", "Hide key");
          } else {
            keyInput.type = "password";
            toggleVisBtn.textContent = "👁";
            toggleVisBtn.setAttribute("title", "Show key");
          }
        });
      }

      if (saveKeyBtn && keyInput) {
        const handleSaveKey = async () => {
          const val = keyInput.value.trim();
          if (!val) {
            if (feedbackEl) {
              feedbackEl.className = "key_feedback_msg error";
              feedbackEl.textContent = "Please enter an API key before saving.";
            }
            return;
          }

          saveKeyBtn.disabled = true;
          saveKeyBtn.textContent = "Verifying with Google...";
          if (feedbackEl) {
            feedbackEl.className = "key_feedback_msg info";
            feedbackEl.textContent = "Directly verifying key with Google Gemini API...";
          }

          try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(val)}`);
            if (res.ok) {
              localStorage.setItem("aurora_gemini_api_key", val);
              this.geminiApiKey = val;
              this.showToast("Gemini API key saved securely on device!", "success");
              this.renderSettingsUI();
            } else {
              const errData = await res.json().catch(() => ({}));
              const msg = errData.error?.message || "Invalid API key or forbidden access.";
              saveKeyBtn.disabled = false;
              saveKeyBtn.textContent = "Save & Verify Key";
              if (feedbackEl) {
                feedbackEl.className = "key_feedback_msg error";
                feedbackEl.textContent = `Verification failed: ${msg}`;
              }
            }
          } catch (err) {
            saveKeyBtn.disabled = false;
            saveKeyBtn.textContent = "Save & Verify Key";
            if (feedbackEl) {
              feedbackEl.className = "key_feedback_msg error";
              feedbackEl.textContent = "Network error. Unable to reach Google API to verify key.";
            }
          }
        };

        saveKeyBtn.addEventListener("click", handleSaveKey);
        keyInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSaveKey();
          }
        });
      }

      if (clearKeyBtn) {
        clearKeyBtn.addEventListener("click", () => {
          if (confirm("Remove your stored Gemini API key from this device? AI coaching and health checks will require a key to function.")) {
            localStorage.removeItem("aurora_gemini_api_key");
            this.geminiApiKey = "";
            this.showToast("Gemini API key removed from device.", "info");
            this.renderSettingsUI();
          }
        });
      }

      document.getElementById("btn_clear_data").addEventListener("click", () => {
        const message = "Permanently clear all task sheets, routines, streaks, and focus metrics? This action is irreversible!\n\nTo confirm, please type \"clear storage\" below:";
        const input = prompt(message);
        
        if (input === null) return; // User cancelled
        
        if (input.trim() === "clear storage") {
          // Clear IndexedDB completely
          indexedDB.deleteDatabase(StorageService.DB_NAME);
          localStorage.clear();
          location.reload();
        } else {
          this.showToast("Verification failed. Storage was not cleared.", "error");
        }
      });
    }

    // =========================================================================
    // PREMIUM ATOMIC CELEBRATIONS & TOAST NOTIFICATION SLIDERS
    // =========================================================================
    triggerCelebration(taskId) {
      const card = document.querySelector(`.task_card[data-id="${taskId}"]`);
      if (!card) return;
      card.classList.add("celebrating");
      setTimeout(() => card.classList.remove("celebrating"), 600);

      const chk = card.querySelector(".checkbox_btn");
      if (chk) this.triggerElementCelebration(chk.id || chk);
    }

    triggerElementCelebration(elementOrId) {
      const node = typeof elementOrId === "string" ? document.getElementById(elementOrId) : elementOrId;
      if (!node) return;

      const rect = node.getBoundingClientRect();
      const numParticles = 16;
      const colors = ["#6366f1", "#10b981", "#f43f5e", "#f59e0b", "#a855f7"];

      for (let i = 0; i < numParticles; i++) {
        const p = document.createElement("div");
        p.className = "celebration_particle";
        const size = Math.random() * 8 + 4;
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        p.style.borderRadius = "50%";
        p.style.position = "fixed";
        p.style.zIndex = "9999";
        p.style.pointerEvents = "none";

        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;

        const angle = Math.random() * Math.PI * 2;
        const vel = Math.random() * 80 + 40;
        const dx = Math.cos(angle) * vel;
        const dy = Math.sin(angle) * vel;

        document.body.appendChild(p);

        p.animate([
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0 }
        ], {
          duration: 600 + Math.random() * 400,
          easing: "cubic-bezier(0.1, 0.8, 0.25, 1)"
        }).onfinish = () => p.remove();
      }
    }

    showToast(msg, type = "success") {
      const toast = document.createElement("div");
      toast.className = `toast_notification ${type}`;
      toast.innerHTML = `<span class="toast_msg">${msg}</span>`;
      document.body.appendChild(toast);

      setTimeout(() => toast.classList.add("visible"), 10);
      setTimeout(() => {
        toast.classList.remove("visible");
        setTimeout(() => toast.remove(), 400);
      }, 3000);
    }

    checkOverdueDeadlines() {
      const today = getLocalDateString();
      const overdue = this.store.tasks.filter(t => !t.completed && t.dueDate < today);
      if (overdue.length > 0) {
        setTimeout(() => {
          NotificationService.send("Urgent Task Alert!", {
            body: `You have ${overdue.length} scheduled goals currently overdue. Let's tackle them first!`
          });
        }, 1500);
      }
    }

    toggleAlarmUI(active) {
      // Only show floating alarm banner when NOT on the timer page
      // The timer page has its own in-panel alarm card (renderAlarmUI)
      if (this.store.currentView === "timer") {
        // Defer to renderAlarmUI for timer page
        this.renderAlarmUI();
        return;
      }

      let banner = document.getElementById("floating_alarm_banner");
      if (active) {
        if (!banner) {
          const type = this.store.timer.type;
          let title = "Focus Session Achieved!";
          let desc = "Time to take a break or start the next block.";
          let btnText = "Stop Alarm";

          if (type === "shortBreak" || type === "longBreak") {
            title = "Break Completed!";
            desc = "Ready to lock in? Let's start the next Focus session!";
            btnText = "Start Next Focus";
          }

          banner = document.createElement("div");
          banner.id = "floating_alarm_banner";
          banner.className = "floating_alarm_banner";
          banner.innerHTML = `
            <div class="alarm_banner_content">
              <span class="alarm_icon">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </span>
              <div class="alarm_text">
                <h3>${title}</h3>
                <p>${desc}</p>
              </div>
              <button class="alarm_stop_btn" id="btn_floating_stop_alarm">${btnText}</button>
            </div>
          `;
          document.body.appendChild(banner);

          document.getElementById("btn_floating_stop_alarm").addEventListener("click", () => {
            this.store.stopAlarm();
            if (type === "shortBreak" || type === "longBreak") {
              this.store.startTimer();
            }
          });
        }
        // Force reflow to ensure CSS transitions trigger properly
        banner.offsetHeight;
        banner.classList.add("visible");
      } else {
        if (banner) {
          banner.classList.remove("visible");
          setTimeout(() => {
            if (banner.parentNode) {
              banner.remove();
            }
          }, 400);
        }
      }
    }

    escapeHTML(str) {
      if (str === null || str === undefined) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    // -------------------------------------------------------------------------
    // PICTURE-IN-PICTURE NATIVE FOCUS OVERLAY
    // -------------------------------------------------------------------------
    async openDocumentPiP() {
      if (!('documentPictureInPicture' in window)) {
        this.showToast("Always-on-top overlay is not supported in this browser.", "info");
        return;
      }

      // If already open, close it
      if (this.pipWindow) {
        this.closeDocumentPiP();
        return;
      }

      try {
        // Request absolute minimum dimensions. Chromium enforces ~160×160 minimum,
        // but content is designed as a slim 50px toolbar strip to feel ultra-compact.
        const pipWindow = await window.documentPictureInPicture.requestWindow({
          width: 320,
          height: 50
        });

        this.pipWindow = pipWindow;
        if (this.timerPipToggleBtn) this.timerPipToggleBtn.classList.add("active");

        // Copy computed CSS variables from main body
        const rootStyles = getComputedStyle(document.body);
        const variables = [
          '--bg-primary', '--bg-secondary', '--card-bg',
          '--text-primary', '--text-secondary', '--text-muted',
          '--border-color', '--accent-primary',
          '--shadow-sm', '--shadow-md', '--shadow-lg'
        ];
        let variablesCSS = ':root {\n';
        for (const varName of variables) {
          const val = rootStyles.getPropertyValue(varName);
          if (val) variablesCSS += `  ${varName}: ${val.trim()};\n`;
        }
        variablesCSS += '}\n';

        const varStyle = pipWindow.document.createElement('style');
        varStyle.textContent = variablesCSS;
        pipWindow.document.head.appendChild(varStyle);

        // Ultra-compact slim toolbar styles — content hugs top, zero wasted space
        const style = pipWindow.document.createElement('style');
        style.textContent = `
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            margin: 0; padding: 0;
            background: var(--bg-primary, #0d1117);
            color: var(--text-primary, #e6edf3);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            overflow: hidden;
            user-select: none;
          }
          .pip_strip {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            height: 50px;
            padding: 0 10px;
            background: var(--bg-secondary, #161b22);
            border-bottom: 2px solid var(--accent-primary, #6366f1);
            position: relative;
          }
          .pip_timer_text {
            font-size: 22px;
            font-weight: 800;
            letter-spacing: -0.5px;
            color: var(--text-primary, #e6edf3);
            font-variant-numeric: tabular-nums;
            line-height: 1;
          }
          .pip_label {
            font-size: 8px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--text-muted, #8b949e);
            margin-top: 1px;
          }
          .pip_left { display: flex; align-items: center; gap: 10px; }
          .pip_text_col { display: flex; flex-direction: column; }
          .pip_controls { display: flex; gap: 3px; align-items: center; }
          .pip_btn {
            background: var(--bg-primary, #0d1117);
            border: 1px solid var(--border-color, #30363d);
            color: var(--text-primary, #e6edf3);
            border-radius: 4px;
            width: 26px; height: 26px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            transition: all 0.15s;
            padding: 0;
          }
          .pip_btn:hover {
            background: var(--accent-primary, #6366f1);
            border-color: var(--accent-primary, #6366f1);
            color: #fff;
          }
          .pip_btn.restart_accent {
            border-color: var(--accent-primary, #6366f1);
            color: var(--accent-primary, #6366f1);
          }
          .pip_btn.restart_accent:hover {
            background: var(--accent-primary, #6366f1);
            color: #fff;
          }
          .pip_btn.skip_accent {
            color: var(--text-primary, #e6edf3);
          }
          .pip_btn.skip_accent:hover {
            background: var(--accent-secondary, #10b981);
            border-color: var(--accent-secondary, #10b981);
            color: #fff;
          }
          .pip_progress {
            position: absolute;
            bottom: 0; left: 0;
            height: 2px;
            background: var(--accent-primary, #6366f1);
            transition: width 1s linear;
          }
        `;
        pipWindow.document.head.appendChild(style);

        // Build the ultra-slim toolbar strip
        const strip = pipWindow.document.createElement('div');
        strip.className = 'pip_strip';
        strip.innerHTML = `
          <div class="pip_left">
            <div class="pip_text_col">
              <div class="pip_timer_text" id="pip_time">25:00</div>
              <div class="pip_label" id="pip_label">FOCUS</div>
            </div>
          </div>
          <div class="pip_controls">
            <button class="pip_btn" id="pip_play_pause" title="Play/Pause">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
            <button class="pip_btn skip_accent" id="pip_skip" title="Skip to Break">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5"></line></svg>
            </button>
            <button class="pip_btn restart_accent" id="pip_restart" title="Reset & Start Again">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            </button>
            <button class="pip_btn" id="pip_stop" title="Stop">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            </button>
          </div>
          <div class="pip_progress" id="pip_progress"></div>
        `;
        pipWindow.document.body.appendChild(strip);

        // Grab PiP DOM refs
        const pipTime = pipWindow.document.getElementById('pip_time');
        const pipLabel = pipWindow.document.getElementById('pip_label');
        const pipPlayPause = pipWindow.document.getElementById('pip_play_pause');
        const pipSkip = pipWindow.document.getElementById('pip_skip');
        const pipStop = pipWindow.document.getElementById('pip_stop');
        const pipRestart = pipWindow.document.getElementById('pip_restart');
        const pipProgress = pipWindow.document.getElementById('pip_progress');

        const typeLabels = { pomodoro: 'FOCUS', shortBreak: 'SHORT BREAK', longBreak: 'LONG BREAK', stopwatch: 'STOPWATCH' };

        const updatePiPUI = (t) => {
          const mins = Math.floor(Math.abs(t.duration) / 60);
          const secs = Math.abs(t.duration) % 60;
          if (pipTime) pipTime.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
          if (pipLabel) pipLabel.textContent = typeLabels[t.type] || 'FOCUS';

          const isBreak = t.type === 'shortBreak' || t.type === 'longBreak';
          if (strip) {
            strip.style.borderBottomColor = isBreak ? 'var(--accent-secondary, #10b981)' : 'var(--accent-primary, #6366f1)';
          }

          // Progress bar width
          if (pipProgress) {
            let pct = 100;
            if (t.type !== 'stopwatch' && t.totalDuration > 0) pct = (t.duration / t.totalDuration) * 100;
            else if (t.type === 'stopwatch') pct = ((t.duration % 60) / 60) * 100;
            pipProgress.style.width = `${pct}%`;
            pipProgress.style.backgroundColor = isBreak ? 'var(--accent-secondary, #10b981)' : 'var(--accent-primary, #6366f1)';
          }

          // Dynamic skip tooltip
          if (pipSkip) {
            pipSkip.title = isBreak ? 'Skip Break → Start Focus' : 'Skip Focus → Start Break';
            pipSkip.setAttribute('aria-label', pipSkip.title);
          }

          // Toggle play/pause icon
          if (pipPlayPause) {
            pipPlayPause.innerHTML = t.isRunning
              ? `<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><rect x="4" y="4" width="4" height="16" rx="1"/><rect x="16" y="4" width="4" height="16" rx="1"/></svg>`
              : `<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
          }
        };

        updatePiPUI(this.store.timer);

        // Bind controls
        pipPlayPause.addEventListener('click', () => {
          this.store.timer.isRunning ? this.store.pauseTimer() : this.store.startTimer();
        });

        pipSkip.addEventListener('click', () => {
          this.store.skipTimerInterval(true);
        });

        pipStop.addEventListener('click', () => {
          this.store.resetTimer();
          this.closeDocumentPiP();
        });

        pipRestart.addEventListener('click', () => {
          this.store.restartTimer();
        });

        // Clean up previous PiP subscriptions if any
        if (this.pipUnsubscribers) {
          this.pipUnsubscribers.forEach(unsub => unsub());
          this.pipUnsubscribers = [];
        }

        // Subscribe to ticks
        const onTick = (t) => updatePiPUI(t);
        const onStateChange = (t) => updatePiPUI(t);
        this.pipUnsubscribers = [
          this.store.subscribe('timerTick', onTick),
          this.store.subscribe('timerStateChanged', onStateChange)
        ];

        pipWindow.addEventListener('pagehide', () => {
          if (this.pipUnsubscribers) {
            this.pipUnsubscribers.forEach(unsub => unsub());
            this.pipUnsubscribers = [];
          }
          this.pipWindow = null;
          if (this.timerPipToggleBtn) this.timerPipToggleBtn.classList.remove("active");
        });

      } catch (err) {
        console.error("Failed to open native Picture-in-Picture window:", err);
      }
    }

    closeDocumentPiP() {
      if (this.pipUnsubscribers) {
        this.pipUnsubscribers.forEach(unsub => unsub());
        this.pipUnsubscribers = [];
      }
      if (this.pipWindow) {
        try { this.pipWindow.close(); } catch(e){}
        this.pipWindow = null;
      }
      if (this.timerPipToggleBtn) this.timerPipToggleBtn.classList.remove("active");
    }
  }

  // =========================================================================
  // 5. ASYNCHRONOUS BOOTLOADER SEQUENCE
  // =========================================================================
  try {
    // 1. Open IndexedDB and run legacy Local Storage migration check
    await StorageService.init();

    // 2. Fetch all loaded records from db object stores
    const dbData = await StorageService.loadAllData();

    // 3. Construct synchronous State Store & App Controller from memory cache
    const store = new TaskStore(dbData);
    window.indigoApp = new AppController(store);
    console.log("Aurora Companion SPA Booted Flawlessly on Transactional IndexedDB!");
  } catch (err) {
    console.error("Critical failure during Aurora Companion database startup:", err);
    const appEl = document.getElementById("app") || document.body;
    const errorBox = document.createElement("div");
    errorBox.className = "db_fatal_error_banner";
    errorBox.style.cssText = "position:fixed;inset:0;background:#0d1117;color:#f85149;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,sans-serif;";
    errorBox.innerHTML = `
      <h2 style="font-size:22px;margin-bottom:12px;color:#fff;">Storage Initialization Failed</h2>
      <p style="max-width:480px;line-height:1.5;color:#8b949e;margin-bottom:20px;">
        Aurora Companion could not access local database storage. This can happen in private browsing mode, if browser storage is blocked, or if disk storage quota is exceeded.
      </p>
      <button style="padding:10px 20px;border-radius:8px;border:none;background:#6366f1;color:#fff;font-weight:600;cursor:pointer;" onclick="window.location.reload()">Reload Application</button>
    `;
    appEl.appendChild(errorBox);
  }
});
