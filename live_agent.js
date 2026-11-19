/**
 * Aurora Companion - Gemini Live Voice Companion (gemini-3.8-live)
 * Enables real-time bidirectional voice conversations, focus coaching,
 * and conversational task capture via WebSocket streaming.
 */

(function () {
  const STORAGE_KEY_API_KEY = "aurora_gemini_api_key";
  const LIVE_MODEL = "models/gemini-3.8-live";
  const WS_BASE_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

  let socket = null;
  let audioContext = null;
  let mediaStream = null;
  let audioInputSource = null;
  let audioWorkletNode = null;
  let isSessionActive = false;
  let nextPlayTime = 0;
  let activeAudioSources = [];
  let currentTranscriptSender = null;
  let currentTranscriptNode = null;
  let interimUserNode = null;

  // DOM Elements
  const liveDialog = document.getElementById("gemini_live_dialog");
  const closeBtn = document.getElementById("close_live_dialog");
  const headerLiveBtn = document.getElementById("header_gemini_live_btn");
  const toggleSessionBtn = document.getElementById("toggle_live_session_btn");
  const apiKeyInput = document.getElementById("gemini_api_key_input");
  const statusText = document.getElementById("live_status_text");
  const statusDot = document.getElementById("live_status_dot");
  const liveOrb = document.getElementById("live_orb");
  const transcriptBox = document.getElementById("live_transcript_box");

  // Load stored API key
  async function loadApiKey() {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const res = await chrome.storage.local.get(STORAGE_KEY_API_KEY);
      if (res[STORAGE_KEY_API_KEY] && apiKeyInput) {
        apiKeyInput.value = res[STORAGE_KEY_API_KEY];
      }
    } else {
      const saved = localStorage.getItem(STORAGE_KEY_API_KEY);
      if (saved && apiKeyInput) apiKeyInput.value = saved;
    }
  }

  // Save API key
  async function saveApiKey(key) {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEY_API_KEY]: key });
    } else {
      localStorage.setItem(STORAGE_KEY_API_KEY, key);
    }
  }

  // Open & Close Dialog
  function openLiveDialog() {
    if (liveDialog) {
      liveDialog.style.display = "flex";
      loadApiKey();
    }
  }

  function closeLiveDialog() {
    if (isSessionActive) {
      stopLiveSession();
    }
    if (liveDialog) {
      liveDialog.style.display = "none";
    }
  }

  // Update Visual Status
  function setStatus(state, message) {
    if (!statusText) return;
    statusText.innerText = message;

    if (liveOrb) {
      liveOrb.classList.remove("listening", "speaking", "thinking", "error");
      if (state !== "idle") liveOrb.classList.add(state);
    }

    if (statusDot) {
      statusDot.className = "live_status_dot " + state;
    }
  }

  // Transcript Management
  function appendTranscript(sender, text, isChunk = false) {
    if (!transcriptBox || !text) return;
    const placeholder = transcriptBox.querySelector(".transcript_placeholder");
    if (placeholder) placeholder.remove();

    if (isChunk && currentTranscriptSender === sender && currentTranscriptNode) {
      const textSpan = currentTranscriptNode.querySelector(".transcript_text");
      if (textSpan) {
        textSpan.textContent += text;
      } else {
        currentTranscriptNode.innerHTML += escapeHtml(text);
      }
    } else {
      const p = document.createElement("p");
      p.className = "transcript_entry " + sender;
      const speaker = sender === "user" ? "You" : (sender === "system" ? "System" : "Aurora");
      p.innerHTML = `<strong>${speaker}:</strong> <span class="transcript_text">${escapeHtml(text)}</span>`;
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
      interimUserNode = document.createElement("p");
      interimUserNode.className = "transcript_entry user interim";
      interimUserNode.style.opacity = "0.7";
      transcriptBox.appendChild(interimUserNode);
    }
    interimUserNode.innerHTML = `<strong>You:</strong> <span class="transcript_text">${escapeHtml(text)}</span>`;
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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.innerText = str;
    return div.innerHTML;
  }

  // Start Gemini Live Session
  async function startLiveSession() {
    const apiKey = apiKeyInput?.value?.trim();
    if (!apiKey) {
      setStatus("error", "Please provide a valid Gemini API key.");
      return;
    }
    await saveApiKey(apiKey);

    // Initialize or resume AudioContext inside user activation gesture
    try {
      if (!audioContext || audioContext.state === "closed") {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      }
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      nextPlayTime = audioContext.currentTime;
    } catch (audioErr) {
      console.warn("AudioContext init warning:", audioErr);
    }

    setStatus("thinking", "Connecting to Gemini 3.8 Live...");
    if (toggleSessionBtn) toggleSessionBtn.innerText = "Connecting...";

    try {
      // Connect WebSocket
      const wsUrl = `${WS_BASE_URL}?key=${encodeURIComponent(apiKey)}`;
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("Aurora Companion: Gemini Live WebSocket connected.");
        setStatus("thinking", "Configuring session parameters...");

        // Build Personalized System Instructions from User State
        const store = window.indigoApp?.store;
        const profile = store?.personalityProfile;
        let systemPromptText = "You are Aurora, an executive and mindful productivity companion. You provide full hands-free operational control of the user's tasks, atomic habits, daily routines, focus timer, and journal reflections. Speak concisely, supportively, and directly.";

        if (profile && profile.archetype) {
          systemPromptText += ` The user completed their behavioral personality quiz. Their archetype is '${profile.archetype}'. Their peak analytical clarity window (chronotype) is '${profile.chronotypeLabel || profile.chronotype || "Morning"}'. Their pacing style is '${profile.pacingLabel || profile.pacing || "Sprints"}'. Their chosen coaching voice is '${profile.coachVoiceLabel || profile.coachVoice || "Stoic"}'. Embody this coaching tone consistently in your spoken voice. Guide them to schedule deep work during peak clarity, protect energy, and build consistency.`;
        } else {
          systemPromptText += " The user has not completed their productivity personality quiz yet. Offer to analyze their behaviors, diagnose their energy patterns, and guide them in setting atomic habits conversationally.";
        }

        systemPromptText += " Execute the tools immediately when asked to create, complete, update, or delete tasks, log habits, start or pause the focus timer, or view analytics. After executing a tool, confirm the action in one brief spoken sentence.";

        // Send Setup Frame with Full Operational Tool Suite
        const setupMessage = {
          setup: {
            model: LIVE_MODEL,
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
              parts: [
                {
                  text: systemPromptText
                }
              ]
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
                        action: { type: "STRING", enum: ["create", "complete", "delete", "update", "add_subtask", "list"], description: "Action to execute" },
                        title: { type: "STRING", description: "Title of the task (or search query for existing task)" },
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
                        action: { type: "STRING", enum: ["create", "complete", "delete", "list", "get_streaks"], description: "Action to execute" },
                        title: { type: "STRING", description: "Habit title or name to find" },
                        habitId: { type: "STRING", description: "Optional habit ID" },
                        category: { type: "STRING", description: "Category: Routine, Health, Mind, Productivity" }
                      },
                      required: ["action"]
                    }
                  },
                  {
                    name: "control_focus_timer",
                    description: "Control the productivity Pomodoro focus timer: start, pause, reset, or switch modes.",
                    parameters: {
                      type: "OBJECT",
                      properties: {
                        action: { type: "STRING", enum: ["start", "pause", "reset", "switch_mode"], description: "Timer action" },
                        mode: { type: "STRING", enum: ["pomodoro", "shortBreak", "longBreak", "stopwatch"], description: "Timer mode" },
                        durationMinutes: { type: "INTEGER", description: "Optional duration in minutes" },
                        taskTitle: { type: "STRING", description: "Optional task title to link this focus session to" }
                      },
                      required: ["action"]
                    }
                  },
                  {
                    name: "get_behavioral_profile_and_insights",
                    description: "Retrieve user's behavioral personality profile (archetype, chronotype, coach voice, energy peaks) and consistency metrics."
                  },
                  {
                    name: "log_reflection_journal",
                    description: "Log mindful reflection, daily mood, energy level, or behavioral insights into the user's journal.",
                    parameters: {
                      type: "OBJECT",
                      properties: {
                        reflection: { type: "STRING", description: "Mindful reflection text" },
                        mood: { type: "STRING", enum: ["great", "good", "neutral", "drained", "stressed"], description: "Current emotional valence" },
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

        socket.send(JSON.stringify(setupMessage));
        console.log("Aurora Companion: Setup frame sent. Awaiting setupComplete...");
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

          console.log("Aurora Companion message received:", data);

          // Handle Setup Completion from Gemini before starting microphone capture
          if (data.setupComplete) {
            console.log("Aurora Companion: Gemini Live setup completed.");
            await startAudioRecording();
            isSessionActive = true;
            setStatus("listening", "Listening... Speak to Aurora.");
            if (toggleSessionBtn) {
              toggleSessionBtn.innerText = "End Live Session";
              toggleSessionBtn.classList.add("danger");
            }
            return;
          }

          handleServerMessage(data);
        } catch (err) {
          console.error("Error parsing Gemini message:", err);
        }
      };

      socket.onerror = (err) => {
        console.error("Gemini Live WebSocket error:", err);
        setStatus("error", "Connection error. Check your API key.");
        stopLiveSession();
      };

      socket.onclose = (event) => {
        console.log("Gemini Live WebSocket closed:", event.code, event.reason);
        if (event.code !== 1000 && event.code !== 1005) {
          setStatus("error", `Disconnected: ${event.reason || "Code " + event.code}`);
        }
        stopLiveSession();
      };
    } catch (err) {
      console.error("Failed to start Gemini Live session:", err);
      setStatus("error", "Could not start session: " + err.message);
      stopLiveSession();
    }
  }

  // Audio Playback & Server Message Handling
  function handleServerMessage(data) {
    if (data.serverContent) {
      // 1. User speech transcription (interim hypothesis and final transcript)
      if (data.serverContent.interimInputTranscription?.text) {
        updateInterimUserTranscript(data.serverContent.interimInputTranscription.text);
      }
      if (data.serverContent.inputTranscription?.text) {
        clearInterimUserTranscript();
        finalizeTranscriptTurn();
        appendTranscript("user", data.serverContent.inputTranscription.text, false);
        finalizeTranscriptTurn();
      }

      // 2. Model speech output transcription (streaming from spoken audio)
      if (data.serverContent.outputTranscription?.text) {
        appendTranscript("model", data.serverContent.outputTranscription.text, true);
      }

      // 3. Model turn parts (text fallback or PCM 24kHz audio)
      const parts = data.serverContent.modelTurn?.parts || [];
      for (const part of parts) {
        if (part.text) {
          appendTranscript("model", part.text, true);
        }
        if (part.inlineData && part.inlineData.mimeType?.startsWith("audio/")) {
          playAudioChunk(part.inlineData.data);
        }
      }

      // 4. Interruption handling
      if (data.serverContent.interrupted) {
        clearInterimUserTranscript();
        finalizeTranscriptTurn();
        stopAudioPlayback();
        setStatus("listening", "Listening... Speak anytime.");
      }

      // 5. Turn complete
      if (data.serverContent.turnComplete) {
        clearInterimUserTranscript();
        finalizeTranscriptTurn();
        setStatus("listening", "Listening... Speak anytime.");
      }
    }

    // Handle Function Call from Gemini
    if (data.toolCall) {
      finalizeTranscriptTurn();
      handleToolCalls(data.toolCall);
    }
  }

  // Helper: Format local date YYYY-MM-DD
  function getTodayDateString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // Helper: Fuzzy task search by ID or title substring
  function findTaskByQuery(tasks, query, id) {
    if (id !== undefined && id !== null && id !== "") {
      const match = tasks.find(t => t.id == id);
      if (match) return match;
    }
    if (!query || typeof query !== "string") return null;
    const q = query.trim().toLowerCase();
    const exact = tasks.find(t => t.title.toLowerCase() === q);
    if (exact) return exact;
    const starts = tasks.find(t => t.title.toLowerCase().startsWith(q));
    if (starts) return starts;
    return tasks.find(t => t.title.toLowerCase().includes(q) || q.includes(t.title.toLowerCase())) || null;
  }

  // Helper: Fuzzy habit search by ID or title substring
  function findHabitByQuery(habits, query, id) {
    if (id) {
      const match = habits.find(h => h.id === id);
      if (match) return match;
    }
    if (!query || typeof query !== "string") return null;
    const q = query.trim().toLowerCase();
    const exact = habits.find(h => h.title.toLowerCase() === q);
    if (exact) return exact;
    return habits.find(h => h.title.toLowerCase().includes(q) || q.includes(h.title.toLowerCase())) || null;
  }

  // Handle Tool Calls from Gemini
  async function handleToolCalls(toolCall) {
    const calls = toolCall.functionCalls || [];
    const responses = [];
    const store = window.indigoApp?.store;

    for (const call of calls) {
      setStatus("thinking", `Executing action: ${call.name}...`);
      let result = { success: true };

      if (!store) {
        result = { success: false, error: "TaskStore is not ready." };
      } else if (call.name === "manage_task" || call.name === "create_task") {
        const action = call.args?.action || (call.name === "create_task" ? "create" : "list");
        const tasks = store.tasks || [];

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
          if (window.indigoApp?.render) window.indigoApp.render();
          appendTranscript("model", `✨ Created task: "${title}" (${priority} priority in ${category})`);
          result = { success: true, taskId: newTask.id, message: `Created task "${title}".` };
        } else if (action === "complete") {
          const task = findTaskByQuery(tasks, call.args?.title, call.args?.taskId);
          if (task) {
            store.toggleTaskComplete(task.id);
            if (window.indigoApp?.render) window.indigoApp.render();
            const state = task.completed ? "completed" : "active";
            appendTranscript("model", `✅ Marked task "${task.title}" as ${state}.`);
            result = { success: true, taskId: task.id, completed: task.completed, message: `Task "${task.title}" is now ${state}.` };
          } else {
            result = { success: false, error: `Task matching "${call.args?.title || call.args?.taskId}" was not found.` };
          }
        } else if (action === "delete") {
          const task = findTaskByQuery(tasks, call.args?.title, call.args?.taskId);
          if (task) {
            const deletedTitle = task.title;
            store.deleteTask(task.id);
            if (window.indigoApp?.render) window.indigoApp.render();
            appendTranscript("model", `🗑️ Deleted task: "${deletedTitle}".`);
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
            if (window.indigoApp?.render) window.indigoApp.render();
            appendTranscript("model", `✏️ Updated task "${task.title}".`);
            result = { success: true, taskId: task.id, message: `Updated task "${task.title}".` };
          } else {
            result = { success: false, error: `Task matching "${call.args?.title}" was not found.` };
          }
        } else if (action === "add_subtask") {
          const task = findTaskByQuery(tasks, call.args?.title, call.args?.taskId);
          const subtaskTitle = call.args?.subtaskTitle?.trim();
          if (task && subtaskTitle) {
            store.addSubtask(task.id, subtaskTitle);
            if (window.indigoApp?.render) window.indigoApp.render();
            appendTranscript("model", `🔹 Added subtask "${subtaskTitle}" to "${task.title}".`);
            result = { success: true, taskId: task.id, message: `Added subtask "${subtaskTitle}" to "${task.title}".` };
          } else {
            result = { success: false, error: "Task not found or subtask title was missing." };
          }
        } else if (action === "list") {
          const uncompleted = tasks.filter(t => !t.completed);
          result = {
            totalTasks: tasks.length,
            activeCount: uncompleted.length,
            activeTasks: uncompleted.slice(0, 8).map(t => ({ id: t.id, title: t.title, priority: t.priority, category: t.category, duration: t.estimatedDuration }))
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
          if (window.indigoApp?.render) window.indigoApp.render();
          appendTranscript("model", `🌱 Created habit: "${title}" in ${category}.`);
          result = { success: true, habitId: habit.id, message: `Created habit "${title}".` };
        } else if (action === "complete") {
          const habit = findHabitByQuery(habits, call.args?.title, call.args?.habitId);
          if (habit) {
            store.toggleHabitCompletion(habit.id, today);
            if (window.indigoApp?.render) window.indigoApp.render();
            const doneToday = !!habit.history?.[today];
            const streak = habit.streak || 0;
            appendTranscript("model", `🔥 Habit "${habit.title}" logged for today! Streak: ${streak} days.`);
            result = { success: true, habitId: habit.id, doneToday, streak, message: `Habit "${habit.title}" logged for today. Streak: ${streak} days.` };
          } else {
            result = { success: false, error: `Could not find habit matching "${call.args?.title || call.args?.habitId}".` };
          }
        } else if (action === "delete") {
          const habit = findHabitByQuery(habits, call.args?.title, call.args?.habitId);
          if (habit) {
            const deletedTitle = habit.title;
            store.deleteHabit(habit.id);
            if (window.indigoApp?.render) window.indigoApp.render();
            appendTranscript("model", `🗑️ Deleted habit: "${deletedTitle}".`);
            result = { success: true, message: `Habit "${deletedTitle}" deleted.` };
          } else {
            result = { success: false, error: `Could not find habit matching "${call.args?.title || call.args?.habitId}".` };
          }
        } else if (action === "list" || action === "get_streaks") {
          result = {
            totalHabits: habits.length,
            habits: habits.map(h => ({
              id: h.id,
              title: h.title,
              category: h.category,
              streak: h.streak || 0,
              maxStreak: h.maxStreak || 0,
              doneToday: !!h.history?.[today]
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
            timer.duration = mins * 60;
            timer.totalDuration = timer.duration;
          }

          store.startTimer(matchedTaskId);
          if (window.indigoApp?.render) window.indigoApp.render();
          const minsLeft = Math.ceil(timer.duration / 60);
          appendTranscript("model", `⏱️ Focus session started (${minsLeft} min, ${timer.type} mode).`);
          result = { success: true, isRunning: true, durationMinutes: minsLeft, mode: timer.type, message: `Focus timer started for ${minsLeft} minutes.` };
        } else if (action === "pause") {
          store.pauseTimer();
          if (window.indigoApp?.render) window.indigoApp.render();
          appendTranscript("model", `⏸️ Focus session paused.`);
          result = { success: true, isRunning: false, message: "Focus timer paused." };
        } else if (action === "reset") {
          store.resetTimer();
          if (window.indigoApp?.render) window.indigoApp.render();
          appendTranscript("model", `🔄 Focus timer reset.`);
          result = { success: true, isRunning: false, message: "Focus timer reset." };
        } else if (action === "switch_mode") {
          const mode = call.args?.mode;
          if (["pomodoro", "shortBreak", "longBreak", "stopwatch"].includes(mode)) {
            if (timer.isRunning) store.pauseTimer();
            store.changeTimerType(mode);
            if (window.indigoApp?.render) window.indigoApp.render();
            appendTranscript("model", `🔀 Switched timer mode to ${mode}.`);
            result = { success: true, mode, message: `Timer switched to ${mode}.` };
          } else {
            result = { success: false, error: "Invalid mode. Use pomodoro, shortBreak, longBreak, or stopwatch." };
          }
        }
      } else if (call.name === "get_behavioral_profile_and_insights" || call.name === "get_todays_focus") {
        const profile = store.personalityProfile || null;
        const tasks = store.tasks || [];
        const uncompleted = tasks.filter(t => !t.completed);
        const completed = tasks.filter(t => t.completed);
        const habits = store.habits || [];
        const today = getTodayDateString();
        const todayJournal = store.journal?.[today] || null;

        result = {
          hasProfile: !!profile,
          profile: profile ? {
            archetype: profile.archetype,
            superpower: profile.superpower,
            chronotype: profile.chronotypeLabel || profile.chronotype,
            pacing: profile.pacingLabel || profile.pacing,
            coachVoice: profile.coachVoiceLabel || profile.coachVoice,
            capacityLimit: profile.capacityLimit || 3
          } : null,
          productivityMetrics: {
            activeTasksCount: uncompleted.length,
            completedTasksCount: completed.length,
            topPriorities: uncompleted.slice(0, 3).map(t => t.title),
            habitsStreakSummary: habits.map(h => ({ title: h.title, streak: h.streak || 0, doneToday: !!h.history?.[today] })),
            timerState: { isRunning: store.timer?.isRunning || false, type: store.timer?.type || "pomodoro", durationMinutes: Math.ceil((store.timer?.duration || 0) / 60) },
            todayJournalEntry: todayJournal ? { mood: todayJournal.mood, energy: todayJournal.energy, reflection: todayJournal.reflection } : null
          }
        };
      } else if (call.name === "log_reflection_journal") {
        const today = getTodayDateString();
        const reflection = (call.args?.reflection || "Daily voice reflection.").trim();
        const mood = call.args?.mood || "good";
        const energy = Math.max(1, Math.min(5, parseInt(call.args?.energy, 10) || 4));
        const wins = (call.args?.wins || "").trim();

        store.saveJournalEntry(today, {
          reflection,
          mood,
          energy,
          wins,
          loggedVia: "Aurora Voice Companion",
          updatedAt: new Date().toISOString()
        });
        if (window.indigoApp?.render) window.indigoApp.render();
        appendTranscript("model", `📖 Saved reflection to today's journal.`);
        result = { success: true, date: today, message: "Reflection and insights logged into daily journal." };
      }

      responses.push({
        response: { output: result },
        id: call.id
      });
    }

    // Send tool response back to Gemini
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        toolResponse: {
          functionResponses: responses
        }
      }));
    }
  }

  // Microphone Audio Capture (PCM 16kHz Mono)
  async function startAudioRecording() {
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

    // Use ScriptProcessor for raw PCM extraction
    const bufferSize = 4096;
    const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

    processor.onaudioprocess = (e) => {
      if (!isSessionActive || !socket || socket.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      // Convert Float32 [-1.0, 1.0] to 16-bit signed PCM
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Convert to Base64
      const base64Chunk = bufferToBase64(pcm16.buffer);

      // Send realtime input using Gemini Live audio schema
      const realtimeInputMessage = {
        realtimeInput: {
          audio: {
            mimeType: "audio/pcm;rate=16000",
            data: base64Chunk
          }
        }
      };
      socket.send(JSON.stringify(realtimeInputMessage));
    };

    // Route processor to a muted gain node to prevent speaker feedback loop
    const muteNode = audioContext.createGain();
    muteNode.gain.value = 0;
    audioInputSource.connect(processor);
    processor.connect(muteNode);
    muteNode.connect(audioContext.destination);
    audioWorkletNode = processor;
  }

  function bufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  // Play Incoming Audio Chunks (PCM 24kHz)
  function playAudioChunk(base64Data) {
    try {
      if (!audioContext) return;
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }
      setStatus("speaking", "Aurora speaking...");

      const binaryStr = window.atob(base64Data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Safe 16-bit PCM Mono 24kHz buffer extraction
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
      console.error("Error playing audio chunk:", err);
    }
  }

  function stopAudioPlayback() {
    while (activeAudioSources.length > 0) {
      const src = activeAudioSources.pop();
      try { src.stop(); src.disconnect(); } catch (e) {}
    }
    if (audioContext) {
      nextPlayTime = audioContext.currentTime;
    }
  }

  // Stop Session
  function stopLiveSession() {
    isSessionActive = false;
    finalizeTranscriptTurn();
    clearInterimUserTranscript();
    stopAudioPlayback();

    if (socket) {
      try { socket.close(); } catch (e) {}
      socket = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }

    if (audioWorkletNode) {
      try { audioWorkletNode.disconnect(); } catch (e) {}
      audioWorkletNode = null;
    }

    if (audioInputSource) {
      try { audioInputSource.disconnect(); } catch (e) {}
      audioInputSource = null;
    }

    if (audioContext) {
      try { audioContext.close(); } catch (e) {}
      audioContext = null;
    }

    setStatus("idle", "Live session ended.");
    if (toggleSessionBtn) {
      toggleSessionBtn.innerText = "Start Live Session";
      toggleSessionBtn.classList.remove("danger");
    }
  }

  // Initialize UI Events
  function init() {
    if (headerLiveBtn) {
      headerLiveBtn.addEventListener("click", openLiveDialog);
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", closeLiveDialog);
    }

    if (toggleSessionBtn) {
      toggleSessionBtn.addEventListener("click", () => {
        if (isSessionActive) {
          stopLiveSession();
        } else {
          startLiveSession();
        }
      });
    }

    if (liveDialog) {
      liveDialog.addEventListener("click", (e) => {
        if (e.target === liveDialog) closeLiveDialog();
      });
    }

    loadApiKey();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
