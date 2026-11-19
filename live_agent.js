/**
 * Aurora Companion - Gemini Live Voice Companion (gemini-3.8-live)
 * Enables real-time bidirectional voice conversations, focus coaching,
 * and conversational task capture via WebSocket streaming.
 */

(function () {
  const STORAGE_KEY_API_KEY = "aurora_gemini_api_key";
  const LIVE_MODEL = "models/gemini-3.8-live";
  const WS_BASE_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

  let socket = null;
  let audioContext = null;
  let mediaStream = null;
  let audioInputSource = null;
  let audioWorkletNode = null;
  let isSessionActive = false;
  let nextPlayTime = 0;

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

  // Append Transcript
  function appendTranscript(sender, text) {
    if (!transcriptBox || !text) return;
    const placeholder = transcriptBox.querySelector(".transcript_placeholder");
    if (placeholder) placeholder.remove();

    const p = document.createElement("p");
    p.className = "transcript_entry " + sender;
    p.innerHTML = `<strong>${sender === "user" ? "You" : "Aurora"}:</strong> ${escapeHtml(text)}`;
    transcriptBox.appendChild(p);
    transcriptBox.scrollTop = transcriptBox.scrollHeight;
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

    setStatus("thinking", "Connecting to Gemini 3.8 Live...");
    if (toggleSessionBtn) toggleSessionBtn.innerText = "Connecting...";

    try {
      // Connect WebSocket
      const wsUrl = `${WS_BASE_URL}?key=${encodeURIComponent(apiKey)}`;
      socket = new WebSocket(wsUrl);

      socket.onopen = async () => {
        console.log("Aurora Companion: Gemini Live WebSocket connected.");
        setStatus("thinking", "Configuring session parameters...");

        // Send Setup Frame
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
            systemInstruction: {
              parts: [
                {
                  text: "You are Aurora, an executive and mindful productivity companion. You help users maintain focus, capture tasks, log reflections, and build habits. Speak warmly, concisely, and supportively. Use the create_task tool when asked to add or save tasks."
                }
              ]
            },
            tools: [
              {
                functionDeclarations: [
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

        // Start Audio Capture
        await startAudioRecording();
        isSessionActive = true;
        setStatus("listening", "Listening... Speak to Aurora.");
        if (toggleSessionBtn) {
          toggleSessionBtn.innerText = "End Live Session";
          toggleSessionBtn.classList.add("danger");
        }
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
      const parts = data.serverContent.modelTurn?.parts || [];
      for (const part of parts) {
        // Text transcript
        if (part.text) {
          appendTranscript("model", part.text);
        }
        // Audio stream (PCM 24kHz)
        if (part.inlineData && part.inlineData.mimeType?.startsWith("audio/")) {
          playAudioChunk(part.inlineData.data);
        }
      }

      if (data.serverContent.turnComplete) {
        setStatus("listening", "Listening... Speak anytime.");
      }
    }

    // Handle Function Call from Gemini
    if (data.toolCall) {
      handleToolCalls(data.toolCall);
    }
  }

  // Handle Tool Calls (e.g. create_task)
  async function handleToolCalls(toolCall) {
    const calls = toolCall.functionCalls || [];
    const responses = [];

    for (const call of calls) {
      setStatus("thinking", `Executing action: ${call.name}...`);
      let result = { success: true };

      if (call.name === "create_task") {
        const title = call.args?.title || "New Voice Task";
        const priority = call.args?.priority || "Medium";
        const category = call.args?.category || "Inbox";

        if (window.indigoApp?.store?.createTask) {
          const newTask = await window.indigoApp.store.createTask({
            title,
            priority,
            category,
            duration: 25,
            notes: "Created via Gemini Live Voice Companion"
          });
          appendTranscript("model", `✨ Created task: "${title}" (${priority} priority in ${category})`);
          result = { success: true, taskId: newTask.id, message: `Task "${title}" created.` };
        } else {
          result = { success: false, error: "Store not initialized." };
        }
      } else if (call.name === "get_todays_focus") {
        const tasks = window.indigoApp?.store?.getAllTasks ? window.indigoApp.store.getAllTasks() : [];
        const uncompleted = tasks.filter(t => !t.completed);
        result = {
          activeTaskCount: uncompleted.length,
          topTasks: uncompleted.slice(0, 3).map(t => t.title)
        };
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
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
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

    // Use ScriptProcessor / AudioWorklet for raw PCM extraction
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

      // Send realtime input
      const realtimeInputMessage = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: "audio/pcm;rate=16000",
              data: base64Chunk
            }
          ]
        }
      };
      socket.send(JSON.stringify(realtimeInputMessage));
    };

    audioInputSource.connect(processor);
    processor.connect(audioContext.destination);
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
      setStatus("speaking", "Aurora speaking...");

      const binaryStr = window.atob(base64Data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // 16-bit PCM Mono 24kHz
      const pcm16 = new Int16Array(bytes.buffer);
      const audioBuffer = audioContext.createBuffer(1, pcm16.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < pcm16.length; i++) {
        channelData[i] = pcm16[i] / 32768.0;
      }

      const sourceNode = audioContext.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(audioContext.destination);

      const startTime = Math.max(audioContext.currentTime, nextPlayTime);
      sourceNode.start(startTime);
      nextPlayTime = startTime + audioBuffer.duration;
    } catch (err) {
      console.error("Error playing audio chunk:", err);
    }
  }

  // Stop Session
  function stopLiveSession() {
    isSessionActive = false;

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
