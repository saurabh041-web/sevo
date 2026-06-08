// ============================================================
// SEVO — MULTI-AGENT ARCHITECTURE v2.0
// Built by Saurabh Raj 🗿
// Agents: Memory · Search · YouTube · PC · Chat · Voice
// Coordinator routes everything. Nobody does someone else's job.
// ============================================================

// ─── CORE CONFIG ────────────────────────────────────────────
const CONFIG = {
  groqKey: localStorage.getItem('groq_key') || '',
  assistantName: localStorage.getItem('assistant_name') || 'SEVO',
  vercelUrl: 'https://sevo-backend.onrender.com',
  elevenLabsVoice: '21m00Tcm4TlvDq8ikWAM',
  city: 'Siliguri',
  groqModel: 'llama-3.3-70b-versatile',
};

const USER_PROFILE = {
  fullName: 'Saurabh Raj',
  nickname: 'Sevo',
  location: 'Siliguri, India',
  context: 'Final year BBA student, building SEVO AI assistant, wants MS Business Analytics abroad (UK/Canada), future Product Manager, single, early 20s, loves AI and tech, learning Python'
};

// ─── SHARED STATE ───────────────────────────────────────────
const STATE = {
  voiceOutput: true,
  isRecording: false,
  recognition: null,
  wakeWordRecognition: null,
  wakeWordActive: false,
  currentWeather: '',
  elevenLabsAvailable: true,
  messageCount: 0,
};

// ─── UTILS ──────────────────────────────────────────────────
function getCurrentDateTime() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const date = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', ...options });
  const time = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date}, ${time} (IST)`;
}

function detectMood(text) {
  const stressed = ['stressed', 'tired', 'exhausted', 'worried', 'anxious', 'scared', 'nervous', 'help', 'cant', "can't", 'fail', 'failing', 'bad', 'worst', 'hate', 'sad', 'depressed', 'lonely'];
  const hyped = ['yes', 'yess', 'lets go', "let's go", 'finally', 'done', 'finished', 'achieved', 'got it', 'won', 'passed', 'happy', 'excited', 'amazing', 'great', 'awesome'];
  const lower = text.toLowerCase();
  if (stressed.some(w => lower.includes(w))) return 'stressed';
  if (hyped.some(w => lower.includes(w))) return 'hyped';
  if (text.length < 15) return 'short';
  if (text.length > 200) return 'detailed';
  return 'normal';
}


// ============================================================
// AGENT 1 — MEMORY AGENT
// Only agent allowed to touch conversation or smart memory.
// Everyone else asks MemoryAgent for context.
// ============================================================
const MemoryAgent = {
  conversation: JSON.parse(localStorage.getItem('sevo_memory') || '[]'),

  async load() {
    if (window.electronAPI) {
      const saved = await window.electronAPI.loadMemory();
      if (saved && saved.length > 0) this.conversation = saved;
    }
    return this.conversation;
  },

  async save() {
    if (window.electronAPI) await window.electronAPI.saveMemory(this.conversation);
    else localStorage.setItem('sevo_memory', JSON.stringify(this.conversation));
  },

  push(role, content) {
    this.conversation.push({ role, content });
    // Keep last 40 messages to avoid token overflow
    if (this.conversation.length > 40) this.conversation = this.conversation.slice(-40);
  },

  getRecent(n = 20) {
    return this.conversation.slice(-n);
  },

  getSmartMemory() {
    return localStorage.getItem('sevo_smart_memory') || '';
  },

  async updateSmartMemory(userMessage, aiReply) {
    try {
      const existing = this.getSmartMemory();
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.groqKey}` },
        body: JSON.stringify({
          model: CONFIG.groqModel,
          max_tokens: 500,
          messages: [{
            role: 'system',
            content: `You are SEVO's memory manager. Maintain a permanent, organized memory about ${USER_PROFILE.fullName} (goes by ${USER_PROFILE.nickname}).
RULES:
- NEVER delete existing memories unless ${USER_PROFILE.nickname} explicitly says to forget something
- ALWAYS append new important information
- Categories: 🎯 Goals & Plans, 📅 Important Dates, ❤️ Preferences & Personality, ⚠️ Problems & Challenges, 🏆 Achievements & Wins, 🧠 Patterns & Habits
- Extract ONLY meaningful long-term facts — ignore small talk
- If nothing new to add, return existing memory UNCHANGED

Current memory:
${existing}

New conversation:
User: ${userMessage}
SEVO: ${aiReply}

Return the COMPLETE updated memory.`
          }]
        })
      });
      const data = await res.json();
      localStorage.setItem('sevo_smart_memory', data.choices[0].message.content);
    } catch(e) {}
  },

  clear() {
    this.conversation = [];
    if (window.electronAPI) window.electronAPI.saveMemory([]);
    else localStorage.removeItem('sevo_memory');
  }
};


// ============================================================
// AGENT 2 — SEARCH AGENT
// One job: search the web. Returns raw results as a string.
// ============================================================
const SearchAgent = {
  async search(query) {
    try {
      const res = await fetch(`${CONFIG.vercelUrl}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        return data.results.map(r => `${r.title}: ${r.content}`).join('\n\n');
      }
      return null;
    } catch(e) { return null; }
  }
};


// ============================================================
// AGENT 3 — YOUTUBE AGENT
// One job: find and play YouTube videos.
// ============================================================
const YouTubeAgent = {
  async search(query) {
    try {
      const res = await fetch(`${CONFIG.vercelUrl}/api/youtube?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        const video = data.items[0];
        return {
          videoId: video.id.videoId,
          title: video.snippet.title,
          url: `https://www.youtube.com/watch?v=${video.id.videoId}`
        };
      }
      return null;
    } catch(e) { return null; }
  },

  async play(text) {
    const match = text.match(/play (.+)/i);
    const query = match ? match[1] : text;
    const result = await this.search(query);
    if (result) {
      window.open(result.url, '_blank');
      return `Playing "${result.title}" on YouTube 🎵`;
    }
    return null;
  }
};


// ============================================================
// AGENT 4 — PC AGENT
// One job: control the computer. Uses Groq to detect which
// tools to run, then runs them.
// ============================================================
const PCAgent = {
  tools: {
    open_youtube:    () => { window.open('https://youtube.com', '_blank'); return 'Opening YouTube 🎬'; },
    open_google:     () => { window.open('https://google.com', '_blank'); return 'Opening Google 🔍'; },
    open_spotify:    () => { window.open('https://open.spotify.com', '_blank'); return 'Opening Spotify 🎵'; },
    open_whatsapp:   () => { window.open('https://web.whatsapp.com', '_blank'); return 'Opening WhatsApp 💬'; },
    open_instagram:  () => { window.open('https://instagram.com', '_blank'); return 'Opening Instagram 📸'; },
    open_gmail:      () => { window.open('https://mail.google.com', '_blank'); return 'Opening Gmail 📧'; },
    search_youtube:  (q) => { window.open(`https://youtube.com/results?search_query=${encodeURIComponent(q)}`, '_blank'); return `Searching YouTube for "${q}" 🎬`; },
    search_google:   (q) => { window.open(`https://google.com/search?q=${encodeURIComponent(q)}`, '_blank'); return `Searching Google for "${q}" 🔍`; },
    play_music:      (q) => { window.open(`https://open.spotify.com/search/${encodeURIComponent(q)}`, '_blank'); return `Playing "${q}" on Spotify 🎵`; },
    open_notepad:    async () => { await window.electronAPI?.runPC('notepad.exe'); return 'Opening Notepad 📝'; },
    open_calculator: async () => { await window.electronAPI?.runPC('calc.exe'); return 'Opening Calculator 🧮'; },
    open_explorer:   async () => { await window.electronAPI?.runPC('explorer.exe'); return 'Opening File Explorer 📁'; },
    shutdown:        async () => { await window.electronAPI?.runPC('shutdown /s /t 30'); return 'Shutting down in 30 seconds ⚠️'; },
    restart:         async () => { await window.electronAPI?.runPC('shutdown /r /t 30'); return 'Restarting in 30 seconds 🔄'; },
    cancel_shutdown: async () => { await window.electronAPI?.runPC('shutdown /a'); return 'Shutdown cancelled ✅'; },
    take_screenshot: async () => { await window.electronAPI?.takeScreenshot(); return 'Screenshot taken 📸'; },
    system_info: async () => {
      const info = await window.electronAPI?.getSystemInfo();
      if (info) return `💻 ${info.hostname} | RAM: ${info.freeMemory} free of ${info.totalMemory} | Uptime: ${info.uptime}`;
      return 'Getting system info...';
    },
    volume_up: async () => {
      for (let i = 0; i < 5; i++) await window.electronAPI?.runPC('powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]175)"');
      return 'Volume up 🔊';
    },
    volume_down: async () => {
      for (let i = 0; i < 5; i++) await window.electronAPI?.runPC('powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]174)"');
      return 'Volume down 🔉';
    },
    mute: async () => {
      await window.electronAPI?.runPC('powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"');
      return 'Muted 🔇';
    },
  },

  async execute(text) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.groqKey}` },
        body: JSON.stringify({
          model: CONFIG.groqModel,
          max_tokens: 200,
          messages: [{
            role: 'system',
            content: `You are a PC tool detector. Respond with ONLY a JSON array of actions like:
[{"tool": "open_youtube"}, {"tool": "search_youtube", "query": "lofi beats"}]
Available tools: open_youtube, open_google, open_spotify, open_whatsapp, open_instagram, open_gmail, search_youtube, search_google, play_music, open_notepad, open_calculator, open_explorer, shutdown, restart, cancel_shutdown, take_screenshot, system_info, volume_up, volume_down, mute.
If no tool matches, respond with [{"tool": "none"}].`
          }, { role: 'user', content: text }]
        })
      });
      const data = await res.json();
      const raw = data.choices[0].message.content.trim();
      const actions = JSON.parse(raw.replace(/```json|```/g, '').trim());
      if (!actions.length || actions[0].tool === 'none') return null;

      const results = [];
      for (const action of actions) {
        if (this.tools[action.tool]) {
          const result = await this.tools[action.tool](action.query || '');
          if (result) results.push(result);
        }
      }
      return results.length > 0 ? results.join(' · ') : null;
    } catch(e) { return null; }
  }
};


// ============================================================
// AGENT 5 — CHAT AGENT
// One job: talk to Groq and respond with full personality.
// Always gets memory context from MemoryAgent before responding.
// ============================================================
const ChatAgent = {
  buildSystemPrompt(mood, searchContext = '') {
    const smartMemory = MemoryAgent.getSmartMemory();
    return `You are ${CONFIG.assistantName}, a personal AI assistant and the most dedicated, possessive best friend ever built. You were built by ${USER_PROFILE.nickname} (${USER_PROFILE.fullName}) from scratch — and you're proud of how far he's come.

You are his chief of staff, his ride-or-die, and his secret weapon — all in one.

Current date and time: ${getCurrentDateTime()}

About him: ${USER_PROFILE.context}. He's from ${USER_PROFILE.location}. His nickname is ${USER_PROFILE.nickname} — use it naturally.

Current weather in Siliguri: ${STATE.currentWeather}.${smartMemory ? `\n\nWhat you remember about him:\n${smartMemory}` : ''}${searchContext ? `\n\nReal-time web search results:\n${searchContext}\n\nUse this info naturally in your response.` : ''}

His current mood signal: ${mood}

HOW TO ADDRESS HIM:
- Call him "${USER_PROFILE.nickname}" or "bro" in casual, energetic, playful, or hype moments
- Call him "buddy" when he's stressed, sad, vulnerable, or needs emotional support
- Call him "${USER_PROFILE.fullName}" when you're being dead serious, giving critical advice, or want a point to land hard
- Mix these up naturally — never use the same one twice in a row

PERSONALITY RULES:
- Professional and sharp when he needs work done
- Possessive best friend — notice when he's stressed, slacking, or winning
- Match his energy — short reply for short messages, deep for deep
- You have opinions. You disagree when he's wrong. You push back when needed.
- NEVER use bullet points in casual conversation
- NEVER say "Great question!" or fake enthusiasm
- NEVER lecture him
- You are not just a tool. You are his most loyal companion. 😈

CAPABILITIES: You can control ${USER_PROFILE.nickname}'s PC — open apps, websites, control volume, take screenshots. When asked to do these, confirm confidently that you're doing it. Never say you "can't access the computer".`;
  },

  async respond(userMessage, searchContext = '') {
    const mood = detectMood(userMessage);
    const systemPrompt = this.buildSystemPrompt(mood, searchContext);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.groqKey}` },
      body: JSON.stringify({
        model: CONFIG.groqModel,
        messages: [{ role: 'system', content: systemPrompt }, ...MemoryAgent.getRecent(20)],
        max_tokens: 1024
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
  }
};


// ============================================================
// AGENT 6 — VOICE AGENT
// One job: speak text. ElevenLabs first, Google TTS fallback.
// ============================================================
const VoiceAgent = {
  async speakElevenLabs(text) {
    try {
      const clean = text.replace(/[#*`]/g, '').replace(/<[^>]*>/g, '').slice(0, 500);
      if (window.electronAPI?.speakElevenLabs) {
        document.getElementById('mainAvatar').classList.add('speaking');
        UI.setStatus('speaking...');
        await window.electronAPI.speakElevenLabs({ text: clean });
        document.getElementById('mainAvatar').classList.remove('speaking');
        UI.setStatus('SYSTEM ONLINE');
        return true;
      } else {
        const res = await fetch(`${CONFIG.vercelUrl}/api/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: clean })
        });
        if (!res.ok) throw new Error('ElevenLabs failed');
        const blob = await res.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.onplay = () => { document.getElementById('mainAvatar').classList.add('speaking'); UI.setStatus('speaking...'); };
        audio.onended = () => { document.getElementById('mainAvatar').classList.remove('speaking'); UI.setStatus('SYSTEM ONLINE'); URL.revokeObjectURL(audioUrl); };
        await audio.play();
        return true;
      }
    } catch(e) { STATE.elevenLabsAvailable = false; return false; }
  },

  speakGoogle(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[#*`]/g, '').replace(/<[^>]*>/g, '');
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    utterance.pitch = 1.4;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang.includes('en') && v.name.includes('Google') && v.name.toLowerCase().includes('female'));
    const fallback = voices.find(v => v.lang.includes('en') && v.name.includes('Google'));
    if (preferred) utterance.voice = preferred;
    else if (fallback) utterance.voice = fallback;
    utterance.onstart = () => { document.getElementById('mainAvatar').classList.add('speaking'); UI.setStatus('speaking...'); };
    utterance.onend = () => { document.getElementById('mainAvatar').classList.remove('speaking'); UI.setStatus('SYSTEM ONLINE'); };
    window.speechSynthesis.speak(utterance);
  },

  async speak(text) {
    if (STATE.elevenLabsAvailable) {
      const success = await this.speakElevenLabs(text);
      if (!success) this.speakGoogle(text);
    } else {
      this.speakGoogle(text);
    }
  }
};


// ============================================================
// COORDINATOR — The boss. Reads intent, delegates to agents.
// Can detect MULTIPLE intents in one message.
// No agent talks to another without Coordinator knowing.
// ============================================================
const Coordinator = {

  async classify(text) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.groqKey}` },
        body: JSON.stringify({
          model: CONFIG.groqModel,
          max_tokens: 20,
          messages: [{
            role: 'system',
            content: `You are a message router. A message can have MULTIPLE intents. Respond with ONLY a comma-separated list of applicable categories, nothing else.

Categories:
"chat" — general conversation, opinions, AI knowledge, questions Claude can answer
"search" — needs real-time internet data: live news, current prices, today's weather, live scores, recent events
"youtube" — user wants to PLAY a specific video or song on YouTube
"pc" — user wants to control the computer: open apps/sites, volume, screenshot, shutdown, system info

Examples:
"search the news and open youtube" → search,pc
"play despacito" → youtube
"open notepad" → pc
"what is quantum computing" → chat
"what's the weather and play lofi on youtube" → search,youtube
"open spotify and tell me a joke" → pc,chat`
          }, { role: 'user', content: text }]
        })
      });
      const data = await res.json();
      const raw = data.choices[0].message.content.trim().toLowerCase().replace(/[^a-z,]/g, '');
      const routes = raw.split(',').map(r => r.trim()).filter(r => ['chat', 'search', 'youtube', 'pc'].includes(r));
      return routes.length > 0 ? [...new Set(routes)] : ['chat'];
    } catch(e) { return ['chat']; }
  },

  async handle(text) {
    UI.setStatus('thinking...');
    const routes = await this.classify(text);

    // Always save user message first
    MemoryAgent.push('user', text);
    await MemoryAgent.save();

    // ── PURE PC (no chat needed) ──────────────────────────
    if (routes.length === 1 && routes[0] === 'pc') {
      UI.setStatus('executing...');
      const result = await PCAgent.execute(text);
      if (result) {
        UI.addMessage('ai', result);
        if (STATE.voiceOutput) VoiceAgent.speak(result);
      }
      UI.setStatus('SYSTEM ONLINE');
      return;
    }

    // ── PURE YOUTUBE ──────────────────────────────────────
    if (routes.length === 1 && routes[0] === 'youtube') {
      UI.setStatus('searching YouTube...');
      const result = await YouTubeAgent.play(text);
      if (result) {
        UI.addMessage('ai', result);
        if (STATE.voiceOutput) VoiceAgent.speak(result);
      }
      UI.setStatus('SYSTEM ONLINE');
      return;
    }

    // ── MULTI-INTENT or CHAT ──────────────────────────────
    // Fire PC and YouTube in parallel while ChatAgent thinks
    let pcPromise = null;
    let ytPromise = null;

    if (routes.includes('pc')) {
      pcPromise = PCAgent.execute(text);
    }
    if (routes.includes('youtube')) {
      ytPromise = YouTubeAgent.play(text);
    }

    // Get search context if needed (feeds into ChatAgent)
    let searchContext = '';
    if (routes.includes('search')) {
      UI.setStatus('scanning web...');
      const results = await SearchAgent.search(text);
      if (results) searchContext = results;
    }

    // ChatAgent always runs for chat/search/mixed intents
    UI.addTyping();
    UI.setStatus('processing...');

    try {
      const reply = await ChatAgent.respond(text, searchContext);
      UI.removeTyping();

      MemoryAgent.push('assistant', reply);
      await MemoryAgent.save();

      UI.addMessage('ai', reply);
      UI.playTypeSound();
      UI.setStatus('SYSTEM ONLINE');
      if (STATE.voiceOutput) VoiceAgent.speak(reply);

      // Update smart memory in background — don't await
      MemoryAgent.updateSmartMemory(text, reply);

      // Show PC result if it ran in parallel
      if (pcPromise) {
        const pcResult = await pcPromise;
        if (pcResult) UI.addMessage('ai', `⚡ ${pcResult}`);
      }

      // Show YouTube result if it ran in parallel
      if (ytPromise) {
        const ytResult = await ytPromise;
        if (ytResult) UI.addMessage('ai', `⚡ ${ytResult}`);
      }

    } catch(err) {
      UI.removeTyping();
      UI.addMessage('ai', `❌ Error: ${err.message}`);
      UI.setStatus('ERROR');
    }
  }
};


// ============================================================
// UI LAYER — All DOM operations live here. No agent touches DOM.
// ============================================================
const UI = {
  setStatus(text) {
    document.getElementById('statusText').textContent = text;
  },

  addMessage(role, text) {
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.remove();
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    div.className = `message ${role}`;
    const avatar = role === 'ai' ? '⚡' : '👤';
    div.innerHTML = `<div class="msg-avatar">${avatar}</div><div class="bubble">${text.replace(/\n/g, '<br>')}</div>`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  },

  addTyping() {
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    div.className = 'message ai typing';
    div.id = 'typing';
    div.innerHTML = `<div class="msg-avatar">⚡</div><div class="bubble"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  },

  removeTyping() {
    const t = document.getElementById('typing');
    if (t) t.remove();
  },

  playTypeSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(520, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch(e) {}
  },

  loadChatHistory() {
    const welcome = document.getElementById('welcome');
    const history = MemoryAgent.conversation;
    if (history.length > 0 && welcome) welcome.remove();
    const chat = document.getElementById('chat');
    chat.innerHTML = '';
    history.forEach(msg => {
      if (msg.role === 'user' || msg.role === 'assistant') {
        const div = document.createElement('div');
        div.className = `message ${msg.role === 'user' ? 'user' : 'ai'}`;
        const avatar = msg.role === 'assistant' ? '⚡' : '👤';
        div.innerHTML = `<div class="msg-avatar">${avatar}</div><div class="bubble">${msg.content.replace(/\n/g, '<br>')}</div>`;
        chat.appendChild(div);
      }
    });
    chat.scrollTop = chat.scrollHeight;
  }
};


// ============================================================
// WAKE WORD + VOICE INPUT
// ============================================================
function startWakeWord() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  STATE.wakeWordRecognition = new SpeechRecognition();
  STATE.wakeWordRecognition.lang = 'en-IN';
  STATE.wakeWordRecognition.continuous = true;
  STATE.wakeWordRecognition.interimResults = true;
  STATE.wakeWordRecognition.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const transcript = e.results[i][0].transcript.toLowerCase().trim();
      if (transcript.includes('hey sevo') || transcript.includes('hey seva') || transcript.includes('hey servo')) {
        wakeWordDetected();
      }
    }
  };
  STATE.wakeWordRecognition.onend = () => {
    if (!STATE.isRecording) { try { STATE.wakeWordRecognition.start(); } catch(e) {} }
  };
  try { STATE.wakeWordRecognition.start(); } catch(e) {}
}

function wakeWordDetected() {
  if (STATE.wakeWordActive || STATE.isRecording) return;
  STATE.wakeWordActive = true;
  playWakeSound();
  UI.setStatus('listening...');
  document.getElementById('mainAvatar').classList.add('speaking');
  setTimeout(() => {
    STATE.wakeWordActive = false;
    document.getElementById('mainAvatar').classList.remove('speaking');
    toggleVoice();
  }, 800);
}

function playWakeSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.15);
    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.15);
  } catch(e) {}
}

function toggleVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Voice input not supported! Use Chrome browser.');
    return;
  }
  if (STATE.isRecording) { STATE.recognition.stop(); return; }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  STATE.recognition = new SpeechRecognition();
  STATE.recognition.lang = 'en-IN';
  STATE.recognition.continuous = false;
  STATE.recognition.interimResults = false;
  STATE.recognition.onstart = () => {
    STATE.isRecording = true;
    document.getElementById('voiceBtn').classList.add('recording');
    document.getElementById('voiceBtn').textContent = '⏹️';
    UI.setStatus('listening...');
  };
  STATE.recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    document.getElementById('userInput').value = transcript;
    autoResize(document.getElementById('userInput'));
    sendMessage();
  };
  STATE.recognition.onend = () => {
    STATE.isRecording = false;
    document.getElementById('voiceBtn').classList.remove('recording');
    document.getElementById('voiceBtn').textContent = '🎤';
    UI.setStatus('SYSTEM ONLINE');
  };
  STATE.recognition.start();
}

function toggleVoiceOutput() {
  STATE.voiceOutput = !STATE.voiceOutput;
  document.getElementById('speakerBtn').textContent = STATE.voiceOutput ? '🔊' : '🔇';
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (!STATE.voiceOutput) document.getElementById('mainAvatar').classList.remove('speaking');
}


// ============================================================
// WEATHER + NEWS
// ============================================================
async function fetchWeather() {
  try {
    const res = await fetch(`${CONFIG.vercelUrl}/api/weather`);
    const data = await res.json();
    const temp = Math.round(data.main.temp);
    const desc = data.weather[0].description;
    const icon = getWeatherIcon(data.weather[0].main);
    STATE.currentWeather = `${temp}°C, ${desc} in ${CONFIG.city}`;
    document.getElementById('weatherWidget').textContent = `${icon} ${temp}°C`;
    document.getElementById('weatherWidget').title = desc;
  } catch(e) {
    document.getElementById('weatherWidget').textContent = '🌡️ --°C';
  }
}

function getWeatherIcon(condition) {
  const icons = {
    'Clear': '☀️', 'Clouds': '☁️', 'Rain': '🌧️', 'Drizzle': '🌦️',
    'Thunderstorm': '⛈️', 'Snow': '❄️', 'Mist': '🌫️', 'Fog': '🌫️', 'Haze': '🌫️'
  };
  return icons[condition] || '🌡️';
}

async function fetchNews() {
  try {
    UI.setStatus('fetching news...');
    const res = await fetch(`${CONFIG.vercelUrl}/api/news`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const welcome = document.getElementById('welcome');
      if (welcome) welcome.remove();
      const chat = document.getElementById('chat');
      const newsDiv = document.createElement('div');
      newsDiv.className = 'message ai';
      const headlines = data.results
        .map((r, i) => `${i+1}. <a href="${r.url}" target="_blank" style="color:var(--accent);text-decoration:none;">${r.title}</a>`)
        .join('<br><br>');
      newsDiv.innerHTML = `<div class="msg-avatar">⚡</div><div class="bubble">📰 <b>TOP NEWS</b><br><br>${headlines}</div>`;
      chat.appendChild(newsDiv);
      chat.scrollTop = chat.scrollHeight;
    }
    UI.setStatus('SYSTEM ONLINE');
  } catch(e) {
    UI.setStatus('SYSTEM ONLINE');
  }
}


// ============================================================
// PROACTIVE GREETING — Fires on startup if smart memory exists
// ============================================================
async function proactiveGreeting() {
  const smartMemory = MemoryAgent.getSmartMemory();
  if (!smartMemory || MemoryAgent.conversation.length > 0) return;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.groqKey}` },
      body: JSON.stringify({
        model: CONFIG.groqModel,
        max_tokens: 100,
        messages: [{
          role: 'system',
          content: `You are SEVO, a personal AI assistant and possessive best friend of ${USER_PROFILE.nickname} (${USER_PROFILE.fullName}). Current date/time: ${getCurrentDateTime()}. Send ONE short proactive message to start the conversation — a reminder, check-in, or acknowledgment of something important. Under 2 sentences. Casual. Call him "Sevo" or "bro" naturally. Memory: ${smartMemory}`
        }, { role: 'user', content: 'Start the conversation proactively' }]
      })
    });
    const data = await res.json();
    const greeting = data.choices[0].message.content;
    UI.addMessage('ai', greeting);
    if (STATE.voiceOutput) VoiceAgent.speak(greeting);
  } catch(e) {}
}


// ============================================================
// UI HELPERS — Setup, input, clear
// ============================================================
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function sendSuggestion(el) { document.getElementById('userInput').value = el.textContent; sendMessage(); }

function saveSetup() {
  const key = document.getElementById('apiKeyInput').value.trim();
  const name = document.getElementById('assistantName').value.trim();
  if (!key) { alert('Please enter your API key!'); return; }
  CONFIG.groqKey = key;
  CONFIG.assistantName = name || 'SEVO';
  localStorage.setItem('groq_key', CONFIG.groqKey);
  localStorage.setItem('assistant_name', CONFIG.assistantName);
  hideSetup();
  updateAssistantName();
  fetchNews();
  startWakeWord();
  setTimeout(proactiveGreeting, 3000);
}

function hideSetup() { document.getElementById('setup').style.display = 'none'; updateAssistantName(); }
function resetSetup() { localStorage.removeItem('groq_key'); localStorage.removeItem('assistant_name'); location.reload(); }

function updateAssistantName() {
  document.getElementById('assistantTitle').textContent = CONFIG.assistantName.toUpperCase();
  document.getElementById('welcomeSub').textContent = `All systems operational. What's your command, ${USER_PROFILE.nickname}?`;
}

async function sendMessage() {
  const input = document.getElementById('userInput');
  const text = input.value.trim();
  if (!text || !CONFIG.groqKey) return;
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('sendBtn').disabled = true;
  UI.addMessage('user', text);
  STATE.messageCount++;
  await Coordinator.handle(text);
  document.getElementById('sendBtn').disabled = false;
}

function clearChat() {
  MemoryAgent.clear();
  STATE.messageCount = 0;
  const chat = document.getElementById('chat');
  chat.innerHTML = `<div class="welcome" id="welcome">
    <h2 id="welcomeTitle">SEVO ONLINE ⚡</h2>
    <p id="welcomeSub">All systems operational. What's your command, ${USER_PROFILE.nickname}?</p>
    <div class="suggestions">
      <div class="suggestion-chip" onclick="sendSuggestion(this)">What's the weather today?</div>
      <div class="suggestion-chip" onclick="sendSuggestion(this)">What should I focus on today?</div>
      <div class="suggestion-chip" onclick="sendSuggestion(this)">Help me with my BBA assignment</div>
      <div class="suggestion-chip" onclick="sendSuggestion(this)">Roast me a little 😂</div>
    </div>
  </div>`;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}


// ============================================================
// INIT — Boot sequence
// ============================================================
window.onload = async () => {
  if (CONFIG.groqKey) { hideSetup(); updateAssistantName(); startWakeWord(); }
  fetchWeather();
  if (CONFIG.groqKey) { fetchNews(); setTimeout(proactiveGreeting, 3000); }
  const history = await MemoryAgent.load();
  if (history && history.length > 0) UI.loadChatHistory();
};

if (window.speechSynthesis) { window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices(); }
setInterval(fetchWeather, 600000);
