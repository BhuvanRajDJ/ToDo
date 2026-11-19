/**
 * Aurora Companion - Gemini Live Voice Companion (MV3 Safe)
 * Real-time bidirectional voice coaching and hands-free task/habit/timer/journal control.
 *
 * Contract alignments (#13 & #14):
 * - Native <dialog id="gemini_live_dialog"> with clean teardown on close/Esc/backdrop dismiss
 * - Unified API key sync via window.AuroraStorage (chrome.storage.local + localStorage fallback)
 * - Dynamic bidiGenerateContent model discovery from Gemini v1beta/models
 * - Unified journal schema (eveningReflection + morningMood) matching Journal UI
 * - Zero duplicate window.indigoApp.render() calls (store events drive UI updates)
 * - Side Panel mic permission recovery CTA (#live_mic_permission_cta + #live_open_tab_for_mic_btn)
 */

(function () {
  "use strict";

  const STORAGE_KEY_API_KEY = "aurora_gemini_api_key";
  const STORAGE_KEY_LIVE_MODEL = "aurora_gemini_live_model";
  const WS_BASE_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
  const MODELS_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

  let socket = null;
  let audioContext = null;
  let mediaStream = null;
  let audioInputSource = null;
  let audioProcessorNode = null;
  let muteGainNode = null;
  let isSessionActive = false;
  let isConnecting = false;
  let nextPlayTime = 0;
  let activeAudioSources = [];
  let currentTranscriptSender = null;
  let currentTranscriptNode = null;
  let interimUserNode = null;

  // DOM Elements (bound in init)
  let liveDialog = null;
  let closeBtn = null;
  let headerLiveBtn = null;
  let toggleSessionBtn = null;
  let apiKeyInput = null;
  let statusText = null;
  let statusDot = null;
  let liveOrb = null;
  let transcriptBox = null;
  let micPermissionCta = null;
  let openTabForMicBtn = null;

  // -------------------------------------------------------------------------
  // Unified Storage Helpers (AuroraStorage -> chrome.storage.local -> localStorage)
  // -------------------------------------------------------------------------
  async function loadApiKey() {
    let key = "";
    try {
      if (window.AuroraStorage?.getApiKey) {
        key = await window.AuroraStorage.getApiKey();
      } else if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const res = await chrome.storage.local.get(STORAGE_KEY_API_KEY);
        key = res[STORAGE_KEY_API_KEY] || "";
      } else {
        key = localStorage.getItem(STORAGE_KEY_API_KEY) || "";
      }
    } catch (err) {
      console.warn("Aurora Live: Failed to load API key:", err);
    }
    if (apiKeyInput && document.activeElement !== apiKeyInput) {
      apiKeyInput.value = key || "";
    }
    return key || "";
  }

  async function saveApiKey(key) {
    try {
      if (window.AuroraStorage?.setApiKey) {
        await window.AuroraStorage.setApiKey(key);
        return;
      }
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        await chrome.storage.local.set({ [STORAGE_KEY_API_KEY]: key });
      }
      localStorage.setItem(STORAGE_KEY_API_KEY, key);
    } catch (err) {
      console.warn("Aurora Live: Failed to save API key:", err);
    }
  }

  async function loadCachedLiveModel() {
    try {
      if (window.AuroraStorage?.getExtensionLocal) {
        return (await window.AuroraStorage.getExtensionLocal(STORAGE_KEY_LIVE_MODEL, "")) || "";
      }
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const res = await chrome.storage.local.get(STORAGE_KEY_LIVE_MODEL);
        return res[STORAGE_KEY_LIVE_MODEL] || "";
      }
      return localStorage.getItem(STORAGE_KEY_LIVE_MODEL) || "";
    } catch (_) {
      return "";
    }
  }

  async function saveCachedLiveModel(modelName) {
    try {
      if (window.AuroraStorage?.setExtensionLocal) {
        await window.AuroraStorage.setExtensionLocal(STORAGE_KEY_LIVE_MODEL, modelName);
        return;
      }
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        await chrome.storage.local.set({ [STORAGE_KEY_LIVE_MODEL]: modelName });
      }
      localStorage.setItem(STORAGE_KEY_LIVE_MODEL, modelName);
    } catch (_) {}
  }

  async function resolveLiveModel(apiKey, forceRefresh = false) {
    if (!forceRefresh) {
      const cached = await loadCachedLiveModel();
      if (cached && cached.startsWith("models/")) {
        return cached;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${MODELS_API_URL}?key=${encodeURIComponent(apiKey)}`, {
        signal: controller.signal
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error?.message || `API key validation failed (HTTP ${res.status}).`);
      }
      const payload = await res.json();
      const models = Array.isArray(payload.models) ? payload.models : [];
      const bidiModels = models.filter(
        (m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("bidiGenerateContent")
      );

      if (bidiModels.length === 0) {
        throw new Error("No Gemini Live (bidiGenerateContent) model is enabled for this API key.");
      }

      const rankModel = (name) => {
        const lower = String(name || "").toLowerCase();
        if (lower.includes("native-audio") && lower.includes("2.5")) return 0;
        if (lower.includes("native-audio")) return 1;
        if (lower.includes("live") && lower.includes("2.5")) return 2;
        if (lower.includes("live") && lower.includes("2.0")) return 3;
        if (lower.includes("flash")) return 4;
        return 5;
      };

      bidiModels.sort((a, b) => rankModel(a.name) - rankModel(b.name));
      const chosen = bidiModels[0].name.startsWith("models/")
        ? bidiModels[0].name
        : `models/${bidiModels[0].name}`;
      await saveCachedLiveModel(chosen);
      return chosen;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("Timed out discovering Gemini Live models. Check your internet connection.");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // -------------------------------------------------------------------------
  // Dialog & Status Helpers
  // -------------------------------------------------------------------------
  function hideMicPermissionCta() {
    if (micPermissionCta) {
      micPermissionCta.hidden = true;
    }
  }

  function showMicPermissionCta() {
    if (micPermissionCta) {
      micPermissionCta.hidden = false;
    }
  }

  async function openFullTabForMic() {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        const response = await chrome.runtime.sendMessage({ type: "OPEN_FULL_TAB" });
        if (response?.success) return;
      }
    } catch (_) {}
    window.open("index.html", "_blank", "noopener");
  }

  function openLiveDialog() {
    if (!liveDialog) return;
    hideMicPermissionCta();
    void loadApiKey();

    if (typeof liveDialog.showModal === "function") {
      if (!liveDialog.open) {
        liveDialog.showModal();
      }
    } else {
      liveDialog.style.display = "flex";
    }
  }

  function closeLiveDialog() {
    if (isSessionActive || isConnecting) {
      stopLiveSession();
    }
    if (!liveDialog) return;

    if (typeof liveDialog.close === "function") {
      if (liveDialog.open) {
        liveDialog.close();
      }
    } else {
      liveDialog.style.display = "none";
    }
  }

  function setStatus(state, message) {
    if (statusText) {
      statusText.textContent = message;
    }

    if (liveOrb) {
      liveOrb.classList.remove("listening", "speaking", "thinking", "error");
      if (state && state !== "idle") {
        liveOrb.classList.add(state);
      }
    }

    if (statusDot) {
      statusDot.className = `live_status_dot ${state || "idle"}`;
    }
  }

  // -------------------------------------------------------------------------
  // Safe Transcript Rendering (zero unescaped innerHTML)
  // -------------------------------------------------------------------------
  function createTranscriptParagraph(sender, text, extraClass = "") {
    const p = document.createElement("p");
    p.className = `transcript_entry ${sender}${extraClass ? ` ${extraClass}` : ""}`;

    const strong = document.createElement("strong");
    const speaker = sender === "user" ? "You" : (sender === "system" ? "System" : "Aurora");
    strong.textContent = `${speaker}: `;

    const span = document.createElement("span");
    span.className = "transcript_text";
    span.textContent = text;

    p.appendChild(strong);
    p.appendChild(span);
    return p;
  }

  function appendTranscript(sender, text, isChunk = false) {
    if (!transcriptBox || !text) return;
    const placeholder = transcriptBox.querySelector(".transcript_placeholder");
    if (placeholder) placeholder.remove();

    if (isChunk && currentTranscriptSender === sender && currentTranscriptNode) {
      const textSpan = currentTranscriptNode.querySelector(".transcript_text");
      if (textSpan) {
        textSpan.textContent += text;
      }
    } else {
      const p = createTranscriptParagraph(sender, text);
      transcriptBox.appendChild(p);
      currentTranscriptSender = sender;
      currentTranscriptNode = p;
    }
    transcriptBox.scrollTop = transcriptBox.scrollHeight;
  }

  function updateInterimUserTranscript(text) {
    if (!transcriptBox || !text) return;
    const placeholder = transcriptBox.querySelector(".transcript_placeholder");
    if (placeholder) placeholder.remove();

    if (!interimUserNode) {
      interimUserNode = createTranscriptParagraph("user", text, "interim");
      interimUserNode.style.opacity = "0.7";
      transcriptBox.appendChild(interimUserNode);
    } else {
      const span = interimUserNode.querySelector(".transcript_text");
      if (span) span.textContent = text;
    }
    transcriptBox.scrollTop = transcriptBox.scrollHeight;
  }

  function clearInterimUserTranscript() {
    if (interimUserNode) {
      interimUserNode.remove();
      interimUserNode = null;
    }
  }

  function finalizeTranscriptTurn() {
    currentTranscriptSender = null;
    currentTranscriptNode = null;
  }

  // -------------------------------------------------------------------------
  // Start & Run Gemini Live Session
  // -------------------------------------------------------------------------
  async function startLiveSession() {
    if (isSessionActive || isConnecting) return;

    if (!navigator.onLine) {
      setStatus("error", "You appear to be offline. Connect to the internet for Voice Companion.");
      return;
    }

    const apiKey = apiKeyInput?.value?.trim() || (await loadApiKey());
    if (!apiKey) {
      setStatus("error", "Enter your Gemini API key below (or in Settings) to start.");
      if (apiKeyInput) apiKeyInput.focus();
      return;
    }

    isConnecting = true;
    hideMicPermissionCta();
    await saveApiKey(apiKey);

    if (toggleSessionBtn) {
      toggleSessionBtn.disabled = true;
      toggleSessionBtn.textContent = "Connecting...";
    }

    // Initialize AudioContext inside user activation gesture
    try {
      if (!audioContext || audioContext.state === "closed") {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      }
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      nextPlayTime = audioContext.currentTime;
    } catch (audioErr) {
      console.warn("Aurora Live: AudioContext init warning:", audioErr);
    }

    let liveModel;
    try {
      setStatus("thinking", "Discovering Gemini Live model...");
      liveModel = await resolveLiveModel(apiKey, false);
    } catch (modelErr) {
      isConnecting = false;
      setStatus("error", modelErr.message || "Unable to find a live voice model for this key.");
      resetSessionButton();
      return;
    }

    setStatus("thinking", "Connecting to Aurora Voice...");

    try {
      const wsUrl = `${WS_BASE_URL}?key=${encodeURIComponent(apiKey)}`;
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setStatus("thinking", "Configuring voice session...");
        const setupMessage = buildSetupMessage(liveModel);
        socket.send(JSON.stringify(setupMessage));
      };

      socket.onmessage = async (event) => {
        try {
          let data;
          if (event.data instanceof Blob) {
            const text = await event.data.text();
            data = JSON.parse(text);
          } else {
            data = JSON.parse(event.data);
          }

          if (data.setupComplete) {
            try {
              await startAudioRecording();
            } catch (micErr) {
              handleMicrophoneError(micErr);
              stopLiveSession(true);
              return;
            }
            isConnecting = false;
            isSessionActive = true;
            hideMicPermissionCta();
            setStatus("listening", "Listening... Speak to Aurora.");
            if (toggleSessionBtn) {
              toggleSessionBtn.disabled = false;
              toggleSessionBtn.textContent = "End Live Session";
              toggleSessionBtn.classList.add("danger");
            }
            return;
          }

          await handleServerMessage(data);
        } catch (err) {
          console.error("Aurora Live: Error parsing server message:", err);
        }
      };

      socket.onerror = () => {
        if (isConnecting || isSessionActive) {
          setStatus("error", "Connection error. Check your API key and network.");
          stopLiveSession(true);
        }
      };

      socket.onclose = async (event) => {
        const abnormal = event.code !== 1000 && event.code !== 1005;
        if (abnormal) {
          // Clear cached live model in case model ID was deprecated
          if (event.code === 1008 || /not found|unsupported|invalid/i.test(event.reason || "")) {
            await saveCachedLiveModel("");
          }
          setStatus("error", `Disconnected: ${event.reason || `Code ${event.code}`}`);
          stopLiveSession(true);
        } else if (isSessionActive || isConnecting) {
          stopLiveSession(false);
        }
      };
    } catch (err) {
      setStatus("error", `Could not start session: ${err.message || String(err)}`);
      stopLiveSession(true);
    }
  }

  function handleMicrophoneError(err) {
    const errName = err?.name || "";
    const isPermissionIssue =
      errName === "NotAllowedError" ||
      errName === "PermissionDeniedError" ||
      errName === "SecurityError";

    if (isPermissionIssue) {
      setStatus(
        "error",
        "Microphone access is blocked in the Side Panel. Open Aurora in a full tab once to grant microphone permission."
      );
      showMicPermissionCta();
    } else if (errName === "NotFoundError") {
      setStatus("error", "No microphone detected. Connect a microphone and try again.");
    } else {
      setStatus("error", `Microphone error: ${err?.message || "Unable to access microphone."}`);
    }
  }

  function buildSetupMessage(liveModel) {
    const store = window.indigoApp?.store;
    const profile = store?.personalityProfile;
    let systemPromptText =
      "You are Aurora, an executive and mindful productivity companion. You provide full hands-free operational control of the user's tasks, atomic habits, daily routines, focus timer, and journal reflections. Speak concisely, supportively, and directly.";

    if (profile && profile.archetype) {
      systemPromptText += ` The user's archetype is '${profile.archetype}'. Peak clarity window: '${profile.chronotypeLabel || profile.chronotype || "Morning"}'. Pacing: '${profile.pacingLabel || profile.pacing || "Sprints"}'. Coaching voice: '${profile.coachVoiceLabel || profile.coachVoice || "Stoic"}'. Match this coaching tone consistently.`;
    }

    systemPromptText +=
      " Execute the tools immediately when asked to create, complete, update, or delete tasks, log habits, start or pause the focus timer, or log reflections. After executing a tool, confirm in one brief spoken sentence.";

    return {
      setup: {
        model: liveModel,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede"
              }
            }
          }
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: {
          parts: [{ text: systemPromptText }]
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "manage_task",
                description: "Manage tasks in the focus pipeline: create, complete, update, delete, list, or add subtasks.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    action: {
                      type: "STRING",
                      enum: ["create", "complete", "delete", "update", "add_subtask", "list"],
                      description: "Action to execute"
                    },
                    title: { type: "STRING", description: "Title of the task or search query" },
                    taskId: { type: "INTEGER", description: "Optional numeric task ID" },
                    priority: { type: "STRING", enum: ["Low", "Medium", "High"], description: "Priority level" },
                    category: { type: "STRING", description: "Category: Inbox, Work, Personal, Health, Finance, Routine" },
                    subtaskTitle: { type: "STRING", description: "Title of subtask to add" },
                    estimatedDuration: { type: "INTEGER", description: "Estimated duration in minutes" }
                  },
                  required: ["action"]
                }
              },
              {
                name: "manage_habit",
                description: "Manage atomic habits and streak tracking: create, log completion, delete, or list.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    action: {
                      type: "STRING",
                      enum: ["create", "complete", "delete", "list", "get_streaks"],
                      description: "Action to execute"
                    },
                    title: { type: "STRING", description: "Habit title or name to find" },
                    habitId: { type: "STRING", description: "Optional habit ID" },
                    category: { type: "STRING", description: "Category: Routine, Health, Mind, Skill, Work" }
                  },
                  required: ["action"]
                }
              },
              {
                name: "control_focus_timer",
                description: "Control the Pomodoro focus timer: start, pause, reset, or switch modes.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    action: {
                      type: "STRING",
                      enum: ["start", "pause", "reset", "switch_mode"],
                      description: "Timer action"
                    },
                    mode: {
                      type: "STRING",
                      enum: ["pomodoro", "shortBreak", "longBreak", "stopwatch"],
                      description: "Timer mode"
                    },
                    durationMinutes: { type: "INTEGER", description: "Optional duration in minutes" },
                    taskTitle: { type: "STRING", description: "Optional task title to link this focus session to" }
                  },
                  required: ["action"]
                }
              },
              {
                name: "get_behavioral_profile_and_insights",
                description: "Retrieve user's behavioral personality profile and consistency metrics."
              },
              {
                name: "log_reflection_journal",
                description: "Log mindful reflection, daily mood, energy level, or wins into today's journal.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    reflection: { type: "STRING", description: "Mindful reflection text" },
                    mood: {
                      type: "STRING",
                      enum: ["great", "good", "neutral", "drained", "stressed"],
                      description: "Current emotional valence"
                    },
                    energy: { type: "INTEGER", description: "Energy rating from 1 to 5" },
                    wins: { type: "STRING", description: "Daily win or achievement" }
                  },
                  required: ["reflection"]
                }
              },
              {
                name: "create_task",
                description: "Create a new focus task in the user's pipeline.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    title: { type: "STRING", description: "Title of the task" },
                    priority: { type: "STRING", enum: ["Low", "Medium", "High"], description: "Task priority" },
                    category: { type: "STRING", description: "Category: Inbox, Work, Personal, Health, Finance" }
                  },
                  required: ["title"]
                }
              },
              {
                name: "get_todays_focus",
                description: "Retrieve summary of user's active tasks and completion streak."
              }
            ]
          }
        ]
      }
    };
  }

  // -------------------------------------------------------------------------
  // Server Content & Tool Execution (zero duplicate render() calls)
  // -------------------------------------------------------------------------
  async function handleServerMessage(data) {
    if (data.serverContent) {
      if (data.serverContent.interimInputTranscription?.text) {
        updateInterimUserTranscript(data.serverContent.interimInputTranscription.text);
      }
      if (data.serverContent.inputTranscription?.text) {
        clearInterimUserTranscript();
        finalizeTranscriptTurn();
        appendTranscript("user", data.serverContent.inputTranscription.text, false);
        finalizeTranscriptTurn();
      }
      if (data.serverContent.outputTranscription?.text) {
        appendTranscript("model", data.serverContent.outputTranscription.text, true);
      }

      const parts = data.serverContent.modelTurn?.parts || [];
      for (const part of parts) {
        if (part.text) {
          appendTranscript("model", part.text, true);
        }
        if (part.inlineData && part.inlineData.mimeType?.startsWith("audio/")) {
          playAudioChunk(part.inlineData.data);
        }
      }

      if (data.serverContent.interrupted) {
        clearInterimUserTranscript();
        finalizeTranscriptTurn();
        stopAudioPlayback();
        setStatus("listening", "Listening... Speak anytime.");
      }

      if (data.serverContent.turnComplete) {
        clearInterimUserTranscript();
        finalizeTranscriptTurn();
        setStatus("listening", "Listening... Speak anytime.");
      }
    }

    if (data.toolCall) {
      finalizeTranscriptTurn();
      await handleToolCalls(data.toolCall);
    }
  }

  function getTodayDateString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function mapVoiceMoodToJournalMood(mood) {
    const map = {
      great: "energized",
      good: "calm",
      neutral: "peaceful",
      drained: "tired",
      stressed: "tired"
    };
    return map[mood] || "calm";
  }

  function findTaskByQuery(tasks, query, id) {
    if (id !== undefined && id !== null && id !== "") {
      const match = tasks.find((t) => String(t.id) === String(id));
      if (match) return match;
    }
    if (!query || typeof query !== "string") return null;
    const q = query.trim().toLowerCase();
    const exact = tasks.find((t) => (t.title || "").toLowerCase() === q);
    if (exact) return exact;
    const starts = tasks.find((t) => (t.title || "").toLowerCase().startsWith(q));
    if (starts) return starts;
    return tasks.find((t) => (t.title || "").toLowerCase().includes(q) || q.includes((t.title || "").toLowerCase())) || null;
  }

  function findHabitByQuery(habits, query, id) {
    if (id) {
      const match = habits.find((h) => h.id === id);
      if (match) return match;
    }
    if (!query || typeof query !== "string") return null;
    const q = query.trim().toLowerCase();
    const exact = habits.find((h) => (h.title || "").toLowerCase() === q);
    if (exact) return exact;
    return habits.find((h) => (h.title || "").toLowerCase().includes(q) || q.includes((h.title || "").toLowerCase())) || null;
  }

  async function handleToolCalls(toolCall) {
    const calls = toolCall.functionCalls || [];
    const responses = [];
    const store = window.indigoApp?.store;

    for (const call of calls) {
      setStatus("thinking", `Executing: ${call.name}...`);
      let result = { success: true };

      if (!store) {
        result = { success: false, error: "TaskStore is not ready." };
      } else if (call.name === "manage_task" || call.name === "create_task") {
        const action = call.args?.action || (call.name === "create_task" ? "create" : "list");
        const tasks = (store.tasks || []).filter((t) => t.id !== "general_focus");

        if (action === "create") {
          const title = (call.args?.title || "New Voice Task").trim();
          const priority = call.args?.priority || "Medium";
          const category = call.args?.category || "Inbox";
          const estimatedDuration = parseInt(call.args?.estimatedDuration, 10) || 25;
          const dueDate = call.args?.dueDate || getTodayDateString();

          const newTask = store.addTask({
            title,
            priority,
            category,
            estimatedDuration,
            dueDate,
            description: "Captured via Aurora Live Voice"
          });
          appendTranscript("system", `Created task: "${title}" (${priority} in ${category}).`);
          result = { success: true, taskId: newTask?.id, message: `Created task "${title}".` };
        } else if (action === "complete") {
          const task = findTaskByQuery(tasks, call.args?.title, call.args?.taskId);
          if (task) {
            store.toggleTaskComplete(task.id);
            const state = task.completed ? "completed" : "active";
            appendTranscript("system", `Marked "${task.title}" as ${state}.`);
            result = { success: true, taskId: task.id, completed: task.completed, message: `Task "${task.title}" is now ${state}.` };
          } else {
            result = { success: false, error: `Task matching "${call.args?.title || call.args?.taskId}" was not found.` };
          }
        } else if (action === "delete") {
          const task = findTaskByQuery(tasks, call.args?.title, call.args?.taskId);
          if (task) {
            const deletedTitle = task.title;
            store.deleteTask(task.id);
            appendTranscript("system", `Deleted task: "${deletedTitle}".`);
            result = { success: true, message: `Task "${deletedTitle}" deleted.` };
          } else {
            result = { success: false, error: `Task matching "${call.args?.title || call.args?.taskId}" was not found.` };
          }
        } else if (action === "update") {
          const task = findTaskByQuery(tasks, call.args?.title, call.args?.taskId);
          if (task) {
            const updates = {};
            if (call.args?.priority) updates.priority = call.args.priority;
            if (call.args?.category) updates.category = call.args.category;
            if (call.args?.estimatedDuration) updates.estimatedDuration = parseInt(call.args.estimatedDuration, 10);
            store.updateTask(task.id, updates);
            appendTranscript("system", `Updated task "${task.title}".`);
            result = { success: true, taskId: task.id, message: `Updated task "${task.title}".` };
          } else {
            result = { success: false, error: `Task matching "${call.args?.title}" was not found.` };
          }
        } else if (action === "add_subtask") {
          const task = findTaskByQuery(tasks, call.args?.title, call.args?.taskId);
          const subtaskTitle = call.args?.subtaskTitle?.trim();
          if (task && subtaskTitle) {
            store.addSubtask(task.id, subtaskTitle);
            appendTranscript("system", `Added subtask "${subtaskTitle}" to "${task.title}".`);
            result = { success: true, taskId: task.id, message: `Added subtask "${subtaskTitle}" to "${task.title}".` };
          } else {
            result = { success: false, error: "Task not found or subtask title was missing." };
          }
        } else if (action === "list") {
          const uncompleted = tasks.filter((t) => !t.completed);
          result = {
            totalTasks: tasks.length,
            activeCount: uncompleted.length,
            activeTasks: uncompleted.slice(0, 8).map((t) => ({
              id: t.id,
              title: t.title,
              priority: t.priority,
              category: t.category,
              duration: t.estimatedDuration
            }))
          };
        }
      } else if (call.name === "manage_habit") {
        const action = call.args?.action || "list";
        const habits = store.habits || [];
        const today = getTodayDateString();

        if (action === "create") {
          const title = (call.args?.title || "New Habit").trim();
          const category = call.args?.category?.trim() || "Routine";
          const habit = store.addHabit(title, category, "indigo");
          appendTranscript("system", `Created habit: "${title}" (${category}).`);
          result = { success: true, habitId: habit?.id, message: `Created habit "${title}".` };
        } else if (action === "complete") {
          const habit = findHabitByQuery(habits, call.args?.title, call.args?.habitId);
          if (habit) {
            store.toggleHabitCompletion(habit.id, today);
            const doneToday = Boolean(habit.history?.[today]);
            const streak = habit.streak || 0;
            appendTranscript("system", `Habit "${habit.title}" updated. Streak: ${streak}d.`);
            result = { success: true, habitId: habit.id, doneToday, streak, message: `Habit "${habit.title}" logged. Streak: ${streak} days.` };
          } else {
            result = { success: false, error: `Could not find habit matching "${call.args?.title || call.args?.habitId}".` };
          }
        } else if (action === "delete") {
          const habit = findHabitByQuery(habits, call.args?.title, call.args?.habitId);
          if (habit) {
            const deletedTitle = habit.title;
            store.deleteHabit(habit.id);
            appendTranscript("system", `Deleted habit: "${deletedTitle}".`);
            result = { success: true, message: `Habit "${deletedTitle}" deleted.` };
          } else {
            result = { success: false, error: `Could not find habit matching "${call.args?.title || call.args?.habitId}".` };
          }
        } else if (action === "list" || action === "get_streaks") {
          result = {
            totalHabits: habits.length,
            habits: habits.map((h) => ({
              id: h.id,
              title: h.title,
              category: h.category,
              streak: h.streak || 0,
              maxStreak: h.maxStreak || 0,
              doneToday: Boolean(h.history?.[today])
            }))
          };
        }
      } else if (call.name === "control_focus_timer") {
        const action = call.args?.action || "start";
        const timer = store.timer;

        if (action === "start") {
          let matchedTaskId = null;
          if (call.args?.taskTitle) {
            const task = findTaskByQuery(store.tasks || [], call.args.taskTitle);
            if (task) matchedTaskId = task.id;
          }

          if (call.args?.mode && ["pomodoro", "shortBreak", "longBreak", "stopwatch"].includes(call.args.mode)) {
            if (timer.isRunning) store.pauseTimer();
            store.changeTimerType(call.args.mode);
          }

          if (call.args?.durationMinutes) {
            const mins = Math.max(1, Math.min(180, parseInt(call.args.durationMinutes, 10)));
            if (typeof store.setCustomTimerDuration === "function") {
              store.setCustomTimerDuration(mins * 60);
            } else {
              timer.duration = mins * 60;
              timer.totalDuration = timer.duration;
            }
          }

          store.startTimer(matchedTaskId);
          const minsLeft = Math.ceil((timer.duration || 0) / 60);
          appendTranscript("system", `Focus timer started (${minsLeft}m, ${timer.type}).`);
          result = { success: true, isRunning: true, durationMinutes: minsLeft, mode: timer.type, message: `Focus timer started for ${minsLeft} minutes.` };
        } else if (action === "pause") {
          store.pauseTimer();
          appendTranscript("system", "Focus timer paused.");
          result = { success: true, isRunning: false, message: "Focus timer paused." };
        } else if (action === "reset") {
          store.resetTimer();
          appendTranscript("system", "Focus timer reset.");
          result = { success: true, isRunning: false, message: "Focus timer reset." };
        } else if (action === "switch_mode") {
          const mode = call.args?.mode;
          if (["pomodoro", "shortBreak", "longBreak", "stopwatch"].includes(mode)) {
            if (timer.isRunning) store.pauseTimer();
            store.changeTimerType(mode);
            appendTranscript("system", `Switched timer mode to ${mode}.`);
            result = { success: true, mode, message: `Timer switched to ${mode}.` };
          } else {
            result = { success: false, error: "Invalid mode. Use pomodoro, shortBreak, longBreak, or stopwatch." };
          }
        }
      } else if (call.name === "get_behavioral_profile_and_insights" || call.name === "get_todays_focus") {
        const profile = store.personalityProfile || null;
        const tasks = (store.tasks || []).filter((t) => t.id !== "general_focus");
        const uncompleted = tasks.filter((t) => !t.completed);
        const completedCount = typeof store.completedCount === "number"
          ? store.completedCount
          : tasks.filter((t) => t.completed).length;
        const habits = store.habits || [];
        const today = getTodayDateString();
        const todayJournal = store.journal?.[today] || null;

        result = {
          hasProfile: Boolean(profile),
          profile: profile
            ? {
                archetype: profile.archetype,
                superpower: profile.superpower,
                chronotype: profile.chronotypeLabel || profile.chronotype,
                pacing: profile.pacingLabel || profile.pacing,
                coachVoice: profile.coachVoiceLabel || profile.coachVoice,
                capacityLimit: profile.capacityLimit || 3
              }
            : null,
          productivityMetrics: {
            activeTasksCount: uncompleted.length,
            completedTasksCount: completedCount,
            topPriorities: uncompleted.slice(0, 3).map((t) => t.title),
            habitsStreakSummary: habits.map((h) => ({
              title: h.title,
              streak: h.streak || 0,
              doneToday: Boolean(h.history?.[today])
            })),
            timerState: {
              isRunning: Boolean(store.timer?.isRunning),
              type: store.timer?.type || "pomodoro",
              durationMinutes: Math.ceil((store.timer?.duration || 0) / 60)
            },
            todayJournalEntry: todayJournal
              ? {
                  mood: todayJournal.morningMood || todayJournal.mood || "",
                  morningIntention: todayJournal.morningIntention || "",
                  eveningReflection: todayJournal.eveningReflection || todayJournal.reflection || ""
                }
              : null
          }
        };
      } else if (call.name === "log_reflection_journal") {
        const today = getTodayDateString();
        const reflection = (call.args?.reflection || "Daily voice reflection.").trim();
        const mood = call.args?.mood || "good";
        const morningMood = mapVoiceMoodToJournalMood(mood);
        const energy = Math.max(1, Math.min(5, parseInt(call.args?.energy, 10) || 4));
        const wins = (call.args?.wins || "").trim();

        const existing = store.journal?.[today] || {};
        const addition = wins ? `${reflection}\n\n**Win:** ${wins}` : reflection;
        const mergedReflection = existing.eveningReflection
          ? `${existing.eveningReflection.trim()}\n\n${addition}`
          : addition;

        store.saveJournalEntry(today, {
          morningIntention: existing.morningIntention || "",
          morningMood,
          eveningReflection: mergedReflection,
          shutdownComplete: Boolean(existing.shutdownComplete),
          mood,
          energy,
          wins,
          loggedVia: "Aurora Voice Companion",
          updatedAt: new Date().toISOString()
        });
        appendTranscript("system", "Saved reflection to today's Journal.");
        result = { success: true, date: today, message: "Reflection logged into today's journal." };
      }

      responses.push({
        response: { output: result },
        id: call.id
      });
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          toolResponse: {
            functionResponses: responses
          }
        })
      );
    }
  }

  // -------------------------------------------------------------------------
  // Audio Capture (PCM 16kHz Mono) & Playback (PCM 24kHz)
  // -------------------------------------------------------------------------
  async function startAudioRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone capture is not supported in this browser context.");
    }

    if (!audioContext || audioContext.state === "closed") {
      audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    }
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    nextPlayTime = audioContext.currentTime;

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    audioInputSource = audioContext.createMediaStreamSource(mediaStream);

    const bufferSize = 4096;
    const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

    processor.onaudioprocess = (e) => {
      if (!isSessionActive || !socket || socket.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      const base64Chunk = bufferToBase64(pcm16.buffer);
      socket.send(
        JSON.stringify({
          realtimeInput: {
            audio: {
              mimeType: "audio/pcm;rate=16000",
              data: base64Chunk
            }
          }
        })
      );
    };

    muteGainNode = audioContext.createGain();
    muteGainNode.gain.value = 0;
    audioInputSource.connect(processor);
    processor.connect(muteGainNode);
    muteGainNode.connect(audioContext.destination);
    audioProcessorNode = processor;
  }

  function bufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  function playAudioChunk(base64Data) {
    try {
      if (!audioContext || audioContext.state === "closed") return;
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }
      setStatus("speaking", "Aurora speaking...");

      const binaryStr = window.atob(base64Data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const sampleCount = Math.floor(len / 2);
      const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, sampleCount);
      const audioBuffer = audioContext.createBuffer(1, pcm16.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < pcm16.length; i++) {
        channelData[i] = pcm16[i] / 32768.0;
      }

      const sourceNode = audioContext.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(audioContext.destination);

      sourceNode.onended = () => {
        const idx = activeAudioSources.indexOf(sourceNode);
        if (idx !== -1) activeAudioSources.splice(idx, 1);
        if (activeAudioSources.length === 0 && isSessionActive) {
          setStatus("listening", "Listening... Speak to Aurora.");
        }
      };
      activeAudioSources.push(sourceNode);

      const startTime = Math.max(audioContext.currentTime, nextPlayTime);
      sourceNode.start(startTime);
      nextPlayTime = startTime + audioBuffer.duration;
    } catch (err) {
      console.error("Aurora Live: Error playing audio chunk:", err);
    }
  }

  function stopAudioPlayback() {
    while (activeAudioSources.length > 0) {
      const src = activeAudioSources.pop();
      try {
        src.stop();
        src.disconnect();
      } catch (_) {}
    }
    if (audioContext) {
      nextPlayTime = audioContext.currentTime;
    }
  }

  function resetSessionButton() {
    if (toggleSessionBtn) {
      toggleSessionBtn.disabled = false;
      toggleSessionBtn.textContent = "Start Live Session";
      toggleSessionBtn.classList.remove("danger");
    }
  }

  function stopLiveSession(preserveErrorStatus = false) {
    isSessionActive = false;
    isConnecting = false;
    finalizeTranscriptTurn();
    clearInterimUserTranscript();
    stopAudioPlayback();

    if (socket) {
      const activeSock = socket;
      socket = null;
      try {
        activeSock.onopen = null;
        activeSock.onmessage = null;
        activeSock.onerror = null;
        activeSock.onclose = null;
        activeSock.close(1000, "User ended session");
      } catch (_) {}
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    if (audioProcessorNode) {
      try {
        audioProcessorNode.onaudioprocess = null;
        audioProcessorNode.disconnect();
      } catch (_) {}
      audioProcessorNode = null;
    }

    if (muteGainNode) {
      try {
        muteGainNode.disconnect();
      } catch (_) {}
      muteGainNode = null;
    }

    if (audioInputSource) {
      try {
        audioInputSource.disconnect();
      } catch (_) {}
      audioInputSource = null;
    }

    if (audioContext) {
      const ctx = audioContext;
      audioContext = null;
      try {
        void ctx.close();
      } catch (_) {}
    }

    if (!preserveErrorStatus) {
      setStatus("idle", "Ready to connect with Aurora");
    }
    resetSessionButton();
  }

  // -------------------------------------------------------------------------
  // Initialization & Cross-Context API Key Sync
  // -------------------------------------------------------------------------
  function init() {
    liveDialog = document.getElementById("gemini_live_dialog");
    closeBtn = document.getElementById("close_live_dialog");
    headerLiveBtn = document.getElementById("header_gemini_live_btn");
    toggleSessionBtn = document.getElementById("toggle_live_session_btn");
    apiKeyInput = document.getElementById("gemini_api_key_input");
    statusText = document.getElementById("live_status_text");
    statusDot = document.getElementById("live_status_dot");
    liveOrb = document.getElementById("live_orb");
    transcriptBox = document.getElementById("live_transcript_box");
    micPermissionCta = document.getElementById("live_mic_permission_cta");
    openTabForMicBtn = document.getElementById("live_open_tab_for_mic_btn");

    if (headerLiveBtn) {
      headerLiveBtn.addEventListener("click", openLiveDialog);
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", closeLiveDialog);
    }

    if (openTabForMicBtn) {
      openTabForMicBtn.addEventListener("click", () => {
        void openFullTabForMic();
      });
    }

    if (toggleSessionBtn) {
      toggleSessionBtn.addEventListener("click", () => {
        if (isSessionActive || isConnecting) {
          stopLiveSession(false);
        } else {
          void startLiveSession();
        }
      });
    }

    if (liveDialog) {
      // Native <dialog> close event handles Esc and closedby="any" backdrop dismiss
      liveDialog.addEventListener("close", () => {
        if (isSessionActive || isConnecting) {
          stopLiveSession(false);
        }
      });

      // Fallback backdrop dismiss when native closedby="any" is unsupported
      liveDialog.addEventListener("click", (e) => {
        if (e.target !== liveDialog) return;
        if (liveDialog.tagName !== "DIALOG") {
          closeLiveDialog();
          return;
        }
        if ("closedBy" in HTMLDialogElement.prototype) return;
        const rect = liveDialog.getBoundingClientRect();
        const outside =
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom;
        if (outside) {
          closeLiveDialog();
        }
      });
    }

    if (window.AuroraStorage?.onSync) {
      window.AuroraStorage.onSync((msg) => {
        if (msg && msg.type === "API_KEY_CHANGED") {
          void loadApiKey();
        }
      });
    }

    window.addEventListener("pagehide", () => {
      if (isSessionActive || isConnecting) {
        stopLiveSession(false);
      }
    });

    void loadApiKey();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
