/**
 * Aurora Companion - High-Performance Circadian Productivity Engine
 * Powered by window.AuroraStorage (IndexedDB v2) & window.AuroraVirtualList.
 * MV3-safe: zero inline handlers, zero blocking prompt/confirm/alert dialogs,
 * zero raw LLM HTML injection, full event delegation, and windowed rendering.
 */
document.addEventListener("DOMContentLoaded", async function () {
  "use strict";

  const Storage = window.AuroraStorage;
  const VirtualList = window.AuroraVirtualList;

  // =========================================================================
  // 0. PURE UTILITIES (LOCAL DATES, SANITIZATION, CIRCADIAN PHASE, CONFIGS)
  // =========================================================================
  function getLocalDateString(input = new Date()) {
    if (typeof input === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
      const parsed = new Date(input);
      if (Number.isNaN(parsed.getTime())) return getLocalDateString(new Date());
      input = parsed;
    } else if (!(input instanceof Date) || Number.isNaN(input.getTime())) {
      input = new Date();
    }
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, "0");
    const d = String(input.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseLocalDate(dateStr) {
    if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      const parts = dateStr.slice(0, 10).split("-").map(Number);
      return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
    }
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  function getNDaysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return getLocalDateString(d);
  }

  function getISOWeekKey(date = new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayNum = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - dayNum);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  function getCircadianPhase(hour = new Date().getHours()) {
    if (hour >= 5 && hour < 9) return { id: "dawn", label: "Dawn Clarity" };
    if (hour >= 9 && hour < 17) return { id: "day", label: "Solar Peak" };
    if (hour >= 17 && hour < 21) return { id: "dusk", label: "Dusk Wind-Down" };
    return { id: "night", label: "Night Restoration" };
  }

  function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function sanitizeUrl(raw) {
    if (!raw || typeof raw !== "string") return "";
    const trimmed = raw.trim();
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
    } catch (_) {}
    return "";
  }

  function renderMarkdownLite(text) {
    if (!text || !text.trim()) {
      return `<p class="muted_italic">Nothing to preview yet. Start writing in the Write tab.</p>`;
    }
    const escaped = escapeHTML(text)
      .replace(/^### (.*)$/gm, "<h3>$1</h3>")
      .replace(/^## (.*)$/gm, "<h2>$1</h2>")
      .replace(/^# (.*)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");

    const lines = escaped.split("\n");
    const out = [];
    let inList = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        if (inList) { out.push("</ul>"); inList = false; }
        continue;
      }
      if (line.startsWith("- ")) {
        if (!inList) { out.push("<ul>"); inList = true; }
        out.push(`<li>${line.slice(2)}</li>`);
      } else {
        if (inList) { out.push("</ul>"); inList = false; }
        if (line.startsWith("<h")) out.push(line);
        else out.push(`<p>${line}</p>`);
      }
    }
    if (inList) out.push("</ul>");
    return out.join("");
  }

  function prefersReducedMotion() {
    return typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function isIMEComposing(e) {
    return Boolean(e && (e.isComposing || e.keyCode === 229));
  }

  function sendExtensionMessage(message) {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.sendMessage === "function") {
        try {
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(response || null);
            }
          });
        } catch (_) {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
  }

  const DEFAULT_CATEGORIES = ["Inbox", "Work", "Personal", "Health", "Finance"];

  const CONFIG_CAPTURE_NEW_GOAL = {
    priorities: [
      { value: "Low", label: "Gentle Focus" },
      { value: "Medium", label: "Steady Momentum" },
      { value: "High", label: "Keystone Priority" }
    ],
    categories: [...DEFAULT_CATEGORIES],
    durations: [
      { value: "15", label: "15 mins (Micro-Flow)" },
      { value: "25", label: "25 mins (Pomodoro)" },
      { value: "40", label: "40 mins (Deep Sprint)" },
      { value: "60", label: "60 mins (Extended Flow)" },
      { value: "90", label: "90 mins (Ultradian Peak)" }
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
      { value: "indigo", label: "Aurora Indigo" },
      { value: "emerald", label: "Pine Emerald" },
      { value: "rose", label: "Terracotta Rose" },
      { value: "amber", label: "Solar Amber" }
    ]
  };

  const CONFIG_CREATE_HABIT = {
    categories: ["Routine", "Mind", "Health", "Skill", "Work", "Fitness", "Focus"],
    colors: [
      { value: "indigo", label: "Aurora Indigo" },
      { value: "emerald", label: "Pine Emerald" },
      { value: "rose", label: "Terracotta Rose" },
      { value: "amber", label: "Solar Amber" }
    ],
    templates: [
      { title: "Drink 3L Water", cat: "Health", color: "emerald", label: "Hydrate" },
      { title: "15m Mindful Breathing", cat: "Mind", color: "indigo", label: "Center" },
      { title: "Read 10 Pages", cat: "Skill", color: "amber", label: "Read" },
      { title: "Stretch & Mobility", cat: "Health", color: "rose", label: "Move" },
      { title: "Write Evening Journal", cat: "Mind", color: "indigo", label: "Reflect" }
    ]
  };

  const PERSONALITY_QUESTIONS = [
    {
      id: "chronotype",
      kicker: "Pillar 1 · Circadian Energy",
      title: "When is your mind at its peak analytical clarity?",
      subtitle: "Deep focus work sticks best when matched to your natural energy peak.",
      options: [
        { value: "early_falcon", icon: "🌅", label: "Early Falcon (06:00 – 10:00)", desc: "Highest clarity at dawn. Energy tapers in late afternoon." },
        { value: "midday_climber", icon: "☀️", label: "Midday Climber (10:00 – 14:00)", desc: "Gradual morning warm-up, peaking around midday." },
        { value: "twilight_owl", icon: "🌙", label: "Twilight Owl (18:00 – 23:00)", desc: "Slow start. Deep creative flow unlocks after dusk." },
        { value: "variable", icon: "⚡", label: "Wave Surfer (Variable)", desc: "Energy shifts by day. Thrives on adaptive micro-sprints." }
      ]
    },
    {
      id: "procrastination",
      kicker: "Pillar 2 · Friction Pattern",
      title: "When you delay an important task, what causes the friction?",
      subtitle: "Aurora crafts 2-minute micro-starters tuned to dissolve this trigger.",
      options: [
        { value: "perfectionism", icon: "🎯", label: "Perfectionist Resistance", desc: "Waiting for ideal conditions or fearing imperfect output." },
        { value: "overwhelm", icon: "🌪️", label: "Cognitive Overwhelm", desc: "Too many open loops; unsure which single thread to pull." },
        { value: "boredom", icon: "🥱", label: "Low-Stimulation Boredom", desc: "Task feels repetitive or lacks urgency and novelty." },
        { value: "fatigue", icon: "🔋", label: "Mental Fatigue", desc: "Depleted energy or overcommitment across too many goals." }
      ]
    },
    {
      id: "pacing",
      kicker: "Pillar 3 · Flow Pacing",
      title: "How do you sustain execution momentum best?",
      subtitle: "Shapes default focus block lengths and daily sequencing.",
      options: [
        { value: "sprints", icon: "🏃", label: "Interval Sprints (20–25m)", desc: "Punchy Pomodoro bursts with quick reset breaks." },
        { value: "deep_dive", icon: "🧘", label: "Deep Immersion (60–90m)", desc: "Long unbroken blocks with minimal context switching." },
        { value: "rule_of_three", icon: "3️⃣", label: "Rule of Three", desc: "Exactly 3 daily keystones; shelter everything else." },
        { value: "momentum", icon: "🔥", label: "Micro-Win Chain", desc: "Start with a 2-minute win to ignite snowball momentum." }
      ]
    },
    {
      id: "coach_voice",
      kicker: "Pillar 4 · Coaching Voice",
      title: "Which coaching tone keeps you moving?",
      subtitle: "Tunes daily nudges, celebration toasts, and Live Voice.",
      options: [
        { value: "stoic", icon: "🥋", label: "Stoic Strategist", desc: "Calm, concise, disciplined, zero fluff." },
        { value: "scientist", icon: "🧠", label: "Behavioral Scientist", desc: "Evidence-based, clear, focused on cognitive ergonomics." },
        { value: "empathetic", icon: "🌿", label: "Empathetic Anchor", desc: "Warm, steady, guards energy against burnout." },
        { value: "hype", icon: "⚡", label: "High-Energy Coach", desc: "Upbeat, gamified, enthusiastic for every win." }
      ]
    },
    {
      id: "capacity_limit",
      kicker: "Pillar 5 · Daily Capacity Guard",
      title: "How many critical goals can you sustainably finish per day?",
      subtitle: "Protects against overplanning by flagging overflow items.",
      options: [
        { value: "2", icon: "🎯", label: "1 to 2 Keystone Goals", desc: "Heavy creative, research, or engineering work." },
        { value: "3", icon: "⚖️", label: "3 to 4 Balanced Priorities", desc: "1 anchor milestone plus 2–3 supporting steps." },
        { value: "5", icon: "🚀", label: "5+ High-Velocity Tasks", desc: "Fast operational execution across many threads." }
      ]
    }
  ];

  function computeArchetype(answers) {
    const { procrastination, pacing } = answers || {};
    if (procrastination === "perfectionism") {
      return {
        archetype: "The Perfectionist",
        heroIcon: "🎯",
        superpower: "Exacting craftsmanship and high quality standards.",
        blindspot: "Hesitating to start until every detail feels certain.",
        strategyTip: "Use strict 2-minute rough-draft starters and timeboxes."
      };
    }
    if (procrastination === "boredom" || pacing === "sprints") {
      return {
        archetype: "The Dopamine Sprinter",
        heroIcon: "⚡",
        superpower: "Fast creative bursts and rapid problem-solving.",
        blindspot: "Losing interest during repetitive maintenance work.",
        strategyTip: "Pair 20–25m countdown sprints with immediate visual wins."
      };
    }
    if (procrastination === "overwhelm" || pacing === "rule_of_three") {
      return {
        archetype: "The Overwhelmed Strategist",
        heroIcon: "🌪️",
        superpower: "Broad vision and multi-threaded architectural thinking.",
        blindspot: "Freezing when facing an unfiltered backlog.",
        strategyTip: "Isolate 1 keystone target and park overflow in Backlog."
      };
    }
    if (pacing === "deep_dive") {
      return {
        archetype: "The Methodical Architect",
        heroIcon: "📐",
        superpower: "High stamina for uninterrupted deep-state work.",
        blindspot: "Friction after unexpected context switches.",
        strategyTip: "Batch deep blocks inside your peak circadian window."
      };
    }
    return {
      archetype: "The Compassionate Balancer",
      heroIcon: "🌿",
      superpower: "Sustainable pacing and long-term resilience.",
      blindspot: "Over-allocating energy to low-leverage requests.",
      strategyTip: "Protect your top milestone before saying yes to extras."
    };
  }

  const ACCENT_MAP = {
    indigo: "aurora",
    aurora: "aurora",
    emerald: "pine",
    pine: "pine",
    rose: "terracotta",
    terracotta: "terracotta",
    amber: "solar",
    solar: "solar"
  };

  const LEGACY_ACCENT_CLASS = {
    aurora: "indigo",
    pine: "emerald",
    terracotta: "rose",
    solar: "amber"
  };

  // =========================================================================
  // 1. NOTIFICATION & SUBTLE AUDIO CHIME SERVICES
  // =========================================================================
  const NotificationService = {
    isSupported() {
      return "Notification" in window;
    },
    async requestPermission() {
      if (this.isSupported() && Notification.permission !== "granted") {
        const res = await Notification.requestPermission();
        return res === "granted";
      }
      return this.isSupported() && Notification.permission === "granted";
    },
    send(title, options = {}, enabled = true) {
      if (enabled && this.isSupported() && Notification.permission === "granted") {
        try {
          new Notification(title, options);
        } catch (_) {}
      }
    }
  };

  const SoundEffects = {
    _ctx: null,
    playCompletionChime() {
      if (prefersReducedMotion()) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!this._ctx || this._ctx.state === "closed") {
          this._ctx = new AudioCtx();
        }
        if (this._ctx.state === "suspended") {
          this._ctx.resume().catch(() => {});
        }
        const now = this._ctx.currentTime;
        const notes = [523.25, 659.25]; // C5 -> E5 soft chime
        notes.forEach((freq, idx) => {
          const osc = this._ctx.createOscillator();
          const gain = this._ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now + idx * 0.065);
          gain.gain.setValueAtTime(0.0001, now + idx * 0.065);
          gain.gain.linearRampToValueAtTime(0.06, now + idx * 0.065 + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.065 + 0.18);
          osc.connect(gain);
          gain.connect(this._ctx.destination);
          osc.start(now + idx * 0.065);
          osc.stop(now + idx * 0.065 + 0.2);
        });
      } catch (_) {}
    }
  };

  // =========================================================================
  // 2. CENTRAL HIGH-PERFORMANCE REACTIVE STATE STORE
  // =========================================================================
  class TaskStore {
    constructor(initialData) {
      this.tasks = [];
      this.taskMap = new Map();
      this.categoryCounts = new Map();
      this.completedCount = initialData.completedCount || 0;
      this.completedPageCache = {
        items: [],
        total: this.completedCount,
        hasMore: this.completedCount > 0,
        nextOffset: 0,
        queryKey: "",
        loaded: false
      };
      this.allCompletedCache = null; // Lazy-loaded for Insights / Tomorrow metrics

      this.routines = Array.isArray(initialData.routines) ? initialData.routines : [];
      this.routineMap = new Map(this.routines.map((r) => [String(r.id), r]));
      this.habits = Array.isArray(initialData.habits) ? initialData.habits : [];
      this.habitMap = new Map(this.habits.map((h) => [String(h.id), h]));
      this.journal = initialData.journal || {};

      const prefs = initialData.preferences || {};
      this.nextId = Number(prefs.nextId) || 1;
      this.routinePrefs = prefs.routinePrefs || { wakeUpTime: "06:00", sleepTime: "23:00" };
      this.theme = prefs.theme || "dark"; // "system" | "dark" | "light"
      this.accent = ACCENT_MAP[prefs.accent] || "aurora";
      this.uiStyle = prefs.uiStyle === "neo-brutalism" ? "neo-brutalism" : "atelier";
      this.sidebarCollapsed = Boolean(prefs.sidebarCollapsed);
      this.notificationsEnabled = prefs.notificationsEnabled !== false;
      this.bannerDismissed = Boolean(prefs.bannerDismissed);
      this.alarmSound = prefs.alarmSound || "default_beeps";
      this.personalityProfile = prefs.personalityProfile || null;
      this.welcomeDialogShown = Boolean(prefs.welcomeDialogShown);
      this.tomorrowPlan = prefs.tomorrowPlan || null;

      // Real XP & Grace Shield state
      this.xpTotal = 0;
      this.graceShieldWeek = "";
      this.graceShieldUsed = false;

      // Navigation state (supports legacy redirect view)
      let initialRedirect = "";
      try {
        initialRedirect = localStorage.getItem("indigo_redirect_view") || "";
        if (initialRedirect) localStorage.removeItem("indigo_redirect_view");
      } catch (_) {}

      this.currentView = "today";
      this.planMode = "pipeline"; // "pipeline" | "routine"
      this.planFilter = "all"; // "all"|"today"|"tomorrow"|"upcoming"|"overdue"|"later"|"completed"
      this.habitsMode = "tracker"; // "tracker" | "history"
      this.todayFilter = "all"; // "all"|"high"|"later"|"completed"

      this.filters = { search: "", priority: "All", category: "All" };
      this.listeners = Object.create(null);

      // Hydrate active tasks with O(1) index & precomputed search text
      const rawTasks = Array.isArray(initialData.tasks) ? initialData.tasks : [];
      let maxNumericId = this.nextId - 1;
      for (let i = 0; i < rawTasks.length; i++) {
        const t = this._prepareTaskInMemory(rawTasks[i]);
        this.tasks.push(t);
        this.taskMap.set(String(t.id), t);
        if (t.id !== "general_focus") {
          this._incCategory(t.category || "Inbox", 1);
          const numId = Number(t.id);
          if (Number.isFinite(numId) && numId > maxNumericId) maxNumericId = numId;
        }
      }
      if (maxNumericId >= this.nextId) {
        this.nextId = maxNumericId + 1;
      }

      // Timer state (synced with background.js)
      this.timer = {
        isRunning: false,
        type: "pomodoro",
        duration: 25 * 60,
        totalDuration: 25 * 60,
        activeTaskId: null,
        activeTaskTitle: "",
        targetEndTime: null,
        stopwatchStartTime: null,
        elapsedSeconds: 0,
        completedSessions: 0,
        alarmActive: false
      };
      this.savedFocusTaskId = null;
      this.timerInterval = null;
      this.isAlarmActive = false;
      this.alarmInterval = null;
      this.audioCtx = null;
      this.alarmAudio = null;

      if (initialRedirect) {
        this._applyViewTarget(initialRedirect);
      }
    }

    async loadExtraPreferences() {
      const [xpTotal, graceWeek, graceUsed] = await Promise.all([
        Storage.getPreference("xp_total", 0),
        Storage.getPreference("grace_shield_week", ""),
        Storage.getPreference("grace_shield_used", false)
      ]);
      this.xpTotal = Number(xpTotal) || 0;
      const thisWeek = getISOWeekKey();
      if (graceWeek !== thisWeek) {
        this.graceShieldWeek = thisWeek;
        this.graceShieldUsed = false;
      } else {
        this.graceShieldWeek = graceWeek;
        this.graceShieldUsed = Boolean(graceUsed);
      }
      await this.verifyHabitsStreaksOnBoot();
    }

    _prepareTaskInMemory(task) {
      const normalized = Storage.normalizeTask({
        ...task,
        priority: task.priority && ["High", "Medium", "Low"].includes(task.priority) ? task.priority : "Medium",
        category: task.category || "Inbox",
        title: task.title || "",
        description: task.description || "",
        subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
        focusSessions: Array.isArray(task.focusSessions) ? task.focusSessions : [],
        estimatedDuration: parseInt(task.estimatedDuration, 10) || 25,
        recurring: task.recurring || "none",
        url: sanitizeUrl(task.url || "")
      });
      normalized._searchText = `${normalized.title.toLowerCase()} ${normalized.description.toLowerCase()} ${normalized.category.toLowerCase()} ${(normalized.url || "").toLowerCase()}`;
      normalized._createdAtMs = normalized.createdAt ? (Date.parse(normalized.createdAt) || Number(normalized.id) || 0) : (Number(normalized.id) || 0);
      return normalized;
    }

    _stripInternalFields(task) {
      const { _searchText, _createdAtMs, ...clean } = task;
      return clean;
    }

    _incCategory(cat, delta) {
      const key = cat || "Inbox";
      const prev = this.categoryCounts.get(key) || 0;
      const next = Math.max(0, prev + delta);
      const structureChanged = (prev === 0 && next > 0) || (prev > 0 && next === 0);
      if (next === 0) this.categoryCounts.delete(key);
      else this.categoryCounts.set(key, next);
      return structureChanged;
    }

    getCategories() {
      const list = [...DEFAULT_CATEGORIES];
      for (const key of this.categoryCounts.keys()) {
        if (!list.includes(key)) list.push(key);
      }
      return list;
    }

    subscribe(event, callback) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(callback);
      return () => this.unsubscribe(event, callback);
    }

    unsubscribe(event, callback) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
      }
    }

    emit(event, data) {
      const list = this.listeners[event];
      if (!list || list.length === 0) return;
      for (let i = 0; i < list.length; i++) {
        try {
          list[i](data);
        } catch (err) {
          console.error(`Aurora TaskStore listener error [${event}]:`, err);
        }
      }
    }

    awardXP(delta) {
      if (!delta) return;
      this.xpTotal = Math.max(0, (this.xpTotal || 0) + delta);
      Storage.savePreference("xp_total", this.xpTotal).catch(() => {});
      this.emit("xpUpdated", this.xpTotal);
    }

    // -----------------------------------------------------------------------
    // Navigation & Legacy Aliases
    // -----------------------------------------------------------------------
    _applyViewTarget(rawView) {
      const v = String(rawView || "today").toLowerCase();
      if (v === "dashboard" || v === "today") {
        this.currentView = "today";
      } else if (v === "focus" || v === "timer") {
        this.currentView = "focus";
      } else if (v === "routine") {
        this.currentView = "plan";
        this.planMode = "routine";
      } else if (v === "plan") {
        this.currentView = "plan";
      } else if (["all", "tomorrow", "upcoming", "overdue", "later", "completed"].includes(v)) {
        this.currentView = "plan";
        this.planMode = "pipeline";
        this.planFilter = v;
      } else if (v === "habits" || v === "consistency") {
        this.currentView = "habits";
        this.habitsMode = "tracker";
      } else if (v === "consistency_history") {
        this.currentView = "habits";
        this.habitsMode = "history";
      } else if (["insights", "journal", "settings"].includes(v)) {
        this.currentView = v;
      } else {
        this.currentView = "today";
      }
    }

    setView(view, subOptions = {}) {
      this._applyViewTarget(view);
      if (subOptions.planMode) this.planMode = subOptions.planMode;
      if (subOptions.planFilter) this.planFilter = subOptions.planFilter;
      if (subOptions.habitsMode) this.habitsMode = subOptions.habitsMode;
      if (subOptions.todayFilter) this.todayFilter = subOptions.todayFilter;

      this.emit("viewChanged", {
        view: this.currentView,
        planMode: this.planMode,
        planFilter: this.planFilter,
        habitsMode: this.habitsMode,
        todayFilter: this.todayFilter
      });
    }

    setPlanMode(mode) {
      if (mode !== "pipeline" && mode !== "routine") return;
      this.planMode = mode;
      this.emit("viewChanged", {
        view: this.currentView,
        planMode: this.planMode,
        planFilter: this.planFilter,
        habitsMode: this.habitsMode,
        todayFilter: this.todayFilter
      });
    }

    setPlanFilter(filter) {
      this.planFilter = filter;
      this.emit("planFilterChanged", filter);
    }

    setHabitsMode(mode) {
      if (mode !== "tracker" && mode !== "history") return;
      this.habitsMode = mode;
      this.emit("viewChanged", {
        view: this.currentView,
        planMode: this.planMode,
        planFilter: this.planFilter,
        habitsMode: this.habitsMode,
        todayFilter: this.todayFilter
      });
    }

    setTodayFilter(filter) {
      this.todayFilter = filter;
      this.emit("todayFilterChanged", filter);
    }

    setFilters(search, priority, category) {
      const nextSearch = search !== undefined ? String(search) : this.filters.search;
      const nextPriority = priority !== undefined ? String(priority) : this.filters.priority;
      const nextCategory = category !== undefined ? String(category) : this.filters.category;
      if (
        nextSearch === this.filters.search &&
        nextPriority === this.filters.priority &&
        nextCategory === this.filters.category
      ) {
        return;
      }
      this.filters.search = nextSearch;
      this.filters.priority = nextPriority;
      this.filters.category = nextCategory;
      this.emit("filtersChanged", this.filters);
    }

    // -----------------------------------------------------------------------
    // Tasks CRUD (O(1) Map Lookups, Batched Writes, Granular Events)
    // -----------------------------------------------------------------------
    getTaskById(id) {
      return this.taskMap.get(String(id)) || null;
    }

    addTask(data, opts = {}) {
      const title = String(data.title || "").trim();
      if (!title) return null;

      const id = data.id !== undefined ? data.id : this.nextId++;
      if (Number(id) >= this.nextId) this.nextId = Number(id) + 1;

      const task = this._prepareTaskInMemory({
        id,
        title,
        description: String(data.description || "").trim(),
        url: sanitizeUrl(data.url || ""),
        dueDate: data.dueDate || getLocalDateString(),
        priority: data.priority || "Medium",
        category: data.category || "Inbox",
        isLater: Boolean(data.isLater),
        subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
        completed: Boolean(data.completed),
        completedDate: data.completed ? (data.completedDate || new Date().toISOString()) : null,
        recurring: data.recurring || "none",
        estimatedDuration: parseInt(data.estimatedDuration, 10) || 25,
        focusSessions: Array.isArray(data.focusSessions) ? data.focusSessions : [],
        createdAt: data.createdAt || new Date().toISOString()
      });

      this.taskMap.set(String(task.id), task);
      if (task.completed) {
        this.completedCount += 1;
        this._invalidateCompletedCaches();
      } else {
        this.tasks.push(task);
      }

      const catChanged = task.id !== "general_focus" && this._incCategory(task.category, 1);

      // Persist task & next_id asynchronously
      Storage.putItem("tasks", this._stripInternalFields(task))
        .then(() => Storage.savePreference("next_id", this.nextId))
        .then(() => Storage.broadcastDataChanged("tasks"))
        .catch((err) => this.emit("storageError", err));

      if (catChanged) this.emit("categoriesChanged", this.getCategories());
      this.emit("taskAdded", { task });
      this.emit("tasksUpdated", this.tasks);
      if (!opts.silent) {
        this.emit("notification", { message: `"${task.title}" captured`, type: "success" });
      }
      return task;
    }

    updateTask(id, updatedData, opts = {}) {
      const key = String(id);
      const existing = this.taskMap.get(key);
      if (!existing) return null;

      const prev = { ...existing };
      const next = this._prepareTaskInMemory({ ...existing, ...updatedData, id: existing.id });
      this.taskMap.set(key, next);

      const idx = this.tasks.findIndex((t) => String(t.id) === key);
      if (!next.completed) {
        if (idx !== -1) this.tasks[idx] = next;
        else this.tasks.push(next);
      } else if (idx !== -1) {
        this.tasks.splice(idx, 1);
      }

      if (prev.completed !== next.completed) {
        this.completedCount = Math.max(0, this.completedCount + (next.completed ? 1 : -1));
        this._invalidateCompletedCaches();
      } else if (next.completed) {
        this._patchCompletedCacheItem(next);
      }

      let catChanged = false;
      if (prev.category !== next.category && existing.id !== "general_focus") {
        const a = this._incCategory(prev.category, -1);
        const b = this._incCategory(next.category, 1);
        catChanged = a || b;
      }

      Storage.putItem("tasks", this._stripInternalFields(next))
        .then(() => Storage.broadcastDataChanged("tasks"))
        .catch((err) => this.emit("storageError", err));

      if (catChanged) this.emit("categoriesChanged", this.getCategories());
      this.emit("taskUpdated", { task: next, prev });
      this.emit("tasksUpdated", this.tasks);
      if (!opts.silent) {
        this.emit("notification", { message: "Task saved", type: "success" });
      }
      return next;
    }

    updateTasksBatch(updates, toastMessage = null) {
      if (!Array.isArray(updates) || updates.length === 0) return [];
      const toPersist = [];
      const changedIds = [];
      let catChanged = false;
      let completedMutated = false;

      for (let i = 0; i < updates.length; i++) {
        const { id, data } = updates[i];
        const key = String(id);
        const existing = this.taskMap.get(key);
        if (!existing) continue;

        const prev = existing;
        const next = this._prepareTaskInMemory({ ...existing, ...data, id: existing.id });
        this.taskMap.set(key, next);

        const idx = this.tasks.findIndex((t) => String(t.id) === key);
        if (!next.completed) {
          if (idx !== -1) this.tasks[idx] = next;
          else this.tasks.push(next);
        } else if (idx !== -1) {
          this.tasks.splice(idx, 1);
        }

        if (prev.completed !== next.completed) {
          this.completedCount = Math.max(0, this.completedCount + (next.completed ? 1 : -1));
          completedMutated = true;
        }
        if (prev.category !== next.category && existing.id !== "general_focus") {
          catChanged = this._incCategory(prev.category, -1) || catChanged;
          catChanged = this._incCategory(next.category, 1) || catChanged;
        }

        toPersist.push(this._stripInternalFields(next));
        changedIds.push(next.id);
      }

      if (toPersist.length === 0) return [];
      if (completedMutated) this._invalidateCompletedCaches();

      Storage.putBatch("tasks", toPersist)
        .then(() => Storage.broadcastDataChanged("tasks"))
        .catch((err) => this.emit("storageError", err));

      if (catChanged) this.emit("categoriesChanged", this.getCategories());
      this.emit("tasksBatchUpdated", { ids: changedIds });
      this.emit("tasksUpdated", this.tasks);
      if (toastMessage) {
        this.emit("notification", { message: toastMessage, type: "success" });
      }
      return changedIds;
    }

    deleteTask(id, opts = {}) {
      const key = String(id);
      const task = this.taskMap.get(key);
      if (!task) return null;

      this.taskMap.delete(key);
      const idx = this.tasks.findIndex((t) => String(t.id) === key);
      if (idx !== -1) this.tasks.splice(idx, 1);

      if (task.completed) {
        this.completedCount = Math.max(0, this.completedCount - 1);
        this._invalidateCompletedCaches();
      }

      const catChanged = task.id !== "general_focus" && this._incCategory(task.category, -1);

      if (String(this.timer.activeTaskId) === key) {
        this.resetTimer();
      }

      Storage.deleteItem("tasks", task.id)
        .then(() => Storage.broadcastDataChanged("tasks"))
        .catch((err) => this.emit("storageError", err));

      if (catChanged) this.emit("categoriesChanged", this.getCategories());
      this.emit("taskDeleted", { id: task.id, task });
      this.emit("tasksUpdated", this.tasks);

      if (!opts.silent) {
        const snapshot = this._stripInternalFields(task);
        this.emit("notification", {
          message: `Deleted "${task.title}"`,
          type: "info",
          undoLabel: "Undo",
          onUndo: () => this.restoreTask(snapshot)
        });
      }
      return task;
    }

    restoreTask(snapshot) {
      if (!snapshot) return null;
      const task = this._prepareTaskInMemory(snapshot);
      this.taskMap.set(String(task.id), task);
      if (task.completed) {
        this.completedCount += 1;
        this._invalidateCompletedCaches();
      } else {
        this.tasks.push(task);
      }
      const catChanged = task.id !== "general_focus" && this._incCategory(task.category, 1);
      Storage.putItem("tasks", this._stripInternalFields(task))
        .then(() => Storage.broadcastDataChanged("tasks"))
        .catch((err) => this.emit("storageError", err));
      if (catChanged) this.emit("categoriesChanged", this.getCategories());
      this.emit("taskAdded", { task });
      this.emit("tasksUpdated", this.tasks);
      return task;
    }

    toggleTaskComplete(id, opts = {}) {
      const key = String(id);
      const task = this.taskMap.get(key);
      if (!task) return null;

      const prev = { ...task };
      const nowCompleted = !task.completed;
      const next = this._prepareTaskInMemory({
        ...task,
        completed: nowCompleted,
        completedDate: nowCompleted ? new Date().toISOString() : null
      });

      this.taskMap.set(key, next);
      const idx = this.tasks.findIndex((t) => String(t.id) === key);

      if (nowCompleted) {
        if (idx !== -1) this.tasks.splice(idx, 1);
        this.completedCount += 1;
        const xpDelta = (next.estimatedDuration || 25) * 4;
        this.awardXP(xpDelta);
        SoundEffects.playCompletionChime();
        this.emit("celebrate", { taskId: next.id });
        if (next.recurring && next.recurring !== "none") {
          this.handleRecurringRecreation(next);
        }
      } else {
        if (idx === -1) this.tasks.push(next);
        this.completedCount = Math.max(0, this.completedCount - 1);
        this.awardXP(-((next.estimatedDuration || 25) * 4));
      }

      this._invalidateCompletedCaches();

      Storage.putItem("tasks", this._stripInternalFields(next))
        .then(() => Storage.broadcastDataChanged("tasks"))
        .catch((err) => this.emit("storageError", err));

      this.emit("taskUpdated", { task: next, prev });
      this.emit("tasksUpdated", this.tasks);

      if (!opts.silent) {
        this.emit("notification", {
          message: nowCompleted ? `Completed "${next.title}" (+${(next.estimatedDuration || 25) * 4} XP)` : `Restored "${next.title}"`,
          type: nowCompleted ? "success" : "info",
          undoLabel: opts.noUndo ? "" : "Undo",
          onUndo: opts.noUndo ? null : () => this.toggleTaskComplete(next.id, { noUndo: true })
        });
      }
      return next;
    }

    handleRecurringRecreation(task) {
      const nextDate = parseLocalDate(task.dueDate || getLocalDateString());
      if (task.recurring === "daily") nextDate.setDate(nextDate.getDate() + 1);
      else if (task.recurring === "weekly") nextDate.setDate(nextDate.getDate() + 7);
      else if (task.recurring === "monthly") nextDate.setMonth(nextDate.getMonth() + 1);

      setTimeout(() => {
        this.addTask({
          title: task.title,
          description: task.description,
          url: task.url || "",
          dueDate: getLocalDateString(nextDate),
          priority: task.priority,
          category: task.category,
          recurring: task.recurring,
          estimatedDuration: task.estimatedDuration,
          subtasks: (task.subtasks || []).map((s) => ({ ...s, completed: false }))
        }, { silent: true });
      }, 350);
    }

    addSubtask(taskId, title) {
      const task = this.getTaskById(taskId);
      const clean = String(title || "").trim();
      if (!task || !clean) return;
      const subtasks = [...(task.subtasks || []), {
        id: `${task.id}_sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: clean,
        completed: false
      }];
      this.updateTask(task.id, { subtasks }, { silent: true });
    }

    addSubtasks(taskId, titlesArray) {
      const task = this.getTaskById(taskId);
      if (!task || !Array.isArray(titlesArray)) return;
      const added = titlesArray
        .map((t) => String(t || "").trim())
        .filter(Boolean)
        .map((title, idx) => ({
          id: `${task.id}_sub_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          title,
          completed: false
        }));
      if (added.length === 0) return;
      const subtasks = [...(task.subtasks || []), ...added];
      this.updateTask(task.id, { subtasks }, { silent: true });
    }

    toggleSubtask(taskId, subtaskId) {
      const task = this.getTaskById(taskId);
      if (!task || !Array.isArray(task.subtasks)) return;
      const subtasks = task.subtasks.map((s) =>
        s.id === subtaskId ? { ...s, completed: !s.completed } : s
      );
      this.updateTask(task.id, { subtasks }, { silent: true });
    }

    deleteSubtask(taskId, subtaskId) {
      const task = this.getTaskById(taskId);
      if (!task || !Array.isArray(task.subtasks)) return;
      const subtasks = task.subtasks.filter((s) => s.id !== subtaskId);
      this.updateTask(task.id, { subtasks }, { silent: true });
    }

    // -----------------------------------------------------------------------
    // Lazy Completed Archive Pagination
    // -----------------------------------------------------------------------
    _invalidateCompletedCaches() {
      this.completedPageCache.loaded = false;
      this.completedPageCache.queryKey = "";
      this.allCompletedCache = null;
    }

    _patchCompletedCacheItem(updatedTask) {
      const items = this.completedPageCache.items;
      const idx = items.findIndex((t) => String(t.id) === String(updatedTask.id));
      if (idx !== -1) items[idx] = updatedTask;
      if (this.allCompletedCache) {
        const aIdx = this.allCompletedCache.findIndex((t) => String(t.id) === String(updatedTask.id));
        if (aIdx !== -1) this.allCompletedCache[aIdx] = updatedTask;
      }
    }

    async loadCompletedPage(options = {}) {
      const reset = Boolean(options.reset);
      const limit = options.limit || 50;
      const search = (options.search !== undefined ? options.search : this.filters.search).trim();
      const priority = options.priority !== undefined ? options.priority : this.filters.priority;
      const category = options.category !== undefined ? options.category : this.filters.category;
      const queryKey = `${search.toLowerCase()}|${priority}|${category}`;

      const shouldReset = reset || !this.completedPageCache.loaded || this.completedPageCache.queryKey !== queryKey;
      const offset = shouldReset ? 0 : this.completedPageCache.nextOffset;

      const page = await Storage.getCompletedTasksPage({ offset, limit, search, priority, category });
      const prepared = page.items.map((t) => {
        const p = this._prepareTaskInMemory(t);
        this.taskMap.set(String(p.id), p);
        return p;
      });

      if (shouldReset) {
        this.completedPageCache = {
          items: prepared,
          total: page.total,
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
          queryKey,
          loaded: true
        };
      } else {
        const existingIds = new Set(this.completedPageCache.items.map((t) => String(t.id)));
        for (let i = 0; i < prepared.length; i++) {
          if (!existingIds.has(String(prepared[i].id))) {
            this.completedPageCache.items.push(prepared[i]);
          }
        }
        this.completedPageCache.total = page.total;
        this.completedPageCache.hasMore = page.hasMore;
        this.completedPageCache.nextOffset = page.nextOffset;
      }

      this.completedCount = page.total;
      return this.completedPageCache;
    }

    async ensureAllCompletedLoaded() {
      if (this.allCompletedCache) return this.allCompletedCache;
      const all = await Storage.getAllItems("tasks");
      const completed = [];
      for (let i = 0; i < all.length; i++) {
        if (all[i] && all[i].completed && all[i].id !== "general_focus") {
          completed.push(this._prepareTaskInMemory(all[i]));
        }
      }
      this.allCompletedCache = completed;
      this.completedCount = completed.length;
      return completed;
    }

    // -----------------------------------------------------------------------
    // Routines CRUD
    // -----------------------------------------------------------------------
    addRoutineBlock(data) {
      const routine = {
        id: `rout_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        title: String(data.title || "").trim(),
        startTime: data.startTime,
        endTime: data.endTime,
        category: data.category || "Routine",
        color: data.color || "indigo",
        icon: String(data.icon || "").trim(),
        days: Array.isArray(data.days) && data.days.length ? data.days : ["Mon", "Tue", "Wed", "Thu", "Fri"]
      };
      this.routines.push(routine);
      this.routineMap.set(String(routine.id), routine);
      Storage.putItem("routines", routine)
        .then(() => Storage.broadcastDataChanged("routines"))
        .catch((err) => this.emit("storageError", err));
      this.emit("routinesUpdated", this.routines);
      this.emit("notification", { message: `Block "${routine.title}" scheduled`, type: "success" });
      return routine;
    }

    updateRoutineBlock(id, data) {
      const key = String(id);
      const idx = this.routines.findIndex((r) => String(r.id) === key);
      if (idx === -1) return null;
      const updated = {
        ...this.routines[idx],
        title: String(data.title || "").trim(),
        startTime: data.startTime,
        endTime: data.endTime,
        category: data.category || "Routine",
        color: data.color || "indigo",
        icon: String(data.icon || "").trim(),
        days: Array.isArray(data.days) && data.days.length ? data.days : ["Mon", "Tue", "Wed", "Thu", "Fri"]
      };
      this.routines[idx] = updated;
      this.routineMap.set(key, updated);
      Storage.putItem("routines", updated)
        .then(() => Storage.broadcastDataChanged("routines"))
        .catch((err) => this.emit("storageError", err));
      this.emit("routinesUpdated", this.routines);
      this.emit("notification", { message: "Block updated", type: "success" });
      return updated;
    }

    deleteRoutineBlock(id) {
      const key = String(id);
      const removed = this.routineMap.get(key);
      this.routineMap.delete(key);
      this.routines = this.routines.filter((r) => String(r.id) !== key);
      Storage.deleteItem("routines", id)
        .then(() => Storage.broadcastDataChanged("routines"))
        .catch((err) => this.emit("storageError", err));
      this.emit("routinesUpdated", this.routines);
      if (removed) {
        this.emit("notification", { message: `Removed "${removed.title}"`, type: "info" });
      }
    }

    checkRoutineOverlap(startTime, endTime, days, ignoreId = null) {
      const [shA, smA] = startTime.split(":").map(Number);
      const [ehA, emA] = endTime.split(":").map(Number);
      const startMinA = shA * 60 + smA;
      const endMinA = ehA * 60 + emA;
      const overlaps = [];

      for (let i = 0; i < this.routines.length; i++) {
        const r = this.routines[i];
        if (r.id === ignoreId) continue;
        const sharedDays = (r.days || []).filter((d) => days.includes(d));
        if (sharedDays.length === 0) continue;
        const [shB, smB] = r.startTime.split(":").map(Number);
        const [ehB, emB] = r.endTime.split(":").map(Number);
        const startMinB = shB * 60 + smB;
        const endMinB = ehB * 60 + emB;
        if (startMinA < endMinB && endMinA > startMinB) {
          overlaps.push({ block: r, days: sharedDays });
        }
      }
      return overlaps;
    }

    // -----------------------------------------------------------------------
    // Habits & Streaks (with 1 Weekly Grace Shield + Minimal Boot Writes)
    // -----------------------------------------------------------------------
    addHabit(title, category = "Routine", color = "indigo") {
      const clean = String(title || "").trim();
      if (!clean) return null;
      const habit = {
        id: `hab_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        title: clean,
        category,
        color,
        streak: 0,
        maxStreak: 0,
        history: {},
        createdAt: new Date().toISOString()
      };
      this.habits.push(habit);
      this.habitMap.set(String(habit.id), habit);
      Storage.putItem("habits", habit)
        .then(() => Storage.broadcastDataChanged("habits"))
        .catch((err) => this.emit("storageError", err));
      this.emit("habitsUpdated", { habit, all: this.habits });
      this.emit("notification", { message: `Habit "${habit.title}" added`, type: "success" });
      return habit;
    }

    updateHabit(id, data) {
      const key = String(id);
      const idx = this.habits.findIndex((h) => String(h.id) === key);
      if (idx === -1) return null;
      const updated = {
        ...this.habits[idx],
        title: String(data.title || "").trim(),
        category: data.category || "Routine",
        color: data.color || "indigo"
      };
      this.habits[idx] = updated;
      this.habitMap.set(key, updated);
      Storage.putItem("habits", updated)
        .then(() => Storage.broadcastDataChanged("habits"))
        .catch((err) => this.emit("storageError", err));
      this.emit("habitsUpdated", { habit: updated, all: this.habits });
      this.emit("notification", { message: `Habit "${updated.title}" updated`, type: "success" });
      return updated;
    }

    deleteHabit(id) {
      const key = String(id);
      const removed = this.habitMap.get(key);
      this.habitMap.delete(key);
      this.habits = this.habits.filter((h) => String(h.id) !== key);
      Storage.deleteItem("habits", id)
        .then(() => Storage.broadcastDataChanged("habits"))
        .catch((err) => this.emit("storageError", err));
      this.emit("habitsUpdated", { deletedId: id, all: this.habits });
      if (removed) {
        this.emit("notification", { message: `Removed "${removed.title}"`, type: "info" });
      }
    }

    toggleHabitCompletion(id, dateStr) {
      const habit = this.habitMap.get(String(id));
      if (!habit) return;
      if (!habit.history) habit.history = {};

      const todayStr = getLocalDateString();
      if (dateStr > todayStr) {
        this.emit("notification", { message: "Cannot log habits for future dates", type: "error" });
        return;
      }

      const nextVal = !habit.history[dateStr];
      if (nextVal) habit.history[dateStr] = true;
      else delete habit.history[dateStr];

      this.recalculateHabitStreaks(habit);
      this.awardXP(nextVal ? 25 : -25);

      Storage.putItem("habits", habit)
        .then(() => Storage.broadcastDataChanged("habits"))
        .catch((err) => this.emit("storageError", err));

      this.emit("habitsUpdated", { habitId: habit.id, habit, dateStr, all: this.habits });

      if (nextVal) {
        SoundEffects.playCompletionChime();
        this.emit("celebrate", { elementId: `habit_checkbox_${habit.id}_${dateStr}` });
        this.emit("notification", { message: `"${habit.title}" checked (+25 XP)`, type: "success" });
      }
    }

    recalculateHabitStreaks(habit) {
      const prevStreak = habit.streak || 0;
      const prevMax = habit.maxStreak || 0;
      const history = habit.history || {};

      const sortedDates = Object.keys(history)
        .filter((d) => history[d] === true)
        .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // Lexicographic YYYY-MM-DD desc

      if (sortedDates.length === 0) {
        habit.streak = 0;
        return prevStreak !== 0;
      }

      const todayStr = getLocalDateString();
      const yesterdayStr = getNDaysFromNow(-1);
      const twoDaysAgoStr = getNDaysFromNow(-2);
      const latestDate = sortedDates[0];

      let graceApplied = false;
      if (latestDate !== todayStr && latestDate !== yesterdayStr) {
        // 1 Weekly Grace Shield protects streak across a single missed day
        if (latestDate === twoDaysAgoStr && !this.graceShieldUsed) {
          graceApplied = true;
        } else {
          habit.streak = 0;
          return prevStreak !== 0;
        }
      }

      let currentStreak = 1;
      let checkMs = parseLocalDate(latestDate).getTime();

      for (let i = 1; i < sortedDates.length; i++) {
        const prevMs = parseLocalDate(sortedDates[i]).getTime();
        const diffDays = Math.round((checkMs - prevMs) / 86400000);
        if (diffDays === 1) {
          currentStreak += 1;
          checkMs = prevMs;
        } else if (diffDays > 1) {
          break;
        }
      }

      habit.streak = currentStreak;
      habit.graceProtected = graceApplied;
      if (habit.streak > (habit.maxStreak || 0)) {
        habit.maxStreak = habit.streak;
      }
      return habit.streak !== prevStreak || habit.maxStreak !== prevMax;
    }

    async verifyHabitsStreaksOnBoot() {
      const changed = [];
      for (let i = 0; i < this.habits.length; i++) {
        if (this.recalculateHabitStreaks(this.habits[i])) {
          changed.push(this.habits[i]);
        }
      }
      if (changed.length > 0) {
        await Storage.putBatch("habits", changed);
      }
    }

    // -----------------------------------------------------------------------
    // Journal (Unified with Voice Companion Schema)
    // -----------------------------------------------------------------------
    saveJournalEntry(dateStr, data, opts = {}) {
      const prev = this.journal[dateStr] || {};
      const next = { ...prev, ...data };
      // Normalize voice-agent `reflection`/`mood` fields if present
      if (data.reflection && !data.eveningReflection) {
        next.eveningReflection = prev.eveningReflection
          ? `${prev.eveningReflection}\n\n${data.reflection}`
          : data.reflection;
      }
      if (data.mood && !data.morningMood) {
        const moodMap = { great: "energized", good: "calm", neutral: "peaceful", drained: "tired", stressed: "tired" };
        next.morningMood = moodMap[data.mood] || data.mood;
      }
      this.journal[dateStr] = next;

      Storage.putItem("journal", { dateStr, ...next })
        .then(() => Storage.broadcastDataChanged("journal"))
        .catch((err) => this.emit("storageError", err));

      this.emit("journalUpdated", { dateStr, entry: next, silentAutosave: Boolean(opts.silentAutosave) });
    }

    // -----------------------------------------------------------------------
    // Persistent Background Focus Timer Engine (#13 Contract)
    // -----------------------------------------------------------------------
    async syncTimerFromBackground() {
      const res = await sendExtensionMessage({ type: "TIMER_GET_STATE" });
      if (res && res.success && res.state) {
        this._applyRemoteTimerState(res.state);
        if (Array.isArray(res.completions) && res.completions.length > 0) {
          await this._drainTimerCompletions(res.completions);
        }
        return;
      }
      // Fallback for non-extension HTTP preview mode
      const saved = await Storage.getExtensionLocal("aurora_timer_state", null);
      if (saved && typeof saved === "object") {
        this._applyRemoteTimerState(saved);
      }
    }

    _applyRemoteTimerState(state) {
      if (!state) return;
      const wasRunning = this.timer.isRunning;
      const wasAlarm = this.isAlarmActive;

      this.timer = {
        ...this.timer,
        ...state,
        duration: this._computeLiveDuration(state)
      };

      if (this.timer.isRunning) {
        this._ensureLocalTickLoop();
      } else {
        this._clearLocalTickLoop();
      }

      if (state.alarmActive && !wasAlarm) {
        this.playAlarmLoop();
      } else if (!state.alarmActive && wasAlarm) {
        this.stopAlarm(true);
      }

      if (wasRunning !== this.timer.isRunning || true) {
        this.emit("timerStateChanged", this.timer);
      }
    }

    _computeLiveDuration(st) {
      if (!st.isRunning) return Math.max(0, Number(st.duration) || 0);
      if (st.type === "stopwatch" && st.stopwatchStartTime) {
        return Math.max(0, Math.floor((Date.now() - st.stopwatchStartTime) / 1000));
      }
      if (st.type !== "stopwatch" && st.targetEndTime) {
        return Math.max(0, Math.round((st.targetEndTime - Date.now()) / 1000));
      }
      return Math.max(0, Number(st.duration) || 0);
    }

    async _drainTimerCompletions(completions) {
      if (!Array.isArray(completions) || completions.length === 0) return;
      const ackIds = [];
      for (let i = 0; i < completions.length; i++) {
        const ev = completions[i];
        if (!ev) continue;
        this.logFocusSession(ev.taskId || "general_focus", ev.minutes || 25, ev.completedAt);
        if (ev.id) ackIds.push(ev.id);
      }
      if (ackIds.length > 0) {
        await sendExtensionMessage({ type: "TIMER_ACK_COMPLETIONS", payload: { ids: ackIds } });
      }
    }

    _ensureLocalTickLoop() {
      if (this.timerInterval) return;
      this.timerInterval = setInterval(() => this.tickTimer(), 1000);
    }

    _clearLocalTickLoop() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    }

    _mirrorTimerStateLocal() {
      Storage.setExtensionLocal("aurora_timer_state", { ...this.timer, updatedAt: Date.now() }).catch(() => {});
      Storage.broadcastSync("TIMER_SYNC", { state: this.timer });
    }

    startTimer(taskId = null) {
      this.stopAlarm(true);
      if (taskId !== null && taskId !== undefined) {
        this.timer.activeTaskId = taskId;
        const linked = this.getTaskById(taskId);
        this.timer.activeTaskTitle = linked ? linked.title : "";
      }
      this.timer.isRunning = true;
      this.timer.alarmActive = false;
      if (this.timer.type !== "stopwatch") {
        this.timer.targetEndTime = Date.now() + this.timer.duration * 1000;
        this.timer.stopwatchStartTime = null;
      } else {
        this.timer.stopwatchStartTime = Date.now() - this.timer.duration * 1000;
        this.timer.targetEndTime = null;
      }

      this._ensureLocalTickLoop();
      this.emit("timerStateChanged", this.timer);

      sendExtensionMessage({
        type: "TIMER_START",
        payload: {
          mode: this.timer.type,
          durationSec: this.timer.duration,
          taskId: this.timer.activeTaskId,
          taskTitle: this.timer.activeTaskTitle
        }
      }).then((res) => {
        if (!res) this._mirrorTimerStateLocal();
      });
    }

    pauseTimer() {
      this.stopAlarm(true);
      this.timer.isRunning = false;
      this._clearLocalTickLoop();
      this.timer.duration = this._computeLiveDuration({ ...this.timer, isRunning: true });
      this.timer.targetEndTime = null;
      this.timer.stopwatchStartTime = null;
      this.emit("timerStateChanged", this.timer);

      sendExtensionMessage({ type: "TIMER_PAUSE" }).then((res) => {
        if (!res) this._mirrorTimerStateLocal();
      });
    }

    resetTimer() {
      this.stopAlarm(true);
      this.timer.isRunning = false;
      this.timer.alarmActive = false;
      this._clearLocalTickLoop();
      this.timer.targetEndTime = null;
      this.timer.stopwatchStartTime = null;
      this.timer.activeTaskId = null;
      this.timer.activeTaskTitle = "";
      this.setTimerDuration();
      this.emit("timerStateChanged", this.timer);

      sendExtensionMessage({
        type: "TIMER_RESET",
        payload: { mode: this.timer.type, durationSec: this.timer.duration, clearTask: true }
      }).then((res) => {
        if (!res) this._mirrorTimerStateLocal();
      });
    }

    restartTimer() {
      const activeId = this.timer.activeTaskId;
      this.stopAlarm(true);
      this.timer.isRunning = false;
      this._clearLocalTickLoop();
      this.timer.targetEndTime = null;
      this.timer.stopwatchStartTime = null;
      this.setTimerDuration();
      this.startTimer(activeId);
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
        this.emit("notification", { message: "Pause the active session before switching modes", type: "info" });
        return;
      }
      this.timer.type = type;
      this.resetTimer();
    }

    skipTimerInterval(autoStart = true) {
      const wasRunning = this.timer.isRunning;
      const currentTaskId = this.timer.activeTaskId;
      this._clearLocalTickLoop();
      this.timer.isRunning = false;

      if (this.timer.type === "pomodoro") {
        this.savedFocusTaskId = currentTaskId;
        this.timer.type = "shortBreak";
        this.setTimerDuration();
        this.emit("notification", { message: "Focus skipped · Break ready", type: "info" });
      } else {
        const restoreId = currentTaskId || this.savedFocusTaskId;
        this.timer.type = "pomodoro";
        this.setTimerDuration();
        if (restoreId) this.timer.activeTaskId = restoreId;
        this.emit("notification", { message: "Break skipped · Focus ready", type: "info" });
      }

      sendExtensionMessage({
        type: "TIMER_SKIP",
        payload: { autoStart: Boolean(wasRunning || autoStart) }
      }).then((res) => {
        if (res && res.state) {
          this._applyRemoteTimerState(res.state);
        } else if (wasRunning || autoStart) {
          this.startTimer(this.timer.activeTaskId);
        } else {
          this._mirrorTimerStateLocal();
          this.emit("timerStateChanged", this.timer);
        }
      });
    }

    tickTimer() {
      if (!this.timer.isRunning) return;
      if (this.timer.type === "stopwatch") {
        this.timer.duration = this._computeLiveDuration(this.timer);
        this.timer.elapsedSeconds = this.timer.duration;
      } else {
        this.timer.duration = this._computeLiveDuration(this.timer);
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
      this._clearLocalTickLoop();
      this.timer.isRunning = false;
      this.timer.targetEndTime = null;

      NotificationService.send(
        "Session Complete",
        { body: completedType === "pomodoro" ? "Focus block finished. Take a quick break." : "Break finished. Ready to focus?" },
        this.notificationsEnabled
      );

      if (navigator.vibrate) {
        try { navigator.vibrate([180, 90, 180]); } catch (_) {}
      }

      if (completedType === "pomodoro") {
        const minutes = Math.round((this.timer.totalDuration || 1500) / 60) || 25;
        this.logFocusSession(this.timer.activeTaskId || "general_focus", minutes);
        this.timer.completedSessions = (this.timer.completedSessions || 0) + 1;
      }

      this.playAlarmLoop();

      if (completedType === "pomodoro") {
        if (this.timer.completedSessions >= 4) {
          this.timer.type = "longBreak";
          this.timer.completedSessions = 0;
        } else {
          this.timer.type = "shortBreak";
        }
      } else {
        this.timer.type = "pomodoro";
      }

      this.timer.activeTaskId = null;
      this.timer.activeTaskTitle = "";
      this.setTimerDuration();
      this._mirrorTimerStateLocal();
      this.emit("timerStateChanged", this.timer);
      this.emit("timerComplete", this.timer);
    }

    logFocusSession(taskId, minutes, completedAtISO = new Date().toISOString()) {
      const targetId = taskId || "general_focus";
      let task = this.getTaskById(targetId);

      if (!task && targetId === "general_focus") {
        task = this._prepareTaskInMemory({
          id: "general_focus",
          title: "General Focus",
          description: "Accumulated unlinked focus sessions",
          category: "Inbox",
          completed: false,
          focusSessions: [],
          createdAt: new Date().toISOString()
        });
        this.tasks.push(task);
        this.taskMap.set("general_focus", task);
      }

      if (!task) return;
      const focusSessions = [...(task.focusSessions || []), {
        startTime: completedAtISO,
        duration: Number(minutes) || 25
      }];
      this.awardXP(100);
      this.updateTask(task.id, { focusSessions }, { silent: true });
      this.emit("notification", { message: `Logged ${minutes}m focus on "${task.title}" (+100 XP)`, type: "success" });
    }

    playAlarmLoop() {
      this.stopAlarm(true);
      this.isAlarmActive = true;
      this.timer.alarmActive = true;
      this.emit("alarmStateChanged", true);

      if (this.alarmSound === "steady_ascent") {
        try {
          if (!this.alarmAudio) {
            this.alarmAudio = new Audio("A_Steady_Ascent.mp3");
            this.alarmAudio.loop = true;
          }
          this.alarmAudio.currentTime = 0;
          this.alarmAudio.play().catch(() => this.playDefaultBeeps());
        } catch (_) {
          this.playDefaultBeeps();
        }
      } else {
        this.playDefaultBeeps();
      }
    }

    playDefaultBeeps() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.audioCtx = new AudioCtx();

        const playBeep = () => {
          if (!this.isAlarmActive || !this.audioCtx) return;
          try {
            const now = this.audioCtx.currentTime;
            [0, 0.24].forEach((offset) => {
              const osc = this.audioCtx.createOscillator();
              const gain = this.audioCtx.createGain();
              osc.type = "sine";
              osc.frequency.setValueAtTime(880, now + offset);
              gain.gain.setValueAtTime(0.0001, now + offset);
              gain.gain.linearRampToValueAtTime(0.14, now + offset + 0.04);
              gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.16);
              osc.connect(gain);
              gain.connect(this.audioCtx.destination);
              osc.start(now + offset);
              osc.stop(now + offset + 0.17);
            });
          } catch (_) {}
        };
        playBeep();
        this.alarmInterval = setInterval(playBeep, 1500);
      } catch (_) {}
    }

    stopAlarm(skipRemote = false) {
      const wasActive = this.isAlarmActive || this.timer.alarmActive;
      this.isAlarmActive = false;
      this.timer.alarmActive = false;
      if (this.alarmInterval) {
        clearInterval(this.alarmInterval);
        this.alarmInterval = null;
      }
      if (this.audioCtx) {
        try { this.audioCtx.close(); } catch (_) {}
        this.audioCtx = null;
      }
      if (this.alarmAudio) {
        try {
          this.alarmAudio.pause();
          this.alarmAudio.currentTime = 0;
        } catch (_) {}
      }
      if (wasActive) {
        this.emit("alarmStateChanged", false);
        if (!skipRemote) {
          sendExtensionMessage({ type: "TIMER_DISMISS_ALARM" });
        }
      }
    }

    // -----------------------------------------------------------------------
    // Preferences
    // -----------------------------------------------------------------------
    setTheme(theme) {
      this.theme = theme;
      Storage.savePreference("theme", theme).then(() => Storage.broadcastDataChanged("preferences")).catch(() => {});
      this.emit("preferenceChanged", { theme });
    }

    setUiStyle(style) {
      this.uiStyle = style === "neo-brutalism" ? "neo-brutalism" : "atelier";
      Storage.savePreference("ui_style", this.uiStyle).then(() => Storage.broadcastDataChanged("preferences")).catch(() => {});
      this.emit("preferenceChanged", { uiStyle: this.uiStyle });
    }

    setAccent(accent) {
      this.accent = ACCENT_MAP[accent] || "aurora";
      Storage.savePreference("accent", this.accent).then(() => Storage.broadcastDataChanged("preferences")).catch(() => {});
      this.emit("preferenceChanged", { accent: this.accent });
    }

    setAlarmSound(sound) {
      this.alarmSound = sound;
      Storage.savePreference("alarm_sound", sound).then(() => Storage.broadcastDataChanged("preferences")).catch(() => {});
      this.emit("preferenceChanged", { alarmSound: sound });
    }

    setSidebarCollapsed(collapsed) {
      this.sidebarCollapsed = Boolean(collapsed);
      Storage.savePreference("sidebar_collapsed", this.sidebarCollapsed).catch(() => {});
      this.emit("sidebarToggled", this.sidebarCollapsed);
    }

    setNotificationsEnabled(enabled) {
      this.notificationsEnabled = Boolean(enabled);
      this.bannerDismissed = true;
      Storage.putBatch("preferences", [
        { key: "notifications_enabled", value: this.notificationsEnabled },
        { key: "banner_dismissed", value: true }
      ]).catch(() => {});
      this.emit("preferenceChanged", { notificationsEnabled: this.notificationsEnabled });
    }

    setPersonalityProfile(profile) {
      this.personalityProfile = profile;
      Storage.savePreference("personality_profile", profile).then(() => Storage.broadcastDataChanged("preferences")).catch(() => {});
      this.emit("personalityChanged", profile);
    }

    setRoutinePrefs(prefs) {
      this.routinePrefs = prefs;
      Storage.savePreference("routine_prefs", prefs).then(() => Storage.broadcastDataChanged("preferences")).catch(() => {});
      this.emit("routinesUpdated", this.routines);
    }

    async reloadStoreSlice(slice = "all") {
      if (slice === "tasks" || slice === "all") {
        const [activeTasks, completedCount] = await Promise.all([
          Storage.getActiveTasks(),
          Storage.getCompletedCount()
        ]);
        this.tasks = [];
        this.taskMap.clear();
        this.categoryCounts.clear();
        for (let i = 0; i < activeTasks.length; i++) {
          const t = this._prepareTaskInMemory(activeTasks[i]);
          this.tasks.push(t);
          this.taskMap.set(String(t.id), t);
          if (t.id !== "general_focus") this._incCategory(t.category, 1);
        }
        this.completedCount = completedCount;
        this._invalidateCompletedCaches();
        this.emit("categoriesChanged", this.getCategories());
        this.emit("tasksBatchUpdated", { ids: [] });
      }
      if (slice === "habits" || slice === "all") {
        this.habits = await Storage.getAllItems("habits");
        this.habitMap = new Map(this.habits.map((h) => [String(h.id), h]));
        this.emit("habitsUpdated", { all: this.habits });
      }
      if (slice === "routines" || slice === "all") {
        this.routines = await Storage.getAllItems("routines");
        this.routineMap = new Map(this.routines.map((r) => [String(r.id), r]));
        this.emit("routinesUpdated", this.routines);
      }
      if (slice === "journal" || slice === "all") {
        const rows = await Storage.getAllItems("journal");
        this.journal = {};
        rows.forEach(({ dateStr, ...entry }) => { if (dateStr) this.journal[dateStr] = entry; });
        this.emit("journalUpdated", { dateStr: getLocalDateString(), entry: this.journal[getLocalDateString()] || {} });
      }
    }
  }

  // =========================================================================
  // 3. APP CONTROLLER (VIRTUALIZED UI, DELEGATED EVENTS, ZERO-JANK PATCHING)
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
      this.selectedJournalDate = getLocalDateString();
      this.renderedJournalDate = null;
      this.journalAutosaveTimeout = null;

      this.habitWeekOffset = 0;
      this.habitHeatmapMonthOffset = 0;

      this.geminiApiKey = "";
      this.cachedGeminiModels = null;
      this.pendingUnhealthyHabit = null;
      this.todayAIPlan = null;
      this.todayAITaskOrder = null;
      this.focusAITab = "today";

      this.personalityProfile = this.store.personalityProfile;
      this.currentQuizStep = 1;
      this.quizAnswers = {};

      this.tomorrowPlan = this.store.tomorrowPlan || null;
      this.tomorrowPlanDraft = null;
      this.eveningPlanningStreak = 0;
      this.eveningClosureDismissedDate = "";

      this.cachedQuote = null;
      this.lastQuoteFetchTime = 0;

      this.quickAddState = {
        dateMode: "today",
        priority: "Medium",
        category: "Inbox",
        attachedTab: null
      };

      // Collapsible group states for virtualized lists
      this.collapsedPriorityGroups = new Set();
      this.collapsedCompletedDates = new Set();
      this.completedDatesInitialized = false;

      // Active Virtual Lists
      this.todayVirtualList = null;
      this.planVirtualList = null;

      // Toast & Dialog state
      this.toastTimer = null;
      this.activeToastUndo = null;
      this.confirmResolver = null;
      this.confirmMatchText = null;
      this.confirmRequireInput = false;

      // PiP & Audio preview handles
      this.pipWindow = null;
      this.pipUnsubscribers = [];
      this.previewAudio = null;
      this.previewCtx = null;
      this.previewTimeout = null;
      this.phaseInterval = null;

      this.cacheDOMElements();
      this.initVirtualLists();
      this.bindStoreEvents();
      this.bindUserInteractions();
      this.populateCreationFormsFromConfigs();
      this.populateCategoryDropdowns();
      this.updateThemeClasses();
      this.updateCircadianPhase();
      this.updateSidebarClass();
      this.updateOfflineBadge();

      // Periodically refresh circadian phase (every 10m)
      this.phaseInterval = setInterval(() => this.updateCircadianPhase(), 600000);
    }

    async finalizeBoot() {
      this.geminiApiKey = await Storage.getApiKey();
      this.eveningPlanningStreak = Number(await Storage.getPreference("evening_planning_streak", 0)) || 0;
      this.eveningClosureDismissedDate = (await Storage.getPreference("evening_closure_dismissed", "")) || "";

      await this.store.syncTimerFromBackground();
      await this.drainPendingCaptures();

      // Hide boot skeleton cleanly
      if (this.bootSkeleton) {
        this.bootSkeleton.hidden = true;
        this.bootSkeleton.style.display = "none";
      }

      // Show non-blocking welcome inline card if first run
      if (!this.store.welcomeDialogShown && this.welcomeInlineCard) {
        this.welcomeInlineCard.hidden = false;
      }

      this.updateActiveTabUI();
      this.render();
      this.checkOverdueDeadlines();

      // Cross-context sync (Side Panel <-> Full Tab)
      Storage.onSync((msg) => this.handleCrossContextSync(msg));
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message) => {
          if (!message) return;
          if (message.type === "TIMER_STATE_UPDATED") {
            if (message.state) this.store._applyRemoteTimerState(message.state);
            if (message.completedEvent) {
              this.store._drainTimerCompletions([message.completedEvent]);
            }
          } else if (message.type === "PENDING_CAPTURES_UPDATED") {
            this.drainPendingCaptures();
          }
        });
      }
    }

    async handleCrossContextSync(msg) {
      if (!msg || !msg.type) return;
      if (msg.type === "DATA_CHANGED") {
        await this.store.reloadStoreSlice(msg.store || "all");
      } else if (msg.type === "API_KEY_CHANGED") {
        this.geminiApiKey = await Storage.getApiKey();
        if (this.store.currentView === "settings") this.renderSettingsUI();
      } else if (msg.type === "TIMER_SYNC" && msg.state) {
        this.store._applyRemoteTimerState(msg.state);
      } else if (msg.type === "PENDING_CAPTURES_UPDATED") {
        await this.drainPendingCaptures();
      } else if (msg.type === "DB_RESET") {
        window.location.reload();
      }
    }

    async drainPendingCaptures() {
      let pending = null;
      const res = await sendExtensionMessage({ type: "GET_PENDING_CAPTURES" });
      if (res && res.success && Array.isArray(res.captures)) {
        pending = res.captures;
      } else {
        const stored = await Storage.getExtensionLocal("aurora_pending_captures", []);
        if (Array.isArray(stored) && stored.length > 0) pending = stored;
      }

      if (!pending || pending.length === 0) return;

      const consumedIds = [];
      const todayStr = getLocalDateString();
      for (let i = 0; i < pending.length; i++) {
        const cap = pending[i];
        if (!cap || !cap.title) continue;
        this.store.addTask({
          title: cap.title,
          description: cap.description || "",
          url: cap.url || "",
          dueDate: todayStr,
          priority: "Medium",
          category: "Inbox"
        }, { silent: true });
        if (cap.id) consumedIds.push(cap.id);
      }

      if (consumedIds.length > 0) {
        const ack = await sendExtensionMessage({
          type: "CONSUME_PENDING_CAPTURES",
          payload: { ids: consumedIds }
        });
        if (!ack) {
          await Storage.setExtensionLocal("aurora_pending_captures", []);
        }
        this.showToast(`Captured ${consumedIds.length} web item${consumedIds.length > 1 ? "s" : ""} to Today`, "success");
      }
    }

    // -----------------------------------------------------------------------
    // DOM Element Cache (Matches #14 Contract + Aliases)
    // -----------------------------------------------------------------------
    cacheDOMElements() {
      this.appContainer = document.getElementById("app");
      this.mainContent = document.getElementById("main_content") || document.querySelector(".main_content");
      this.desktopSidebar = document.getElementById("desktop_sidebar") || document.querySelector(".desktop_sidebar");
      this.sidebarToggleBtn = document.getElementById("sidebar_toggle_trigger");
      this.navButtons = document.querySelectorAll(".nav_tab");
      this.moreNavPopover = document.getElementById("more_nav_popover");

      // Header
      this.viewTitle = document.getElementById("active_view_title");
      this.viewCount = document.getElementById("active_view_count");
      this.phaseDot = document.getElementById("circadian_phase_dot");
      this.phaseLabel = document.getElementById("circadian_phase_label");
      this.offlineBadge = document.getElementById("offline_status_badge");
      this.streakCountEl = document.getElementById("streak_count");
      this.headerMomentumRing = document.getElementById("header_momentum_ring");
      this.headerMomentumPct = document.getElementById("header_momentum_pct");

      // Panels
      this.panels = {
        today: document.getElementById("today_panel"),
        plan: document.getElementById("plan_panel"),
        habits: document.getElementById("habits_panel"),
        focus: document.getElementById("focus_panel") || document.getElementById("timer_panel"),
        insights: document.getElementById("insights_panel"),
        journal: document.getElementById("journal_panel"),
        settings: document.getElementById("settings_panel")
      };

      // Sub-views
      this.planPipelineView = document.getElementById("plan_pipeline_view");
      this.planRoutineView = document.getElementById("plan_routine_view");
      this.habitsTrackerView = document.getElementById("habits_tracker_view");
      this.habitsHistoryView = document.getElementById("habits_history_view");

      // Today Feed chrome
      this.bootSkeleton = document.getElementById("boot_skeleton");
      this.inlineErrorAlert = document.getElementById("inline_error_alert") || document.getElementById("inline_error_banner");
      this.inlineErrorText = document.getElementById("inline_error_text");
      this.inlineErrorActionBtn = document.getElementById("inline_error_action_btn");
      this.inlineErrorDismissBtn = document.getElementById("inline_error_dismiss_btn");
      this.notifBanner = document.getElementById("notification_banner");
      this.grantNotifBtn = document.getElementById("grant_notifications");
      this.closeNotifBtn = document.getElementById("close_notification_banner");
      this.welcomeInlineCard = document.getElementById("welcome_inline_card") || document.getElementById("welcome_nudge_banner");

      // Quick-Add
      this.quickAddForm = document.getElementById("quick_add_form");
      this.quickAddInput = document.getElementById("quick_add_input");
      this.qaCaptureTabBtn = document.getElementById("qa_capture_tab_btn");
      this.qaAttachedTabChip = document.getElementById("qa_attached_tab_chip");
      this.qaAttachedTabTitle = document.getElementById("qa_attached_tab_title");
      this.qaClearTabBtn = document.getElementById("qa_clear_tab_btn");
      this.qaChipDate = document.getElementById("qa_chip_date");
      this.qaDateText = document.getElementById("qa_date_text");
      this.qaChipPriority = document.getElementById("qa_chip_priority");
      this.qaPriorityText = document.getElementById("qa_priority_text");
      this.qaChipCategory = document.getElementById("qa_chip_category");
      this.qaCategoryText = document.getElementById("qa_category_text");
      this.qaBtnAdvanced = document.getElementById("qa_btn_advanced");
      this.qaBtnCommit = document.getElementById("qa_btn_commit");

      // Search & Filter Controls (Today + Plan)
      this.searchInput = document.getElementById("search_bar");
      this.filterPriority = document.getElementById("filter_priority");
      this.filterCategory = document.getElementById("filter_category");
      this.searchClearBtn = document.getElementById("search_clear_btn");
      this.todaySearchPopover = document.getElementById("today_search_popover");

      this.planSearchInput = document.getElementById("plan_search_input");
      this.planFilterPriority = document.getElementById("plan_filter_priority");
      this.planFilterCategory = document.getElementById("plan_filter_category");
      this.planLoadMoreBtn = document.getElementById("plan_completed_load_more_btn");

      // Virtual List Hosts
      this.todayListViewport = document.getElementById("task_list_viewport");
      this.todayListContainer = document.getElementById("task_list_container");
      this.todayEmptyState = document.getElementById("task_list_empty_state");

      this.planListViewport = document.getElementById("plan_task_list_viewport");
      this.planListContainer = document.getElementById("plan_task_list_container");
      this.planEmptyState = document.getElementById("plan_empty_state");

      // Mini-Timer Bar
      this.miniTimerBar = document.getElementById("mini_timer_bar");
      this.miniTimerDot = document.getElementById("mini_timer_mode_dot");
      this.miniTimerTaskTitle = document.getElementById("mini_timer_task_title");
      this.miniTimerCountdown = document.getElementById("mini_timer_countdown");
      this.miniTimerToggleBtn = document.getElementById("mini_timer_toggle_btn");
      this.miniTimerOpenBtn = document.getElementById("mini_timer_open_btn");
      this.miniTimerStopBtn = document.getElementById("mini_timer_stop_btn");
      this.timerPipToggleBtn = document.getElementById("timer_pip_toggle_btn");

      // Native Dialogs
      this.taskDialog = document.getElementById("task_dialog");
      this.sheetForm = document.getElementById("sheet_form");
      this.sheetTitle = document.getElementById("sheet_form_title");
      this.sheetSubmitBtn = document.getElementById("sheet_submit");
      this.closeSheetBtn = document.getElementById("close_sheet");
      this.sheetDeleteBtn = document.getElementById("sheet_delete_btn");

      this.routineDialog = document.getElementById("routine_dialog");
      this.routineForm = document.getElementById("routine_sheet_form");
      this.closeRoutineSheetBtn = document.getElementById("close_routine_sheet");

      this.habitDialog = document.getElementById("habit_dialog");
      this.habitForm = document.getElementById("habit_sheet_form");
      this.closeHabitSheetBtn = document.getElementById("close_habit_sheet");

      this.personalityDialog = document.getElementById("personality_quiz_dialog");
      this.closePersonalityDialogBtn = document.getElementById("close_personality_dialog");
      this.personalityPrevBtn = document.getElementById("personality_prev_btn");
      this.personalityNextBtn = document.getElementById("personality_next_btn");
      this.personalitySkipBtn = document.getElementById("personality_skip_btn");
      this.personalityStepContent = document.getElementById("personality_step_content");
      this.personalityStepperBar = document.getElementById("personality_stepper_bar");

      this.confirmDialog = document.getElementById("confirm_dialog");
      this.confirmForm = document.getElementById("confirm_dialog_form");
      this.confirmTitle = document.getElementById("confirm_dialog_title");
      this.confirmMessage = document.getElementById("confirm_dialog_message");
      this.confirmInputGroup = document.getElementById("confirm_input_group");
      this.confirmInputLabel = document.getElementById("confirm_input_label");
      this.confirmInput = document.getElementById("confirm_dialog_input");
      this.confirmCancelBtn = document.getElementById("confirm_cancel_btn");
      this.confirmOkBtn = document.getElementById("confirm_ok_btn");

      // Live Regions
      this.toastRegion = document.getElementById("toast_region");
      this.srAssertive = document.getElementById("sr_assertive_region");
    }

    // -----------------------------------------------------------------------
    // Native Dialog Helper (with closedby="any" light-dismiss fallback)
    // -----------------------------------------------------------------------
    openDialog(dialogEl) {
      if (!dialogEl) return;
      if (typeof dialogEl.showModal === "function") {
        if (!dialogEl.open) dialogEl.showModal();
      } else {
        dialogEl.setAttribute("open", "");
      }
      if (!dialogEl.dataset.lightDismissBound) {
        dialogEl.dataset.lightDismissBound = "true";
        if (!("closedBy" in HTMLDialogElement.prototype)) {
          dialogEl.addEventListener("click", (e) => {
            if (e.target !== dialogEl) return;
            const rect = dialogEl.getBoundingClientRect();
            const outside =
              e.clientX < rect.left ||
              e.clientX > rect.right ||
              e.clientY < rect.top ||
              e.clientY > rect.bottom;
            if (outside) this.closeDialog(dialogEl);
          });
        }
      }
    }

    closeDialog(dialogEl) {
      if (!dialogEl) return;
      if (typeof dialogEl.close === "function" && dialogEl.open) {
        dialogEl.close();
      } else {
        dialogEl.removeAttribute("open");
      }
    }

    showConfirmDialog(opts = {}) {
      if (!this.confirmDialog) return Promise.resolve(false);
      if (this.confirmResolver) {
        this.confirmResolver(opts.requireInput ? null : false);
        this.confirmResolver = null;
      }

      this.confirmRequireInput = Boolean(opts.requireInput);
      this.confirmMatchText = opts.matchText || null;

      if (this.confirmTitle) this.confirmTitle.textContent = opts.title || "Confirm Action";
      if (this.confirmMessage) this.confirmMessage.textContent = opts.message || "";
      if (this.confirmOkBtn) {
        this.confirmOkBtn.textContent = opts.okLabel || "Confirm";
        this.confirmOkBtn.classList.toggle("danger", Boolean(opts.danger));
      }
      if (this.confirmCancelBtn) {
        this.confirmCancelBtn.textContent = opts.cancelLabel || "Cancel";
        this.confirmCancelBtn.hidden = Boolean(opts.hideCancel);
      }

      if (this.confirmInputGroup && this.confirmInput) {
        this.confirmInputGroup.hidden = !this.confirmRequireInput;
        if (this.confirmInputLabel) this.confirmInputLabel.textContent = opts.inputLabel || "Value";
        this.confirmInput.value = opts.defaultValue !== undefined ? String(opts.defaultValue) : "";
        this.confirmInput.placeholder = opts.inputPlaceholder || "";
        this.confirmInput.type = opts.inputType || "text";
        this.confirmInput.required = this.confirmRequireInput;
      }

      this.openDialog(this.confirmDialog);
      if (this.confirmRequireInput && this.confirmInput) {
        setTimeout(() => {
          this.confirmInput.focus();
          this.confirmInput.select();
        }, 30);
      }

      return new Promise((resolve) => {
        this.confirmResolver = resolve;
      });
    }

    // -----------------------------------------------------------------------
    // Virtual Lists Initialization (Today & Plan Pipeline)
    // -----------------------------------------------------------------------
    initVirtualLists() {
      const commonOpts = {
        scrollContainer: this.mainContent || window,
        estimatedItemHeight: 84,
        overscan: 6,
        gap: 8,
        getItemKey: (item) => (item.__type === "groupHeader" ? item.id : `task_${item.id}`),
        estimateHeight: (item, isExpanded) => {
          if (item.__type === "groupHeader") return 42;
          if (isExpanded) {
            const subCount = Array.isArray(item.subtasks) ? item.subtasks.length : 0;
            return 220 + subCount * 34;
          }
          return item.description ? 96 : 78;
        },
        renderItem: (item, state) => this.renderVirtualListRow(item, state),
        updateItem: (el, item, state) => this.patchVirtualListRow(el, item, state),
        onAction: (e, key, action, actionEl, item) => this.handleVirtualAction(e, key, action, actionEl, item),
        onSwipe: (key, direction, item) => this.handleVirtualSwipe(key, direction, item),
        enableSwipe: true
      };

      if (this.todayListContainer) {
        this.todayVirtualList = new VirtualList({
          ...commonOpts,
          container: this.todayListContainer
        });
      }

      if (this.planListContainer) {
        this.planVirtualList = new VirtualList({
          ...commonOpts,
          container: this.planListContainer
        });
      }
    }

    getActiveVirtualList() {
      return this.store.currentView === "plan" ? this.planVirtualList : this.todayVirtualList;
    }

    // -----------------------------------------------------------------------
    // Store Event Bindings (Granular Surgical Patching)
    // -----------------------------------------------------------------------
    bindStoreEvents() {
      this.store.subscribe("taskAdded", ({ task }) => {
        this._handleTaskMutationUI(task, "add");
      });

      this.store.subscribe("taskUpdated", ({ task, prev }) => {
        this._handleTaskMutationUI(task, "update", prev);
      });

      this.store.subscribe("taskDeleted", ({ task }) => {
        this._handleTaskMutationUI(task, "delete");
      });

      this.store.subscribe("tasksBatchUpdated", () => {
        this._refreshActiveViewOnly();
      });

      this.store.subscribe("categoriesChanged", () => {
        this.populateCategoryDropdowns();
      });

      this.store.subscribe("routinesUpdated", () => {
        if (this.store.currentView === "today") {
          this.renderTodayCircadianBlocks();
        } else if (this.store.currentView === "plan" && this.store.planMode === "routine") {
          this.renderRoutineUI();
        }
      });

      this.store.subscribe("habitsUpdated", () => {
        this.updateGlobalStreakBadge();
        if (this.store.currentView === "today") {
          this.renderTodayHabitStrip();
          this.updateTodayMomentumMetrics();
        } else if (this.store.currentView === "habits") {
          if (this.store.habitsMode === "history") this.renderConsistencyHistoryUI();
          else this.renderConsistencyUI();
        } else if (this.store.currentView === "insights") {
          this.renderInsightsUI();
        }
      });

      this.store.subscribe("journalUpdated", ({ dateStr, silentAutosave }) => {
        if (this.store.currentView === "journal" && !silentAutosave) {
          if (dateStr === this.selectedJournalDate) {
            this.syncJournalInputsWithoutRebuild();
          }
        }
        if (this.store.currentView === "today") {
          this.renderEveningClosureCard();
        }
      });

      this.store.subscribe("personalityChanged", (profile) => {
        this.personalityProfile = profile;
        this.todayAIPlan = null;
        this._refreshActiveViewOnly();
      });

      this.store.subscribe("viewChanged", () => {
        this.clearJournalAutosaveTimer();
        this.updateActiveTabUI();
        this.transitionRender();
      });

      this.store.subscribe("planFilterChanged", () => {
        this.updatePlanSubNavUI();
        this.renderPlanPipelineUI();
      });

      this.store.subscribe("todayFilterChanged", () => {
        this.updateTodayFilterPillsUI();
        this.renderTodayTaskList();
      });

      this.store.subscribe("filtersChanged", () => {
        this.syncFilterInputsUI();
        if (this.store.currentView === "today") {
          this.renderTodayTaskList();
        } else if (this.store.currentView === "plan" && this.store.planMode === "pipeline") {
          this.renderPlanPipelineUI();
        }
      });

      this.store.subscribe("preferenceChanged", () => {
        this.updateThemeClasses();
      });

      this.store.subscribe("sidebarToggled", () => {
        this.updateSidebarClass();
      });

      this.store.subscribe("xpUpdated", () => {
        if (this.store.currentView === "today") this.updateTodayMomentumMetrics();
      });

      this.store.subscribe("timerStateChanged", (t) => {
        this.renderMiniTimerBar(t);
        if (this.store.currentView === "focus") this.renderTimerUI(t);
        if (this.store.currentView === "today") this.renderTodayHeroCard();
      });

      this.store.subscribe("timerTick", (t) => {
        this.updateTimerCountdown(t);
        this.renderMiniTimerBar(t);
      });

      this.store.subscribe("timerComplete", () => {
        if (this.store.currentView === "focus") this.renderTimerUI(this.store.timer);
        if (this.store.currentView === "today") {
          this.updateTodayMomentumMetrics();
          this.renderTodayHeroCard();
        }
      });

      this.store.subscribe("alarmStateChanged", (active) => {
        this.toggleAlarmUI(active);
      });

      this.store.subscribe("celebrate", ({ taskId, elementId }) => {
        if (taskId) this.triggerCelebration(taskId);
        if (elementId) this.triggerElementCelebration(elementId);
      });

      this.store.subscribe("notification", (payload) => {
        this.showToast(payload.message, payload.type || "success", {
          undoLabel: payload.undoLabel,
          onUndo: payload.onUndo
        });
      });

      this.store.subscribe("storageError", (err) => {
        this.showInlineError(`Storage write error: ${err && err.message ? err.message : "check disk quota"}`);
      });
    }

    _handleTaskMutationUI(task, kind, prev) {
      const view = this.store.currentView;

      if (view === "today") {
        // Fast-path: patch single card in place if membership didn't change
        const canPatchInPlace =
          kind === "update" &&
          prev &&
          prev.completed === task.completed &&
          prev.priority === task.priority &&
          prev.isLater === task.isLater &&
          prev.dueDate === task.dueDate &&
          this.todayVirtualList &&
          this.todayVirtualList.patchItem(`task_${task.id}`, task);

        if (!canPatchInPlace) {
          this.renderTodayTaskList();
        }
        this.updateTodayMomentumMetrics();
        this.renderTodayHeroCard();
        this.renderEveningClosureCard();
      } else if (view === "plan" && this.store.planMode === "pipeline") {
        const canPatchInPlace =
          kind === "update" &&
          prev &&
          prev.completed === task.completed &&
          prev.priority === task.priority &&
          prev.isLater === task.isLater &&
          prev.dueDate === task.dueDate &&
          this.planVirtualList &&
          this.planVirtualList.patchItem(`task_${task.id}`, task);

        if (!canPatchInPlace) {
          this.renderPlanPipelineUI();
        }
      } else if (view === "insights") {
        this.renderInsightsUI();
      }
    }

    _refreshActiveViewOnly() {
      const active = this.store.currentView;
      if (active === "today") this.renderTodayView();
      else if (active === "plan") this.renderPlanView();
      else if (active === "habits") this.renderHabitsView();
      else if (active === "focus") this.renderTimerUI(this.store.timer);
      else if (active === "insights") this.renderInsightsUI();
      else if (active === "journal") this.renderJournalUI();
      else if (active === "settings") this.renderSettingsUI();
    }

    transitionRender() {
      if (typeof document.startViewTransition === "function" && !prefersReducedMotion()) {
        try {
          document.startViewTransition(() => {
            this.render();
          });
          return;
        } catch (_) {}
      }
      this.render();
    }

    // -----------------------------------------------------------------------
    // User Interactions (Delegated, IME-Safe, Zero Inline Handlers)
    // -----------------------------------------------------------------------
    bindUserInteractions() {
      // Online/offline listeners
      window.addEventListener("online", () => this.updateOfflineBadge());
      window.addEventListener("offline", () => this.updateOfflineBadge());

      // Sidebar collapse
      if (this.sidebarToggleBtn) {
        this.sidebarToggleBtn.addEventListener("click", () => {
          this.store.setSidebarCollapsed(!this.store.sidebarCollapsed);
        });
      }

      // Navigation tabs (Desktop rail + Bottom dock + More popover)
      this.navButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = btn.getAttribute("data-view");
          if (target) this.store.setView(target);
          if (this.moreNavPopover && typeof this.moreNavPopover.hidePopover === "function") {
            try { this.moreNavPopover.hidePopover(); } catch (_) {}
          }
        });
      });

      // Header momentum pill -> open Habits
      const momentumBtn = document.getElementById("header_momentum_btn");
      if (momentumBtn) {
        momentumBtn.addEventListener("click", () => this.store.setView("habits"));
      }

      // Shortcuts help button inside More popover
      const shortcutsBtn = document.getElementById("more_shortcuts_btn");
      if (shortcutsBtn) {
        shortcutsBtn.addEventListener("click", () => {
          if (this.moreNavPopover && typeof this.moreNavPopover.hidePopover === "function") {
            try { this.moreNavPopover.hidePopover(); } catch (_) {}
          }
          this.showConfirmDialog({
            title: "Keyboard Shortcuts",
            message: "N: Focus Quick-Add · /: Focus Search · Space: Play/Pause Timer (Focus view) · R: Restart Timer · Esc: Close dialog or dismiss alarm",
            okLabel: "Got it",
            hideCancel: true
          });
        });
      }

      // Inline Error Alert dismissal
      if (this.inlineErrorDismissBtn) {
        this.inlineErrorDismissBtn.addEventListener("click", () => this.hideInlineError());
      }

      // Welcome inline nudge card
      const welcomeDismiss = document.getElementById("welcome_dismiss_btn");
      if (welcomeDismiss) {
        welcomeDismiss.addEventListener("click", () => {
          if (this.welcomeInlineCard) this.welcomeInlineCard.hidden = true;
          this.store.welcomeDialogShown = true;
          Storage.savePreference("welcome_dialog_shown", true).catch(() => {});
        });
      }
      const welcomeQuizBtn = document.getElementById("welcome_start_quiz_btn");
      if (welcomeQuizBtn) {
        welcomeQuizBtn.addEventListener("click", () => {
          if (this.welcomeInlineCard) this.welcomeInlineCard.hidden = true;
          this.store.welcomeDialogShown = true;
          Storage.savePreference("welcome_dialog_shown", true).catch(() => {});
          this.openPersonalityQuiz();
        });
      }

      // Welcome 1-click starter blueprints
      document.querySelectorAll(".blueprint_btn[data-blueprint]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const role = btn.getAttribute("data-blueprint");
          this.applyStarterBlueprint(role);
          if (this.welcomeInlineCard) this.welcomeInlineCard.hidden = true;
          this.store.welcomeDialogShown = true;
          Storage.savePreference("welcome_dialog_shown", true).catch(() => {});
        });
      });

      // Keystone Card Collapse Toggle
      const keystoneCollapseBtn = document.getElementById("keystone_collapse_btn");
      const keystoneCard = document.getElementById("today_keystone_card");
      const keystoneBody = document.getElementById("keystone_expandable_body");
      if (keystoneCollapseBtn && keystoneCard && keystoneBody) {
        keystoneCollapseBtn.addEventListener("click", () => {
          const isCollapsed = keystoneCard.classList.toggle("collapsed");
          keystoneBody.hidden = isCollapsed;
          keystoneCollapseBtn.setAttribute("aria-expanded", String(!isCollapsed));
        });
      }

      // Standup Markdown Export
      const standupBtn = document.getElementById("today_standup_export_btn");
      if (standupBtn) {
        standupBtn.addEventListener("click", () => this.exportStandupMarkdown());
      }

      // Notification permission banner
      if (NotificationService.isSupported() && Notification.permission === "default" && !this.store.bannerDismissed && this.store.notificationsEnabled && this.notifBanner) {
        this.notifBanner.hidden = false;
        this.notifBanner.classList.add("visible");
      }
      if (this.grantNotifBtn) {
        this.grantNotifBtn.addEventListener("click", async () => {
          const granted = await NotificationService.requestPermission();
          this.store.setNotificationsEnabled(granted);
          if (this.notifBanner) {
            this.notifBanner.hidden = true;
            this.notifBanner.classList.remove("visible");
          }
          if (granted) {
            this.showToast("Flow alerts enabled", "success");
            this.checkOverdueDeadlines();
          }
        });
      }
      if (this.closeNotifBtn) {
        this.closeNotifBtn.addEventListener("click", () => {
          this.store.setNotificationsEnabled(false);
          if (this.notifBanner) {
            this.notifBanner.hidden = true;
            this.notifBanner.classList.remove("visible");
          }
        });
      }

      // Quick-Add Form & Active Tab Capture
      this.bindQuickAddInteractions();

      // Today filter pills
      const todayPills = document.getElementById("today_filter_pills");
      if (todayPills) {
        todayPills.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-today-filter]");
          if (!btn) return;
          this.store.setTodayFilter(btn.getAttribute("data-today-filter"));
        });
      }

      // Today inline habit strip (single delegated listener)
      const habitStripList = document.getElementById("today_habit_strip_list");
      if (habitStripList) {
        habitStripList.addEventListener("click", (e) => {
          const pill = e.target.closest("button[data-habit-id]");
          if (!pill) return;
          const id = pill.getAttribute("data-habit-id");
          this.store.toggleHabitCompletion(id, getLocalDateString());
        });
      }
      const habitStripAllBtn = document.getElementById("today_habit_view_all_btn");
      if (habitStripAllBtn) {
        habitStripAllBtn.addEventListener("click", () => this.store.setView("habits"));
      }

      // Evening Closure Card interactions
      this.bindEveningClosureInteractions();

      // Search & Filter controls (debounced 120ms for snappy INP)
      let searchDebounce = null;
      const onSearchInput = (val) => {
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          this.store.setFilters(val, undefined, undefined);
        }, 120);
      };
      if (this.searchInput) {
        this.searchInput.addEventListener("input", () => onSearchInput(this.searchInput.value));
      }
      if (this.planSearchInput) {
        this.planSearchInput.addEventListener("input", () => onSearchInput(this.planSearchInput.value));
      }
      if (this.filterPriority) {
        this.filterPriority.addEventListener("change", () => this.store.setFilters(undefined, this.filterPriority.value, undefined));
      }
      if (this.planFilterPriority) {
        this.planFilterPriority.addEventListener("change", () => this.store.setFilters(undefined, this.planFilterPriority.value, undefined));
      }
      if (this.filterCategory) {
        this.filterCategory.addEventListener("change", () => this.store.setFilters(undefined, undefined, this.filterCategory.value));
      }
      if (this.planFilterCategory) {
        this.planFilterCategory.addEventListener("change", () => this.store.setFilters(undefined, undefined, this.planFilterCategory.value));
      }
      if (this.searchClearBtn) {
        this.searchClearBtn.addEventListener("click", () => {
          this.store.setFilters("", "All", "All");
        });
      }

      // Plan Sub-navigation (Pipeline vs Routine, and Pipeline filter pills)
      const planModeTabs = document.getElementById("plan_mode_tabs");
      if (planModeTabs) {
        planModeTabs.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-plan-mode]");
          if (!btn) return;
          this.store.setPlanMode(btn.getAttribute("data-plan-mode"));
        });
      }
      const planFilterBar = document.getElementById("plan_filter_bar");
      if (planFilterBar) {
        planFilterBar.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-plan-filter]");
          if (!btn) return;
          this.store.setPlanFilter(btn.getAttribute("data-plan-filter"));
        });
      }
      if (this.planLoadMoreBtn) {
        this.planLoadMoreBtn.addEventListener("click", async () => {
          this.planLoadMoreBtn.disabled = true;
          this.planLoadMoreBtn.textContent = "Loading...";
          await this.store.loadCompletedPage({ reset: false, limit: 50 });
          this.renderPlanPipelineUI({ skipCompletedFetch: true });
        });
      }

      // Routine Controls (delegated)
      const routineQuickAddBtn = document.getElementById("routine_quick_add_btn");
      if (routineQuickAddBtn) {
        routineQuickAddBtn.addEventListener("click", () => this.openRoutineSheet());
      }
      const dayTabsBar = document.getElementById("routine_day_tabs_bar");
      if (dayTabsBar) {
        dayTabsBar.addEventListener("click", (e) => {
          const tab = e.target.closest(".routine_day_tab");
          if (!tab) return;
          this.selectedRoutineDay = tab.getAttribute("data-day");
          this.renderRoutineUI();
        });
      }
      const layoutPills = document.getElementById("routine_layout_pills");
      if (layoutPills) {
        layoutPills.addEventListener("click", (e) => {
          const btn = e.target.closest(".pill_btn");
          if (!btn) return;
          this.routineLayoutMode = btn.getAttribute("data-layout");
          this.renderRoutineUI();
        });
      }
      const routineScroller = document.getElementById("routine_timetable_scroller");
      if (routineScroller) {
        routineScroller.addEventListener("click", async (e) => {
          const delBtn = e.target.closest("[data-action='delete-routine']");
          if (delBtn) {
            e.stopPropagation();
            const id = delBtn.getAttribute("data-id");
            const block = this.store.routineMap.get(String(id));
            const ok = await this.showConfirmDialog({
              title: "Remove Routine Block",
              message: `Unschedule "${block ? block.title : "this block"}"?`,
              okLabel: "Remove",
              danger: true
            });
            if (ok) this.store.deleteRoutineBlock(id);
            return;
          }
          const editTarget = e.target.closest("[data-action='edit-routine'], .agenda_timeline_item[data-id], .routine_table_row[data-id]");
          if (editTarget) {
            const id = editTarget.getAttribute("data-id");
            const block = this.store.routineMap.get(String(id));
            if (block) this.openRoutineSheet(block);
          }
        });
      }

      // Habits Sub-navigation & Delegated Interactions
      const habitsModeTabs = document.getElementById("habits_mode_tabs");
      if (habitsModeTabs) {
        habitsModeTabs.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-habits-mode]");
          if (!btn) return;
          this.store.setHabitsMode(btn.getAttribute("data-habits-mode"));
        });
      }
      this.bindConsistencyInteractions();

      // Task Dialog / Form Bindings
      this.bindTaskDialogInteractions();
      this.bindRoutineDialogInteractions();
      this.bindHabitDialogInteractions();
      this.bindPersonalityDialogInteractions();
      this.bindConfirmDialogInteractions();
      this.bindTimerInteractions();

      // Global Keyboard Shortcuts (IME-safe)
      document.addEventListener("keydown", (e) => {
        if (isIMEComposing(e)) return;
        const tag = (e.target && e.target.tagName ? e.target.tagName.toLowerCase() : "");
        const activeEditing = ["input", "textarea", "select"].includes(tag) || (e.target && e.target.isContentEditable);
        const anyModalOpen = Boolean(document.querySelector("dialog[open]"));

        if (!activeEditing && !anyModalOpen) {
          if (e.key === "n" || e.key === "N" || e.key === "+") {
            e.preventDefault();
            if (this.store.currentView === "plan" && this.store.planMode === "routine") {
              this.openRoutineSheet();
            } else if (this.store.currentView === "today" && this.quickAddInput) {
              this.quickAddInput.focus();
              this.quickAddInput.select();
            } else {
              this.openBottomSheet();
            }
          } else if (e.key === "c" || e.key === "C") {
            e.preventDefault();
            if (this.quickAddInput) {
              this.quickAddInput.focus();
              this.quickAddInput.select();
            }
          } else if (["1", "2", "3", "4", "5"].includes(e.key)) {
            e.preventDefault();
            const views = ["today", "plan", "focus", "habits", "analytics"];
            const targetView = views[parseInt(e.key, 10) - 1];
            if (targetView) this.store.setView(targetView);
          } else if (e.key === "j" || e.key === "ArrowDown") {
            e.preventDefault();
            this.navigateTaskList(1);
          } else if (e.key === "k" || e.key === "ArrowUp") {
            e.preventDefault();
            this.navigateTaskList(-1);
          } else if (e.key === " " || e.code === "Space") {
            const card = document.activeElement ? document.activeElement.closest(".task_card") : null;
            if (card && this.store.currentView !== "focus") {
              e.preventDefault();
              const taskId = card.getAttribute("data-id");
              if (taskId) {
                card.classList.add("completed_transition");
                const chk = card.querySelector(".checkbox_btn");
                if (chk) {
                  chk.setAttribute("aria-pressed", "true");
                  this.triggerElementCelebration(chk);
                }
                setTimeout(() => this.store.toggleTaskComplete(taskId), 350);
              }
            } else if (this.store.currentView === "focus") {
              e.preventDefault();
              if (this.store.timer.isRunning) this.store.pauseTimer();
              else this.store.startTimer();
            }
          } else if (e.key === "e" || e.key === "E") {
            const card = document.activeElement ? document.activeElement.closest(".task_card") : null;
            if (card) {
              e.preventDefault();
              const taskId = card.getAttribute("data-id");
              const task = taskId ? this.store.getTaskById(taskId) : null;
              if (task) this.openBottomSheet(task);
            }
          } else if (e.key === "Delete" || e.key === "Backspace") {
            const card = document.activeElement ? document.activeElement.closest(".task_card") : null;
            if (card) {
              e.preventDefault();
              const taskId = card.getAttribute("data-id");
              if (taskId) this.store.deleteTask(taskId);
            }
          } else if (e.key === "/") {
            e.preventDefault();
            if (this.store.currentView === "plan" && this.planSearchInput) {
              this.planSearchInput.focus();
            } else if (this.todaySearchPopover && typeof this.todaySearchPopover.showPopover === "function") {
              try { this.todaySearchPopover.showPopover(); } catch (_) {}
              if (this.searchInput) this.searchInput.focus();
            } else if (this.searchInput) {
              this.searchInput.focus();
            }
          } else if (this.store.currentView === "focus") {
            if (e.key === "r" || e.key === "R") {
              e.preventDefault();
              this.store.restartTimer();
            }
          }
        }

        if (e.key === "Escape") {
          if (this.store.isAlarmActive) {
            this.dismissTimerAlarm();
          } else if (document.body.classList.contains("journal-distraction-free")) {
            document.body.classList.remove("journal-distraction-free");
            this.updateJournalDFButton();
          }
        }
      });
    }

    bindQuickAddInteractions() {
      if (this.quickAddForm) {
        this.quickAddForm.addEventListener("submit", (e) => {
          e.preventDefault();
          this.submitQuickAdd();
        });
      }

      if (this.quickAddInput) {
        this.quickAddInput.addEventListener("keydown", (e) => {
          if (isIMEComposing(e)) return;
          if (e.key === "Escape") {
            this.quickAddInput.blur();
          }
        });
      }

      if (this.qaCaptureTabBtn) {
        this.qaCaptureTabBtn.addEventListener("click", async () => {
          const res = await sendExtensionMessage({ type: "CAPTURE_ACTIVE_TAB" });
          if (res && res.success && res.tab) {
            this.quickAddState.attachedTab = {
              title: res.tab.title || res.tab.url || "Active Tab",
              url: sanitizeUrl(res.tab.url || "")
            };
            if (this.quickAddInput && !this.quickAddInput.value.trim()) {
              this.quickAddInput.value = this.quickAddState.attachedTab.title;
            }
            this.updateAttachedTabChipUI();
            if (this.quickAddInput) this.quickAddInput.focus();
          } else {
            this.showToast(res && res.error ? res.error : "Active tab capture works inside the Chrome Extension", "info");
          }
        });
      }

      if (this.qaClearTabBtn) {
        this.qaClearTabBtn.addEventListener("click", () => {
          this.quickAddState.attachedTab = null;
          this.updateAttachedTabChipUI();
        });
      }

      if (this.qaChipDate) {
        this.qaChipDate.addEventListener("click", () => {
          const modes = ["today", "tomorrow", "later"];
          const nextMode = modes[(modes.indexOf(this.quickAddState.dateMode) + 1) % modes.length];
          this.quickAddState.dateMode = nextMode;
          const labels = { today: "Today", tomorrow: "Tomorrow", later: "Backlog" };
          if (this.qaDateText) this.qaDateText.textContent = labels[nextMode];
        });
      }

      if (this.qaChipPriority) {
        this.qaChipPriority.addEventListener("click", () => {
          const order = ["Medium", "High", "Low"];
          const nextPri = order[(order.indexOf(this.quickAddState.priority) + 1) % order.length];
          this.quickAddState.priority = nextPri;
          const labels = { Medium: "Steady", High: "Keystone", Low: "Gentle" };
          if (this.qaPriorityText) this.qaPriorityText.textContent = labels[nextPri];
          const dot = this.qaChipPriority.querySelector(".qa_p_dot");
          if (dot) dot.className = "qa_p_dot " + (nextPri === "Medium" ? "med" : nextPri.toLowerCase());
        });
      }

      if (this.qaChipCategory) {
        this.qaChipCategory.addEventListener("click", () => {
          const cats = this.store.getCategories();
          const idx = cats.indexOf(this.quickAddState.category);
          const nextCat = cats[(idx + 1) % cats.length];
          this.quickAddState.category = nextCat;
          if (this.qaCategoryText) this.qaCategoryText.textContent = nextCat;
        });
      }

      if (this.qaBtnAdvanced) {
        this.qaBtnAdvanced.addEventListener("click", () => {
          const title = this.quickAddInput ? this.quickAddInput.value.trim() : "";
          this.openBottomSheet(null, {
            title,
            url: this.quickAddState.attachedTab ? this.quickAddState.attachedTab.url : "",
            priority: this.quickAddState.priority,
            category: this.quickAddState.category,
            dateMode: this.quickAddState.dateMode
          });
          if (this.quickAddInput) this.quickAddInput.value = "";
          this.quickAddState.attachedTab = null;
          this.updateAttachedTabChipUI();
        });
      }
    }

    updateAttachedTabChipUI() {
      if (!this.qaAttachedTabChip) return;
      const tab = this.quickAddState.attachedTab;
      if (tab && tab.url) {
        this.qaAttachedTabChip.hidden = false;
        if (this.qaAttachedTabTitle) {
          this.qaAttachedTabTitle.textContent = tab.title || tab.url;
        }
      } else {
        this.qaAttachedTabChip.hidden = true;
      }
    }

    parseQuickAddTokens(rawText) {
      let text = rawText;
      let priority = null;
      let category = null;
      let dateMode = null;

      // 1. Priority: !high, !keystone, !p1, !med, !medium, !steady, !p2, !low, !gentle, !p3
      text = text.replace(/!(keystone|high|p1)\b/gi, () => {
        priority = "High";
        return "";
      });
      text = text.replace(/!(steady|med|medium|p2)\b/gi, () => {
        priority = "Medium";
        return "";
      });
      text = text.replace(/!(gentle|low|p3)\b/gi, () => {
        priority = "Low";
        return "";
      });

      // 2. Date mode: \b(tomorrow|tmrw|later|backlog|today)\b
      text = text.replace(/\b(tomorrow|tmrw)\b/gi, () => {
        dateMode = "tomorrow";
        return "";
      });
      text = text.replace(/\b(later|backlog)\b/gi, () => {
        dateMode = "later";
        return "";
      });
      text = text.replace(/\btoday\b/gi, () => {
        dateMode = "today";
        return "";
      });

      // 3. Category: @categoryName
      const availableCats = typeof this.store.getCategories === "function" ? this.store.getCategories() : [];
      text = text.replace(/@([a-zA-Z0-9_-]+)/g, (match, catName) => {
        const found = availableCats.find((c) => c.toLowerCase() === catName.toLowerCase());
        category = found || catName;
        return "";
      });

      return {
        cleanTitle: text.replace(/\s+/g, " ").trim(),
        priority,
        category,
        dateMode
      };
    }

    submitQuickAdd() {
      if (!this.quickAddInput) return;
      const rawTitle = this.quickAddInput.value.trim();
      if (!rawTitle) {
        this.quickAddInput.focus();
        return;
      }

      const parsed = this.parseQuickAddTokens(rawTitle);
      const title = parsed.cleanTitle || rawTitle;

      const dateMode = parsed.dateMode || this.quickAddState.dateMode || "today";
      const priority = parsed.priority || this.quickAddState.priority || "Medium";
      const category = parsed.category || this.quickAddState.category || "Inbox";

      let dueDate = getLocalDateString();
      let isLater = false;
      if (dateMode === "tomorrow") {
        dueDate = getNDaysFromNow(1);
      } else if (dateMode === "later") {
        isLater = true;
        dueDate = "";
      }

      const task = this.store.addTask({
        title,
        description: "",
        url: this.quickAddState.attachedTab ? this.quickAddState.attachedTab.url : "",
        dueDate,
        priority,
        category,
        estimatedDuration: 25,
        recurring: "none",
        isLater
      });

      this.quickAddInput.value = "";
      this.quickAddState.attachedTab = null;
      this.updateAttachedTabChipUI();
      this.quickAddInput.focus();

      if (task) {
        this.showToast(`Captured: ${task.title}`, "success");
      }
    }

    applyStarterBlueprint(role) {
      const todayStr = getLocalDateString();
      if (role === "lead") {
        this.store.addTask({
          title: "Review team PRs & milestone roadmap",
          dueDate: todayStr,
          priority: "High",
          category: "Work",
          estimatedDuration: 30
        });
        this.store.addTask({
          title: "Establish daily keystone intention",
          dueDate: todayStr,
          priority: "High",
          category: "Planning",
          estimatedDuration: 15
        });
        this.store.addTask({
          title: "Execute 30-second shutdown & standup sync",
          dueDate: todayStr,
          priority: "Medium",
          category: "Review",
          estimatedDuration: 10
        });
        this.showToast("Executive blueprint loaded", "success");
      } else if (role === "engineer") {
        this.store.addTask({
          title: "Deep focus: Core feature sprint",
          dueDate: todayStr,
          priority: "High",
          category: "Dev",
          estimatedDuration: 45
        });
        this.store.addTask({
          title: "Triage open GitHub notifications & review requests",
          dueDate: todayStr,
          priority: "Medium",
          category: "Dev",
          estimatedDuration: 20
        });
        this.store.addTask({
          title: "Capture active browser tab to backlog (Press Tab)",
          dueDate: "",
          isLater: true,
          priority: "Low",
          category: "Research",
          estimatedDuration: 15
        });
        this.showToast("Software engineer blueprint loaded", "success");
      } else if (role === "creator") {
        this.store.addTask({
          title: "Draft daily long-form writing piece (25m flow)",
          dueDate: todayStr,
          priority: "High",
          category: "Creative",
          estimatedDuration: 25
        });
        this.store.addTask({
          title: "Review weekly publishing horizon & draft queue",
          dueDate: todayStr,
          priority: "Medium",
          category: "Planning",
          estimatedDuration: 20
        });
        this.store.addTask({
          title: "Inbox zero: organize incoming notes & references",
          dueDate: todayStr,
          priority: "Low",
          category: "Admin",
          estimatedDuration: 15
        });
        this.showToast("Creator blueprint loaded", "success");
      }
    }

    exportStandupMarkdown() {
      const todayStr = getLocalDateString();
      const allTasks = this.store.tasks;
      const completedToday = allTasks.filter((t) => t.completed && (!t.completedAt || t.completedAt.startsWith(todayStr)));
      const pendingToday = allTasks.filter((t) => !t.completed && !t.isLater && t.dueDate <= todayStr);

      let md = `### 🌅 Daily Standup — ${todayStr}\n\n`;
      md += `**Completed:**\n`;
      if (completedToday.length === 0) {
        md += `- *(No tasks completed yet)*\n`;
      } else {
        completedToday.forEach((t) => {
          md += `- [x] ${t.title} (${t.category || "General"})\n`;
        });
      }

      md += `\n**In Progress & Priorities:**\n`;
      if (pendingToday.length === 0) {
        md += `- *(All planned tasks cleared)*\n`;
      } else {
        pendingToday.forEach((t) => {
          const pri = t.priority === "High" ? " [Keystone]" : "";
          md += `- [ ] ${t.title}${pri}\n`;
        });
      }

      md += `\n*Organized with Aurora Companion*\n`;

      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(md).then(() => {
          this.showToast("Standup copied to clipboard!", "success");
        }).catch(() => {
          this.showToast("Failed to copy standup", "error");
        });
      } else {
        this.showToast("Clipboard not accessible", "error");
      }
    }

    navigateTaskList(direction) {
      const cards = Array.from(document.querySelectorAll("#task_list_container .task_card"));
      if (cards.length === 0) return;
      const currentIdx = cards.findIndex((c) => c.contains(document.activeElement) || c === document.activeElement);
      let nextIdx = 0;
      if (currentIdx !== -1) {
        nextIdx = Math.max(0, Math.min(cards.length - 1, currentIdx + direction));
      } else if (direction === -1) {
        nextIdx = cards.length - 1;
      }
      const targetCard = cards[nextIdx];
      if (targetCard) {
        targetCard.focus();
        targetCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    bindEveningClosureInteractions() {
      const moodGroup = document.getElementById("evening_closure_mood_group");
      let selectedMood = "calm";
      if (moodGroup) {
        moodGroup.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-mood]");
          if (!btn) return;
          selectedMood = btn.getAttribute("data-mood");
          moodGroup.querySelectorAll("button[data-mood]").forEach((b) => {
            b.classList.toggle("active", b === btn);
          });
        });
      }

      const commitBtn = document.getElementById("evening_closure_commit_btn");
      if (commitBtn) {
        commitBtn.addEventListener("click", () => {
          const input = document.getElementById("evening_closure_win_input");
          const winText = input ? input.value.trim() : "";
          const todayStr = getLocalDateString();
          const prev = this.store.journal[todayStr] || {};
          const merged = winText
            ? (prev.eveningReflection ? `${prev.eveningReflection}\n- Win: ${winText}` : `- Win: ${winText}`)
            : (prev.eveningReflection || "Completed mindful evening shutdown.");

          this.store.saveJournalEntry(todayStr, {
            eveningReflection: merged,
            morningMood: selectedMood,
            shutdownComplete: true
          });
          if (input) input.value = "";
          this.eveningClosureDismissedDate = todayStr;
          Storage.savePreference("evening_closure_dismissed", todayStr).catch(() => {});
          this.store.awardXP(40);
          this.showToast("Evening closure logged (+40 XP). Rest well.", "success");
          this.renderEveningClosureCard();
        });
      }

      const dismissBtn = document.getElementById("evening_closure_dismiss_btn");
      if (dismissBtn) {
        dismissBtn.addEventListener("click", () => {
          const todayStr = getLocalDateString();
          this.eveningClosureDismissedDate = todayStr;
          Storage.savePreference("evening_closure_dismissed", todayStr).catch(() => {});
          this.renderEveningClosureCard();
        });
      }
    }

    bindTaskDialogInteractions() {
      if (this.closeSheetBtn) this.closeSheetBtn.addEventListener("click", () => this.closeBottomSheet());
      const cancelBtn = document.getElementById("btn_cancel_sheet");
      if (cancelBtn) cancelBtn.addEventListener("click", () => this.closeBottomSheet());

      if (this.sheetDeleteBtn) {
        this.sheetDeleteBtn.addEventListener("click", async () => {
          if (this.activeEditingTaskId === null) return;
          const task = this.store.getTaskById(this.activeEditingTaskId);
          this.closeBottomSheet();
          if (task) this.store.deleteTask(task.id);
        });
      }

      if (this.sheetForm) {
        this.sheetForm.addEventListener("submit", (e) => {
          e.preventDefault();
          this.handleTaskFormSubmission();
        });

        // Custom category tag creation via native #confirm_dialog
        const catSelect = document.getElementById("task_category");
        let prevCat = "Inbox";
        if (catSelect) {
          catSelect.addEventListener("focus", () => {
            if (catSelect.value !== "custom") prevCat = catSelect.value;
          });
          catSelect.addEventListener("change", async () => {
            if (catSelect.value !== "custom") {
              prevCat = catSelect.value;
              return;
            }
            const tag = await this.showConfirmDialog({
              title: "Create Category Tag",
              message: "Enter a short tag name for grouping tasks.",
              requireInput: true,
              inputLabel: "Category Name",
              inputPlaceholder: "e.g., Design, Study, Home",
              okLabel: "Add Tag"
            });
            const clean = tag ? tag.trim() : "";
            if (clean) {
              const formatted = clean.charAt(0).toUpperCase() + clean.slice(1);
              if (!Array.from(catSelect.options).some((o) => o.value === formatted)) {
                const opt = document.createElement("option");
                opt.value = formatted;
                opt.textContent = formatted;
                catSelect.insertBefore(opt, catSelect.options[catSelect.options.length - 1]);
              }
              catSelect.value = formatted;
              prevCat = formatted;
            } else {
              catSelect.value = prevCat;
            }
          });
        }

        // Priority pills
        const pillGroup = document.getElementById("priority_pill_group");
        const priSelect = document.getElementById("task_priority");
        if (pillGroup && priSelect) {
          pillGroup.addEventListener("click", (e) => {
            const pill = e.target.closest(".priority_pill_option");
            if (!pill) return;
            const val = pill.getAttribute("data-priority");
            if (!val) return;
            priSelect.value = val;
            this.updatePriorityPillsUI(val);
          });
        }

        // Date chips
        const dateChips = this.sheetForm.querySelectorAll(".date_chip");
        const dateInput = document.getElementById("task_due_date");
        dateChips.forEach((chip) => {
          chip.addEventListener("click", () => {
            dateChips.forEach((c) => c.classList.remove("active"));
            chip.classList.add("active");
            const daysStr = chip.getAttribute("data-days");
            if (daysStr !== null && dateInput) {
              dateInput.value = getNDaysFromNow(parseInt(daysStr, 10) || 0);
              dateInput.hidden = true;
              dateInput.style.display = "none";
            } else if (chip.id === "chip_custom_date" && dateInput) {
              dateInput.hidden = false;
              dateInput.style.display = "block";
              if (!dateInput.value) dateInput.value = getLocalDateString();
              dateInput.focus();
            } else if (dateInput) {
              dateInput.value = "";
              dateInput.hidden = true;
              dateInput.style.display = "none";
            }
          });
        });
      }
    }

    bindRoutineDialogInteractions() {
      if (this.closeRoutineSheetBtn) {
        this.closeRoutineSheetBtn.addEventListener("click", () => this.closeRoutineSheet());
      }
      if (this.routineForm) {
        this.routineForm.addEventListener("submit", (e) => {
          e.preventDefault();
          this.handleRoutineFormSubmission();
        });
      }
    }

    bindHabitDialogInteractions() {
      if (this.closeHabitSheetBtn) {
        this.closeHabitSheetBtn.addEventListener("click", () => this.closeHabitSheet());
      }
      if (this.habitForm) {
        this.habitForm.addEventListener("submit", (e) => {
          e.preventDefault();
          if (this.isSubmitting) return;
          const title = (document.getElementById("habit_title")?.value || "").trim();
          const cat = document.getElementById("habit_category")?.value || "Routine";
          const color = document.getElementById("habit_color")?.value || "indigo";
          if (!title) return;

          this.isSubmitting = true;
          if (this.activeEditingHabitId !== null) {
            this.store.updateHabit(this.activeEditingHabitId, { title, category: cat, color });
            this.evaluateHabitWithAI(title, this.activeEditingHabitId);
          } else {
            const created = this.store.addHabit(title, cat, color);
            if (created) this.evaluateHabitWithAI(title, created.id);
          }
          this.closeHabitSheet();
        });
      }
    }

    bindPersonalityDialogInteractions() {
      if (this.closePersonalityDialogBtn) {
        this.closePersonalityDialogBtn.addEventListener("click", () => this.closePersonalityQuiz());
      }
      if (this.personalitySkipBtn) {
        this.personalitySkipBtn.addEventListener("click", () => this.closePersonalityQuiz());
      }
      if (this.personalityPrevBtn) {
        this.personalityPrevBtn.addEventListener("click", () => this.handlePersonalityPrev());
      }
      if (this.personalityNextBtn) {
        this.personalityNextBtn.addEventListener("click", () => this.handlePersonalityNext());
      }
    }

    bindConfirmDialogInteractions() {
      if (!this.confirmDialog) return;
      if (this.confirmCancelBtn) {
        this.confirmCancelBtn.addEventListener("click", () => {
          const resolve = this.confirmResolver;
          this.confirmResolver = null;
          this.closeDialog(this.confirmDialog);
          if (resolve) resolve(this.confirmRequireInput ? null : false);
        });
      }
      if (this.confirmForm) {
        this.confirmForm.addEventListener("submit", (e) => {
          e.preventDefault();
          if (this.confirmRequireInput && this.confirmInput) {
            const val = this.confirmInput.value.trim();
            if (this.confirmMatchText && val !== this.confirmMatchText) {
              this.showToast(`Type "${this.confirmMatchText}" exactly to confirm`, "error");
              this.confirmInput.focus();
              return;
            }
            const resolve = this.confirmResolver;
            this.confirmResolver = null;
            this.closeDialog(this.confirmDialog);
            if (resolve) resolve(val);
            return;
          }
          const resolve = this.confirmResolver;
          this.confirmResolver = null;
          this.closeDialog(this.confirmDialog);
          if (resolve) resolve(true);
        });
      }
      this.confirmDialog.addEventListener("cancel", () => {
        if (this.confirmResolver) {
          const resolve = this.confirmResolver;
          this.confirmResolver = null;
          resolve(this.confirmRequireInput ? null : false);
        }
      });
    }

    bindTimerInteractions() {
      const bindClick = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", fn);
      };

      // Focus panel controls (PiP is opt-in only via #timer_pip_toggle_btn)
      bindClick("timer_play_btn", () => this.store.startTimer());
      bindClick("timer_pause_btn", () => this.store.pauseTimer());
      bindClick("timer_stop_btn", () => {
        this.store.resetTimer();
        this.closeDocumentPiP();
      });
      bindClick("timer_restart_btn", () => this.store.restartTimer());
      bindClick("timer_skip_btn", () => this.store.skipTimerInterval(true));
      bindClick("timer_pomo_btn", () => this.store.changeTimerType("pomodoro"));
      bindClick("timer_short_btn", () => this.store.changeTimerType("shortBreak"));
      bindClick("timer_long_btn", () => this.store.changeTimerType("longBreak"));
      bindClick("timer_stopwatch_btn", () => this.store.changeTimerType("stopwatch"));
      bindClick("timer_dismiss_alarm_btn", () => this.dismissTimerAlarm());
      bindClick("timer_start_next_btn", () => {
        this.dismissTimerAlarm();
        this.store.startTimer();
      });

      if (this.timerPipToggleBtn) {
        this.timerPipToggleBtn.addEventListener("click", () => {
          if (this.pipWindow) this.closeDocumentPiP();
          else this.openDocumentPiP();
        });
      }

      bindClick("btn_timer_dec", () => {
        if (this.store.timer.isRunning) {
          this.showToast("Pause timer before adjusting duration", "info");
          return;
        }
        const next = Math.max(300, this.store.timer.duration - 300);
        this.store.timer.duration = next;
        this.store.timer.totalDuration = next;
        this.updateTimerCountdown(this.store.timer);
      });

      bindClick("btn_timer_inc", () => {
        if (this.store.timer.isRunning) {
          this.showToast("Pause timer before adjusting duration", "info");
          return;
        }
        const next = Math.min(7200, this.store.timer.duration + 300);
        this.store.timer.duration = next;
        this.store.timer.totalDuration = next;
        this.updateTimerCountdown(this.store.timer);
      });

      const openCustomDuration = async () => {
        if (this.store.timer.isRunning) {
          this.showToast("Pause timer before setting custom minutes", "info");
          return;
        }
        const currentMins = Math.max(1, Math.round(this.store.timer.duration / 60));
        const raw = await this.showConfirmDialog({
          title: "Custom Timer Duration",
          message: "Enter focus duration in minutes (1 to 180).",
          requireInput: true,
          inputLabel: "Minutes",
          inputType: "number",
          defaultValue: currentMins,
          okLabel: "Apply"
        });
        if (raw === null) return;
        const mins = parseInt(raw, 10);
        if (Number.isNaN(mins) || mins < 1 || mins > 180) {
          this.showToast("Enter a number between 1 and 180", "error");
          return;
        }
        this.store.timer.duration = mins * 60;
        this.store.timer.totalDuration = mins * 60;
        this.updateTimerCountdown(this.store.timer);
        this.showToast(`Timer set to ${mins} minutes`, "success");
      };
      bindClick("timer_custom_duration_btn", openCustomDuration);
      bindClick("timer_countdown_text", openCustomDuration);

      // Docked Mini-Timer Bar
      if (this.miniTimerToggleBtn) {
        this.miniTimerToggleBtn.addEventListener("click", () => {
          if (this.store.timer.isRunning) this.store.pauseTimer();
          else this.store.startTimer();
        });
      }
      if (this.miniTimerOpenBtn) {
        this.miniTimerOpenBtn.addEventListener("click", () => this.store.setView("focus"));
      }
      if (this.miniTimerStopBtn) {
        this.miniTimerStopBtn.addEventListener("click", () => {
          this.store.resetTimer();
          this.closeDocumentPiP();
        });
      }
    }

    // -----------------------------------------------------------------------
    // Theme, Circadian Phase, Offline & Chrome Updates
    // -----------------------------------------------------------------------
    updateThemeClasses() {
      const theme = this.store.theme || "dark";
      const accent = this.store.accent || "aurora";
      const legacyAccent = LEGACY_ACCENT_CLASS[accent] || "indigo";
      const resolvedTheme =
        theme === "system"
          ? (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
          : theme;

      document.body.classList.remove("theme-dark", "theme-light", "accent-indigo", "accent-emerald", "accent-rose", "accent-amber");
      document.body.classList.add(`theme-${resolvedTheme}`, `accent-${legacyAccent}`);
      document.body.dataset.theme = theme;
      document.body.dataset.accent = accent;
      document.body.dataset.style = this.store.uiStyle || "atelier";

      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) {
        meta.setAttribute("content", theme === "system" ? "light dark" : theme);
      }
    }

    updateCircadianPhase() {
      const phase = getCircadianPhase();
      document.body.dataset.phase = phase.id;
      if (this.phaseDot) this.phaseDot.title = phase.label;
      if (this.phaseLabel) this.phaseLabel.textContent = phase.label;
    }

    updateSidebarClass() {
      if (this.appContainer) {
        this.appContainer.classList.toggle("collapsed", this.store.sidebarCollapsed);
      }
    }

    updateOfflineBadge() {
      if (!this.offlineBadge) return;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      this.offlineBadge.hidden = !offline;
    }

    updateActiveTabUI() {
      const active = this.store.currentView;
      this.navButtons.forEach((btn) => {
        const v = btn.getAttribute("data-view");
        const isCurrent = v === active;
        btn.classList.toggle("active", isCurrent);
        if (isCurrent) btn.setAttribute("aria-current", "page");
        else btn.removeAttribute("aria-current");
      });
    }

    updateGlobalStreakBadge() {
      if (!this.streakCountEl) return;
      let maxStreak = 0;
      for (let i = 0; i < this.store.habits.length; i++) {
        const s = this.store.habits[i].streak || 0;
        if (s > maxStreak) maxStreak = s;
      }
      this.streakCountEl.textContent = String(maxStreak);
    }

    populateCategoryDropdowns() {
      const cats = this.store.getCategories();
      const filterHTML = `<option value="All">All Tags</option>` + cats.map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join("");
      const current = this.store.filters.category || "All";

      [this.filterCategory, this.planFilterCategory].forEach((sel) => {
        if (!sel) return;
        sel.innerHTML = filterHTML;
        sel.value = cats.includes(current) ? current : "All";
      });

      const taskCatSelect = document.getElementById("task_category");
      if (taskCatSelect) {
        const prev = taskCatSelect.value || "Inbox";
        taskCatSelect.innerHTML =
          cats.map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join("") +
          `<option value="custom">+ Create Tag...</option>`;
        taskCatSelect.value = cats.includes(prev) ? prev : "Inbox";
      }
    }

    populateCreationFormsFromConfigs() {
      const fill = (id, list, extra = "") => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = list.map((item) => {
          const v = typeof item === "string" ? item : item.value;
          const l = typeof item === "string" ? item : item.label;
          return `<option value="${escapeHTML(v)}">${escapeHTML(l)}</option>`;
        }).join("") + extra;
      };

      fill("task_priority", CONFIG_CAPTURE_NEW_GOAL.priorities);
      fill("task_duration", CONFIG_CAPTURE_NEW_GOAL.durations);
      fill("task_recurring", CONFIG_CAPTURE_NEW_GOAL.recurrences);
      fill("routine_category", CONFIG_SCHEDULE_ROUTINE.categories);
      fill("routine_color", CONFIG_SCHEDULE_ROUTINE.colors);
      fill("habit_category", CONFIG_CREATE_HABIT.categories);
      fill("habit_color", CONFIG_CREATE_HABIT.colors);

      const templatesBox = document.getElementById("habit_templates");
      if (templatesBox) {
        templatesBox.innerHTML = CONFIG_CREATE_HABIT.templates
          .map((tpl) => `<button type="button" class="template_chip" data-title="${escapeHTML(tpl.title)}" data-cat="${escapeHTML(tpl.cat)}" data-color="${escapeHTML(tpl.color)}">${escapeHTML(tpl.label)}</button>`)
          .join("");
        templatesBox.addEventListener("click", (e) => {
          const chip = e.target.closest(".template_chip");
          if (!chip) return;
          const titleEl = document.getElementById("habit_title");
          const catEl = document.getElementById("habit_category");
          const colEl = document.getElementById("habit_color");
          if (titleEl) titleEl.value = chip.getAttribute("data-title") || "";
          if (catEl) catEl.value = chip.getAttribute("data-cat") || "Routine";
          if (colEl) colEl.value = chip.getAttribute("data-color") || "indigo";
          templatesBox.querySelectorAll(".template_chip").forEach((c) => c.classList.toggle("active", c === chip));
        });
      }
    }

    syncFilterInputsUI() {
      if (this.searchInput && this.searchInput.value !== this.store.filters.search) {
        this.searchInput.value = this.store.filters.search;
      }
      if (this.planSearchInput && this.planSearchInput.value !== this.store.filters.search) {
        this.planSearchInput.value = this.store.filters.search;
      }
      if (this.filterPriority) this.filterPriority.value = this.store.filters.priority;
      if (this.planFilterPriority) this.planFilterPriority.value = this.store.filters.priority;
      if (this.filterCategory) this.filterCategory.value = this.store.filters.category;
      if (this.planFilterCategory) this.planFilterCategory.value = this.store.filters.category;
    }

    // -----------------------------------------------------------------------
    // Main View Router
    // -----------------------------------------------------------------------
    render() {
      const active = this.store.currentView;

      Object.keys(this.panels).forEach((key) => {
        const panel = this.panels[key];
        if (!panel) return;
        const isActive = key === active;
        panel.hidden = !isActive;
        panel.style.display = isActive ? (key === "focus" ? "flex" : "block") : "none";
      });

      document.body.classList.toggle("view-timer-active", active === "focus");
      this.updateGlobalStreakBadge();
      this.renderMiniTimerBar(this.store.timer);

      const titles = {
        today: "Today",
        plan: this.store.planMode === "routine" ? "Daily Rhythm" : "Plan & Pipeline",
        habits: this.store.habitsMode === "history" ? "Habit Trajectory" : "Atomic Habits",
        focus: "Flow Timer",
        insights: "Insights",
        journal: "Reflection",
        settings: "Settings"
      };
      if (this.viewTitle) {
        this.viewTitle.textContent = titles[active] || "Aurora";
      }
      if (this.viewCount) {
        const showCount = active === "today" || (active === "plan" && this.store.planMode === "pipeline");
        this.viewCount.hidden = !showCount;
        this.viewCount.style.display = showCount ? "inline-flex" : "none";
      }

      if (active === "today") this.renderTodayView();
      else if (active === "plan") this.renderPlanView();
      else if (active === "habits") this.renderHabitsView();
      else if (active === "focus") this.renderTimerUI(this.store.timer);
      else if (active === "insights") this.renderInsightsUI();
      else if (active === "journal") this.renderJournalUI();
      else if (active === "settings") this.renderSettingsUI();
    }

    // -----------------------------------------------------------------------
    // 1. TODAY COMMAND FEED (Unified Home)
    // -----------------------------------------------------------------------
    renderTodayView() {
      this.updateTodayFilterPillsUI();
      this.syncFilterInputsUI();
      this.renderTodayHeroCard();
      this.renderTodayCircadianBlocks();
      this.updateTodayMomentumMetrics();
      this.renderTodayHabitStrip();
      this.renderTodayTaskList();
      this.renderEveningClosureCard();
      this.loadInspirationalQuote();
    }

    updateTodayFilterPillsUI() {
      const container = document.getElementById("today_filter_pills");
      if (!container) return;
      container.querySelectorAll("button[data-today-filter]").forEach((btn) => {
        const active = btn.getAttribute("data-today-filter") === this.store.todayFilter;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", String(active));
      });
    }

    renderTodayHeroCard() {
      const nudgeBox = document.getElementById("dash_focus_nudge_area");
      const bridgeSlot = document.getElementById("morning_bridge_slot");

      if (bridgeSlot) {
        const morningPlan = this.getMorningMomentumPlan();
        if (morningPlan) {
          bridgeSlot.innerHTML = this.renderMorningMomentumCardHTML(morningPlan);
          this.bindMorningCardEvents(morningPlan);
        } else {
          bridgeSlot.innerHTML = "";
        }
      }

      if (!nudgeBox) return;

      if (this.store.timer.isRunning) {
        const activeTask = this.store.timer.activeTaskId ? this.store.getTaskById(this.store.timer.activeTaskId) : null;
        const mins = Math.floor(Math.abs(this.store.timer.duration) / 60);
        const secs = Math.abs(this.store.timer.duration) % 60;
        const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

        const miniTitle = document.getElementById("keystone_mini_title");
        const miniActionBtn = document.getElementById("keystone_mini_action_btn");
        if (miniTitle) miniTitle.textContent = `Flow: ${activeTask ? activeTask.title : "Deep Focus"} (${formatted})`;
        if (miniActionBtn) {
          miniActionBtn.textContent = "Timer";
          miniActionBtn.setAttribute("data-nudge", "goto-timer");
        }

        nudgeBox.innerHTML = `
          <div class="dash_nudge_prompt_card active_focus">
            <div class="nudge_text">
              <span class="nudge_kicker">FLOW SESSION LIVE</span>
              <h3>${escapeHTML(activeTask ? activeTask.title : (this.store.timer.activeTaskTitle || "Deep Focus"))}</h3>
              <p>${formatted} remaining</p>
            </div>
            <div class="nudge_actions">
              <button type="button" class="nudge_focus_btn" data-nudge="goto-timer">Open Timer</button>
              <button type="button" class="nudge_focus_btn secondary" data-nudge="stop-timer">Stop</button>
            </div>
          </div>
        `;
      } else {
        const todayStr = getLocalDateString();
        let keystone = null;
        for (let i = 0; i < this.store.tasks.length; i++) {
          const t = this.store.tasks[i];
          if (t.id === "general_focus" || t.completed || t.isLater) continue;
          if (!keystone) {
            keystone = t;
          } else if (t.dueDate <= todayStr && keystone.dueDate > todayStr) {
            keystone = t;
          } else if (t.priority === "High" && keystone.priority !== "High" && t.dueDate <= todayStr) {
            keystone = t;
          }
        }

        const miniTitle = document.getElementById("keystone_mini_title");
        const miniActionBtn = document.getElementById("keystone_mini_action_btn");

        if (keystone) {
          if (miniTitle) miniTitle.textContent = keystone.title;
          if (miniActionBtn) {
            miniActionBtn.textContent = "Focus";
            miniActionBtn.setAttribute("data-nudge", "start-keystone");
            miniActionBtn.setAttribute("data-task-id", String(keystone.id));
          }

          nudgeBox.innerHTML = `
            <div class="dash_nudge_prompt_card">
              <div class="nudge_text">
                <span class="nudge_kicker">NEXT UP · KEYSTONE FOCUS</span>
                <h3>${escapeHTML(keystone.title)}</h3>
                <p>${keystone.description ? escapeHTML(keystone.description) : `${keystone.estimatedDuration || 25}m · ${escapeHTML(keystone.category)}`}</p>
              </div>
              <button type="button" class="nudge_focus_btn" data-nudge="start-keystone" data-task-id="${escapeHTML(String(keystone.id))}">
                Start ${keystone.estimatedDuration || 25}m Focus
              </button>
            </div>
          `;
        } else {
          if (miniTitle) miniTitle.textContent = "All priorities cleared";
          if (miniActionBtn) {
            miniActionBtn.textContent = "Rest";
            miniActionBtn.setAttribute("data-nudge", "quick-focus");
          }

          nudgeBox.innerHTML = `
            <div class="dash_nudge_prompt_card clean_slate">
              <div class="nudge_text">
                <span class="nudge_kicker">CLEAR HORIZON</span>
                <h3>All active priorities cleared</h3>
                <p>Capture your next intention above or take a restorative break.</p>
              </div>
            </div>
          `;
        }
      }

      const keystoneCard = document.getElementById("today_keystone_card");
      if (keystoneCard && !keystoneCard.dataset.bound) {
        keystoneCard.dataset.bound = "true";
        keystoneCard.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-nudge]");
          if (!btn) return;
          const act = btn.getAttribute("data-nudge");
          if (act === "goto-timer") {
            this.store.setView("focus");
          } else if (act === "stop-timer") {
            this.store.resetTimer();
          } else if (act === "start-keystone") {
            const id = btn.getAttribute("data-task-id");
            const task = this.store.getTaskById(id);
            this.store.setView("focus");
            if (task) this.store.startTimer(task.id);
          } else if (act === "quick-focus") {
            this.store.setView("focus");
            this.store.startTimer();
          }
        });
      }

      if (!nudgeBox.dataset.bound) {
        nudgeBox.dataset.bound = "true";
        nudgeBox.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-nudge]");
          if (!btn) return;
          const act = btn.getAttribute("data-nudge");
          if (act === "goto-timer") {
            this.store.setView("focus");
          } else if (act === "stop-timer") {
            this.store.resetTimer();
          } else if (act === "start-keystone") {
            const id = btn.getAttribute("data-task-id");
            const task = this.store.getTaskById(id);
            this.store.setView("focus");
            if (task) this.store.startTimer(task.id);
          }
        });
      }
    }

    renderTodayCircadianBlocks() {
      const nowNode = document.getElementById("dash_now_block");
      const nextNode = document.getElementById("dash_next_block");
      if (!nowNode && !nextNode) return;

      const map = this.getNowNextRoutine();
      if (nowNode) {
        nowNode.innerHTML = map.now
          ? `<div class="dash_rout_card border-${escapeHTML(map.now.color || "indigo")}"><div class="dash_rout_text"><h4>${escapeHTML(map.now.icon ? `${map.now.icon} ` : "")}${escapeHTML(map.now.title)}</h4><p>${escapeHTML(map.now.startTime)} – ${escapeHTML(map.now.endTime)}</p></div></div>`
          : `<div class="dash_rout_empty">Open breathing space</div>`;
      }
      if (nextNode) {
        nextNode.innerHTML = map.next
          ? `<div class="dash_rout_card next border-${escapeHTML(map.next.color || "indigo")}"><div class="dash_rout_text"><h4>${escapeHTML(map.next.icon ? `${map.next.icon} ` : "")}${escapeHTML(map.next.title)}</h4><p>Next at ${escapeHTML(map.next.startTime)}</p></div></div>`
          : `<div class="dash_rout_empty">No more blocks today</div>`;
      }
    }

    getNowNextRoutine() {
      const now = new Date();
      const currentMin = now.getHours() * 60 + now.getMinutes();
      const dayLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()];
      const todayRoutines = this.store.routines.filter((r) => Array.isArray(r.days) && r.days.includes(dayLabel));

      let activeBlock = null;
      let upcomingBlock = null;
      let minDiff = Infinity;

      for (let i = 0; i < todayRoutines.length; i++) {
        const rout = todayRoutines[i];
        const [sH, sM] = (rout.startTime || "00:00").split(":").map(Number);
        const [eH, eM] = (rout.endTime || "00:00").split(":").map(Number);
        const sMin = sH * 60 + sM;
        const eMin = eH * 60 + eM;
        if (currentMin >= sMin && currentMin <= eMin) {
          activeBlock = rout;
        } else if (sMin > currentMin && sMin - currentMin < minDiff) {
          minDiff = sMin - currentMin;
          upcomingBlock = rout;
        }
      }

      if (!upcomingBlock && todayRoutines.length > 0) {
        const sorted = [...todayRoutines].sort((a, b) => a.startTime.localeCompare(b.startTime));
        upcomingBlock = sorted[0];
      }
      return { now: activeBlock, next: upcomingBlock };
    }

    updateTodayMomentumMetrics() {
      const todayStr = getLocalDateString();

      let pendingToday = 0;
      let todayFocusMin = 0;
      for (let i = 0; i < this.store.tasks.length; i++) {
        const t = this.store.tasks[i];
        if (t.id !== "general_focus" && !t.completed && !t.isLater && t.dueDate <= todayStr) {
          pendingToday += 1;
        }
        if (Array.isArray(t.focusSessions)) {
          for (let j = 0; j < t.focusSessions.length; j++) {
            const fs = t.focusSessions[j];
            if (fs && fs.startTime && getLocalDateString(fs.startTime) === todayStr) {
              todayFocusMin += fs.duration || 0;
            }
          }
        }
      }

      // Count tasks completed today from loaded caches or estimate cleanly
      let completedToday = 0;
      for (const t of this.store.taskMap.values()) {
        if (t.id !== "general_focus" && t.completed && t.completedDate && getLocalDateString(t.completedDate) === todayStr) {
          completedToday += 1;
        }
      }

      const totalTodayTasks = pendingToday + completedToday;
      const taskPct = totalTodayTasks > 0 ? Math.min(1, completedToday / totalTodayTasks) : (this.store.completedCount > 0 ? 1 : 0);

      let habitsDone = 0;
      for (let i = 0; i < this.store.habits.length; i++) {
        const h = this.store.habits[i];
        if (h.history && h.history[todayStr] === true) habitsDone += 1;
      }
      const habitPct = this.store.habits.length > 0 ? Math.min(1, habitsDone / this.store.habits.length) : 0;

      // Focus target: 50 mins/day contributes 20% to Daily Momentum Score
      const focusPct = Math.min(1, todayFocusMin / 50);
      const momentumScore = Math.round(Math.min(100, (taskPct * 50) + (habitPct * 30) + (focusPct * 20)));

      this.updateCircularProgressRing("ring_tasks_today", taskPct);
      this.updateCircularProgressRing("ring_habits_today", habitPct);
      this.updateCircularProgressRing("header_momentum_ring", momentumScore / 100);

      const tasksLabel = document.getElementById("dash_tasks_pct_label");
      const habitsLabel = document.getElementById("dash_habits_pct_label");
      const momentumEl = document.getElementById("dash_momentum_score");

      if (tasksLabel) tasksLabel.textContent = `${Math.round(taskPct * 100)}%`;
      if (habitsLabel) habitsLabel.textContent = `${Math.round(habitPct * 100)}%`;
      if (this.headerMomentumPct) this.headerMomentumPct.textContent = `${momentumScore}%`;
      if (momentumEl) momentumEl.textContent = `${momentumScore} · ${this.store.xpTotal} XP`;
    }

    updateCircularProgressRing(elementId, percentage) {
      const ring = document.getElementById(elementId);
      if (!ring || !ring.r) return;
      const radius = ring.r.baseVal.value || 40;
      const circ = 2 * Math.PI * radius;
      const clamped = Math.min(Math.max(Number(percentage) || 0, 0), 1);
      ring.style.strokeDasharray = `${circ} ${circ}`;
      ring.style.strokeDashoffset = String(circ * (1 - clamped));
    }

    renderTodayHabitStrip() {
      const list = document.getElementById("today_habit_strip_list");
      const countEl = document.getElementById("today_habit_strip_count");
      if (!list) return;

      const todayStr = getLocalDateString();
      const habits = this.store.habits;
      let done = 0;

      if (habits.length === 0) {
        if (countEl) countEl.textContent = "0/0";
        list.innerHTML = `<span class="habit_strip_empty">No daily habits yet</span>`;
        return;
      }

      let html = "";
      for (let i = 0; i < habits.length; i++) {
        const h = habits[i];
        const isDone = Boolean(h.history && h.history[todayStr] === true);
        if (isDone) done += 1;
        html += `
          <button type="button"
            class="habit_strip_pill color-${escapeHTML(h.color || "indigo")} ${isDone ? "done" : ""}"
            id="habit_checkbox_${escapeHTML(h.id)}_${todayStr}"
            data-habit-id="${escapeHTML(h.id)}"
            aria-pressed="${isDone}">
            <span class="habit_strip_check">${isDone ? "✓" : ""}</span>
            <span class="habit_strip_label">${escapeHTML(h.title)}</span>
            <span class="habit_strip_streak">${h.streak || 0}d</span>
          </button>
        `;
      }
      if (countEl) countEl.textContent = `${done}/${habits.length}`;
      list.innerHTML = html;
    }

    renderEveningClosureCard() {
      const card = document.getElementById("evening_closure_card");
      if (!card) return;
      const todayStr = getLocalDateString();
      const entry = this.store.journal[todayStr];
      if ((entry && entry.shutdownComplete) || this.eveningClosureDismissedDate === todayStr) {
        card.hidden = true;
        return;
      }

      const hour = new Date().getHours();
      let pendingToday = 0;
      let completedToday = 0;
      for (const t of this.store.taskMap.values()) {
        if (t.id === "general_focus") continue;
        if (!t.completed && !t.isLater && t.dueDate <= todayStr) pendingToday += 1;
        if (t.completed && t.completedDate && getLocalDateString(t.completedDate) === todayStr) completedToday += 1;
      }
      const total = pendingToday + completedToday;
      const ratio = total > 0 ? completedToday / total : 0;

      card.hidden = !(hour >= 18 || (total > 0 && ratio >= 0.8));
    }

    async loadInspirationalQuote() {
      const quoteEl = document.getElementById("dash_wisdom_prompt_quote");
      if (!quoteEl) return;

      const offlineQuotes = [
        { quote: "Simplify. Focus on the single next action.", author: "Don Norman" },
        { quote: "Motivation gets you started. Habit keeps you going.", author: "Jim Ryun" },
        { quote: "Make good habits obvious, easy, and immediately rewarding.", author: "James Clear" },
        { quote: "Protect your peak hours for deep, unhurried work.", author: "Cal Newport" },
        { quote: "A clear evening shutdown restores tomorrow's focus.", author: "Cal Newport" },
        { quote: "Small daily disciplines compound into lasting momentum.", author: "James Clear" }
      ];

      const now = Date.now();
      if (this.cachedQuote && now - this.lastQuoteFetchTime < 3600000) {
        quoteEl.textContent = this.cachedQuote;
        return;
      }

      const fallback = offlineQuotes[new Date().getDate() % offlineQuotes.length];
      this.cachedQuote = `"${fallback.quote}" — ${fallback.author}`;
      this.lastQuoteFetchTime = now;
      quoteEl.textContent = this.cachedQuote;
    }

    // -----------------------------------------------------------------------
    // Virtualized Task List Filtering, Grouping & Row Rendering
    // -----------------------------------------------------------------------
    getFilteredActiveTasks(filterMode) {
      const todayStr = getLocalDateString();
      const tomorrowStr = getNDaysFromNow(1);
      const upcomingEndStr = getNDaysFromNow(7);
      const search = (this.store.filters.search || "").trim().toLowerCase();
      const priority = this.store.filters.priority || "All";
      const category = this.store.filters.category || "All";

      const result = [];
      const tasks = this.store.tasks;

      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        if (!t || t.id === "general_focus" || t.completed) continue;

        // Scope filter
        if (filterMode === "later") {
          if (!t.isLater) continue;
        } else if (filterMode === "high") {
          if (t.isLater || t.priority !== "High") continue;
        } else if (filterMode === "today") {
          if (t.isLater || t.dueDate > todayStr) continue;
        } else if (filterMode === "tomorrow") {
          if (t.isLater || t.dueDate !== tomorrowStr) continue;
        } else if (filterMode === "upcoming") {
          if (t.isLater || !(t.dueDate > todayStr && t.dueDate <= upcomingEndStr)) continue;
        } else if (filterMode === "overdue") {
          if (t.isLater || t.dueDate >= todayStr) continue;
        } else if (filterMode === "all") {
          if (t.isLater) continue;
        }

        // Attribute filters
        if (priority !== "All" && t.priority !== priority) continue;
        if (category !== "All" && t.category !== category) continue;
        if (search && !t._searchText.includes(search)) continue;

        result.push(t);
      }

      // Fast O(N log N) numeric sort (O(1) AI rank lookup via Map)
      if ((filterMode === "today" || filterMode === "all") && Array.isArray(this.todayAITaskOrder) && this.todayAITaskOrder.length > 0) {
        const rankMap = new Map();
        for (let i = 0; i < this.todayAITaskOrder.length; i++) {
          rankMap.set(String(this.todayAITaskOrder[i]), i);
        }
        result.sort((a, b) => {
          const rA = rankMap.has(String(a.id)) ? rankMap.get(String(a.id)) : 1e9;
          const rB = rankMap.has(String(b.id)) ? rankMap.get(String(b.id)) : 1e9;
          if (rA !== rB) return rA - rB;
          return (b._createdAtMs || 0) - (a._createdAtMs || 0);
        });
      } else {
        result.sort((a, b) => (b._createdAtMs || 0) - (a._createdAtMs || 0));
      }

      return result;
    }

    buildPriorityVirtualItems(tasks) {
      const buckets = { High: [], Medium: [], Low: [] };
      for (let i = 0; i < tasks.length; i++) {
        const p = buckets[tasks[i].priority] ? tasks[i].priority : "Medium";
        buckets[p].push(tasks[i]);
      }

      const labels = {
        High: "Keystone Priorities",
        Medium: "Steady Momentum",
        Low: "Gentle Focus"
      };

      const flat = [];
      ["High", "Medium", "Low"].forEach((pKey) => {
        const list = buckets[pKey];
        if (list.length === 0) return;
        const groupId = `grp_pri_${pKey}`;
        const collapsed = this.collapsedPriorityGroups.has(groupId);
        flat.push({
          __type: "groupHeader",
          groupKind: "priority",
          id: groupId,
          title: labels[pKey],
          count: list.length,
          unit: list.length === 1 ? "intention" : "intentions",
          priorityClass: `priority-${pKey.toLowerCase()}`,
          collapsed
        });
        if (!collapsed) {
          for (let i = 0; i < list.length; i++) flat.push(list[i]);
        }
      });
      return flat;
    }

    buildCompletedVirtualItems(completedTasks) {
      const groups = new Map();
      for (let i = 0; i < completedTasks.length; i++) {
        const t = completedTasks[i];
        const dateKey = t.completedDate ? getLocalDateString(t.completedDate) : (t.dueDate || "No Date");
        if (!groups.has(dateKey)) groups.set(dateKey, []);
        groups.get(dateKey).push(t);
      }

      const sortedDates = Array.from(groups.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
      const todayStr = getLocalDateString();
      const yesterdayStr = getNDaysFromNow(-1);

      if (!this.completedDatesInitialized && sortedDates.length > 1) {
        for (let i = 1; i < sortedDates.length; i++) {
          this.collapsedCompletedDates.add(`grp_date_${sortedDates[i]}`);
        }
        this.completedDatesInitialized = true;
      }

      const flat = [];
      for (let i = 0; i < sortedDates.length; i++) {
        const dKey = sortedDates[i];
        const list = groups.get(dKey);
        let label = "Completed";
        if (dKey === todayStr) label = "Today";
        else if (dKey === yesterdayStr) label = "Yesterday";
        else if (dKey !== "No Date") {
          label = parseLocalDate(dKey).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
        }

        const groupId = `grp_date_${dKey}`;
        const collapsed = this.collapsedCompletedDates.has(groupId);
        flat.push({
          __type: "groupHeader",
          groupKind: "completed",
          id: groupId,
          title: label,
          count: list.length,
          unit: list.length === 1 ? "win" : "wins",
          priorityClass: "completed-group",
          collapsed
        });
        if (!collapsed) {
          for (let j = 0; j < list.length; j++) flat.push(list[j]);
        }
      }
      return flat;
    }

    async renderTodayTaskList() {
      const mode = this.store.todayFilter;
      const bannerContainer = document.getElementById("today_ai_banner_container");

      if (mode === "completed") {
        if (bannerContainer) {
          bannerContainer.hidden = true;
          bannerContainer.innerHTML = "";
        }
        const page = await this.store.loadCompletedPage({ reset: true, limit: 50 });
        if (this.viewCount) this.viewCount.textContent = `(${page.total})`;
        this._mountVirtualListData(
          this.todayVirtualList,
          this.todayEmptyState,
          this.buildCompletedVirtualItems(page.items),
          page.items.length === 0 ? this.getEmptyStateHTML("completed") : ""
        );
        return;
      }

      const scope = mode === "all" ? "today" : mode;
      const filtered = this.getFilteredActiveTasks(scope);
      if (this.viewCount) this.viewCount.textContent = `(${filtered.length})`;

      if (bannerContainer) {
        if (mode === "all") {
          bannerContainer.hidden = false;
          this.renderTodayAIBanner(filtered);
        } else {
          bannerContainer.hidden = true;
          bannerContainer.innerHTML = "";
        }
      }

      const virtualItems = this.buildPriorityVirtualItems(filtered);
      this._mountVirtualListData(
        this.todayVirtualList,
        this.todayEmptyState,
        virtualItems,
        filtered.length === 0 ? this.getEmptyStateHTML(scope) : ""
      );
    }

    _mountVirtualListData(vlist, emptyEl, items, emptyHTML) {
      if (!vlist) return;
      if (items.length === 0) {
        vlist.setItems([]);
        if (emptyEl) {
          emptyEl.hidden = false;
          emptyEl.innerHTML = emptyHTML;
          if (!emptyEl.dataset.bound) {
            emptyEl.dataset.bound = "true";
            emptyEl.addEventListener("click", (e) => {
              const btn = e.target.closest("[data-empty-action]");
              if (!btn) return;
              const act = btn.getAttribute("data-empty-action");
              if (act === "add-task") this.openBottomSheet();
              else if (act === "goto-today") this.store.setView("today");
              else if (act === "clear-filters") this.store.setFilters("", "All", "All");
            });
          }
        }
      } else {
        if (emptyEl) {
          emptyEl.hidden = true;
          emptyEl.innerHTML = "";
        }
        vlist.setItems(items);
      }
    }

    getEmptyStateHTML(mode) {
      const hasSearch = Boolean(this.store.filters.search || this.store.filters.priority !== "All" || this.store.filters.category !== "All");
      if (hasSearch) {
        return `
          <div class="empty_state">
            <h3>No matching tasks</h3>
            <p>Adjust your search term or clear active filters.</p>
            <button type="button" class="sheet_primary_commit" data-empty-action="clear-filters">Clear Filters</button>
          </div>
        `;
      }
      if (mode === "completed") {
        return `
          <div class="empty_state">
            <h3>No completed wins yet</h3>
            <p>Finish your first intention to start building your win log.</p>
            <button type="button" class="sheet_primary_commit" data-empty-action="goto-today">Go to Today</button>
          </div>
        `;
      }
      return `
        <div class="empty_state">
          <h3>Clear canvas</h3>
          <p>Nothing pending here. Capture your next priority when ready.</p>
          <button type="button" class="sheet_primary_commit" data-empty-action="add-task">+ Add Task</button>
        </div>
      `;
    }

    renderVirtualListRow(item, state) {
      if (item.__type === "groupHeader") {
        const header = document.createElement("button");
        header.type = "button";
        header.className = `virtual_group_header ${item.priorityClass || ""} ${item.collapsed ? "collapsed" : ""}`;
        header.setAttribute("data-action", "toggle-group");
        header.setAttribute("data-group-id", item.id);
        header.setAttribute("aria-expanded", String(!item.collapsed));
        header.innerHTML = `
          <span class="group_header_left">
            <svg class="chevron_icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
            <span class="group_header_title">${escapeHTML(item.title)}</span>
          </span>
          <span class="count_badge">${item.count} ${escapeHTML(item.unit || "")}</span>
        `;
        return header;
      }

      return this.createLeanTaskCardDOM(item, state.isExpanded);
    }

    patchVirtualListRow(el, item, state) {
      if (item.__type === "groupHeader") {
        el.classList.toggle("collapsed", Boolean(item.collapsed));
        el.setAttribute("aria-expanded", String(!item.collapsed));
        const badge = el.querySelector(".count_badge");
        if (badge) badge.textContent = `${item.count} ${item.unit || ""}`;
        return true;
      }
      // Re-render card content cleanly on state/data change (single mounted slot only)
      return false;
    }

    createLeanTaskCardDOM(task, isExpanded) {
      const priority = (task.priority || "Medium").toLowerCase();
      const card = document.createElement("article");
      card.className = `task_card priority-${priority} ${task.completed ? "completed" : ""} ${isExpanded ? "expanded" : ""}`;
      card.setAttribute("data-id", String(task.id));
      card.setAttribute("tabindex", "0");

      // Due status badge (pure local string comparison — zero per-card Date objects for common cases!)
      let statusBadge = "";
      if (!task.completed) {
        if (task.isLater) {
          statusBadge = `<span class="badge later">Backlog</span>`;
        } else {
          const todayStr = getLocalDateString();
          const tomorrowStr = getNDaysFromNow(1);
          if (task.dueDate < todayStr) {
            const diffDays = Math.max(1, Math.round((parseLocalDate(todayStr) - parseLocalDate(task.dueDate)) / 86400000));
            statusBadge = `<span class="badge overdue">Overdue ${diffDays}d</span>`;
          } else if (task.dueDate === todayStr) {
            statusBadge = `<span class="badge today">Today</span>`;
          } else if (task.dueDate === tomorrowStr) {
            statusBadge = `<span class="badge tomorrow">Tomorrow</span>`;
          } else if (task.dueDate) {
            statusBadge = `<span class="badge upcoming">${escapeHTML(task.dueDate)}</span>`;
          }
        }
      }

      const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
      const hasSub = subtasks.length > 0;
      const doneSub = hasSub ? subtasks.filter((s) => s.completed).length : 0;
      const priLabel = { High: "Keystone", Medium: "Steady", Low: "Gentle" }[task.priority] || "Steady";

      let urlBadge = "";
      if (task.url) {
        let host = "Link";
        try { host = new URL(task.url).hostname.replace(/^www\./, ""); } catch (_) {}
        urlBadge = `<a class="meta_item url_badge" href="${escapeHTML(task.url)}" target="_blank" rel="noopener noreferrer" data-action="open-url">${escapeHTML(host)}</a>`;
      }

      const expandedHTML = isExpanded
        ? `
          <div class="card_actions_expanded">
            ${task.description ? `<p class="card_desc_full">${escapeHTML(task.description)}</p>` : ""}
            <div class="subtasks_wrapper">
              <div class="subtask_list">
                ${subtasks.map((sub) => `
                  <div class="subtask_item" data-sub-id="${escapeHTML(sub.id)}">
                    <button type="button" class="sub_check_btn ${sub.completed ? "checked" : ""}" data-action="sub-toggle" data-sub-id="${escapeHTML(sub.id)}" aria-label="Toggle subtask">
                      ${sub.completed ? "✓" : ""}
                    </button>
                    <span class="subtask_title ${sub.completed ? "done" : ""}">${escapeHTML(sub.title)}</span>
                    <button type="button" class="sub_delete_btn" data-action="sub-delete" data-sub-id="${escapeHTML(sub.id)}" aria-label="Delete subtask">✕</button>
                  </div>
                `).join("")}
              </div>
              <div class="add_subtask_row">
                <input type="text" class="subtask_input" data-key-action="sub-add" data-task-id="${escapeHTML(String(task.id))}" placeholder="+ Add step, press Enter..." aria-label="Add subtask">
              </div>
            </div>
            <div class="task_ai_drawer_slot"></div>
            <div class="card_control_buttons">
              <button type="button" class="action_btn edit_btn" data-action="edit">Edit</button>
              ${!task.completed ? `
                <button type="button" class="action_btn ai_breakdown_btn" data-action="ai-breakdown">Breakdown</button>
                <button type="button" class="action_btn play_btn" data-action="focus">Focus</button>
                <button type="button" class="action_btn later_btn" data-action="toggle-later">${task.isLater ? "Move to Today" : "Backlog"}</button>
              ` : ""}
              <button type="button" class="action_btn delete_btn_manual" data-action="delete">Delete</button>
            </div>
          </div>
        `
        : "";

      card.innerHTML = `
        <div class="card_swipe_bg left_bg" aria-hidden="true"><span>${task.completed ? "Restore" : "Complete"}</span></div>
        <div class="card_swipe_bg right_bg" aria-hidden="true"><span>Delete</span></div>
        <div class="card_content">
          <div class="card_main_row">
            <button type="button" class="checkbox_btn" data-action="toggle" aria-label="Toggle complete for ${escapeHTML(task.title)}" aria-pressed="${Boolean(task.completed)}">
              <svg class="check_icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
            <div class="card_text">
              <div class="card_title_row">
                <h3 class="card_title">${escapeHTML(task.title)}</h3>
                ${task.recurring && task.recurring !== "none" ? `<span class="recurring_icon" title="Repeats ${escapeHTML(task.recurring)}">↻</span>` : ""}
              </div>
              <div class="card_meta_row">
                <span class="meta_item priority_badge priority-${priority}">${priLabel}</span>
                <span class="meta_item category_badge">${escapeHTML(task.category || "Inbox")}</span>
                ${statusBadge}
                ${urlBadge}
                <span class="meta_item duration_badge">${task.estimatedDuration || 25}m</span>
                ${hasSub ? `<span class="meta_item subtask_ratio">${doneSub}/${subtasks.length}</span>` : ""}
              </div>
            </div>
            <button type="button" class="quick_delete_task_btn" data-action="delete" title="Delete task" aria-label="Delete ${escapeHTML(task.title)}">✕</button>
          </div>
          ${expandedHTML}
        </div>
      `;

      return card;
    }

    handleVirtualAction(e, key, action, actionEl, item) {
      if (!item) return;

      if (action === "toggle-group" && item.__type === "groupHeader") {
        const targetSet = item.groupKind === "completed" ? this.collapsedCompletedDates : this.collapsedPriorityGroups;
        if (targetSet.has(item.id)) targetSet.delete(item.id);
        else targetSet.add(item.id);
        if (this.store.currentView === "today") this.renderTodayTaskList();
        else this.renderPlanPipelineUI({ skipCompletedFetch: true });
        return;
      }

      if (item.__type === "groupHeader") return;
      const task = this.store.getTaskById(item.id) || item;

      if (action === "toggle") {
        e.stopPropagation();
        const card = target.closest(".task_card");
        if (card && !task.completed) {
          card.classList.add("completed_transition");
          const chk = card.querySelector(".checkbox_btn");
          if (chk) {
            chk.setAttribute("aria-pressed", "true");
            this.triggerElementCelebration(chk);
          }
          setTimeout(() => {
            this.store.toggleTaskComplete(task.id);
          }, 350);
        } else {
          this.store.toggleTaskComplete(task.id);
        }
      } else if (action === "delete") {
        e.stopPropagation();
        this.store.deleteTask(task.id);
      } else if (action === "edit") {
        e.stopPropagation();
        this.openBottomSheet(task);
      } else if (action === "focus") {
        e.stopPropagation();
        this.store.setView("focus");
        this.store.startTimer(task.id);
      } else if (action === "toggle-later") {
        e.stopPropagation();
        if (task.isLater) {
          this.store.updateTask(task.id, { isLater: false, dueDate: getLocalDateString() });
        } else {
          this.store.updateTask(task.id, { isLater: true });
        }
      } else if (action === "ai-breakdown") {
        e.stopPropagation();
        const card = actionEl.closest(".task_card");
        if (card) this.openAIBreakdownDrawer(task, card);
      } else if (action === "sub-toggle") {
        e.stopPropagation();
        const subId = actionEl.getAttribute("data-sub-id");
        if (subId) this.store.toggleSubtask(task.id, subId);
      } else if (action === "sub-delete") {
        e.stopPropagation();
        const subId = actionEl.getAttribute("data-sub-id");
        if (subId) this.store.deleteSubtask(task.id, subId);
      } else if (action === "sub-add") {
        if (isIMEComposing(e)) return;
        e.preventDefault();
        const val = (actionEl.value || "").trim();
        if (val) {
          this.store.addSubtask(task.id, val);
          actionEl.value = "";
        }
      } else if (action === "card-click") {
        const vlist = this.getActiveVirtualList();
        if (vlist) {
          vlist.setExpanded(key, !vlist.isExpanded(key));
        }
      }
    }

    handleVirtualSwipe(key, direction, item) {
      if (!item || item.__type === "groupHeader") return;
      if (direction === "right") {
        this.store.toggleTaskComplete(item.id);
      } else if (direction === "left") {
        this.store.deleteTask(item.id);
      }
    }

    // -----------------------------------------------------------------------
    // 2. PLAN VIEW (Pipeline + Circadian Routine)
    // -----------------------------------------------------------------------
    renderPlanView() {
      this.updatePlanSubNavUI();
      this.syncFilterInputsUI();

      if (this.planPipelineView) {
        this.planPipelineView.hidden = this.store.planMode !== "pipeline";
      }
      if (this.planRoutineView) {
        this.planRoutineView.hidden = this.store.planMode !== "routine";
      }

      if (this.store.planMode === "routine") {
        this.renderRoutineUI();
      } else {
        this.renderPlanPipelineUI();
      }
    }

    updatePlanSubNavUI() {
      const modeTabs = document.getElementById("plan_mode_tabs");
      if (modeTabs) {
        modeTabs.querySelectorAll("button[data-plan-mode]").forEach((btn) => {
          const active = btn.getAttribute("data-plan-mode") === this.store.planMode;
          btn.classList.toggle("active", active);
          btn.setAttribute("aria-selected", String(active));
        });
      }

      const filterBar = document.getElementById("plan_filter_bar");
      if (filterBar) {
        filterBar.querySelectorAll("button[data-plan-filter]").forEach((btn) => {
          const active = btn.getAttribute("data-plan-filter") === this.store.planFilter;
          btn.classList.toggle("active", active);
          btn.setAttribute("aria-pressed", String(active));
        });
      }
    }

    async renderPlanPipelineUI(opts = {}) {
      const filter = this.store.planFilter || "all";

      if (filter === "completed") {
        const page = opts.skipCompletedFetch && this.store.completedPageCache.loaded
          ? this.store.completedPageCache
          : await this.store.loadCompletedPage({ reset: true, limit: 50 });

        if (this.viewCount) this.viewCount.textContent = `(${page.total})`;
        if (this.planLoadMoreBtn) {
          this.planLoadMoreBtn.hidden = !page.hasMore;
          this.planLoadMoreBtn.disabled = false;
          this.planLoadMoreBtn.textContent = `Load more (${page.items.length} of ${page.total})`;
        }

        const virtualItems = this.buildCompletedVirtualItems(page.items);
        this._mountVirtualListData(
          this.planVirtualList,
          this.planEmptyState,
          virtualItems,
          page.items.length === 0 ? this.getEmptyStateHTML("completed") : ""
        );
        return;
      }

      if (this.planLoadMoreBtn) this.planLoadMoreBtn.hidden = true;
      const filtered = this.getFilteredActiveTasks(filter);
      if (this.viewCount) this.viewCount.textContent = `(${filtered.length})`;

      const virtualItems = this.buildPriorityVirtualItems(filtered);
      this._mountVirtualListData(
        this.planVirtualList,
        this.planEmptyState,
        virtualItems,
        filtered.length === 0 ? this.getEmptyStateHTML(filter) : ""
      );
    }

    // -----------------------------------------------------------------------
    // 2B. CIRCADIAN ROUTINE PLANNER (Delegated, #routine_icon Fixed)
    // -----------------------------------------------------------------------
    renderRoutineUI() {
      const wrapper = document.getElementById("routine_timetable_scroller");
      if (!wrapper) return;

      document.querySelectorAll("#routine_day_tabs_bar .routine_day_tab").forEach((t) => {
        t.classList.toggle("active", t.getAttribute("data-day") === this.selectedRoutineDay);
      });
      document.querySelectorAll("#routine_layout_pills .pill_btn").forEach((p) => {
        p.classList.toggle("active", p.getAttribute("data-layout") === this.routineLayoutMode);
      });

      const [wakeH] = (this.store.routinePrefs.wakeUpTime || "06:00").split(":").map(Number);
      const [sleepH] = (this.store.routinePrefs.sleepTime || "23:00").split(":").map(Number);
      const now = new Date();
      const currentHour = now.getHours();
      const currentMin = currentHour * 60 + now.getMinutes();
      const currentDayLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()];

      const dayRoutines = this.store.routines
        .filter((r) => Array.isArray(r.days) && r.days.includes(this.selectedRoutineDay))
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      if (this.routineLayoutMode === "timeline") {
        if (dayRoutines.length === 0) {
          wrapper.innerHTML = `<div class="agenda_empty_card"><p>No blocks scheduled for ${escapeHTML(this.selectedRoutineDay)}.</p></div>`;
          return;
        }
        const isToday = this.selectedRoutineDay === currentDayLabel;
        wrapper.innerHTML = `<div class="timeline_agenda_wrapper">${dayRoutines.map((rout) => {
          const [sH, sM] = rout.startTime.split(":").map(Number);
          const [eH, eM] = rout.endTime.split(":").map(Number);
          const sMin = sH * 60 + sM;
          const eMin = eH * 60 + eM;
          const durationMin = Math.max(0, eMin - sMin);
          let activeHtml = "";
          let activeClass = "";
          if (isToday && currentMin >= sMin && currentMin <= eMin && durationMin > 0) {
            activeClass = "active_now_item";
            const pct = Math.min(100, Math.round(((currentMin - sMin) / durationMin) * 100));
            activeHtml = `
              <div class="agenda_progress_wrapper">
                <div class="agenda_progress_labels"><span>Active Now · ${pct}%</span><span>${eMin - currentMin}m left</span></div>
                <div class="agenda_progress_track"><div class="agenda_progress_bar bg-${escapeHTML(rout.color)}" style="width:${pct}%"></div></div>
              </div>
            `;
          }
          return `
            <div class="agenda_timeline_item ${activeClass}" data-id="${escapeHTML(rout.id)}">
              <div class="agenda_timeline_header">
                <div class="agenda_block_title_area">
                  <span class="agenda_block_indicator bg-${escapeHTML(rout.color || "indigo")}"></span>
                  <h4>${rout.icon ? `${escapeHTML(rout.icon)} ` : ""}${escapeHTML(rout.title)}</h4>
                </div>
                <div class="agenda_block_actions">
                  <button type="button" class="agenda_block_btn edit" data-action="edit-routine" data-id="${escapeHTML(rout.id)}">Edit</button>
                  <button type="button" class="agenda_block_btn delete" data-action="delete-routine" data-id="${escapeHTML(rout.id)}" aria-label="Delete block">✕</button>
                </div>
              </div>
              <div class="agenda_timeline_meta">
                <span class="agenda_time_badge">${escapeHTML(rout.startTime)} – ${escapeHTML(rout.endTime)}</span>
                <span class="agenda_category_badge">${escapeHTML(rout.category || "Routine")}</span>
                <span class="agenda_duration_badge">${durationMin}m</span>
              </div>
              ${activeHtml}
            </div>
          `;
        }).join("")}</div>`;
      } else {
        const hours = [];
        if (wakeH <= sleepH) {
          for (let h = wakeH; h <= sleepH; h++) hours.push(h);
        } else {
          for (let h = wakeH; h < 24; h++) hours.push(h);
          for (let h = 0; h <= sleepH; h++) hours.push(h);
        }

        const rows = hours.map((h) => {
          const formatted = `${String(h).padStart(2, "0")}:00`;
          const isCurrent = h === currentHour && this.selectedRoutineDay === currentDayLabel;
          const matches = dayRoutines.filter((r) => parseInt(r.startTime.split(":")[0], 10) === h);
          if (matches.length === 0) {
            return `<tr class="routine_table_row ${isCurrent ? "active_hour" : ""}"><td class="routine_time_col">${formatted}</td><td class="routine_block_col empty_block" colspan="4">Free</td></tr>`;
          }
          return matches.map((rout, idx) => {
            const [sH, sM] = rout.startTime.split(":").map(Number);
            const [eH, eM] = rout.endTime.split(":").map(Number);
            const durationMin = Math.max(0, (eH * 60 + eM) - (sH * 60 + sM));
            return `
              <tr class="routine_table_row ${isCurrent ? "active_hour" : ""}" data-id="${escapeHTML(rout.id)}">
                ${idx === 0 ? `<td class="routine_time_col" rowspan="${matches.length}">${formatted}</td>` : ""}
                <td class="routine_block_col">
                  <span class="routine_block_indicator bg-${escapeHTML(rout.color || "indigo")}"></span>
                  <div class="routine_block_details">
                    <span class="routine_block_title">${rout.icon ? `${escapeHTML(rout.icon)} ` : ""}${escapeHTML(rout.title)}</span>
                    <span class="routine_block_time_span">${escapeHTML(rout.startTime)} – ${escapeHTML(rout.endTime)}</span>
                  </div>
                </td>
                <td class="routine_category_col"><span class="category_badge">${escapeHTML(rout.category || "Routine")}</span></td>
                <td class="routine_duration_col">${durationMin}m</td>
                <td class="routine_action_col"><button type="button" class="routine_block_delete_btn" data-action="delete-routine" data-id="${escapeHTML(rout.id)}" aria-label="Delete block">✕</button></td>
              </tr>
            `;
          }).join("");
        }).join("");

        wrapper.innerHTML = `
          <div class="routine_table_responsive_wrapper">
            <table class="routine_table">
              <thead><tr><th>Hour</th><th>Block</th><th>Tag</th><th>Dur</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
      }
    }

    // -----------------------------------------------------------------------
    // 3. HABITS & CONSISTENCY (Responsive Cards + Delegated Matrix + History)
    // -----------------------------------------------------------------------
    renderHabitsView() {
      const modeTabs = document.getElementById("habits_mode_tabs");
      if (modeTabs) {
        modeTabs.querySelectorAll("button[data-habits-mode]").forEach((btn) => {
          const active = btn.getAttribute("data-habits-mode") === this.store.habitsMode;
          btn.classList.toggle("active", active);
          btn.setAttribute("aria-selected", String(active));
        });
      }
      if (this.habitsTrackerView) this.habitsTrackerView.hidden = this.store.habitsMode !== "tracker";
      if (this.habitsHistoryView) this.habitsHistoryView.hidden = this.store.habitsMode !== "history";

      if (this.store.habitsMode === "history") {
        this.renderConsistencyHistoryUI();
      } else {
        this.renderConsistencyUI();
      }
    }

    bindConsistencyInteractions() {
      const bindOnce = (id, fn) => {
        const el = document.getElementById(id);
        if (el && !el.dataset.bound) {
          el.dataset.bound = "true";
          el.addEventListener("click", fn);
        }
      };

      bindOnce("btn_habit_prev_week", () => { this.habitWeekOffset -= 1; this.renderConsistencyUI(); });
      bindOnce("btn_habit_this_week", () => { this.habitWeekOffset = 0; this.renderConsistencyUI(); });
      bindOnce("btn_habit_next_week", () => { this.habitWeekOffset += 1; this.renderConsistencyUI(); });
      bindOnce("btn_heatmap_prev_month", () => { this.habitHeatmapMonthOffset -= 1; this.renderMonthlyHeatmapSVG(); });
      bindOnce("btn_heatmap_this_month", () => { this.habitHeatmapMonthOffset = 0; this.renderMonthlyHeatmapSVG(); });
      bindOnce("btn_heatmap_next_month", () => { this.habitHeatmapMonthOffset += 1; this.renderMonthlyHeatmapSVG(); });
      bindOnce("btn_consistency_add_habit", () => this.openHabitSheet());
      bindOnce("btn_ai_analyze_habits", () => this.analyzeHabitsWithAI());

      const advisoryCard = document.getElementById("habit_ai_advisory_card");
      bindOnce("btn_dismiss_ai_advisory", () => {
        if (advisoryCard) advisoryCard.hidden = true;
        this.pendingUnhealthyHabit = null;
      });
      bindOnce("btn_ai_keep_habit", () => {
        if (advisoryCard) advisoryCard.hidden = true;
        this.pendingUnhealthyHabit = null;
      });
      bindOnce("btn_ai_adopt_alternative", () => {
        if (!this.pendingUnhealthyHabit) return;
        const { id, alternativeTitle, category } = this.pendingUnhealthyHabit;
        this.store.updateHabit(id, { title: alternativeTitle, category: category || "Health", color: "emerald" });
        if (advisoryCard) advisoryCard.hidden = true;
        this.pendingUnhealthyHabit = null;
      });

      const quickForm = document.getElementById("habit_quick_add_form");
      if (quickForm && !quickForm.dataset.bound) {
        quickForm.dataset.bound = "true";
        quickForm.addEventListener("submit", (e) => {
          e.preventDefault();
          const input = document.getElementById("habit_quick_input");
          const catSel = document.getElementById("habit_quick_cat");
          const title = input ? input.value.trim() : "";
          if (!title) return;
          const created = this.store.addHabit(title, catSel ? catSel.value : "Routine", "indigo");
          if (input) input.value = "";
          if (created) this.evaluateHabitWithAI(title, created.id);
        });
      }

      document.querySelectorAll(".habit_preset_chip").forEach((chip) => {
        if (chip.dataset.bound) return;
        chip.dataset.bound = "true";
        chip.addEventListener("click", () => {
          const title = chip.dataset.title;
          if (!title) return;
          const created = this.store.addHabit(title, chip.dataset.cat || "Routine", chip.dataset.color || "indigo");
          if (created) this.evaluateHabitWithAI(title, created.id);
        });
      });

      document.querySelectorAll(".ai_prompt_chip").forEach((chip) => {
        if (chip.dataset.bound) return;
        chip.dataset.bound = "true";
        chip.addEventListener("click", () => this.analyzeHabitsWithAI(chip.dataset.prompt));
      });

      // Single delegated listener for BOTH #habit_matrix_tbody and #habit_cards_list
      const handleHabitContainerClick = async (e) => {
        const toggleBtn = e.target.closest("[data-action='habit-toggle']");
        if (toggleBtn && !toggleBtn.disabled) {
          this.store.toggleHabitCompletion(toggleBtn.getAttribute("data-id"), toggleBtn.getAttribute("data-date"));
          return;
        }
        const editBtn = e.target.closest("[data-action='habit-edit']");
        if (editBtn) {
          const h = this.store.habitMap.get(String(editBtn.getAttribute("data-id")));
          if (h) this.openHabitSheet(h);
          return;
        }
        const delBtn = e.target.closest("[data-action='habit-delete']");
        if (delBtn) {
          const id = delBtn.getAttribute("data-id");
          const h = this.store.habitMap.get(String(id));
          const ok = await this.showConfirmDialog({
            title: "Delete Habit",
            message: `Permanently delete "${h ? h.title : "this habit"}" and its streak history?`,
            okLabel: "Delete",
            danger: true
          });
          if (ok) this.store.deleteHabit(id);
        }
      };

      const matrixBody = document.getElementById("habit_matrix_tbody");
      if (matrixBody && !matrixBody.dataset.bound) {
        matrixBody.dataset.bound = "true";
        matrixBody.addEventListener("click", handleHabitContainerClick);
      }
      const cardsList = document.getElementById("habit_cards_list");
      if (cardsList && !cardsList.dataset.bound) {
        cardsList.dataset.bound = "true";
        cardsList.addEventListener("click", handleHabitContainerClick);
      }
    }

    renderConsistencyUI() {
      const matrixBox = document.getElementById("habit_matrix_tbody");
      const cardsBox = document.getElementById("habit_cards_list");
      if (!matrixBox && !cardsBox) return;

      const today = new Date();
      const todayISO = getLocalDateString(today);
      const dow = today.getDay();
      const diffToMon = dow === 0 ? -6 : 1 - dow;
      const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMon + this.habitWeekOffset * 7);

      const weekdaysShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const weekdays = [];

      for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + i);
        const iso = getLocalDateString(d);
        weekdays.push({
          iso,
          dayName: weekdaysShort[i],
          dateNum: d.getDate(),
          monthShort: monthsShort[d.getMonth()],
          year: d.getFullYear(),
          isToday: iso === todayISO,
          isFuture: iso > todayISO
        });
      }

      const weekBadge = document.getElementById("habit_week_range_badge");
      if (weekBadge) {
        const s = weekdays[0];
        const e = weekdays[6];
        weekBadge.textContent = `${s.monthShort} ${s.dateNum} – ${e.monthShort} ${e.dateNum}, ${e.year}`;
      }

      const theadRow = document.getElementById("habit_matrix_thead_row");
      if (theadRow) {
        theadRow.innerHTML = `<th>Habit</th>` + weekdays.map((w) => `
          <th class="${w.isToday ? "active_today" : ""}">
            <div class="matrix_th_content">
              <span class="matrix_th_day">${w.dayName}</span>
              <span class="matrix_th_date">${w.dateNum}</span>
            </div>
          </th>
        `).join("");
      }

      // Motivation metrics (single pass)
      const habits = this.store.habits;
      const past7 = [];
      for (let j = 0; j < 7; j++) past7.push(getNDaysFromNow(-j));

      let completedToday = 0;
      let weeklyCompletions = 0;
      let maxStreak = 0;

      for (let i = 0; i < habits.length; i++) {
        const h = habits[i];
        const hist = h.history || {};
        if (hist[todayISO] === true) completedToday += 1;
        if ((h.streak || 0) > maxStreak) maxStreak = h.streak || 0;
        for (let j = 0; j < 7; j++) {
          if (hist[past7[j]] === true) weeklyCompletions += 1;
        }
      }

      const todayPct = habits.length > 0 ? Math.round((completedToday / habits.length) * 100) : 0;
      const weeklyPct = habits.length > 0 ? Math.round((weeklyCompletions / (habits.length * 7)) * 100) : 0;

      const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
      setTxt("habit_today_score", `${completedToday} / ${habits.length}`);
      setTxt("habit_today_pct", `${todayPct}%`);
      setTxt("habit_weekly_rate", `${weeklyPct}%`);
      setTxt("habit_top_streak", `${maxStreak}d`);
      const bar = document.getElementById("habit_today_progress_bar");
      if (bar) bar.style.width = `${todayPct}%`;

      const quoteEl = document.getElementById("habit_motivation_quote");
      if (quoteEl) {
        if (habits.length === 0) quoteEl.textContent = "Add your first habit below to start compounding daily consistency.";
        else if (todayPct === 100) quoteEl.textContent = "100% alignment today. Your consistency flywheel is locked in.";
        else if (completedToday > 0) quoteEl.textContent = `${completedToday} checked, ${habits.length - completedToday} left today.`;
        else quoteEl.textContent = "Check off 1 small ritual to ignite today's streak.";
      }

      if (habits.length === 0) {
        if (matrixBox) matrixBox.innerHTML = `<tr><td colspan="8" class="empty_table_cell">No habits tracked yet.</td></tr>`;
        if (cardsBox) cardsBox.innerHTML = `<div class="empty_state_text">No habits tracked yet. Add one above or pick a preset.</div>`;
      } else {
        if (matrixBox) {
          matrixBox.innerHTML = habits.map((habit) => {
            const cells = weekdays.map((w) => {
              const done = Boolean(habit.history && habit.history[w.iso] === true);
              return `
                <td class="${w.isToday ? "active_today" : ""}">
                  <button type="button"
                    class="habit_matrix_check_pill bg-${escapeHTML(habit.color || "indigo")} ${done ? "completed" : ""} ${w.isFuture ? "future_pill" : ""}"
                    id="habit_checkbox_${escapeHTML(habit.id)}_${w.iso}"
                    data-action="habit-toggle" data-id="${escapeHTML(habit.id)}" data-date="${w.iso}"
                    ${w.isFuture ? "disabled" : ""}
                    aria-label="Toggle ${escapeHTML(habit.title)} on ${w.dayName} ${w.dateNum}">
                    ${done ? "✓" : (w.isFuture ? "–" : "•")}
                  </button>
                </td>
              `;
            }).join("");

            return `
              <tr>
                <td class="habit_row_title_cell">
                  <div class="habit_row_title">
                    <span class="habit_tag_indicator bg-${escapeHTML(habit.color || "indigo")}"></span>
                    <div class="habit_row_meta_col">
                      <div class="habit_row_top">
                        <h4>${escapeHTML(habit.title)}</h4>
                        <div class="habit_row_actions">
                          <button type="button" class="habit_edit_btn" data-action="habit-edit" data-id="${escapeHTML(habit.id)}">Edit</button>
                          <button type="button" class="habit_delete_btn" data-action="habit-delete" data-id="${escapeHTML(habit.id)}" aria-label="Delete habit">✕</button>
                        </div>
                      </div>
                      <p>${habit.streak || 0}d streak (best ${habit.maxStreak || 0}d) · ${escapeHTML(habit.category || "Routine")}</p>
                    </div>
                  </div>
                </td>
                ${cells}
              </tr>
            `;
          }).join("");
        }

        if (cardsBox) {
          cardsBox.innerHTML = habits.map((habit) => {
            const dayPills = weekdays.map((w) => {
              const done = Boolean(habit.history && habit.history[w.iso] === true);
              return `
                <button type="button"
                  class="habit_day_dot ${done ? "completed" : ""} ${w.isToday ? "today" : ""}"
                  data-action="habit-toggle" data-id="${escapeHTML(habit.id)}" data-date="${w.iso}"
                  ${w.isFuture ? "disabled" : ""}
                  aria-label="${escapeHTML(habit.title)} ${w.dayName} ${w.dateNum}"
                  aria-pressed="${done}">
                  <span>${w.dayName[0]}</span>
                </button>
              `;
            }).join("");

            return `
              <div class="habit_mobile_card border-${escapeHTML(habit.color || "indigo")}">
                <div class="habit_mobile_header">
                  <div>
                    <h4>${escapeHTML(habit.title)}</h4>
                    <span class="habit_mobile_meta">${habit.streak || 0}d streak · Best ${habit.maxStreak || 0}d · ${escapeHTML(habit.category || "Routine")}</span>
                  </div>
                  <div class="habit_row_actions">
                    <button type="button" class="habit_edit_btn" data-action="habit-edit" data-id="${escapeHTML(habit.id)}">Edit</button>
                    <button type="button" class="habit_delete_btn" data-action="habit-delete" data-id="${escapeHTML(habit.id)}" aria-label="Delete">✕</button>
                  </div>
                </div>
                <div class="habit_mobile_days">${dayPills}</div>
              </div>
            `;
          }).join("");
        }
      }

      this.renderMonthlyHeatmapSVG();
    }

    renderMonthlyHeatmapSVG() {
      const container = document.getElementById("chart_heatmap_grid");
      if (!container) return;

      const today = new Date();
      const todayISO = getLocalDateString(today);
      const target = new Date(today.getFullYear(), today.getMonth() + this.habitHeatmapMonthOffset, 1);
      const year = target.getFullYear();
      const month = target.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthNames = ["January", "February", "March", "April", "May", "Jun", "July", "August", "September", "October", "November", "December"];
      const badge = document.getElementById("heatmap_month_badge");
      if (badge) badge.textContent = `${monthNames[month]} ${year}`;

      const habitCount = this.store.habits.length;
      const firstDow = new Date(year, month, 1).getDay();
      const leading = firstDow === 0 ? 6 : firstDow - 1;

      const headerHtml = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => `<div class="cal_th">${d}</div>`).join("");
      const emptyHtml = `<div class="cal_cell empty"></div>`.repeat(leading);

      let cellsHtml = "";
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        let done = 0;
        for (let i = 0; i < habitCount; i++) {
          if (this.store.habits[i].history && this.store.habits[i].history[dateStr] === true) done += 1;
        }
        let density = 0;
        if (habitCount > 0 && done > 0) {
          const pct = done / habitCount;
          density = pct >= 0.75 ? 3 : pct >= 0.4 ? 2 : 1;
        }
        const isToday = dateStr === todayISO;
        cellsHtml += `<div class="cal_cell density-${density} ${isToday ? "active_today" : ""}" title="${dateStr}: ${done}/${habitCount}"><span class="cal_day_num">${day}</span></div>`;
      }

      container.innerHTML = `<div class="cal_heatmap_grid">${headerHtml}${emptyHtml}${cellsHtml}</div>`;
    }

    renderConsistencyHistoryUI() {
      const habits = this.store.habits;
      const past30 = [];
      for (let i = 0; i < 30; i++) past30.push(getNDaysFromNow(-i));

      let totalStreak = 0;
      let totalCompletions = 0;
      let actual30 = 0;
      const perHabit30 = new Map();

      for (let i = 0; i < habits.length; i++) {
        const h = habits[i];
        totalStreak += h.streak || 0;
        const hist = h.history || {};
        const keys = Object.keys(hist);
        for (let k = 0; k < keys.length; k++) {
          if (hist[keys[k]] === true) totalCompletions += 1;
        }
        let c30 = 0;
        for (let j = 0; j < 30; j++) {
          if (hist[past30[j]] === true) c30 += 1;
        }
        perHabit30.set(h.id, c30);
        actual30 += c30;
      }

      const avgStreak = habits.length > 0 ? Math.round(totalStreak / habits.length) : 0;
      const overallRate = habits.length > 0 ? Math.round((actual30 / (habits.length * 30)) * 100) : 0;

      const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      setTxt("history_active_habits_count", String(habits.length));
      setTxt("history_avg_streak", `${avgStreak}d`);
      setTxt("history_total_completions", String(totalCompletions));
      setTxt("history_overall_rate", `${overallRate}%`);

      const streaksBox = document.getElementById("history_streaks_container");
      if (streaksBox) {
        if (habits.length === 0) {
          streaksBox.innerHTML = `<div class="empty_state_text">No habits tracked yet.</div>`;
        } else {
          streaksBox.innerHTML = habits.map((h) => {
            const pct = Math.round(((perHabit30.get(h.id) || 0) / 30) * 100);
            return `
              <div class="history_streak_item">
                <div class="habit_info_row">
                  <span class="habit_dot bg-${escapeHTML(h.color || "indigo")}"></span>
                  <div class="habit_title_meta">
                    <h4>${escapeHTML(h.title)}</h4>
                    <span class="category_label">${escapeHTML(h.category || "Routine")}</span>
                  </div>
                </div>
                <div class="streak_pills_progress">
                  <div class="streak_stat"><span class="label">Current</span><span class="val">${h.streak || 0}d</span></div>
                  <div class="streak_stat"><span class="label">Best</span><span class="val">${h.maxStreak || 0}d</span></div>
                  <div class="streak_stat"><span class="label">30d</span><span class="val">${pct}%</span></div>
                </div>
              </div>
            `;
          }).join("");
        }
      }

      this.renderWeeklyConsistencyTrendChart();
      this.renderCategoryConsistencyChart();
      this.renderChronologicalLogTimeline();
    }

    renderWeeklyConsistencyTrendChart() {
      const wrapper = document.getElementById("chart_weekly_consistency_trend");
      if (!wrapper) return;
      const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const days = [];
      const counts = [];
      for (let i = 6; i >= 0; i--) {
        const ds = getNDaysFromNow(-i);
        days.push(ds);
        let c = 0;
        for (let h = 0; h < this.store.habits.length; h++) {
          if (this.store.habits[h].history && this.store.habits[h].history[ds] === true) c += 1;
        }
        counts.push(c);
      }
      const maxCount = Math.max(...counts, 4);
      const labels = days.map((ds) => weekdayLabels[parseLocalDate(ds).getDay()]);
      const chartWidth = 160;
      const chartHeight = 90;
      const xStart = 35;
      const yStart = 20;
      const stepX = chartWidth / 6;

      const pts = counts.map((c, idx) => ({
        x: xStart + idx * stepX,
        y: yStart + chartHeight - (c / maxCount) * chartHeight,
        value: c
      }));

      wrapper.innerHTML = `
        <svg viewBox="0 0 210 130" width="100%" height="100%">
          ${[0, 0.5, 1].map((pct) => {
            const y = yStart + chartHeight - pct * chartHeight;
            return `<line x1="${xStart}" y1="${y}" x2="${xStart + chartWidth}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="2,2" stroke-width="0.5"/><text x="${xStart - 6}" y="${y + 3}" fill="var(--text-muted)" font-size="8" text-anchor="end">${Math.round(pct * maxCount)}</text>`;
          }).join("")}
          <polyline fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${pts.map((p) => `${p.x},${p.y}`).join(" ")}"/>
          ${pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--accent-primary)"/><text x="${p.x}" y="${p.y - 6}" fill="var(--text-primary)" font-size="8" text-anchor="middle">${p.value}</text>`).join("")}
          ${labels.map((lbl, idx) => `<text x="${xStart + idx * stepX}" y="${yStart + chartHeight + 14}" fill="var(--text-secondary)" font-size="8" text-anchor="middle">${lbl}</text>`).join("")}
        </svg>
      `;
    }

    renderCategoryConsistencyChart() {
      const wrapper = document.getElementById("chart_category_consistency");
      if (!wrapper) return;
      const categories = ["Routine", "Mind", "Health", "Skill", "Work"];
      const countsMap = { Routine: 0, Mind: 0, Health: 0, Skill: 0, Work: 0 };
      this.store.habits.forEach((h) => {
        if (countsMap[h.category] !== undefined && h.history) {
          Object.values(h.history).forEach((v) => { if (v === true) countsMap[h.category] += 1; });
        }
      });
      const counts = categories.map((c) => countsMap[c]);
      const maxVal = Math.max(...counts, 4);
      const colors = { Routine: "#f59e0b", Mind: "#10b981", Health: "#f43f5e", Skill: "#a855f7", Work: "#6366f1" };

      wrapper.innerHTML = `
        <svg viewBox="0 0 210 130" width="100%" height="100%">
          ${categories.map((cat, idx) => {
            const y = 15 + idx * 18;
            const w = Math.max((counts[idx] / maxVal) * 120, 2);
            return `<text x="42" y="${y + 8}" fill="var(--text-secondary)" font-size="8" text-anchor="end">${cat}</text><rect x="50" y="${y}" width="${w}" height="10" rx="2" fill="${colors[cat]}"/><text x="${56 + w}" y="${y + 8}" fill="var(--text-primary)" font-size="8">${counts[idx]}</text>`;
          }).join("")}
        </svg>
      `;
    }

    renderChronologicalLogTimeline() {
      const container = document.getElementById("history_chronological_log");
      if (!container) return;
      let html = "";
      for (let i = 0; i < 7; i++) {
        const dateStr = getNDaysFromNow(-i);
        const done = this.store.habits.filter((h) => h.history && h.history[dateStr] === true);
        const formatted = parseLocalDate(dateStr).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
        html += `
          <div class="history_log_day_row">
            <div class="history_log_date">${escapeHTML(formatted)}</div>
            <div class="history_log_completions_list">
              ${done.length === 0 ? `<span class="empty_log_item">None logged</span>` : done.map((h) => `<span class="history_log_badge border-${escapeHTML(h.color || "indigo")}">${escapeHTML(h.title)}</span>`).join(" ")}
            </div>
          </div>
        `;
      }
      container.innerHTML = html;
    }

    // -----------------------------------------------------------------------
    // 4. FOCUS TIMER & DOCKED MINI-TIMER BAR
    // -----------------------------------------------------------------------
    renderMiniTimerBar(t) {
      if (!this.miniTimerBar) return;
      const shouldShow =
        this.store.currentView !== "focus" &&
        (t.isRunning || t.alarmActive || (t.duration > 0 && t.duration < t.totalDuration));

      this.miniTimerBar.hidden = !shouldShow;
      if (!shouldShow) return;

      const mins = Math.floor(Math.abs(t.duration) / 60);
      const secs = Math.abs(t.duration) % 60;
      const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

      if (this.miniTimerCountdown) this.miniTimerCountdown.textContent = formatted;
      if (this.miniTimerTaskTitle) {
        const linked = t.activeTaskId ? this.store.getTaskById(t.activeTaskId) : null;
        this.miniTimerTaskTitle.textContent = linked ? linked.title : (t.activeTaskTitle || (t.type === "pomodoro" ? "Deep Focus" : "Break"));
      }
      if (this.miniTimerToggleBtn) {
        this.miniTimerToggleBtn.textContent = t.isRunning ? "Pause" : "Resume";
        this.miniTimerToggleBtn.setAttribute("aria-label", t.isRunning ? "Pause focus timer" : "Resume focus timer");
      }
      if (this.miniTimerDot) {
        this.miniTimerDot.classList.toggle("running", Boolean(t.isRunning));
      }
    }

    renderTimerUI(t) {
      const detailsBox = document.getElementById("timer_task_details");
      if (detailsBox) {
        const task = t.activeTaskId ? this.store.getTaskById(t.activeTaskId) : null;
        if (task) {
          detailsBox.hidden = false;
          detailsBox.style.display = "block";
          detailsBox.innerHTML = `
            <div class="active_focus_task">
              <span class="focus_tag">${escapeHTML(task.category || "Inbox")}</span>
              <h3>${escapeHTML(task.title)}</h3>
              <p>${task.description ? escapeHTML(task.description) : "Focused session in progress"}</p>
            </div>
          `;
        } else {
          detailsBox.hidden = true;
          detailsBox.innerHTML = "";
        }
      }

      this.updateTimerCountdown(t);

      const subMsg = document.getElementById("timer_sub_msg");
      if (subMsg) {
        const labels = { pomodoro: "Deep Flow", shortBreak: "Short Break", longBreak: "Long Renewal", stopwatch: "Open Flow" };
        subMsg.textContent = labels[t.type] || "Ready";
      }

      const focusPanel = this.panels.focus;
      if (focusPanel) focusPanel.classList.toggle("ticking", Boolean(t.isRunning));

      const map = {
        timer_pomo_btn: "pomodoro",
        timer_short_btn: "shortBreak",
        timer_long_btn: "longBreak",
        timer_stopwatch_btn: "stopwatch"
      };
      Object.keys(map).forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.toggle("active", t.type === map[id]);
      });

      this.updateSessionCycle(t);

      const playBtn = document.getElementById("timer_play_btn");
      const pauseBtn = document.getElementById("timer_pause_btn");
      if (playBtn && pauseBtn) {
        playBtn.style.display = t.isRunning ? "none" : "flex";
        pauseBtn.style.display = t.isRunning ? "flex" : "none";
      }

      this.renderAlarmUI();
    }

    updateSessionCycle(t) {
      const count = t.completedSessions || 0;
      document.querySelectorAll("#timer_mini_cycle .mini_dot").forEach((dot, idx) => {
        dot.classList.toggle("completed", idx < count);
        dot.classList.toggle("active", idx === count && (t.type === "pomodoro" || t.type === "shortBreak"));
      });
      const counter = document.getElementById("cycle_counter_text");
      if (counter) {
        if (t.type === "pomodoro") counter.textContent = `Focus ${count + 1}/4`;
        else if (t.type === "shortBreak") counter.textContent = `Short Break · ${count} done`;
        else if (t.type === "longBreak") counter.textContent = "Long Break";
        else counter.textContent = "Open Flow";
      }
    }

    updateTimerCountdown(t) {
      const display = document.getElementById("timer_countdown_text");
      const mins = Math.floor(Math.abs(t.duration) / 60);
      const secs = Math.abs(t.duration) % 60;
      const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      if (display) display.textContent = formatted;
      document.title = t.isRunning ? `(${formatted}) Aurora` : "Aurora Companion";

      const focusPanel = this.panels.focus;
      if (focusPanel) {
        focusPanel.classList.toggle("urgent", Boolean(t.isRunning && t.type !== "stopwatch" && t.duration <= 60 && t.duration > 0));
      }

      const ring = document.getElementById("timer_ring_progress");
      if (ring) {
        if (!this._timerRingCirc) {
          const r = ring.r ? ring.r.baseVal.value : 125;
          this._timerRingCirc = 2 * Math.PI * (r || 125);
        }
        const circ = this._timerRingCirc;
        const pct = t.type === "stopwatch" ? 0 : (t.totalDuration > 0 ? Math.min(1, Math.max(0, t.duration / t.totalDuration)) : 1);
        ring.style.strokeDasharray = `${circ} ${circ}`;
        ring.style.strokeDashoffset = String(circ * (1 - pct));
      }
    }

    renderAlarmUI() {
      const card = document.getElementById("timer_alarm_dismiss");
      if (!card) return;
      if (this.store.isAlarmActive) {
        card.hidden = false;
        card.style.display = "flex";
        const desc = document.getElementById("alarm_dismiss_desc");
        const nextBtn = document.getElementById("timer_start_next_btn");
        const nextType = this.store.timer.type;
        if (desc) desc.textContent = nextType === "pomodoro" ? "Ready for the next focus block?" : "Great focus! Time for a break.";
        if (nextBtn) {
          nextBtn.style.display = "inline-flex";
          nextBtn.textContent = nextType === "pomodoro" ? "Start Focus" : "Start Break";
        }
      } else {
        card.hidden = true;
        card.style.display = "none";
      }
    }

    dismissTimerAlarm() {
      this.store.stopAlarm();
      this.renderAlarmUI();
    }

    toggleAlarmUI(active) {
      this.renderAlarmUI();
      if (this.store.currentView !== "focus" && active) {
        this.showToast("Focus session complete!", "success", {
          undoLabel: "Dismiss",
          onUndo: () => this.dismissTimerAlarm()
        });
      }
    }

    // -----------------------------------------------------------------------
    // 5. INSIGHTS VIEW (Distinct Containers, Lazy Completed Load, Local Dates)
    // -----------------------------------------------------------------------
    async renderInsightsUI() {
      const completed = await this.store.ensureAllCompletedLoaded();
      const pending = this.store.tasks.filter((t) => t.id !== "general_focus" && !t.completed);
      const total = completed.length + pending.length;
      const rate = total > 0 ? Math.round((completed.length / total) * 100) : 0;

      const todayStr = getLocalDateString();
      let completedToday = 0;
      for (let i = 0; i < completed.length; i++) {
        if (completed[i].completedDate && getLocalDateString(completed[i].completedDate) === todayStr) {
          completedToday += 1;
        }
      }

      const allForFocus = [...this.store.tasks, ...completed];
      let todayFocusMin = 0;
      let todaySessions = 0;
      const dailyFocusMap = {};
      const todayTaskFocus = [];

      for (let i = 0; i < allForFocus.length; i++) {
        const t = allForFocus[i];
        if (!Array.isArray(t.focusSessions) || t.focusSessions.length === 0) continue;
        let taskTodayMin = 0;
        let taskTodayCount = 0;
        for (let j = 0; j < t.focusSessions.length; j++) {
          const fs = t.focusSessions[j];
          if (!fs || !fs.startTime) continue;
          const ds = getLocalDateString(fs.startTime);
          const dur = Number(fs.duration) || 0;
          dailyFocusMap[ds] = (dailyFocusMap[ds] || 0) + dur;
          if (ds === todayStr) {
            todayFocusMin += dur;
            todaySessions += 1;
            taskTodayMin += dur;
            taskTodayCount += 1;
          }
        }
        if (taskTodayCount > 0) {
          todayTaskFocus.push({ title: t.title, sessions: taskTodayCount, minutes: taskTodayMin });
        }
      }

      const maxStreak = this.store.habits.reduce((m, h) => Math.max(m, h.streak || 0), 0);
      const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      setTxt("stat_completed_today", String(completedToday));
      setTxt("stat_weekly_completion_pct", `${rate}%`);
      setTxt("stat_total_focus_hours", `${(todayFocusMin / 60).toFixed(1)}h`);
      setTxt("stat_total_active_streak", `${maxStreak}d`);

      this.renderCompletionLineChart(completed);
      this.renderCategoryDonutChart(completed, pending);
      this.renderFocusTimeBarChart(dailyFocusMap);
      this.renderFocusSessionsTable(todayTaskFocus);
    }

    renderCompletionLineChart(completed) {
      const wrapper = document.getElementById("chart_weekly_productivity");
      if (!wrapper) return;
      const countsMap = {};
      for (let i = 0; i < completed.length; i++) {
        if (completed[i].completedDate) {
          const ds = getLocalDateString(completed[i].completedDate);
          countsMap[ds] = (countsMap[ds] || 0) + 1;
        }
      }
      const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const days = [];
      const counts = [];
      for (let i = 6; i >= 0; i--) {
        const ds = getNDaysFromNow(-i);
        days.push(ds);
        counts.push(countsMap[ds] || 0);
      }
      const maxCount = Math.max(...counts, 4);
      const labels = days.map((ds) => weekdayLabels[parseLocalDate(ds).getDay()]);
      const chartWidth = 440;
      const chartHeight = 130;
      const xStart = 40;
      const yStart = 20;
      const stepX = chartWidth / 6;

      const pts = counts.map((c, idx) => ({
        x: xStart + idx * stepX,
        y: yStart + chartHeight - (c / maxCount) * chartHeight,
        value: c
      }));

      wrapper.innerHTML = `
        <svg viewBox="0 0 500 200" width="100%" height="100%">
          ${[0, 0.5, 1].map((pct) => {
            const y = yStart + chartHeight - pct * chartHeight;
            return `<line x1="${xStart}" y1="${y}" x2="${xStart + chartWidth}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="3,3" stroke-width="0.6"/><text x="${xStart - 10}" y="${y + 4}" fill="var(--text-muted)" font-size="10" text-anchor="end">${Math.round(pct * maxCount)}</text>`;
          }).join("")}
          <polyline fill="none" stroke="var(--accent-primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${pts.map((p) => `${p.x},${p.y}`).join(" ")}"/>
          ${pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--accent-primary)"/><text x="${p.x}" y="${p.y - 8}" fill="var(--text-primary)" font-size="10" text-anchor="middle">${p.value}</text>`).join("")}
          ${labels.map((lbl, idx) => `<text x="${xStart + idx * stepX}" y="${yStart + chartHeight + 18}" fill="var(--text-secondary)" font-size="11" text-anchor="middle">${lbl}</text>`).join("")}
        </svg>
      `;
    }

    renderFocusTimeBarChart(dailyFocusMap) {
      const wrapper = document.getElementById("chart_focus_distribution");
      if (!wrapper) return;
      const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const days = [];
      const mins = [];
      for (let i = 6; i >= 0; i--) {
        const ds = getNDaysFromNow(-i);
        days.push(ds);
        mins.push(dailyFocusMap[ds] || 0);
      }
      const maxMins = Math.max(...mins, 50);
      const labels = days.map((ds) => weekdayLabels[parseLocalDate(ds).getDay()]);
      const chartWidth = 440;
      const chartHeight = 130;
      const xStart = 40;
      const yStart = 20;
      const stepX = chartWidth / 7;
      const barWidth = 24;

      wrapper.innerHTML = `
        <svg viewBox="0 0 500 200" width="100%" height="100%">
          <line x1="${xStart}" y1="${yStart + chartHeight}" x2="${xStart + chartWidth}" y2="${yStart + chartHeight}" stroke="var(--border-color)" stroke-width="1"/>
          ${mins.map((m, idx) => {
            const x = xStart + idx * stepX + (stepX - barWidth) / 2;
            const h = (m / maxMins) * chartHeight;
            const y = yStart + chartHeight - h;
            return `<rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(h, 2)}" rx="4" fill="var(--accent-primary)"/><text x="${x + barWidth / 2}" y="${y - 6}" fill="var(--text-primary)" font-size="10" text-anchor="middle">${m > 0 ? `${m}m` : ""}</text>`;
          }).join("")}
          ${labels.map((lbl, idx) => `<text x="${xStart + idx * stepX + stepX / 2}" y="${yStart + chartHeight + 18}" fill="var(--text-secondary)" font-size="11" text-anchor="middle">${lbl}</text>`).join("")}
        </svg>
      `;
    }

    renderFocusSessionsTable(todayTaskFocus) {
      const wrapper = document.getElementById("focus_sessions_table");
      if (!wrapper) return;
      if (!todayTaskFocus || todayTaskFocus.length === 0) {
        wrapper.innerHTML = `<div class="empty_state_text">No focus sessions logged today yet.</div>`;
        return;
      }
      const sorted = [...todayTaskFocus].sort((a, b) => b.minutes - a.minutes);
      wrapper.innerHTML = `
        <table class="insights_sessions_table">
          <thead><tr><th>Task</th><th>Sessions</th><th>Time</th></tr></thead>
          <tbody>
            ${sorted.map((row) => `
              <tr>
                <td>${escapeHTML(row.title)}</td>
                <td>${row.sessions}</td>
                <td>${row.minutes}m</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    }

    renderCategoryDonutChart(completed, pending) {
      const wrapper = document.getElementById("chart_category_breakdown");
      if (!wrapper) return;
      const map = {};
      const total = completed.length + pending.length;
      if (total === 0) {
        wrapper.innerHTML = `<div class="empty_state_text">No task data yet.</div>`;
        return;
      }
      completed.forEach((t) => { const c = t.category || "Inbox"; map[c] = (map[c] || 0) + 1; });
      pending.forEach((t) => { const c = t.category || "Inbox"; map[c] = (map[c] || 0) + 1; });

      const data = Object.keys(map).map((label) => ({ label, value: map[label] }));
      const radius = 60;
      const circ = 2 * Math.PI * radius;
      const colors = ["var(--accent-primary)", "var(--accent-secondary)", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];
      let acc = 0;

      const slices = data.map((item, idx) => {
        const pct = item.value / total;
        const dash = pct * circ;
        const offset = circ - acc * circ;
        acc += pct;
        return `<circle cx="100" cy="100" r="${radius}" fill="none" stroke="${colors[idx % colors.length]}" stroke-width="16" stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${offset}" transform="rotate(-90 100 100)"/>`;
      }).join("");

      const legend = data.map((item, idx) => `
        <div class="legend_item">
          <span class="legend_dot" style="background:${colors[idx % colors.length]}"></span>
          <span class="legend_label">${escapeHTML(item.label)}</span>
          <span class="legend_value">${item.value} (${Math.round((item.value / total) * 100)}%)</span>
        </div>
      `).join("");

      wrapper.innerHTML = `
        <div class="donut_layout_wrapper">
          <div class="donut_canvas">
            <svg viewBox="0 0 200 200" width="100%" height="100%">
              <circle cx="100" cy="100" r="${radius}" fill="none" stroke="var(--border-color)" stroke-width="18"/>
              ${slices}
              <text x="100" y="98" fill="var(--text-primary)" font-size="20" font-weight="700" text-anchor="middle">${total}</text>
              <text x="100" y="116" fill="var(--text-secondary)" font-size="11" text-anchor="middle">Tasks</text>
            </svg>
          </div>
          <div class="donut_legend">${legend}</div>
        </div>
      `;
    }

    // -----------------------------------------------------------------------
    // 6. REFLECTIVE JOURNAL (Persistent Editor DOM — Zero Focus Loss on Autosave!)
    // -----------------------------------------------------------------------
    clearJournalAutosaveTimer() {
      if (this.journalAutosaveTimeout) {
        clearTimeout(this.journalAutosaveTimeout);
        this.journalAutosaveTimeout = null;
      }
    }

    updateJournalDFButton() {
      const dfBtn = document.getElementById("btn_journal_df_toggle");
      if (dfBtn) {
        dfBtn.textContent = document.body.classList.contains("journal-distraction-free") ? "Exit Focus" : "Focus Mode";
      }
    }

    syncJournalInputsWithoutRebuild() {
      const entry = this.store.journal[this.selectedJournalDate] || {};
      const intentInput = document.getElementById("j_intent");
      const reflectionArea = document.getElementById("j_gratitude");
      const shutdownCb = document.getElementById("btn_j_shutdown_trigger");
      const reflectionVal = entry.eveningReflection || entry.reflection || "";
      if (intentInput && document.activeElement !== intentInput) intentInput.value = entry.morningIntention || "";
      if (reflectionArea && document.activeElement !== reflectionArea) reflectionArea.value = reflectionVal;
      if (shutdownCb) shutdownCb.checked = Boolean(entry.shutdownComplete);
    }

    renderJournalUI() {
      const wrapper = document.getElementById("journal_entries_container");
      if (!wrapper) return;
      this.clearJournalAutosaveTimer();

      const activeDate = this.selectedJournalDate;
      this.renderedJournalDate = activeDate;
      const entry = this.store.journal[activeDate] || {};
      const reflectionText = entry.eveningReflection || entry.reflection || "";
      const activeMood = entry.morningMood || entry.mood || "";

      const dates = [];
      for (let i = 0; i < 7; i++) dates.push(getNDaysFromNow(-i));
      if (!dates.includes(activeDate)) {
        dates.push(activeDate);
        dates.sort((a, b) => (a < b ? 1 : -1));
      }

      const todayStr = getLocalDateString();
      const yesterdayStr = getNDaysFromNow(-1);
      const formattedActive = parseLocalDate(activeDate).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });

      const navHtml = dates.map((dStr) => {
        const d = parseLocalDate(dStr);
        let label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        if (dStr === todayStr) label = "Today";
        else if (dStr === yesterdayStr) label = "Yesterday";
        const hasEntry = Boolean(this.store.journal[dStr] && (this.store.journal[dStr].morningIntention || this.store.journal[dStr].eveningReflection || this.store.journal[dStr].reflection));
        return `<button type="button" class="journal_nav_item ${dStr === activeDate ? "active" : ""} ${hasEntry ? "has_entry" : ""}" data-date="${dStr}"><span>${escapeHTML(label)}</span>${hasEntry ? `<span class="nav_entry_dot" aria-hidden="true">•</span>` : ""}</button>`;
      }).join("");

      wrapper.innerHTML = `
        <div class="journal_layout_split">
          <aside class="journal_sidebar_nav">
            <div class="journal_nav_list">${navHtml}</div>
            <div class="journal_date_picker_block">
              <label for="journal_date_picker" class="journal_nav_section_title">Jump to Date</label>
              <input type="date" id="journal_date_picker" class="journal_date_picker_input" value="${activeDate}">
            </div>
          </aside>
          <div class="journal_editor_view">
            <div class="journal_workspace_header">
              <div class="journal_date_details">
                <h3>${escapeHTML(formattedActive)}</h3>
                <span class="journal_autosave_status" id="journal_autosave_status">✓ Saved</span>
              </div>
              <button type="button" class="journal_action_btn" id="btn_journal_df_toggle">${document.body.classList.contains("journal-distraction-free") ? "Exit Focus" : "Focus Mode"}</button>
            </div>
            <div class="journal_workspace_content">
              <div class="journal_editor_section">
                <label for="j_intent" class="control_label">Morning Intention</label>
                <input type="text" id="j_intent" class="journal_text_input" placeholder="Primary focus for today..." value="${escapeHTML(entry.morningIntention || "")}">
              </div>
              <div class="journal_editor_section">
                <span class="control_label">Mood</span>
                <div class="journal_mood_pills" id="j_mood_row">
                  ${[["calm", "Calm"], ["energized", "Charged"], ["peaceful", "Peaceful"], ["tired", "Tired"]].map(([val, lbl]) => `
                    <button type="button" class="mood_pill ${activeMood === val ? "active" : ""}" data-mood="${val}">${lbl}</button>
                  `).join("")}
                </div>
              </div>
              <div class="journal_editor_section">
                <div class="journal_tabs_bar">
                  <button type="button" class="journal_tab_btn active" id="tab_journal_write">Write</button>
                  <button type="button" class="journal_tab_btn" id="tab_journal_preview">Preview</button>
                </div>
                <textarea id="j_gratitude" class="journal_textarea" rows="7" placeholder="Reflect on wins, blockers, and clarity (Markdown supported)...">${escapeHTML(reflectionText)}</textarea>
                <div id="j_gratitude_preview" class="journal_preview_pane" hidden></div>
              </div>
              <label class="shutdown_check_label">
                <input type="checkbox" id="btn_j_shutdown_trigger" class="shutdown_native_checkbox" ${entry.shutdownComplete ? "checked" : ""}>
                <span>Mindful shutdown complete for the evening</span>
              </label>
              <div class="journal_footer_actions">
                <button type="button" class="journal_submit_btn" id="btn_journal_commit_save">Save Reflection</button>
              </div>
            </div>
          </div>
        </div>
      `;

      const intentInput = document.getElementById("j_intent");
      const gratitudeArea = document.getElementById("j_gratitude");
      const shutdownCb = document.getElementById("btn_j_shutdown_trigger");
      const statusEl = document.getElementById("journal_autosave_status");
      const writeBtn = document.getElementById("tab_journal_write");
      const previewBtn = document.getElementById("tab_journal_preview");
      const previewPane = document.getElementById("j_gratitude_preview");
      let selectedMood = activeMood;

      const commitSave = (isAutosave) => {
        if (this.renderedJournalDate !== activeDate) return;
        this.store.saveJournalEntry(activeDate, {
          morningIntention: intentInput ? intentInput.value.trim() : "",
          morningMood: selectedMood,
          eveningReflection: gratitudeArea ? gratitudeArea.value.trim() : "",
          shutdownComplete: Boolean(shutdownCb && shutdownCb.checked)
        }, { silentAutosave: isAutosave });

        if (statusEl) {
          statusEl.textContent = "✓ Saved";
          statusEl.classList.remove("saving");
        }
        if (!isAutosave) this.showToast("Reflection saved", "success");
      };

      const scheduleAutosave = () => {
        if (statusEl) {
          statusEl.textContent = "Saving...";
          statusEl.classList.add("saving");
        }
        this.clearJournalAutosaveTimer();
        this.journalAutosaveTimeout = setTimeout(() => {
          this.journalAutosaveTimeout = null;
          commitSave(true);
        }, 800);
      };

      const moodRow = document.getElementById("j_mood_row");
      if (moodRow) {
        moodRow.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-mood]");
          if (!btn) return;
          selectedMood = btn.getAttribute("data-mood");
          moodRow.querySelectorAll("button[data-mood]").forEach((b) => b.classList.toggle("active", b === btn));
          scheduleAutosave();
        });
      }

      if (writeBtn && previewBtn && previewPane && gratitudeArea) {
        writeBtn.addEventListener("click", () => {
          writeBtn.classList.add("active");
          previewBtn.classList.remove("active");
          gratitudeArea.hidden = false;
          previewPane.hidden = true;
        });
        previewBtn.addEventListener("click", () => {
          previewBtn.classList.add("active");
          writeBtn.classList.remove("active");
          gratitudeArea.hidden = true;
          previewPane.hidden = false;
          previewPane.innerHTML = renderMarkdownLite(gratitudeArea.value);
        });
      }

      wrapper.querySelector(".journal_nav_list")?.addEventListener("click", (e) => {
        const item = e.target.closest(".journal_nav_item");
        if (!item) return;
        const nextDate = item.getAttribute("data-date");
        if (nextDate && nextDate !== this.selectedJournalDate) {
          this.clearJournalAutosaveTimer();
          this.selectedJournalDate = nextDate;
          this.renderJournalUI();
        }
      });

      document.getElementById("journal_date_picker")?.addEventListener("change", (e) => {
        if (e.target.value && e.target.value !== this.selectedJournalDate) {
          this.clearJournalAutosaveTimer();
          this.selectedJournalDate = e.target.value;
          this.renderJournalUI();
        }
      });

      document.getElementById("btn_journal_df_toggle")?.addEventListener("click", () => {
        document.body.classList.toggle("journal-distraction-free");
        this.updateJournalDFButton();
      });

      if (intentInput) intentInput.addEventListener("input", scheduleAutosave);
      if (gratitudeArea) gratitudeArea.addEventListener("input", scheduleAutosave);
      if (shutdownCb) {
        shutdownCb.addEventListener("change", () => {
          scheduleAutosave();
          if (shutdownCb.checked) this.store.emit("celebrate", { elementId: "btn_j_shutdown_trigger" });
        });
      }
      document.getElementById("btn_journal_commit_save")?.addEventListener("click", () => commitSave(false));
    }

    // -----------------------------------------------------------------------
    // 7. SETTINGS VIEW (Unified API Key, 3-State Theme, Safe Wipe via Dialog)
    // -----------------------------------------------------------------------
    renderSettingsUI() {
      const panel = this.panels.settings;
      if (!panel) return;
      const curTheme = this.store.theme;
      const curStyle = this.store.uiStyle;
      const curAccent = this.store.accent;

      panel.innerHTML = `
        <div class="settings_group">
          <h2>Appearance & Circadian Atelier</h2>
          <div class="setting_row">
            <span class="setting_label">Theme</span>
            <div class="theme_toggle_pills" id="settings_theme_toggle">
              <button type="button" class="pill_btn ${curTheme === "system" ? "active" : ""}" data-theme="system">System</button>
              <button type="button" class="pill_btn ${curTheme === "light" ? "active" : ""}" data-theme="light">Light</button>
              <button type="button" class="pill_btn ${curTheme === "dark" ? "active" : ""}" data-theme="dark">Dark</button>
            </div>
          </div>
          <div class="setting_row">
            <span class="setting_label">Visual Style</span>
            <div class="theme_toggle_pills" id="settings_style_toggle">
              <button type="button" class="pill_btn ${curStyle === "atelier" ? "active" : ""}" data-style="atelier">Atelier</button>
              <button type="button" class="pill_btn ${curStyle === "neo-brutalism" ? "active" : ""}" data-style="neo-brutalism">Neo-Brutalism</button>
            </div>
          </div>
          <div class="setting_row">
            <span class="setting_label">Accent</span>
            <div class="accent_pills_grid" id="settings_accent_toggle">
              <button type="button" class="accent_pill ${curAccent === "aurora" ? "active" : ""}" data-accent="aurora" aria-label="Aurora Indigo"></button>
              <button type="button" class="accent_pill ${curAccent === "pine" ? "active" : ""}" data-accent="pine" aria-label="Pine Emerald"></button>
              <button type="button" class="accent_pill ${curAccent === "terracotta" ? "active" : ""}" data-accent="terracotta" aria-label="Terracotta Rose"></button>
              <button type="button" class="accent_pill ${curAccent === "solar" ? "active" : ""}" data-accent="solar" aria-label="Solar Amber"></button>
            </div>
          </div>
        </div>

        <div class="settings_group">
          <h2>Circadian Schedule</h2>
          <div class="setting_row">
            <label for="set_wake_time" class="setting_label">Wake-up Time</label>
            <input type="time" id="set_wake_time" class="settings_dropdown" value="${escapeHTML(this.store.routinePrefs.wakeUpTime || "06:00")}">
          </div>
          <div class="setting_row">
            <label for="set_sleep_time" class="setting_label">Sleep Time</label>
            <input type="time" id="set_sleep_time" class="settings_dropdown" value="${escapeHTML(this.store.routinePrefs.sleepTime || "23:00")}">
          </div>
        </div>

        <div class="settings_group">
          <h2>Productivity DNA</h2>
          <div class="personality_settings_card">
            <div class="personality_settings_info">
              <h4>${this.personalityProfile ? `${this.personalityProfile.heroIcon || "🧠"} ${escapeHTML(this.personalityProfile.archetype)}` : "Discover Your Productivity DNA"}</h4>
              <p>${this.personalityProfile ? `${escapeHTML(this.personalityProfile.chronotypeLabel || "")} · Cap ${this.personalityProfile.capacityLimit || 3}/day` : "60-second behavioral profile to personalize coaching and pacing."}</p>
            </div>
            <button type="button" id="btn_retake_personality_quiz" class="setting_primary_btn">${this.personalityProfile ? "Retake Quiz" : "Take Quiz"}</button>
          </div>
        </div>

        <div class="settings_group">
          <div class="settings_header_with_badge">
            <h2>Gemini AI Key (Device-Local)</h2>
            <span class="badge_key_status ${this.geminiApiKey ? "active" : "inactive"}">${this.geminiApiKey ? "Configured" : "Not Set"}</span>
          </div>
          <div class="key_input_container">
            <div class="key_input_wrapper">
              <input type="password" id="input_gemini_api_key" class="settings_key_input" placeholder="Paste your Gemini API key..." value="${escapeHTML(this.geminiApiKey)}" autocomplete="off" spellcheck="false">
              <button type="button" id="btn_toggle_key_visibility" class="key_toggle_vis_btn" aria-label="Toggle API key visibility">👁</button>
            </div>
            <div class="key_action_buttons">
              <button type="button" id="btn_save_gemini_key" class="setting_primary_btn">Save & Verify</button>
              ${this.geminiApiKey ? `<button type="button" id="btn_clear_gemini_key" class="setting_secondary_btn danger">Remove Key</button>` : ""}
            </div>
            <div id="gemini_key_feedback" class="key_feedback_msg"></div>
          </div>
        </div>

        <div class="settings_group">
          <h2>Alerts & Storage</h2>
          <div class="setting_row">
            <span class="setting_label">Browser Notifications</span>
            <div class="theme_toggle_pills" id="settings_notif_toggle">
              <button type="button" class="pill_btn ${this.store.notificationsEnabled ? "active" : ""}" data-notif="true">On</button>
              <button type="button" class="pill_btn ${!this.store.notificationsEnabled ? "active" : ""}" data-notif="false">Off</button>
            </div>
          </div>
          <div class="setting_row">
            <span class="setting_label">Timer Alarm</span>
            <div class="theme_toggle_pills" id="settings_alarm_sound_toggle">
              <button type="button" class="pill_btn ${this.store.alarmSound === "default_beeps" ? "active" : ""}" data-sound="default_beeps">Beeps</button>
              <button type="button" class="pill_btn ${this.store.alarmSound === "steady_ascent" ? "active" : ""}" data-sound="steady_ascent">Steady Ascent</button>
            </div>
          </div>
          <div class="setting_row">
            <span class="setting_label">Local Database</span>
            <button type="button" class="setting_secondary_btn danger" id="btn_clear_data">Wipe All Local Data</button>
          </div>
        </div>
      `;

      panel.querySelector("#settings_theme_toggle")?.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-theme]");
        if (!btn) return;
        this.store.setTheme(btn.getAttribute("data-theme"));
        this.renderSettingsUI();
      });

      panel.querySelector("#settings_style_toggle")?.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-style]");
        if (!btn) return;
        this.store.setUiStyle(btn.getAttribute("data-style"));
        this.renderSettingsUI();
      });

      panel.querySelector("#settings_accent_toggle")?.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-accent]");
        if (!btn) return;
        this.store.setAccent(btn.getAttribute("data-accent"));
        this.renderSettingsUI();
      });

      const wakeInput = document.getElementById("set_wake_time");
      const sleepInput = document.getElementById("set_sleep_time");
      const saveRoutineTimes = () => {
        this.store.setRoutinePrefs({
          wakeUpTime: wakeInput ? wakeInput.value : "06:00",
          sleepTime: sleepInput ? sleepInput.value : "23:00"
        });
      };
      wakeInput?.addEventListener("change", saveRoutineTimes);
      sleepInput?.addEventListener("change", saveRoutineTimes);

      panel.querySelector("#settings_notif_toggle")?.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-notif]");
        if (!btn) return;
        const val = btn.getAttribute("data-notif") === "true";
        if (val) await NotificationService.requestPermission();
        this.store.setNotificationsEnabled(val);
        this.renderSettingsUI();
      });

      panel.querySelector("#settings_alarm_sound_toggle")?.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-sound]");
        if (!btn) return;
        const sound = btn.getAttribute("data-sound");
        this.store.setAlarmSound(sound);
        this.previewAlarmSound(sound);
        this.renderSettingsUI();
      });

      document.getElementById("btn_retake_personality_quiz")?.addEventListener("click", () => this.openPersonalityQuiz());

      const keyInput = document.getElementById("input_gemini_api_key");
      const toggleVisBtn = document.getElementById("btn_toggle_key_visibility");
      const saveKeyBtn = document.getElementById("btn_save_gemini_key");
      const clearKeyBtn = document.getElementById("btn_clear_gemini_key");
      const feedbackEl = document.getElementById("gemini_key_feedback");

      toggleVisBtn?.addEventListener("click", () => {
        if (!keyInput) return;
        keyInput.type = keyInput.type === "password" ? "text" : "password";
      });

      const saveKey = async () => {
        const val = keyInput ? keyInput.value.trim() : "";
        if (!val) {
          if (feedbackEl) feedbackEl.textContent = "Enter an API key first.";
          return;
        }
        if (saveKeyBtn) { saveKeyBtn.disabled = true; saveKeyBtn.textContent = "Verifying..."; }
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(val)}`);
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            if (Array.isArray(data.models)) {
              const supported = data.models
                .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
                .map((m) => m.name.replace(/^models\//, ""));
              const flash = supported.filter((n) => n.includes("flash"));
              const resolved = [...flash, ...supported.filter((n) => !n.includes("flash"))];
              if (resolved.length > 0) {
                this.cachedGeminiModels = resolved;
                await Storage.setExtensionLocal("aurora_gemini_models", resolved);
              }
            }
            this.geminiApiKey = await Storage.setApiKey(val);
            this.showToast("Gemini API key verified and saved", "success");
            this.renderSettingsUI();
          } else {
            const err = await res.json().catch(() => ({}));
            if (feedbackEl) feedbackEl.textContent = err.error?.message || "Invalid API key.";
            if (saveKeyBtn) { saveKeyBtn.disabled = false; saveKeyBtn.textContent = "Save & Verify"; }
          }
        } catch (_) {
          if (feedbackEl) feedbackEl.textContent = "Network error verifying key.";
          if (saveKeyBtn) { saveKeyBtn.disabled = false; saveKeyBtn.textContent = "Save & Verify"; }
        }
      };

      saveKeyBtn?.addEventListener("click", saveKey);
      keyInput?.addEventListener("keydown", (e) => {
        if (!isIMEComposing(e) && e.key === "Enter") { e.preventDefault(); saveKey(); }
      });

      clearKeyBtn?.addEventListener("click", async () => {
        const ok = await this.showConfirmDialog({
          title: "Remove Gemini API Key",
          message: "Remove your stored key from this device?",
          okLabel: "Remove",
          danger: true
        });
        if (!ok) return;
        await Storage.clearApiKey();
        this.geminiApiKey = "";
        this.cachedGeminiModels = null;
        this.showToast("Gemini API key removed", "info");
        this.renderSettingsUI();
      });

      document.getElementById("btn_clear_data")?.addEventListener("click", async () => {
        const typed = await this.showConfirmDialog({
          title: "Wipe All Local Data",
          message: 'This permanently deletes all tasks, habits, routines, and journal entries. Type "clear storage" to confirm.',
          requireInput: true,
          inputLabel: "Confirmation",
          inputPlaceholder: "clear storage",
          matchText: "clear storage",
          okLabel: "Wipe Everything",
          danger: true
        });
        if (typed === "clear storage") {
          await Storage.closeAndDeleteDatabase();
          try { localStorage.clear(); } catch (_) {}
          window.location.reload();
        }
      });
    }

    previewAlarmSound(sound) {
      if (this.previewAudio) { try { this.previewAudio.pause(); } catch (_) {} this.previewAudio = null; }
      if (this.previewCtx) { try { this.previewCtx.close(); } catch (_) {} this.previewCtx = null; }
      if (this.previewTimeout) { clearTimeout(this.previewTimeout); this.previewTimeout = null; }

      if (sound === "steady_ascent") {
        try {
          this.previewAudio = new Audio("A_Steady_Ascent.mp3");
          this.previewAudio.play().catch(() => {});
          this.previewTimeout = setTimeout(() => { if (this.previewAudio) this.previewAudio.pause(); }, 2200);
        } catch (_) {}
      } else {
        SoundEffects.playCompletionChime();
      }
    }

    // -----------------------------------------------------------------------
    // 8. DIALOG OPENERS & SUBMISSIONS (Task, Routine, Habit, Personality)
    // -----------------------------------------------------------------------
    openBottomSheet(task = null, initialData = null) {
      if (!this.taskDialog) return;
      const dateChips = this.sheetForm ? this.sheetForm.querySelectorAll(".date_chip") : [];
      const dateInput = document.getElementById("task_due_date");
      const urlInput = document.getElementById("task_url");
      const advDetails = document.getElementById("sheet_advanced_details");

      if (task) {
        this.activeEditingTaskId = task.id;
        if (this.sheetTitle) this.sheetTitle.textContent = "Edit Task";
        if (this.sheetSubmitBtn) this.sheetSubmitBtn.textContent = "Save Changes";
        if (this.sheetDeleteBtn) this.sheetDeleteBtn.hidden = false;

        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        setVal("task_title", task.title || "");
        setVal("task_desc", task.description || "");
        if (urlInput) urlInput.value = task.url || "";
        setVal("task_due_date", task.isLater ? "" : (task.dueDate || getLocalDateString()));
        setVal("task_priority", task.priority || "Medium");
        this.updatePriorityPillsUI(task.priority || "Medium");
        setVal("task_category", task.category || "Inbox");
        setVal("task_duration", String(task.estimatedDuration || 25));
        setVal("task_recurring", task.recurring || "none");
        if (advDetails) advDetails.open = Boolean(task.recurring && task.recurring !== "none");

        const todayStr = getLocalDateString();
        const tomStr = getNDaysFromNow(1);
        const wkStr = getNDaysFromNow(7);
        let matched = false;
        dateChips.forEach((c) => {
          c.classList.remove("active");
          const days = c.getAttribute("data-days");
          if (days === "0" && !task.isLater && task.dueDate === todayStr) { c.classList.add("active"); matched = true; }
          else if (days === "1" && !task.isLater && task.dueDate === tomStr) { c.classList.add("active"); matched = true; }
          else if (days === "7" && !task.isLater && task.dueDate === wkStr) { c.classList.add("active"); matched = true; }
          else if (task.isLater && c.id === "chip_do_later") { c.classList.add("active"); matched = true; }
        });
        if (!matched && !task.isLater && dateInput) {
          document.getElementById("chip_custom_date")?.classList.add("active");
          dateInput.hidden = false;
          dateInput.style.display = "block";
        } else if (dateInput) {
          dateInput.hidden = true;
          dateInput.style.display = "none";
        }
      } else {
        this.activeEditingTaskId = null;
        if (this.sheetTitle) this.sheetTitle.textContent = "New Task";
        if (this.sheetSubmitBtn) this.sheetSubmitBtn.textContent = "Add Task";
        if (this.sheetDeleteBtn) this.sheetDeleteBtn.hidden = true;
        if (this.sheetForm) this.sheetForm.reset();
        if (advDetails) advDetails.open = false;

        const initPri = initialData?.priority || this.quickAddState.priority || "Medium";
        const initCat = initialData?.category || this.quickAddState.category || "Inbox";
        const dateMode = initialData?.dateMode || this.quickAddState.dateMode || "today";
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        setVal("task_title", initialData?.title || "");
        setVal("task_desc", "");
        if (urlInput) urlInput.value = initialData?.url || "";
        setVal("task_priority", initPri);
        this.updatePriorityPillsUI(initPri);
        setVal("task_category", initCat);
        setVal("task_duration", "25");
        setVal("task_recurring", "none");

        dateChips.forEach((c) => c.classList.remove("active"));
        if (dateInput) { dateInput.hidden = true; dateInput.style.display = "none"; }
        if (dateMode === "tomorrow") {
          setVal("task_due_date", getNDaysFromNow(1));
          this.sheetForm?.querySelector('.date_chip[data-days="1"]')?.classList.add("active");
        } else if (dateMode === "later") {
          setVal("task_due_date", "");
          document.getElementById("chip_do_later")?.classList.add("active");
        } else {
          setVal("task_due_date", getLocalDateString());
          this.sheetForm?.querySelector('.date_chip[data-days="0"]')?.classList.add("active");
        }
      }

      this.openDialog(this.taskDialog);
      setTimeout(() => document.getElementById("task_title")?.focus(), 40);
    }

    closeBottomSheet() {
      this.closeDialog(this.taskDialog);
      this.activeEditingTaskId = null;
      this.isSubmitting = false;
      if (this.sheetSubmitBtn) this.sheetSubmitBtn.disabled = false;
    }

    updatePriorityPillsUI(val) {
      document.querySelectorAll("#priority_pill_group .priority_pill_option").forEach((p) => {
        p.classList.toggle("active", p.getAttribute("data-priority") === val);
      });
    }

    handleTaskFormSubmission() {
      if (this.isSubmitting) return;
      const title = (document.getElementById("task_title")?.value || "").trim();
      if (!title) return;

      this.isSubmitting = true;
      if (this.sheetSubmitBtn) this.sheetSubmitBtn.disabled = true;

      const description = (document.getElementById("task_desc")?.value || "").trim();
      const url = sanitizeUrl(document.getElementById("task_url")?.value || "");
      let dueDate = document.getElementById("task_due_date")?.value || "";
      const priority = document.getElementById("task_priority")?.value || "Medium";
      const category = document.getElementById("task_category")?.value || "Inbox";
      const estimatedDuration = parseInt(document.getElementById("task_duration")?.value, 10) || 25;
      const recurring = document.getElementById("task_recurring")?.value || "none";
      const doLaterChip = document.getElementById("chip_do_later");
      const isLater = Boolean((doLaterChip && doLaterChip.classList.contains("active")) || !dueDate);
      if (!dueDate) dueDate = getLocalDateString();

      const data = { title, description, url, dueDate, priority, category, estimatedDuration, recurring, isLater };
      if (this.activeEditingTaskId !== null) {
        this.store.updateTask(this.activeEditingTaskId, data);
      } else {
        const created = this.store.addTask(data);
        if (created) setTimeout(() => this.triggerCelebration(created.id), 150);
      }
      this.closeBottomSheet();
    }

    openRoutineSheet(block = null) {
      if (!this.routineDialog) return;
      const titleEl = document.getElementById("routine_sheet_title");
      const submitBtn = document.getElementById("routine_sheet_submit");
      const iconEl = document.getElementById("routine_icon");

      if (block) {
        this.activeEditingRoutineId = block.id;
        if (titleEl) titleEl.textContent = "Edit Time Block";
        if (submitBtn) submitBtn.textContent = "Save Block";
        document.getElementById("routine_title").value = block.title || "";
        document.getElementById("routine_start_time").value = block.startTime || "09:00";
        document.getElementById("routine_end_time").value = block.endTime || "10:00";
        document.getElementById("routine_category").value = block.category || "Routine";
        document.getElementById("routine_color").value = block.color || "indigo";
        if (iconEl) iconEl.value = block.icon || "";
        this.routineForm?.querySelectorAll("input[name='routine_days']").forEach((cb) => {
          cb.checked = Array.isArray(block.days) && block.days.includes(cb.value);
        });
      } else {
        this.activeEditingRoutineId = null;
        if (titleEl) titleEl.textContent = "Schedule Time Block";
        if (submitBtn) submitBtn.textContent = "Add Block";
        this.routineForm?.reset();
        if (iconEl) iconEl.value = "";
        this.routineForm?.querySelectorAll("input[name='routine_days']").forEach((cb) => {
          cb.checked = true;
        });
      }
      this.openDialog(this.routineDialog);
      setTimeout(() => document.getElementById("routine_title")?.focus(), 40);
    }

    closeRoutineSheet() {
      this.closeDialog(this.routineDialog);
      this.activeEditingRoutineId = null;
      this.isSubmitting = false;
    }

    handleRoutineFormSubmission() {
      if (this.isSubmitting) return;
      const title = (document.getElementById("routine_title")?.value || "").trim();
      const startTime = document.getElementById("routine_start_time")?.value || "";
      const endTime = document.getElementById("routine_end_time")?.value || "";
      const category = document.getElementById("routine_category")?.value || "Routine";
      const color = document.getElementById("routine_color")?.value || "indigo";
      const icon = (document.getElementById("routine_icon")?.value || "").trim();
      const days = Array.from(this.routineForm?.querySelectorAll("input[name='routine_days']:checked") || []).map((cb) => cb.value);

      if (!title || !startTime || !endTime || days.length === 0) {
        this.showToast("Specify a title, start/end times, and at least one weekday", "error");
        return;
      }
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      if (sh * 60 + sm >= eh * 60 + em) {
        this.showToast("Start time must be earlier than end time", "error");
        return;
      }

      this.isSubmitting = true;
      const overlaps = this.store.checkRoutineOverlap(startTime, endTime, days, this.activeEditingRoutineId);
      if (overlaps.length > 0) {
        this.showToast(`Note: overlaps with "${overlaps[0].block.title}"`, "info");
      }

      const data = { title, startTime, endTime, category, color, icon, days };
      if (this.activeEditingRoutineId !== null) this.store.updateRoutineBlock(this.activeEditingRoutineId, data);
      else this.store.addRoutineBlock(data);
      this.closeRoutineSheet();
    }

    openHabitSheet(habit = null) {
      if (!this.habitDialog) return;
      const titleEl = document.getElementById("habit_sheet_title");
      const submitBtn = document.getElementById("habit_sheet_submit");
      if (habit) {
        this.activeEditingHabitId = habit.id;
        if (titleEl) titleEl.textContent = "Edit Habit";
        if (submitBtn) submitBtn.textContent = "Save Habit";
        document.getElementById("habit_title").value = habit.title || "";
        document.getElementById("habit_category").value = habit.category || "Routine";
        document.getElementById("habit_color").value = habit.color || "indigo";
      } else {
        this.activeEditingHabitId = null;
        if (titleEl) titleEl.textContent = "New Atomic Habit";
        if (submitBtn) submitBtn.textContent = "Create Habit";
        this.habitForm?.reset();
      }
      this.openDialog(this.habitDialog);
      setTimeout(() => document.getElementById("habit_title")?.focus(), 40);
    }

    closeHabitSheet() {
      this.closeDialog(this.habitDialog);
      this.activeEditingHabitId = null;
      this.isSubmitting = false;
    }

    // -----------------------------------------------------------------------
    // 9. PERSONALITY DNA QUIZ
    // -----------------------------------------------------------------------
    openPersonalityQuiz() {
      if (!this.personalityDialog) return;
      this.currentQuizStep = 1;
      this.quizAnswers = this.personalityProfile
        ? {
            chronotype: this.personalityProfile.chronotype,
            procrastination: this.personalityProfile.procrastination,
            pacing: this.personalityProfile.pacing,
            coach_voice: this.personalityProfile.coachVoice,
            capacity_limit: String(this.personalityProfile.capacityLimit || "3")
          }
        : {};
      this.openDialog(this.personalityDialog);
      this.renderQuizStep(1);
    }

    closePersonalityQuiz() {
      this.closeDialog(this.personalityDialog);
    }

    renderQuizStep(step) {
      if (!this.personalityStepContent) return;
      this.currentQuizStep = step;

      if (this.personalityStepperBar) {
        this.personalityStepperBar.querySelectorAll(".stepper_dot").forEach((dot, idx) => {
          dot.classList.toggle("completed", idx + 1 < step || step > 5);
          dot.classList.toggle("active", idx + 1 === step);
        });
      }

      if (step >= 1 && step <= 5) {
        const q = PERSONALITY_QUESTIONS[step - 1];
        const selected = this.quizAnswers[q.id];
        this.personalityStepContent.innerHTML = `
          <div class="quiz_step_header">
            <span class="quiz_step_kicker">${escapeHTML(q.kicker)}</span>
            <h3 class="quiz_step_title">${escapeHTML(q.title)}</h3>
            <p class="quiz_step_subtitle">${escapeHTML(q.subtitle)}</p>
          </div>
          <div class="quiz_options_grid">
            ${q.options.map((opt) => `
              <button type="button" class="personality_option_card ${selected === opt.value ? "selected" : ""}" data-val="${escapeHTML(opt.value)}">
                <span class="option_icon_box">${opt.icon}</span>
                <span class="option_text_col">
                  <span class="option_label">${escapeHTML(opt.label)}</span>
                  <span class="option_desc">${escapeHTML(opt.desc)}</span>
                </span>
              </button>
            `).join("")}
          </div>
        `;
        this.personalityStepContent.querySelector(".quiz_options_grid")?.addEventListener("click", (e) => {
          const card = e.target.closest(".personality_option_card");
          if (!card) return;
          this.quizAnswers[q.id] = card.getAttribute("data-val");
          this.personalityStepContent.querySelectorAll(".personality_option_card").forEach((c) => c.classList.toggle("selected", c === card));
        });
        if (this.personalityPrevBtn) this.personalityPrevBtn.hidden = step <= 1;
        if (this.personalityNextBtn) this.personalityNextBtn.textContent = step === 5 ? "See Archetype" : "Continue";
      } else {
        const arch = computeArchetype(this.quizAnswers);
        this.personalityStepContent.innerHTML = `
          <div class="personality_result_container">
            <div class="personality_badge_hero">
              <div class="personality_hero_icon">${arch.heroIcon}</div>
              <h3>${escapeHTML(arch.archetype)}</h3>
              <p>${escapeHTML(arch.strategyTip)}</p>
            </div>
            <div class="personality_traits_grid">
              <div class="trait_card superpower"><span class="trait_label">Superpower</span><span>${escapeHTML(arch.superpower)}</span></div>
              <div class="trait_card blindspot"><span class="trait_label">Watchout</span><span>${escapeHTML(arch.blindspot)}</span></div>
            </div>
          </div>
        `;
        if (this.personalityPrevBtn) this.personalityPrevBtn.hidden = false;
        if (this.personalityNextBtn) this.personalityNextBtn.textContent = "Activate Profile";
      }
    }

    handlePersonalityNext() {
      if (this.currentQuizStep <= 5) {
        const q = PERSONALITY_QUESTIONS[this.currentQuizStep - 1];
        if (!this.quizAnswers[q.id]) this.quizAnswers[q.id] = q.options[0].value;
        this.renderQuizStep(this.currentQuizStep + 1);
      } else {
        const arch = computeArchetype(this.quizAnswers);
        const findLabel = (idx, key, fallback) => PERSONALITY_QUESTIONS[idx].options.find((o) => o.value === this.quizAnswers[key])?.label || fallback;
        const profile = {
          ...arch,
          chronotype: this.quizAnswers.chronotype || "early_falcon",
          chronotypeLabel: findLabel(0, "chronotype", "Morning"),
          procrastination: this.quizAnswers.procrastination || "perfectionism",
          procrastinationLabel: findLabel(1, "procrastination", "Perfectionism"),
          pacing: this.quizAnswers.pacing || "sprints",
          pacingLabel: findLabel(2, "pacing", "Sprints"),
          coachVoice: this.quizAnswers.coach_voice || "stoic",
          coachVoiceLabel: findLabel(3, "coach_voice", "Stoic"),
          capacityLimit: parseInt(this.quizAnswers.capacity_limit || "3", 10),
          updatedAt: new Date().toISOString()
        };
        this.store.setPersonalityProfile(profile);
        this.closePersonalityQuiz();
        this.showToast(`${profile.archetype} profile activated`, "success");
      }
    }

    handlePersonalityPrev() {
      if (this.currentQuizStep > 1) this.renderQuizStep(this.currentQuizStep - 1);
    }

    // -----------------------------------------------------------------------
    // 10. AI STRATEGIST, TOMORROW BRIDGE, CLARITY BREAKDOWN & HABIT COACH
    //     (Strict Safe Escaping — Zero Raw LLM innerHTML, Capped Payloads)
    // -----------------------------------------------------------------------
    async getCandidateGeminiModels() {
      if (Array.isArray(this.cachedGeminiModels) && this.cachedGeminiModels.length > 0) {
        return this.cachedGeminiModels;
      }
      const stored = await Storage.getExtensionLocal("aurora_gemini_models", null);
      if (Array.isArray(stored) && stored.length > 0) {
        this.cachedGeminiModels = stored;
        return stored;
      }
      this.cachedGeminiModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
      return this.cachedGeminiModels;
    }

    async callGeminiWithFallback(bodyPayload) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("Offline — AI features require an internet connection.");
      }
      if (!this.geminiApiKey) throw new Error("Gemini API key is not configured.");

      const models = (await this.getCandidateGeminiModels()).slice(0, 4);
      let lastError = null;
      for (const model of models) {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 10000);
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.geminiApiKey)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(bodyPayload),
              signal: controller.signal
            }
          );
          if (res.ok) return { data: await res.json(), model };
          if (res.status === 401 || res.status === 403) {
            throw new Error("Invalid or unauthorized Gemini API key.");
          }
          lastError = new Error(`${model}: HTTP ${res.status}`);
        } catch (err) {
          lastError = err;
          if (err.message && err.message.includes("unauthorized")) break;
        } finally {
          clearTimeout(tid);
        }
      }
      throw lastError || new Error("Gemini request failed.");
    }

    getMorningMomentumPlan() {
      if (!this.tomorrowPlan) return null;
      if (this.tomorrowPlan.targetDate === getLocalDateString() && !this.tomorrowPlan.dismissed) {
        return this.tomorrowPlan;
      }
      return null;
    }

    saveTomorrowPlan(plan) {
      this.tomorrowPlan = plan;
      Storage.savePreference("tomorrow_plan", plan || null).catch(() => {});
    }

    renderMorningMomentumCardHTML(plan) {
      return `
        <div class="morning_momentum_bridge_card">
          <div class="morning_bridge_badge_row">
            <span class="morning_bridge_pill">🌅 Morning Momentum · ${this.eveningPlanningStreak}d Streak</span>
            <button type="button" class="morning_bridge_dismiss_btn" id="btn_dismiss_morning_bridge" aria-label="Dismiss">✕</button>
          </div>
          <h4 class="morning_bridge_title">${escapeHTML(plan.keystoneTitle || "Keystone Goal")}</h4>
          <p class="morning_bridge_starter">⚡ 2-Min Starter: ${escapeHTML(plan.microStarter || "Open your workspace and do the first step.")}</p>
          <div class="morning_bridge_actions">
            ${plan.microStarterDone
              ? `<span class="morning_bridge_done_badge">✓ 2-Min Starter Done</span>`
              : `<button type="button" class="today_ai_btn primary" id="btn_launch_morning_micro_start">Launch 2m Focus</button>
                 <button type="button" class="today_ai_btn secondary" id="btn_complete_morning_micro_start">✓ Started</button>`}
          </div>
        </div>
      `;
    }

    bindMorningCardEvents(plan) {
      document.getElementById("btn_dismiss_morning_bridge")?.addEventListener("click", () => {
        this.saveTomorrowPlan({ ...plan, dismissed: true });
        this.renderTodayHeroCard();
      });
      document.getElementById("btn_launch_morning_micro_start")?.addEventListener("click", () => {
        this.store.setView("focus");
        this.store.timer.duration = 120;
        this.store.timer.totalDuration = 120;
        this.store.startTimer(plan.keystoneTaskId || null);
      });
      document.getElementById("btn_complete_morning_micro_start")?.addEventListener("click", () => {
        this.saveTomorrowPlan({ ...plan, microStarterDone: true });
        this.store.awardXP(20);
        this.showToast("Morning starter conquered (+20 XP)", "success");
        this.renderTodayHeroCard();
      });
    }

    renderTodayAIBanner(todayTasks) {
      const container = document.getElementById("today_ai_banner_container");
      if (!container) return;

      const hasLocked = Boolean(this.tomorrowPlan && this.tomorrowPlan.targetDate === getNDaysFromNow(1) && this.tomorrowPlan.committed);
      container.innerHTML = `
        <div class="today_ai_deck">
          <div class="focus_mode_tabs_bar">
            <button type="button" class="focus_mode_tab ${this.focusAITab === "today" ? "active" : ""}" data-ai-tab="today">Today Plan (${todayTasks.length})</button>
            <button type="button" class="focus_mode_tab ${this.focusAITab === "tomorrow" ? "active" : ""}" data-ai-tab="tomorrow">Plan Tomorrow ${hasLocked ? "✓" : ""}</button>
          </div>
          <div id="focus_ai_content_area"></div>
        </div>
      `;

      container.querySelector(".focus_mode_tabs_bar")?.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-ai-tab]");
        if (!btn) return;
        this.focusAITab = btn.getAttribute("data-ai-tab");
        this.renderTodayAIBanner(todayTasks);
      });

      const area = document.getElementById("focus_ai_content_area");
      if (!area) return;

      if (this.focusAITab === "today") {
        const profile = this.personalityProfile;
        area.innerHTML = `
          <div class="today_ai_header">
            <div class="today_ai_title_group">
              <h3>Focus Strategist</h3>
              <span class="today_ai_tag">${profile ? escapeHTML(profile.archetype) : "Heuristic + AI"}</span>
            </div>
            <div class="today_ai_actions">
              <button type="button" id="btn_today_ai_plan" class="today_ai_btn primary">Plan Today</button>
              <button type="button" id="btn_today_ai_prioritize" class="today_ai_btn secondary">Smart Order</button>
              ${this.todayAIPlan || this.todayAITaskOrder ? `<button type="button" id="btn_today_ai_reset" class="today_ai_btn text_only">Reset</button>` : ""}
            </div>
          </div>
          <div id="today_ai_plan_result" class="today_ai_plan_result"></div>
        `;
        if (this.todayAIPlan) this.renderTodayAIPlanDetails(this.todayAIPlan, todayTasks);
        document.getElementById("btn_today_ai_plan")?.addEventListener("click", () => this.generateTodayAIPlan(todayTasks));
        document.getElementById("btn_today_ai_prioritize")?.addEventListener("click", () => this.autoPrioritizeTodayTasks(todayTasks));
        document.getElementById("btn_today_ai_reset")?.addEventListener("click", () => {
          this.todayAIPlan = null;
          this.todayAITaskOrder = null;
          this.renderTodayTaskList();
        });
      } else {
        const plan = this.tomorrowPlanDraft || (hasLocked ? this.tomorrowPlan : null);
        area.innerHTML = `
          <div class="today_ai_header">
            <div class="today_ai_title_group">
              <h3>Tomorrow Blueprint</h3>
              <span class="today_ai_tag">${this.eveningPlanningStreak}d Streak</span>
            </div>
            <div class="today_ai_actions">
              <button type="button" id="btn_generate_tomorrow_blueprint" class="today_ai_btn primary">Plan Tomorrow</button>
              ${plan ? `<button type="button" id="btn_reset_tomorrow_draft" class="today_ai_btn text_only">Reset</button>` : ""}
            </div>
          </div>
          <div id="tomorrow_blueprint_result_slot"></div>
        `;
        const slot = document.getElementById("tomorrow_blueprint_result_slot");
        if (plan && slot) this.renderTomorrowBlueprintDetails(slot, plan);
        document.getElementById("btn_generate_tomorrow_blueprint")?.addEventListener("click", () => this.generateTomorrowBlueprint());
        document.getElementById("btn_reset_tomorrow_draft")?.addEventListener("click", () => {
          this.tomorrowPlanDraft = null;
          this.saveTomorrowPlan(null);
          this.renderTodayAIBanner(todayTasks);
        });
      }
    }

    generateHeuristicDailyPlan(todayTasks) {
      const profile = this.personalityProfile || { archetype: "Balanced Achiever", chronotypeLabel: "Morning Peak", procrastination: "perfectionism", capacityLimit: 3 };
      const weights = { High: 3, Medium: 2, Low: 1 };
      const sorted = [...todayTasks].sort((a, b) => (weights[b.priority] || 2) - (weights[a.priority] || 2));
      const cap = Math.max(1, profile.capacityLimit || 3);
      const chosen = sorted.slice(0, cap);
      const overflow = sorted.slice(cap);
      const top = chosen[0];

      return {
        executiveSummary: `Focus on ${chosen.length} priority goal${chosen.length === 1 ? "" : "s"} matched to ${profile.chronotypeLabel}.`,
        topFocusTaskId: top ? top.id : null,
        antiProcrastinationTip: top ? `Spend 2 minutes opening "${top.title}" and writing the first bullet.` : "",
        recommendedOrder: chosen.map((t, i) => ({ taskId: t.id, taskTitle: t.title, order: i + 1 })),
        overflowTasks: overflow.map((t) => ({ taskId: t.id, title: t.title, reason: `Above ${cap}-task daily cap` }))
      };
    }

    async generateTodayAIPlan(todayTasks) {
      if (todayTasks.length === 0) {
        this.showToast("Add at least 1 task for today first", "info");
        return;
      }
      if (!this.geminiApiKey || (typeof navigator !== "undefined" && !navigator.onLine)) {
        const plan = this.generateHeuristicDailyPlan(todayTasks);
        this.todayAIPlan = plan;
        this.todayAITaskOrder = plan.recommendedOrder.map((r) => r.taskId);
        this.renderTodayTaskList();
        return;
      }

      const resultEl = document.getElementById("today_ai_plan_result");
      if (resultEl) resultEl.innerHTML = `<div class="ai_coach_loading">Planning today's focus...</div>`;

      // Cap payload to top 25 tasks so large backlogs never bloat prompt serialization
      const capped = todayTasks.slice(0, 25).map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        category: t.category,
        estimatedDuration: t.estimatedDuration || 25
      }));

      try {
        const cap = this.personalityProfile?.capacityLimit || 3;
        const { data } = await this.callGeminiWithFallback({
          contents: [{ parts: [{ text: `Select top ${cap} tasks for today and put excess in overflowTasks. Tasks: ${JSON.stringify(capped)}. Return ONLY JSON: {"executiveSummary":"...","topFocusTaskId":${capped[0].id},"antiProcrastinationTip":"...","recommendedOrder":[{"taskId":${capped[0].id},"order":1,"timeSlot":"09:00-09:30"}],"overflowTasks":[{"taskId":0,"reason":"..."}]}` }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
        });
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const plan = JSON.parse(text);
        this.todayAIPlan = plan;
        if (Array.isArray(plan.recommendedOrder)) {
          this.todayAITaskOrder = plan.recommendedOrder.map((r) => r.taskId);
        }
        this.renderTodayTaskList();
      } catch (_) {
        const fallback = this.generateHeuristicDailyPlan(todayTasks);
        this.todayAIPlan = fallback;
        this.todayAITaskOrder = fallback.recommendedOrder.map((r) => r.taskId);
        this.renderTodayTaskList();
      }
    }

    async autoPrioritizeTodayTasks(todayTasks) {
      if (todayTasks.length <= 1) return;
      const weights = { High: 3, Medium: 2, Low: 1 };
      const fallbackOrder = [...todayTasks]
        .sort((a, b) => (weights[b.priority] || 2) - (weights[a.priority] || 2) || (a.estimatedDuration || 25) - (b.estimatedDuration || 25))
        .map((t) => t.id);

      if (!this.geminiApiKey || (typeof navigator !== "undefined" && !navigator.onLine)) {
        this.todayAITaskOrder = fallbackOrder;
        this.renderTodayTaskList();
        this.showToast("Tasks ordered by leverage", "success");
        return;
      }

      const capped = todayTasks.slice(0, 25).map((t) => ({ id: t.id, title: t.title, priority: t.priority, duration: t.estimatedDuration || 25 }));
      try {
        const { data } = await this.callGeminiWithFallback({
          contents: [{ parts: [{ text: `Order these task IDs by impact: ${JSON.stringify(capped)}. Return ONLY a JSON array of IDs.` }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
        });
        const ordered = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "[]");
        this.todayAITaskOrder = Array.isArray(ordered) && ordered.length ? ordered : fallbackOrder;
      } catch (_) {
        this.todayAITaskOrder = fallbackOrder;
      }
      this.renderTodayTaskList();
      this.showToast("Smart order applied", "success");
    }

    renderTodayAIPlanDetails(plan, todayTasks) {
      const el = document.getElementById("today_ai_plan_result");
      if (!el) return;
      const top = this.store.getTaskById(plan.topFocusTaskId) || todayTasks[0];
      const overflow = Array.isArray(plan.overflowTasks) ? plan.overflowTasks.filter((o) => this.store.getTaskById(o.taskId)) : [];

      el.innerHTML = `
        <div class="today_ai_plan_card">
          <p class="today_ai_summary">${escapeHTML(plan.executiveSummary || "")}</p>
          ${top ? `<div class="today_ai_conquer_box"><strong>🎯 #1 Keystone: ${escapeHTML(top.title)}</strong><button type="button" class="today_ai_btn primary" id="btn_ai_launch_top_task">Start Focus</button></div>` : ""}
          ${plan.antiProcrastinationTip ? `<p class="today_ai_inertia_box">⚡ ${escapeHTML(plan.antiProcrastinationTip)}</p>` : ""}
          ${overflow.length > 0 ? `<div class="today_ai_overflow_advisory"><span>${overflow.length} task(s) exceed your daily cap.</span><button type="button" class="today_ai_btn secondary" id="btn_defer_overflow_tasks">Move ${overflow.length} to Tomorrow</button></div>` : ""}
        </div>
      `;

      document.getElementById("btn_ai_launch_top_task")?.addEventListener("click", () => {
        if (!top) return;
        this.store.setView("focus");
        this.store.startTimer(top.id);
      });

      document.getElementById("btn_defer_overflow_tasks")?.addEventListener("click", () => {
        const tom = getNDaysFromNow(1);
        const batch = overflow.map((o) => ({ id: o.taskId, data: { dueDate: tom, isLater: false } }));
        this.todayAIPlan = null;
        this.store.updateTasksBatch(batch, `Moved ${batch.length} overflow task(s) to Tomorrow`);
      });
    }

    generateTomorrowBlueprint() {
      const active = this.getFilteredActiveTasks("all");
      const keystone = active.find((t) => t.priority === "High") || active[0] || { id: 0, title: "Deep Focus Milestone", priority: "High", category: "Work" };
      const supporting = active.filter((t) => t.id !== keystone.id).slice(0, 2).map((t) => ({ taskId: t.id, title: t.title, estimatedDuration: t.estimatedDuration || 25 }));
      const draft = {
        keystoneTaskId: keystone.id,
        keystoneTitle: keystone.title,
        keystonePriority: keystone.priority || "High",
        keystoneCategory: keystone.category || "Work",
        microStarter: `Open "${keystone.title}" and draft the first 2-minute step.`,
        supportingTasks: supporting,
        committed: false
      };
      this.tomorrowPlanDraft = draft;
      const slot = document.getElementById("tomorrow_blueprint_result_slot");
      if (slot) this.renderTomorrowBlueprintDetails(slot, draft);
    }

    renderTomorrowBlueprintDetails(slot, plan) {
      const tomStr = getNDaysFromNow(1);
      const committed = Boolean(plan.committed && plan.targetDate === tomStr);
      slot.innerHTML = `
        <div class="tomorrow_plan_card">
          <h4>🎯 ${escapeHTML(plan.keystoneTitle || "Keystone Goal")}</h4>
          <p>⚡ ${escapeHTML(plan.microStarter || "")}</p>
          ${committed
            ? `<div class="tomorrow_committed_banner">✓ Locked in for ${tomStr}</div>`
            : `<button type="button" class="today_ai_btn primary" id="btn_lock_tomorrow_blueprint">Lock In Tomorrow</button>`}
        </div>
      `;
      document.getElementById("btn_lock_tomorrow_blueprint")?.addEventListener("click", () => {
        const updates = [];
        if (plan.keystoneTaskId && this.store.getTaskById(plan.keystoneTaskId)) {
          updates.push({ id: plan.keystoneTaskId, data: { dueDate: tomStr, isLater: false } });
        }
        (plan.supportingTasks || []).forEach((s) => {
          if (s.taskId && this.store.getTaskById(s.taskId)) {
            updates.push({ id: s.taskId, data: { dueDate: tomStr, isLater: false } });
          }
        });
        if (updates.length > 0) this.store.updateTasksBatch(updates);
        const locked = { ...plan, targetDate: tomStr, committed: true, dismissed: false, microStarterDone: false };
        this.saveTomorrowPlan(locked);
        this.tomorrowPlanDraft = locked;
        this.eveningPlanningStreak += 1;
        Storage.savePreference("evening_planning_streak", this.eveningPlanningStreak).catch(() => {});
        this.showToast("Tomorrow's blueprint locked in", "success");
        this.renderTomorrowBlueprintDetails(slot, locked);
      });
    }

    async openAIBreakdownDrawer(task, card) {
      const slot = card.querySelector(".task_ai_drawer_slot");
      if (!slot) return;
      if (slot.innerHTML.trim() !== "") {
        slot.innerHTML = "";
        return;
      }
      if (!this.geminiApiKey) {
        slot.innerHTML = `<div class="task_ai_breakdown_deck"><p>Add a Gemini API key in Settings to generate AI subtask breakdowns.</p></div>`;
        return;
      }
      slot.innerHTML = `<div class="task_ai_breakdown_deck"><p>Generating action steps...</p></div>`;
      try {
        const { data } = await this.callGeminiWithFallback({
          contents: [{ parts: [{ text: `Break down task "${task.title}" (${task.description || "no notes"}) into 3-5 small actionable subtasks. Return ONLY JSON: {"firstMicroStep":"...","subtasks":["step 1","step 2","step 3"]}` }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
        });
        const parsed = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
        const subs = Array.isArray(parsed.subtasks) ? parsed.subtasks : [];
        slot.innerHTML = `
          <div class="task_ai_breakdown_deck">
            ${parsed.firstMicroStep ? `<p>⚡ <strong>2m Starter:</strong> ${escapeHTML(parsed.firstMicroStep)}</p>` : ""}
            <ul>${subs.map((s) => `<li>${escapeHTML(s)}</li>`).join("")}</ul>
            <div class="task_ai_actions_row">
              <button type="button" class="today_ai_btn primary" data-bd="commit">Add ${subs.length} Subtasks</button>
              <button type="button" class="today_ai_btn secondary" data-bd="close">Dismiss</button>
            </div>
          </div>
        `;
        slot.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-bd]");
          if (!btn) return;
          e.stopPropagation();
          if (btn.getAttribute("data-bd") === "commit" && subs.length > 0) {
            this.store.addSubtasks(task.id, subs);
            this.showToast(`Added ${subs.length} subtasks`, "success");
          }
          slot.innerHTML = "";
        }, { once: true });
      } catch (err) {
        slot.innerHTML = `<div class="task_ai_breakdown_deck"><p>${escapeHTML(err.message || "Could not generate breakdown.")}</p></div>`;
      }
    }

    async evaluateHabitWithAI(habitTitle, habitId) {
      const card = document.getElementById("habit_ai_advisory_card");
      if (!card) return;
      const lower = habitTitle.toLowerCase();
      const risky = ["smoke", "smoking", "cigarette", "vape", "doomscroll", "junk food", "binge drink", "skip meal", "procrastinat"];
      const matched = risky.some((term) => lower.includes(term));

      if (!this.geminiApiKey || (typeof navigator !== "undefined" && !navigator.onLine)) {
        if (matched) {
          this.showAIAdvisoryCard(habitId, habitTitle, "This habit may undermine focus or health.", "5-minute walk or glass of water", "Swap the trigger cue with a fast healthy action.");
        }
        return;
      }

      try {
        const { data } = await this.callGeminiWithFallback({
          contents: [{ parts: [{ text: `Evaluate if habit "${habitTitle}" is unhealthy or counterproductive. Return ONLY JSON: {"isUnhealthy":boolean,"risk":"...","alternative":"...","tip":"..."}` }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
        });
        const parsed = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
        if (parsed.isUnhealthy) {
          this.showAIAdvisoryCard(habitId, habitTitle, parsed.risk, parsed.alternative, parsed.tip);
        } else {
          card.hidden = true;
        }
      } catch (_) {
        if (matched) {
          this.showAIAdvisoryCard(habitId, habitTitle, "This habit may undermine focus or health.", "5-minute mindful break", "Replace the craving with a positive cue.");
        }
      }
    }

    showAIAdvisoryCard(habitId, title, risk, alternative, tip) {
      const card = document.getElementById("habit_ai_advisory_card");
      if (!card) return;
      this.pendingUnhealthyHabit = { id: habitId, alternativeTitle: alternative || "5-minute breathing", category: "Health" };
      const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      setTxt("ai_advisory_title", `Health Check: "${title}"`);
      setTxt("ai_advisory_reason", risk || "May reduce long-term focus.");
      setTxt("ai_advisory_alternative", alternative || "5-minute breathing");
      setTxt("ai_advisory_tip", tip || "");
      card.hidden = false;
    }

    async analyzeHabitsWithAI(customPrompt = null) {
      const box = document.getElementById("habit_ai_coach_results");
      if (!box) return;
      if (!this.geminiApiKey) {
        box.innerHTML = `<div class="ai_coach_placeholder"><p>Add your Gemini API key in Settings to unlock Habit Coach insights.</p></div>`;
        return;
      }
      if (this.store.habits.length === 0) {
        box.innerHTML = `<div class="ai_coach_placeholder"><p>Add at least 1 habit first.</p></div>`;
        return;
      }

      box.innerHTML = `<div class="ai_coach_loading">Analyzing your habit consistency...</div>`;
      const summary = this.store.habits.slice(0, 30).map((h) => ({
        title: h.title,
        category: h.category,
        streak: h.streak || 0,
        best: h.maxStreak || 0
      }));

      try {
        const { data, model } = await this.callGeminiWithFallback({
          contents: [{ parts: [{ text: `You are an Atomic Habits coach. Habits: ${JSON.stringify(summary)}. Question: "${customPrompt || "Diagnose consistency and suggest habit stacking."}". Return ONLY JSON: {"diagnosis":"...","stackingBlueprints":["After X, I will Y"],"weeklyChallenge":"..."}` }] }],
          generationConfig: { temperature: 0.3, responseMimeType: "application/json" }
        });
        const parsed = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
        const stacks = Array.isArray(parsed.stackingBlueprints) ? parsed.stackingBlueprints : [];
        // Safe strictly-escaped DOM markup (ZERO raw LLM HTML!)
        box.innerHTML = `
          <div class="ai_coach_content_rendered">
            <h4>Consistency Diagnosis</h4>
            <p>${escapeHTML(parsed.diagnosis || "")}</p>
            ${stacks.length > 0 ? `<h4>Habit Stacking Blueprint</h4><ul>${stacks.map((s) => `<li>${escapeHTML(s)}</li>`).join("")}</ul>` : ""}
            <h4>7-Day Challenge</h4>
            <p>${escapeHTML(parsed.weeklyChallenge || "")}</p>
            <div class="ai_coach_footer_meta">
              <span>Powered by ${escapeHTML(model)}</span>
              <button type="button" class="ai_prompt_chip" id="btn_reask_ai_coach">Ask Follow-up</button>
            </div>
          </div>
        `;
        document.getElementById("btn_reask_ai_coach")?.addEventListener("click", async () => {
          const q = await this.showConfirmDialog({
            title: "Ask Habit Coach",
            message: "What habit challenge would you like coaching on?",
            requireInput: true,
            inputLabel: "Question",
            inputPlaceholder: "e.g., How do I stay consistent on weekends?",
            okLabel: "Ask"
          });
          if (q) this.analyzeHabitsWithAI(q);
        });
      } catch (err) {
        box.innerHTML = `<div class="ai_coach_placeholder"><p>Coach unavailable: ${escapeHTML(err.message || "Network error")}</p></div>`;
      }
    }

    // -----------------------------------------------------------------------
    // 11. FEEDBACK: UNDO TOAST, INLINE ERROR ALERT, CELEBRATIONS & OPT-IN PiP
    // -----------------------------------------------------------------------
    showToast(message, type = "success", opts = {}) {
      if (!this.toastRegion) return;
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
        this.toastTimer = null;
      }
      this.activeToastUndo = typeof opts.onUndo === "function" ? opts.onUndo : null;

      this.toastRegion.className = `toast_region visible ${type}`;
      this.toastRegion.innerHTML = `
        <div class="toast_pill">
          <span id="toast_message" class="toast_msg">${escapeHTML(message)}</span>
          ${this.activeToastUndo ? `<button type="button" id="toast_undo_btn" class="toast_undo_btn">${escapeHTML(opts.undoLabel || "Undo")}</button>` : ""}
        </div>
      `;

      const undoBtn = document.getElementById("toast_undo_btn");
      if (undoBtn && this.activeToastUndo) {
        const fn = this.activeToastUndo;
        undoBtn.addEventListener("click", () => {
          this.activeToastUndo = null;
          this.toastRegion.classList.remove("visible");
          fn();
        }, { once: true });
      }

      this.toastTimer = setTimeout(() => {
        this.toastRegion.classList.remove("visible");
        this.activeToastUndo = null;
        this.toastTimer = null;
      }, opts.duration || (this.activeToastUndo ? 4500 : 2800));
    }

    showInlineError(message, opts = {}) {
      if (!this.inlineErrorAlert) return;
      this.inlineErrorAlert.hidden = false;
      if (this.inlineErrorText) this.inlineErrorText.textContent = message;
      if (this.inlineErrorActionBtn) {
        if (opts.actionLabel && typeof opts.onAction === "function") {
          this.inlineErrorActionBtn.hidden = false;
          this.inlineErrorActionBtn.textContent = opts.actionLabel;
          this.inlineErrorActionBtn.onclick = null;
          const clone = this.inlineErrorActionBtn.cloneNode(true);
          this.inlineErrorActionBtn.replaceWith(clone);
          this.inlineErrorActionBtn = clone;
          this.inlineErrorActionBtn.addEventListener("click", opts.onAction);
        } else {
          this.inlineErrorActionBtn.hidden = true;
        }
      }
      if (this.srAssertive) this.srAssertive.textContent = message;
    }

    hideInlineError() {
      if (this.inlineErrorAlert) this.inlineErrorAlert.hidden = true;
    }

    triggerCelebration(taskId) {
      if (prefersReducedMotion()) return;
      const card = document.querySelector(`.task_card[data-id="${CSS.escape(String(taskId))}"]`);
      if (!card) return;
      card.classList.add("celebrating");
      setTimeout(() => card.classList.remove("celebrating"), 500);
      const chk = card.querySelector(".checkbox_btn");
      if (chk) this.triggerElementCelebration(chk);
    }

    triggerElementCelebration(elementOrId) {
      if (prefersReducedMotion()) return;
      const node = typeof elementOrId === "string" ? document.getElementById(elementOrId) : elementOrId;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const colors = ["#6366f1", "#10b981", "#f43f5e", "#f59e0b"];
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      for (let i = 0; i < 10; i++) {
        const p = document.createElement("div");
        p.className = "celebration_particle";
        p.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:6px;height:6px;border-radius:50%;background:${colors[i % colors.length]};pointer-events:none;z-index:9999;`;
        document.body.appendChild(p);
        const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
        const vel = 36 + Math.random() * 44;
        const anim = p.animate(
          [
            { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
            { transform: `translate3d(${Math.cos(angle) * vel}px,${Math.sin(angle) * vel}px,0) scale(0.2)`, opacity: 0 }
          ],
          { duration: 480, easing: "cubic-bezier(0.16,1,0.3,1)" }
        );
        anim.onfinish = () => p.remove();
      }
    }

    checkOverdueDeadlines() {
      const today = getLocalDateString();
      let overdue = 0;
      for (let i = 0; i < this.store.tasks.length; i++) {
        const t = this.store.tasks[i];
        if (t.id !== "general_focus" && !t.completed && !t.isLater && t.dueDate < today) overdue += 1;
      }
      if (overdue > 0) {
        setTimeout(() => {
          NotificationService.send(
            "Overdue Focus Items",
            { body: `You have ${overdue} overdue task${overdue === 1 ? "" : "s"} waiting.` },
            this.store.notificationsEnabled
          );
        }, 1800);
      }
    }

    async openDocumentPiP() {
      if (!("documentPictureInPicture" in window)) {
        this.showToast("Picture-in-Picture is not supported in this browser", "info");
        return;
      }
      if (this.pipWindow) {
        this.closeDocumentPiP();
        return;
      }
      try {
        const pipWin = await window.documentPictureInPicture.requestWindow({ width: 320, height: 54 });
        this.pipWindow = pipWin;
        this.timerPipToggleBtn?.classList.add("active");

        const style = pipWin.document.createElement("style");
        style.textContent = `*{box-sizing:border-box;margin:0;padding:0}body{background:#0f141e;color:#f1f5f9;font-family:system-ui,sans-serif;overflow:hidden}.pip_strip{display:flex;align-items:center;justify-content:space-between;height:54px;padding:0 12px;border-bottom:2px solid #6366f1}.pip_time{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}.pip_controls{display:flex;gap:6px}.pip_btn{background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px}`;
        pipWin.document.head.appendChild(style);

        const strip = pipWin.document.createElement("div");
        strip.className = "pip_strip";
        strip.innerHTML = `<span class="pip_time" id="pip_time">25:00</span><div class="pip_controls"><button type="button" class="pip_btn" id="pip_toggle">Pause</button><button type="button" class="pip_btn" id="pip_stop">Stop</button></div>`;
        pipWin.document.body.appendChild(strip);

        const timeEl = pipWin.document.getElementById("pip_time");
        const toggleBtn = pipWin.document.getElementById("pip_toggle");
        const stopBtn = pipWin.document.getElementById("pip_stop");

        const update = (t) => {
          const m = Math.floor(Math.abs(t.duration) / 60);
          const s = Math.abs(t.duration) % 60;
          if (timeEl) timeEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
          if (toggleBtn) toggleBtn.textContent = t.isRunning ? "Pause" : "Start";
        };
        update(this.store.timer);

        toggleBtn?.addEventListener("click", () => {
          if (this.store.timer.isRunning) this.store.pauseTimer();
          else this.store.startTimer();
        });
        stopBtn?.addEventListener("click", () => {
          this.store.resetTimer();
          this.closeDocumentPiP();
        });

        this.pipUnsubscribers = [
          this.store.subscribe("timerTick", update),
          this.store.subscribe("timerStateChanged", update)
        ];
        pipWin.addEventListener("pagehide", () => this.closeDocumentPiP());
      } catch (err) {
        this.showToast("Could not open Picture-in-Picture overlay", "info");
      }
    }

    closeDocumentPiP() {
      if (this.pipUnsubscribers) {
        this.pipUnsubscribers.forEach((u) => u());
        this.pipUnsubscribers = [];
      }
      if (this.pipWindow) {
        try { this.pipWindow.close(); } catch (_) {}
        this.pipWindow = null;
      }
      this.timerPipToggleBtn?.classList.remove("active");
    }

    // Public alias for external callers / benchmark / live_agent
    setView(viewName, subOptions) {
      this.store.setView(viewName, subOptions);
    }
  }

  // =========================================================================
  // 4. EXTENSION FULL-TAB EXPANSION CONTROLLER (rAF-Throttled Resize)
  // =========================================================================
  function initExtensionControls() {
    const openTab = async () => {
      const res = await sendExtensionMessage({ type: "OPEN_FULL_TAB" });
      if (!res || !res.success) {
        if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
        } else {
          window.open("index.html", "_blank");
        }
      }
    };

    ["sidebar_expand_tab_btn", "header_expand_tab_btn", "more_expand_tab_btn"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", openTab);
    });

    const sidebarExpandBtn = document.getElementById("sidebar_expand_tab_btn");
    let resizeRaf = 0;
    const updateVisibility = () => {
      resizeRaf = 0;
      const isWide = window.innerWidth > 850;
      if (sidebarExpandBtn) sidebarExpandBtn.hidden = isWide;
    };
    window.addEventListener("resize", () => {
      if (!resizeRaf) resizeRaf = requestAnimationFrame(updateVisibility);
    }, { passive: true });
    updateVisibility();
  }

  // =========================================================================
  // 5. ASYNCHRONOUS BOOTLOADER (MV3-Safe Error Recovery — Zero Inline onclick)
  // =========================================================================
  try {
    if (!Storage || !VirtualList) {
      throw new Error("Required Aurora modules (storage.js / virtual_list.js) did not load.");
    }

    await Storage.init();
    const initialData = await Storage.loadInitialData();
    const store = new TaskStore(initialData);
    await store.loadExtraPreferences();

    const app = new AppController(store);
    window.indigoApp = app;
    await app.finalizeBoot();
    initExtensionControls();
  } catch (err) {
    console.error("Aurora Companion boot error:", err);
    const appEl = document.getElementById("app") || document.body;
    const errorBox = document.createElement("div");
    errorBox.className = "db_fatal_error_banner";
    errorBox.setAttribute("role", "alert");

    const heading = document.createElement("h2");
    heading.textContent = "Storage Initialization Failed";
    const detail = document.createElement("p");
    detail.textContent = "Aurora Companion could not access local IndexedDB storage. Check browser storage permissions or disk space.";
    const reloadBtn = document.createElement("button");
    reloadBtn.type = "button";
    reloadBtn.className = "sheet_primary_commit";
    reloadBtn.textContent = "Reload Application";
    reloadBtn.addEventListener("click", () => window.location.reload());

    errorBox.append(heading, detail, reloadBtn);
    appEl.appendChild(errorBox);
  }
});
