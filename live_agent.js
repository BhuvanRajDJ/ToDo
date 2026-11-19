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
            inputAudioTranscription: {},
            outputAudioTranscription: {},
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
