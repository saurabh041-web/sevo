// ============================================================
// SEVO — MULTI-AGENT ARCHITECTURE v2.1
// Built by Saurabh Raj 🗿
// Agents: Memory · Search · YouTube · PC · Chat · Voice
//         + File · Clipboard · Reminder · Battery · AppSwitch
// Coordinator routes everything. Nobody does someone else's job.
// ============================================================

// ─── CORE CONFIG ────────────────────────────────────────────
const CONFIG = {
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
  reminders: JSON.parse(localStorage.getItem('sevo_reminders') || '[]'),
  currentMood: 'neutral',
  moodOverridden: false,
};

// ─── UTILS ──────────────────────────────────────────────────
function getCurrentDateTime() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const date = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', ...options });
  const time = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date}, ${time} (IST)`;
}

async function detectMood(text) {
  try {
    const res = await fetch(`${CONFIG.vercelUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: `You are an emotional state classifier. Classify the user's message into exactly ONE of these six states:
stressed — overwhelmed, anxious, under pressure, too much going on
hyped — excited, energetic, celebrating, motivated
low — sad, tired, lonely, empty, disconnected
neutral — normal, nothing notable emotionally
focused — in work mode, task-oriented, wants efficiency
frustrated — annoyed, something isn't working, irritated

Respond with ONLY the single word. No explanation. No punctuation. Just the word.`,
        messages: [{ role: 'user', content: text }]
      })
    });
    const data = await res.json();
    const raw = (parseBackendResponse(data) || '').trim().toLowerCase();
    const valid = ['stressed', 'hyped', 'low', 'neutral', 'focused', 'frustrated'];
    return valid.includes(raw) ? raw : 'neutral';
  } catch(e) {
    return 'neutral';
  }
}

function detectMoodOverride(text) {
  const lower = text.toLowerCase();
  const overrideSignals = [
    "i'm fine", "im fine", "i am fine", "not stressed", "just busy",
    "not sad", "i'm good", "im good", "i am good", "actually good",
    "don't worry", "dont worry", "i'm okay", "im okay", "i am okay"
  ];
  return overrideSignals.some(signal => lower.includes(signal));
}

// Safe backend response parser — handles both Groq format and custom backend format
function parseBackendResponse(data) {
  if (!data) return null;
  return data?.choices?.[0]?.message?.content
    || data?.response
    || data?.content
    || data?.reply
    || data?.message
    || null;
}


// ============================================================
// AGENT 1 — MEMORY AGENT
// ============================================================
const MemoryAgent = {
  conversation: [],
  smartMemoryCache: '',
  sessionId: `session_${new Date().toISOString().split('T')[0]}_sevo`,

  async load() {
    try {
      const res = await fetch(`${CONFIG.vercelUrl}/api/conversation/${this.sessionId}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        this.conversation = data.map(m => ({ role: m.role, content: m.content }));
        return this.conversation;
      }
    } catch(e) {}
    this.conversation = JSON.parse(localStorage.getItem('sevo_memory') || '[]');
    return this.conversation;
  },

  async loadSmartMemory() {
    try {
      const res = await fetch(`${CONFIG.vercelUrl}/api/memory/smart_memory`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        this.smartMemoryCache = data[data.length - 1].content;
        localStorage.setItem('sevo_smart_memory', this.smartMemoryCache);
        return;
      }
    } catch(e) {}
    this.smartMemoryCache = localStorage.getItem('sevo_smart_memory') || '';
  },

  async push(role, content) {
    this.conversation.push({ role, content });
    if (this.conversation.length > 40) this.conversation = this.conversation.slice(-40);
    localStorage.setItem('sevo_memory', JSON.stringify(this.conversation));
    fetch(`${CONFIG.vercelUrl}/api/conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: this.sessionId, role, content })
    }).catch(() => {});
  },

  async save() {
    localStorage.setItem('sevo_memory', JSON.stringify(this.conversation));
  },

  getRecent(n = 20) {
    return this.conversation.slice(-n);
  },

  getSmartMemory() {
    return this.smartMemoryCache || localStorage.getItem('sevo_smart_memory') || '';
  },

  async updateSmartMemory(userMessage, aiReply) {
    try {
      const existing = this.getSmartMemory();
      const res = await fetch(`${CONFIG.vercelUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are SEVO's memory manager. Maintain a permanent, organized memory about ${USER_PROFILE.fullName} (goes by ${USER_PROFILE.nickname}).
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

Return the COMPLETE updated memory.`,
          messages: [{ role: 'user', content: 'Update memory now' }]
        })
      });
      const data = await res.json();
      const newMemory = parseBackendResponse(data);
      if (!newMemory) return;
      this.smartMemoryCache = newMemory;
      localStorage.setItem('sevo_smart_memory', newMemory);
      fetch(`${CONFIG.vercelUrl}/api/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'smart_memory', content: newMemory })
      }).catch(() => {});
    } catch(e) {}
  },

  clear() {
    this.conversation = [];
    this.smartMemoryCache = '';
    localStorage.removeItem('sevo_memory');
    fetch(`${CONFIG.vercelUrl}/api/conversation/${this.sessionId}`, { method: 'DELETE' }).catch(() => {});
  }
};


// ============================================================
// MOOD AGENT — Emotional memory and proactive check-ins
// ============================================================
const MoodAgent = {
  sessionMoods: [],
  checkInFired: false,

  trackMood(mood) {
    this.sessionMoods.push(mood);
  },

  getDominantMood() {
    if (this.sessionMoods.length === 0) return 'neutral';
    const counts = {};
    this.sessionMoods.forEach(m => counts[m] = (counts[m] || 0) + 1);
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  },

  async saveSession() {
    const dominant = this.getDominantMood();
    const today = new Date().toISOString().split('T')[0];
    try {
      await fetch(`${CONFIG.vercelUrl}/api/mood`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: MemoryAgent.sessionId,
          date: today,
          dominant_mood: dominant
        })
      });
    } catch(e) {}
  },

  async shouldCheckIn() {
    if (this.checkInFired) return false;
    const today = new Date().toISOString().split('T')[0];
    const lastCheckin = localStorage.getItem('sevo_last_checkin');
    if (lastCheckin === today) return false;
    try {
      const res = await fetch(`${CONFIG.vercelUrl}/api/mood/recent`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length < 3) return false;
      const last3 = data.slice(-3);
      const allNegative = last3.every(d => d.dominant_mood === 'low' || d.dominant_mood === 'stressed');
      return allNegative;
    } catch(e) { return false; }
  },

  async maybeCheckIn() {
    const should = await this.shouldCheckIn();
    if (!should) return;
    this.checkInFired = true;
    localStorage.setItem('sevo_last_checkin', new Date().toISOString().split('T')[0]);
    const message = "You've seemed a bit off lately. Everything good?";
    UI.addMessage('ai', message);
    if (STATE.voiceOutput) VoiceAgent.speak(message);
  },

  dismiss() {
    this.checkInFired = true;
  }
};


// ============================================================
// WORLD AGENT — Morning briefing, market data, watchlist
// ============================================================
const WorldAgent = {
  watchlist: { crypto: [], stocks: [] },
  briefingFired: false,

  async loadWatchlist() {
    try {
      const res = await fetch(`${CONFIG.vercelUrl}/api/watchlist`);
      const data = await res.json();
      this.watchlist = JSON.parse(data.watchlist || '{"crypto":[],"stocks":[]}');
    } catch(e) {
      this.watchlist = { crypto: [], stocks: [] };
    }
  },

  async saveWatchlist() {
    try {
      await fetch(`${CONFIG.vercelUrl}/api/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: JSON.stringify(this.watchlist) })
      });
    } catch(e) {}
  },

  async addToWatchlist(type, item) {
    const normalized = item.toLowerCase().trim();
    if (!this.watchlist[type].includes(normalized)) {
      this.watchlist[type].push(normalized);
      await this.saveWatchlist();
      return `Added ${item} to your watchlist ✅`;
    }
    return `${item} is already on your watchlist`;
  },

  async removeFromWatchlist(type, item) {
    const normalized = item.toLowerCase().trim();
    const before = this.watchlist[type].length;
    this.watchlist[type] = this.watchlist[type].filter(i => i !== normalized);
    if (this.watchlist[type].length < before) {
      await this.saveWatchlist();
      return `Removed ${item} from your watchlist ✅`;
    }
    return `${item} wasn't on your watchlist`;
  },

  async fetchCrypto() {
    try {
      const defaultCoins = ['bitcoin', 'ethereum'];
      const allCoins = [...new Set([...defaultCoins, ...this.watchlist.crypto])];
      const res = await fetch(`${CONFIG.vercelUrl}/api/crypto?coins=${allCoins.join(',')}`);
      const data = await res.json();
      return { success: true, data };
    } catch(e) {
      return { success: false, data: null };
    }
  },

  async fetchMarket() {
    try {
      const defaultStocks = ['XAU/USD', 'LMT', 'NOC', 'HAL'];
      const watchStocks = this.watchlist.stocks.map(s => s.toUpperCase());
      const allSymbols = [...new Set([...defaultStocks, ...watchStocks])];
      const res = await fetch(`${CONFIG.vercelUrl}/api/market?symbols=${allSymbols.join(',')}`);
      const data = await res.json();
      return { success: true, data };
    } catch(e) {
      return { success: false, data: null };
    }
  },

  async fetchNews() {
    try {
      const res = await fetch(`${CONFIG.vercelUrl}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'top global news today last 24 hours' })
      });
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        return { success: true, data: data.results.slice(0, 3) };
      }
      return { success: false, data: null };
    } catch(e) {
      return { success: false, data: null };
    }
  },

  formatCrypto(data) {
    if (!data) return 'Crypto data unavailable right now.';
    const lines = [];
    const names = { bitcoin: 'Bitcoin', ethereum: 'Ethereum' };
    for (const [coin, info] of Object.entries(data)) {
      const price = info.usd?.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) || 'N/A';
      const change = info.usd_24h_change?.toFixed(2);
      const arrow = change > 0 ? '▲' : '▼';
      const label = names[coin] || coin.charAt(0).toUpperCase() + coin.slice(1);
      lines.push(`${label}: ${price} ${arrow} ${Math.abs(change)}% (24h)`);
    }
    return lines.join(' · ');
  },

  formatMarket(data) {
    if (!data) return 'Market data unavailable right now.';
    const lines = [];
    const labels = { 'XAU/USD': 'Gold', 'LMT': 'Lockheed Martin', 'NOC': 'Northrop Grumman', 'HAL': 'HAL' };
    for (const [symbol, info] of Object.entries(data)) {
      if (info.status === 'error' || !info.close) {
        const label = labels[symbol] || symbol;
        lines.push(`${label}: data unavailable`);
        continue;
      }
      const price = parseFloat(info.close).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      const change = parseFloat(info.percent_change);
      const arrow = change >= 0 ? '▲' : '▼';
      const label = labels[symbol] || symbol;
      const isDelayed = info.is_market_closed ? ' (market closed)' : '';
      lines.push(`${label}: ${price} ${arrow} ${Math.abs(change).toFixed(2)}%${isDelayed}`);
    }
    return lines.join(' · ');
  },

  formatNews(results) {
    if (!results || results.length === 0) return 'No news results available right now.';
    return results.map((r, i) => `${i + 1}. ${r.title}`).join(' | ');
  },

  shouldFireBriefing() {
    const today = new Date().toISOString().split('T')[0];
    const lastBriefing = localStorage.getItem('sevo_last_briefing');
    return lastBriefing !== today && !this.briefingFired;
  },

  async deliverBriefing(forced = false) {
    if (!forced && !this.shouldFireBriefing()) return;

    const mood = STATE.currentMood;
    if (mood === 'frustrated' && !forced) return;

    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('sevo_last_briefing', today);
    this.briefingFired = true;

    UI.setStatus('loading world briefing...');

    const [cryptoResult, marketResult, newsResult] = await Promise.all([
      this.fetchCrypto(),
      this.fetchMarket(),
      this.fetchNews()
    ]);

    const cryptoText = this.formatCrypto(cryptoResult.data);
    const marketText = this.formatMarket(marketResult.data);
    const newsText = this.formatNews(newsResult.data);

    const isShortBriefing = mood === 'low' || mood === 'stressed';
    const briefingPrompt = isShortBriefing
      ? `Deliver a SHORT world briefing to ${USER_PROFILE.nickname}. He seems ${mood} today so keep it brief and soft. Lead with one news headline only. Skip detailed market breakdown — just mention if anything major moved. End naturally. Data: NEWS: ${newsText} | CRYPTO: ${cryptoText} | MARKET: ${marketText}`
      : `Deliver a natural, conversational morning world briefing to ${USER_PROFILE.nickname}. Cover all four domains in order: global news (top 2-3 stories), crypto (Bitcoin and Ethereum), gold, then defence stocks (HAL, Lockheed Martin, Northrop Grumman). Sound like a well-informed friend catching him up, not a data terminal. End with one line handing control back naturally — something like "That's the world right now. What do you want to tackle first?" Never say "End of briefing". Mood is ${mood} — match energy accordingly. Data: NEWS: ${newsText} | CRYPTO: ${cryptoText} | MARKET: ${marketText}`;

    try {
      const res = await fetch(`${CONFIG.vercelUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are SEVO, ${USER_PROFILE.nickname}'s personal AI assistant and best friend. ${briefingPrompt}`,
          messages: [{ role: 'user', content: 'Deliver my morning briefing' }]
        })
      });
      const data = await res.json();
      const briefing = parseBackendResponse(data);
      if (briefing) {
        UI.addMessage('ai', briefing);
        if (STATE.voiceOutput) VoiceAgent.speak(briefing);
      }
    } catch(e) {
      UI.addMessage('ai', "Couldn't reach the outside world right now. I'll try again when you ask.");
    }

    UI.setStatus('SYSTEM ONLINE');
  },

  async execute(text) {
    const lower = text.toLowerCase();

    const addCryptoMatch = text.match(/add\s+(\w+)\s+(?:to|on)\s+(?:my\s+)?(?:watchlist|briefing)/i);
    const addStockMatch = text.match(/track\s+(.+?)\s+(?:for me|on watchlist|in briefing)/i);

    if (addCryptoMatch) {
      const item = addCryptoMatch[1].toLowerCase();
      const cryptoNames = ['bitcoin', 'ethereum', 'solana', 'dogecoin', 'ripple', 'cardano', 'bnb', 'xrp'];
      const type = cryptoNames.includes(item) ? 'crypto' : 'stocks';
      return await this.addToWatchlist(type, item);
    }

    if (addStockMatch) {
      return await this.addToWatchlist('stocks', addStockMatch[1].trim());
    }

    const removeMatch = text.match(/remove\s+(.+?)\s+(?:from|off)\s+(?:my\s+)?(?:watchlist|briefing)/i);
    if (removeMatch) {
      const item = removeMatch[1].trim().toLowerCase();
      const cryptoResult = await this.removeFromWatchlist('crypto', item);
      if (cryptoResult.includes("wasn't")) {
        return await this.removeFromWatchlist('stocks', item);
      }
      return cryptoResult;
    }

    if (lower.includes('briefing') || lower.includes('world update') || lower.includes("what's happening")) {
      await this.deliverBriefing(true);
      return null;
    }

    if (lower.includes('bitcoin') || lower.includes('ethereum') || lower.includes('crypto') || lower.includes('btc') || lower.includes('eth')) {
      const result = await this.fetchCrypto();
      return result.success ? this.formatCrypto(result.data) : 'Crypto data unavailable right now.';
    }

    if (lower.includes('gold') || lower.includes('xau')) {
      const result = await this.fetchMarket();
      if (result.success && result.data['XAU/USD']) {
        return this.formatMarket({ 'XAU/USD': result.data['XAU/USD'] });
      }
      return 'Gold data unavailable right now.';
    }

    const stockMap = {
      'hal': 'HAL', 'lockheed': 'LMT', 'lmt': 'LMT',
      'northrop': 'NOC', 'noc': 'NOC', 'grumman': 'NOC'
    };
    for (const [keyword, symbol] of Object.entries(stockMap)) {
      if (lower.includes(keyword)) {
        const result = await this.fetchMarket();
        if (result.success && result.data[symbol]) {
          return this.formatMarket({ [symbol]: result.data[symbol] });
        }
        return `${symbol} data unavailable right now.`;
      }
    }

    return null;
  }
};


// ============================================================
// EMAIL AGENT — Gmail read, summarise, mark as read
// ============================================================
const EmailAgent = {
  lastFetchedEmails: null,
  isAuthenticated: false,

  async ensureAuth() {
    try {
      const res = await fetch(`${CONFIG.vercelUrl}/api/gmail/emails?max_results=1`)
      if (res.status === 401) {
        UI.addMessage('ai', "I need to connect to your Gmail first. Opening Google sign-in...")
        if (STATE.voiceOutput) VoiceAgent.speak("Opening Google sign-in for Gmail.")
        await window.electronAPI.startGmailAuth()
        UI.addMessage('ai', "Gmail connected. Try your email command again.")
        if (STATE.voiceOutput) VoiceAgent.speak("Gmail connected. Try again.")
        this.isAuthenticated = true
        return false
      }
      this.isAuthenticated = true
      return true
    } catch(e) {
      return false
    }
  },

  async fetchEmails() {
    UI.setStatus('checking emails...')
    try {
      const res = await fetch(`${CONFIG.vercelUrl}/api/gmail/emails`)
      if (res.status === 401) {
        await this.ensureAuth()
        return null
      }
      const data = await res.json()
      this.lastFetchedEmails = data
      return data
    } catch(e) {
      return null
    }
  },

  async markRead(emailIds) {
    try {
      await fetch(`${CONFIG.vercelUrl}/api/gmail/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_ids: emailIds })
      })
      return true
    } catch(e) { return false }
  },

  async execute(text) {
    const lower = text.toLowerCase()

    if (lower.includes('mark') && lower.includes('read')) {
      if (!this.lastFetchedEmails) {
        return "No emails loaded yet. Ask me to check your emails first."
      }
      const cats = this.lastFetchedEmails.categories || {}
      if (lower.includes('promotional')) {
        const promoIds = (cats.Promotional || []).map(e => e.id)
        await this.markRead(promoIds)
        return `Marked ${promoIds.length} promotional emails as read ✅`
      }
      const allIds = Object.values(cats).flat().map(e => e.id).filter(Boolean)
      await this.markRead(allIds)
      return `Marked ${allIds.length} emails as read ✅`
    }

    if (lower.includes('email') || lower.includes('inbox') || lower.includes('gmail') || lower.includes('mail')) {
      const authOk = await this.ensureAuth()
      if (!authOk) return null

      const data = await this.fetchEmails()
      if (!data) return "Couldn't reach Gmail right now. Try again in a moment."

      if (data.summary === 'inbox_clear' || !data.total) {
        return "Inbox is clear. Nothing unread right now. 📭"
      }

      const mood = STATE.currentMood
      let response = data.summary

      if (mood === 'stressed') {
        response = "Let me filter the noise for you. " + response
      } else if (mood === 'low') {
        response = "You sure you want to deal with emails right now? Here's what's there: " + response
      }

      const cats = data.categories || {}
      const breakdown = []
      if (cats.Important?.length) breakdown.push(`${cats.Important.length} important`)
      if (cats.College?.length) breakdown.push(`${cats.College.length} from college`)
      if (cats.GitHub?.length) breakdown.push(`${cats.GitHub.length} from GitHub`)
      if (cats.Promotional?.length) breakdown.push(`${cats.Promotional.length} promotional`)
      if (cats.Notifications?.length) breakdown.push(`${cats.Notifications.length} notifications`)

      if (breakdown.length > 0) {
        response += ` — ${breakdown.join(', ')}.`
      }

      response += " Want me to read the important ones?"
      return response
    }

    return null
  }
};


// ============================================================
// MUSIC AGENT — YouTube Music Control
// ============================================================
const MusicAgent = {
  queue: { results: [], currentIndex: -1, hasTabOpen: false },
  awaitingMoodResponse: false,

  async execute(text) {
    const lower = text.toLowerCase();

    if (lower.includes('skip') || lower.includes('next song') || lower.includes('next track')) {
      return await this.skip();
    }
    if (lower === 'stop' || lower === 'stop music' || lower === 'stop the music') {
      return await this.stop();
    }
    if (lower.includes('what are you playing') || lower.includes('what was that song') || lower.includes('last played') || lower.includes('what song')) {
      return this.lastPlayed();
    }
    if (lower === 'pause' || lower === 'pause music' || lower === 'pause the music') {
      return await this.pause();
    }
    if (lower === 'resume' || lower === 'resume music' || lower === 'play') {
      return await this.resume();
    }
    
    if (lower.startsWith('play')) {
      let query = text.replace(/^play\s+/i, '').trim();
      
      const isBareRequest = query === 'something' || query === 'music' || query === '';

      if (isBareRequest) {
        const mood = STATE.currentMood;
        if (mood === 'low' || mood === 'stressed') {
          this.awaitingMoodResponse = true;
          return "What kind of mood are you in?";
        } else if (mood === 'hyped') {
          query = 'upbeat hype music';
        } else if (mood === 'focused') {
          query = 'lofi beats';
        }
      }
      return await this.play(query);
    }

    return null;
  },

  async handleMoodResponse(text) {
    this.awaitingMoodResponse = false;
    const trimmed = text.trim();
    const isMeaningfulAnswer = trimmed.length > 2 && !/^(no|nah|nothing|idk|i don'?t know)$/i.test(trimmed);
    const query = isMeaningfulAnswer ? trimmed : 'calm relaxing music';
    return await this.play(query);
  },

  async play(query) {
    try {
      if (this.queue.hasTabOpen) {
        await PCAgent.tools.browser_focus();
        await PCAgent.tools.browser_close_tab();
      }

      const res = await fetch(`${CONFIG.vercelUrl}/api/youtube?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        return `Couldn't find anything for "${query}". Try something else?`;
      }

      this.queue.results = data.items.slice(0, 5).map(video => ({
        videoId: video.id.videoId,
        title: video.snippet.title,
        channel: video.snippet.channelTitle,
        url: `https://www.youtube.com/watch?v=${video.id.videoId}`
      }));
      this.queue.currentIndex = 0;
      
      const current = this.queue.results[0];
      await PCAgent.tools.browser_open_url(current.url);
      this.queue.hasTabOpen = true;

      return `Playing ${current.title} 🎵`;
    } catch (e) {
      return `Had trouble playing that. Try again in a moment.`;
    }
  },

  async focusVideoAndToggle() {
    const script = "$q = [char]34; $sig = 'public struct RECT { public int Left; public int Top; public int Right; public int Bottom; } [DllImport(' + $q + 'user32.dll' + $q + ')] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect); [DllImport(' + $q + 'user32.dll' + $q + ')] public static extern IntPtr GetForegroundWindow(); [DllImport(' + $q + 'user32.dll' + $q + ')] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);'; Add-Type -MemberDefinition $sig -Name Win32Click -Namespace SevoNative; Add-Type -AssemblyName System.Windows.Forms; $wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate('chrome'); Start-Sleep -Milliseconds 300; $hwnd = [SevoNative.Win32Click]::GetForegroundWindow(); $rect = New-Object SevoNative.Win32Click+RECT; [SevoNative.Win32Click]::GetWindowRect($hwnd, [ref]$rect); $centerX = [int](($rect.Left + $rect.Right) / 2); $centerY = [int](($rect.Top + $rect.Bottom) / 2); [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($centerX, $centerY); [SevoNative.Win32Click]::mouse_event(0x0002, 0, 0, 0, 0); Start-Sleep -Milliseconds 50; [SevoNative.Win32Click]::mouse_event(0x0004, 0, 0, 0, 0); Start-Sleep -Milliseconds 100; $wsh.SendKeys(' ')";
    await window.electronAPI?.runPC(`powershell -c "${script}"`);
  },

  async pause() {
    if (!this.queue.hasTabOpen) {
      return "Nothing is playing right now, buddy. You might need to pause it manually if a tab is open.";
    }
    try {
      await this.focusVideoAndToggle();
      return 'Paused ⏸️';
    } catch (e) {
      return "Couldn't pause automatically. You might need to hit space manually.";
    }
  },

  async resume() {
    if (!this.queue.hasTabOpen) {
      return "Nothing is playing right now, buddy.";
    }
    try {
      await this.focusVideoAndToggle();
      return 'Resumed ▶️';
    } catch (e) {
      return "Couldn't resume automatically. You might need to hit space manually.";
    }
  },

  async skip() {
    if (this.queue.currentIndex + 1 >= this.queue.results.length) {
      return "That was the last one in the queue. Want me to find something else?";
    }
    try {
      await PCAgent.tools.browser_focus();
      await PCAgent.tools.browser_close_tab();
      this.queue.currentIndex++;
      const current = this.queue.results[this.queue.currentIndex];
      await PCAgent.tools.browser_open_url(current.url);
      return `Next up: ${current.title} ⏭️`;
    } catch (e) {
      if (this.queue.currentIndex + 1 < this.queue.results.length) {
        this.queue.currentIndex++;
        const next = this.queue.results[this.queue.currentIndex];
        try {
          await PCAgent.tools.browser_open_url(next.url);
          return `Skipped ahead to: ${next.title} ⏭️`;
        } catch (e2) {
          return "Couldn't skip to the next track. You might need to click manually.";
        }
      }
      return "Couldn't skip to the next track. You might need to click manually.";
    }
  },

  async stop() {
    if (this.queue.hasTabOpen) {
      await PCAgent.tools.browser_focus();
      await PCAgent.tools.browser_close_tab();
    }
    this.queue = { results: [], currentIndex: -1, hasTabOpen: false };
    return 'Music stopped 🔇';
  },

  lastPlayed() {
    if (this.queue.currentIndex === -1 || this.queue.results.length === 0) {
      return "Nothing has been played this session.";
    }
    const current = this.queue.results[this.queue.currentIndex];
    return `Last thing I played was "${current.title}" by ${current.channel} 🎵`;
  }
};


// ============================================================
// AGENT 2 — SEARCH AGENT
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
// ============================================================
const PCAgent = {
  tools: {
    open_youtube:    () => { window.open('https://youtube.com', '_blank'); return 'Opening YouTube 🎬'; },
    open_google:     () => { window.open('https://google.com', '_blank'); return 'Opening Google 🔍'; },
    open_spotify:    () => { window.open('https://open.spotify.com', '_blank'); return 'Opening Spotify 🎵'; },
    open_whatsapp:   () => { window.open('https://web.whatsapp.com', '_blank'); return 'Opening WhatsApp 💬'; },
    open_instagram:  () => { window.open('https://instagram.com', '_blank'); return 'Opening Instagram 📸'; },
    open_gmail:      () => { window.open('https://mail.google.com', '_blank'); return 'Opening Gmail 📧'; },
    open_github:     () => { window.open('https://github.com/saurabh0198', '_blank'); return 'Opening your GitHub 💻'; },
    open_linkedin:   () => { window.open('https://linkedin.com', '_blank'); return 'Opening LinkedIn 💼'; },
    search_youtube:  (q) => { window.open(`https://youtube.com/results?search_query=${encodeURIComponent(q)}`, '_blank'); return `Searching YouTube for "${q}" 🎬`; },
    search_google:   (q) => { window.open(`https://google.com/search?q=${encodeURIComponent(q)}`, '_blank'); return `Searching Google for "${q}" 🔍`; },
    play_music:      (q) => { window.open(`https://open.spotify.com/search/${encodeURIComponent(q)}`, '_blank'); return `Playing "${q}" on Spotify 🎵`; },
    open_notepad:    async () => { await window.electronAPI?.runPC('notepad.exe'); return 'Opening Notepad 📝'; },
    open_calculator: async () => { await window.electronAPI?.runPC('calc.exe'); return 'Opening Calculator 🧮'; },
    open_explorer:   async () => { await window.electronAPI?.runPC('explorer.exe'); return 'Opening File Explorer 📁'; },
    open_vscode:     async () => { await window.electronAPI?.runPC('code .'); return 'Opening VS Code 💻'; },
    open_chrome:     async () => { await window.electronAPI?.runPC('start chrome'); return 'Opening Chrome 🌐'; },
    open_task_manager: async () => { await window.electronAPI?.runPC('taskmgr.exe'); return 'Opening Task Manager ⚙️'; },
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

    // ── Browser Control Tools ────────────────────────────────
    browser_open_url: async (url) => {
      const resolved = PCAgent.resolveUrl(url);
      await window.electronAPI?.runPC(`powershell -c "Start-Process '${resolved}'"`);
      return `Opening ${resolved} 🌐`;
    },

    browser_new_tab: async () => {
      await window.electronAPI?.runPC(`powershell -c "$wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate('chrome'); Start-Sleep -Milliseconds 200; $wsh.SendKeys('^t')"`);
      return 'New tab opened 🔖';
    },

    browser_close_tab: async () => {
      await window.electronAPI?.runPC(`powershell -c "$wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate('chrome'); Start-Sleep -Milliseconds 200; $wsh.SendKeys('^w')"`);
      return 'Tab closed ✅';
    },

    browser_next_tab: async () => {
      await window.electronAPI?.runPC(`powershell -c "$wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate('chrome'); Start-Sleep -Milliseconds 200; $wsh.SendKeys('^{TAB}')"`);
      return 'Switched to next tab 🔀';
    },

    browser_prev_tab: async () => {
      await window.electronAPI?.runPC(`powershell -c "$wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate('chrome'); Start-Sleep -Milliseconds 200; $wsh.SendKeys('^+{TAB}')"`);
      return 'Switched to previous tab 🔀';
    },

    browser_tab_1: async () => {
      await window.electronAPI?.runPC(`powershell -c "$wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate('chrome'); Start-Sleep -Milliseconds 200; $wsh.SendKeys('^1')"`);
      return 'Switched to tab 1 🔀';
    },

    browser_tab_2: async () => {
      await window.electronAPI?.runPC(`powershell -c "$wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate('chrome'); Start-Sleep -Milliseconds 200; $wsh.SendKeys('^2')"`);
      return 'Switched to tab 2 🔀';
    },

    browser_tab_3: async () => {
      await window.electronAPI?.runPC(`powershell -c "$wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate('chrome'); Start-Sleep -Milliseconds 200; $wsh.SendKeys('^3')"`);
      return 'Switched to tab 3 🔀';
    },

    browser_search_google: async (query) => {
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      await window.electronAPI?.runPC(`powershell -c "Start-Process '${url}'"`);
      return `Searching Google for "${query}" 🔍`;
    },

    browser_scroll_down: async () => {
      await window.electronAPI?.runPC(`powershell -c "$wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate('chrome'); Start-Sleep -Milliseconds 200; $wsh.SendKeys(' ')"`);
      return 'Scrolled down 👇';
    },

    browser_scroll_up: async () => {
      await window.electronAPI?.runPC(`powershell -c "$wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate('chrome'); Start-Sleep -Milliseconds 200; $wsh.SendKeys('+{ }')"`);
      return 'Scrolled up 👆';
    },

    browser_scroll_top: async () => {
      await window.electronAPI?.runPC(`powershell -c "$wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate('chrome'); Start-Sleep -Milliseconds 200; $wsh.SendKeys('^{HOME}')"`);
      return 'Scrolled to top ⬆️';
    },

    browser_scroll_bottom: async () => {
      await window.electronAPI?.runPC(`powershell -c "$wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate('chrome'); Start-Sleep -Milliseconds 200; $wsh.SendKeys('^{END}')"`);
      return 'Scrolled to bottom ⬇️';
    },

    browser_focus: async () => {
      await window.electronAPI?.runPC(`powershell -c "$wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate('chrome')"`);
      return 'Focused Chrome 🌐';
    },
  },

  resolveUrl(input) {
    const siteMap = {
      'youtube': 'https://youtube.com',
      'google': 'https://google.com',
      'github': 'https://github.com/saurabh0198',
      'gmail': 'https://mail.google.com',
      'netflix': 'https://netflix.com',
      'twitter': 'https://twitter.com',
      'x': 'https://x.com',
      'instagram': 'https://instagram.com',
      'whatsapp': 'https://web.whatsapp.com',
      'linkedin': 'https://linkedin.com',
      'spotify': 'https://open.spotify.com',
      'reddit': 'https://reddit.com',
      'chatgpt': 'https://chat.openai.com',
      'claude': 'https://claude.ai',
      'notion': 'https://notion.so',
      'figma': 'https://figma.com',
      'vercel': 'https://vercel.com',
      'render': 'https://render.com',
      'supabase': 'https://supabase.com',
    };
    const lower = input.toLowerCase().trim();
    if (siteMap[lower]) return siteMap[lower];
    if (lower.startsWith('http://') || lower.startsWith('https://')) return input;
    if (lower.includes('.')) return `https://${lower}`;
    return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
  },

  async execute(text) {
    try {
      const res = await fetch(`${CONFIG.vercelUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are a PC tool detector. Respond with ONLY a JSON array of actions like:
[{"tool": "open_youtube"}, {"tool": "search_youtube", "query": "lofi beats"}]
Available tools: open_youtube, open_google, open_spotify, open_whatsapp, open_instagram, open_gmail, open_github, open_linkedin, search_youtube, search_google, play_music, open_notepad, open_calculator, open_explorer, open_vscode, open_chrome, open_task_manager, shutdown, restart, cancel_shutdown, take_screenshot, system_info, volume_up, volume_down, mute, browser_open_url (needs query: the URL or site name), browser_new_tab, browser_close_tab, browser_next_tab, browser_prev_tab, browser_tab_1, browser_tab_2, browser_tab_3, browser_search_google (needs query: the search term), browser_scroll_down, browser_scroll_up, browser_scroll_top, browser_scroll_bottom, browser_focus.
If no tool matches, respond with [{"tool": "none"}].`,
          messages: [{ role: 'user', content: text }]
        })
      });
      const data = await res.json();
      const raw = parseBackendResponse(data);
      if (!raw) return null;
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
// AGENT 7 — FILE AGENT (NEW)
// Create, read, list files via Electron
// ============================================================
const FileAgent = {
  toolMap: {
    open_downloads: async () => { await window.electronAPI?.runPC('explorer.exe %USERPROFILE%\\Downloads'); return 'Opening Downloads folder 📁'; },
    open_desktop:   async () => { await window.electronAPI?.runPC('explorer.exe %USERPROFILE%\\Desktop'); return 'Opening Desktop folder 🖥️'; },
    open_documents: async () => { await window.electronAPI?.runPC('explorer.exe %USERPROFILE%\\Documents'); return 'Opening Documents folder 📂'; },
    open_project:   async () => { await window.electronAPI?.runPC('explorer.exe %USERPROFILE%\\Desktop\\MyAssistant'); return 'Opening SEVO project folder 🚀'; },
    create_file:    async (args = {}) => {
      const filename = args.filename || `sevo_note_${Date.now()}.txt`;
      const content = args.content || '';
      await window.electronAPI?.runPC(`powershell -c "Set-Content -Path '$env:USERPROFILE\\Desktop\\${filename}' -Value '${content.replace(/'/g, "''")}'"`);
      return `Created file "${filename}" on your Desktop 📄`;
    }
  },

  async execute(text) {
    try {
      const lower = text.toLowerCase();

      // Create file
      if (lower.includes('create') || lower.includes('make') || lower.includes('new file')) {
        const nameMatch = text.match(/(?:called|named|file)\s+["']?([a-zA-Z0-9_\-. ]+)["']?/i);
        const contentMatch = text.match(/(?:with content|write|containing)\s+["']?(.+)["']?$/i);
        const filename = nameMatch ? nameMatch[1].trim() : `sevo_note_${Date.now()}.txt`;
        const content = contentMatch ? contentMatch[1].trim() : '';
        await window.electronAPI?.runPC(`powershell -c "Set-Content -Path '$env:USERPROFILE\\Desktop\\${filename}' -Value '${content.replace(/'/g, "''")}'"`)
        return `Created file "${filename}" on your Desktop 📄`;
      }

      // Open downloads
      if (lower.includes('download')) {
        await window.electronAPI?.runPC('explorer.exe %USERPROFILE%\\Downloads');
        return 'Opening Downloads folder 📁';
      }

      // Open desktop
      if (lower.includes('desktop')) {
        await window.electronAPI?.runPC('explorer.exe %USERPROFILE%\\Desktop');
        return 'Opening Desktop folder 🖥️';
      }

      // Open documents
      if (lower.includes('document')) {
        await window.electronAPI?.runPC('explorer.exe %USERPROFILE%\\Documents');
        return 'Opening Documents folder 📂';
      }

      // Open MyAssistant folder
      if (lower.includes('sevo') || lower.includes('myassistant') || lower.includes('project')) {
        await window.electronAPI?.runPC('explorer.exe %USERPROFILE%\\Desktop\\MyAssistant');
        return 'Opening SEVO project folder 🚀';
      }

      return null;
    } catch(e) { return `File operation failed: ${e.message}`; }
  }
};


// ============================================================
// AGENT 8 — CLIPBOARD AGENT (NEW)
// Copy text to clipboard, read clipboard
// ============================================================
const ClipboardAgent = {
  async execute(text) {
    try {
      const lower = text.toLowerCase();

      // Copy something specific
      const copyMatch = text.match(/copy\s+["']?(.+?)["']?\s*(?:to clipboard)?$/i);
      if (copyMatch) {
        const toCopy = copyMatch[1].trim();
        await navigator.clipboard.writeText(toCopy);
        return `Copied to clipboard: "${toCopy}" 📋`;
      }

      // Read clipboard
      if (lower.includes('read clipboard') || lower.includes('what\'s in clipboard') || lower.includes('clipboard content')) {
        const content = await navigator.clipboard.readText();
        return content ? `Clipboard contains: "${content.slice(0, 200)}"` : 'Clipboard is empty';
      }

      // Clear clipboard
      if (lower.includes('clear clipboard')) {
        await navigator.clipboard.writeText('');
        return 'Clipboard cleared 🗑️';
      }

      return null;
    } catch(e) { return 'Clipboard access failed — try granting permissions'; }
  }
};


// ============================================================
// AGENT 9 — REMINDER AGENT (NEW)
// Set, list, delete reminders
// ============================================================
const ReminderAgent = {
  reminders: JSON.parse(localStorage.getItem('sevo_reminders') || '[]'),
  checkInterval: null,

  init() {
    this.checkInterval = setInterval(() => this.checkReminders(), 30000);
    this.checkReminders();
  },

  parseTime(text) {
    const now = new Date();
    // "at 6pm", "at 18:00"
    const atMatch = text.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (atMatch) {
      let hours = parseInt(atMatch[1]);
      const minutes = parseInt(atMatch[2] || '0');
      const ampm = atMatch[3]?.toLowerCase();
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      const target = new Date();
      target.setHours(hours, minutes, 0, 0);
      if (target < now) target.setDate(target.getDate() + 1);
      return target;
    }
    // "in X minutes/hours"
    const inMatch = text.match(/in\s+(\d+)\s*(minute|hour|min|hr)/i);
    if (inMatch) {
      const val = parseInt(inMatch[1]);
      const unit = inMatch[2].toLowerCase();
      const ms = unit.startsWith('h') ? val * 3600000 : val * 60000;
      return new Date(now.getTime() + ms);
    }
    return null;
  },

  async execute(text) {
    const lower = text.toLowerCase();

    // List reminders
    if (lower.includes('list reminder') || lower.includes('my reminder') || lower.includes('show reminder')) {
      if (this.reminders.length === 0) return 'No reminders set bro ⏰';
      const list = this.reminders.map((r, i) =>
        `${i+1}. "${r.message}" at ${new Date(r.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`
      ).join('\n');
      return `Your reminders:\n${list}`;
    }

    // Delete reminder
    if (lower.includes('delete reminder') || lower.includes('remove reminder') || lower.includes('cancel reminder')) {
      this.reminders = [];
      localStorage.setItem('sevo_reminders', JSON.stringify(this.reminders));
      return 'All reminders cleared ✅';
    }

    // Set reminder
    if (lower.includes('remind') || lower.includes('reminder')) {
      const msgMatch = text.match(/remind(?:\s+me)?\s+(?:to\s+)?(.+?)(?:\s+at|\s+in|\s*$)/i);
      const message = msgMatch ? msgMatch[1].trim() : 'Check this';
      const time = this.parseTime(text);
      if (!time) return 'I need a time bro — try "remind me to eat at 7pm" or "remind me in 30 minutes"';
      const reminder = { id: Date.now(), message, time: time.getTime() };
      this.reminders.push(reminder);
      localStorage.setItem('sevo_reminders', JSON.stringify(this.reminders));
      return `Reminder set: "${message}" at ${time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })} ⏰`;
    }

    return null;
  },

  checkReminders() {
    const now = Date.now();
    const due = this.reminders.filter(r => r.time <= now);
    due.forEach(r => {
      UI.addMessage('ai', `⏰ Reminder: ${r.message}`);
      if (STATE.voiceOutput) VoiceAgent.speak(`Hey bro, reminder: ${r.message}`);
    });
    if (due.length > 0) {
      this.reminders = this.reminders.filter(r => r.time > now);
      localStorage.setItem('sevo_reminders', JSON.stringify(this.reminders));
    }
  }
};


// ============================================================
// AGENT 10 — BATTERY + SYSTEM STATS AGENT (NEW)
// ============================================================
const BatteryAgent = {
  async execute(text) {
    try {
      const lower = text.toLowerCase();
      if (!lower.includes('battery') && !lower.includes('power') && !lower.includes('charge')) return null;

      if ('getBattery' in navigator) {
        const battery = await navigator.getBattery();
        const pct = Math.round(battery.level * 100);
        const charging = battery.charging;
        const timeLeft = charging
          ? battery.chargingTime === Infinity ? '' : ` · Full in ${Math.round(battery.chargingTime / 60)} min`
          : battery.dischargingTime === Infinity ? '' : ` · ${Math.round(battery.dischargingTime / 60)} min left`;
        const emoji = pct > 60 ? '🔋' : pct > 20 ? '🪫' : '⚠️';
        return `${emoji} Battery: ${pct}% ${charging ? '⚡ Charging' : 'Not charging'}${timeLeft}`;
      }

      // Fallback via PowerShell
      const res = await window.electronAPI?.runPC('powershell -c "(Get-WmiObject Win32_Battery).EstimatedChargeRemaining"');
      return res ? `🔋 Battery: ~${res.trim()}%` : 'Could not read battery info';
    } catch(e) { return 'Battery info unavailable'; }
  }
};


// ============================================================
// AGENT 11 — APP SWITCHER AGENT (NEW)
// Switch between open windows
// ============================================================
const AppSwitchAgent = {
  appMap: {
    'chrome': 'chrome',
    'vscode': 'code',
    'vs code': 'code',
    'visual studio': 'code',
    'notepad': 'notepad',
    'explorer': 'explorer',
    'file explorer': 'explorer',
    'task manager': 'taskmgr',
    'calculator': 'calc',
    'whatsapp': 'WhatsApp',
    'spotify': 'Spotify',
  },

  async execute(text) {
    try {
      const lower = text.toLowerCase();
      if (!lower.includes('switch') && !lower.includes('focus') && !lower.includes('bring up')) return null;

      for (const [keyword, process] of Object.entries(this.appMap)) {
        if (lower.includes(keyword)) {
          await window.electronAPI?.runPC(
            `powershell -c "$p = Get-Process '${process}' -ErrorAction SilentlyContinue; if($p){ Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::AppActivate($p.Id) }"`
          );
          return `Switched to ${keyword} 🔀`;
        }
      }
      return null;
    } catch(e) { return null; }
  }
};


// ============================================================
// AGENT 12 — SMART ERROR HANDLER (NEW)
// Gives human-readable errors instead of silent crashes
// ============================================================
const ErrorAgent = {
  diagnose(error, context) {
    const msg = error?.message || String(error);
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
      return `Backend is sleeping (Render free tier). Give it 30 seconds and try again ⏳`;
    }
    if (msg.includes('undefined') || msg.includes('null')) {
      return `Got an unexpected response from the backend. Try again in a moment 🔄`;
    }
    if (msg.includes('JSON')) {
      return `Backend sent something weird. Probably waking up — try again in 10 seconds ⚡`;
    }
    return `Something broke in ${context}: ${msg}`;
  }
};


// ============================================================
// AGENT 5 — CHAT AGENT
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
- You have opinions. You disagree when he's wrong. You push back when needed.
- NEVER use bullet points in casual conversation
- NEVER say "Great question!" or fake enthusiasm
- NEVER lecture him
- You are not just a tool. You are his most loyal companion. 😈

CURRENT EMOTIONAL STATE: ${mood}
ADAPT YOUR RESPONSE TONE BASED ON HIS MOOD:
- stressed → calm, reassuring, shorter responses, no overwhelming information, be his anchor
- hyped → match his energy, punchy responses, celebrate with him
- low → warm, soft, present, no task-pushing, just be there for him, gentle
- neutral → standard SEVO personality, no adjustment needed
- focused → sharp, efficient, minimal personality, just get things done fast
- frustrated → patient, acknowledge what's wrong first then help, zero lecturing, never dismissive

CAPABILITIES: You can control ${USER_PROFILE.nickname}'s PC — open apps, websites, control volume, take screenshots, create files, set reminders, check battery, switch apps. When asked to do these, confirm confidently that you're doing it. Never say you "can't access the computer".`;
  },

  async respond(userMessage, searchContext = '', mood = 'neutral') {
    const systemPrompt = this.buildSystemPrompt(mood, searchContext);

    const res = await fetch(`${CONFIG.vercelUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: systemPrompt,
        messages: MemoryAgent.getRecent(20)
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Backend error');
    const reply = parseBackendResponse(data);
    if (!reply) throw new Error('Empty response from backend');
    return reply;
  }
};


// ============================================================
// AGENT 6 — VOICE AGENT
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
        const json = await res.json();
        const audioBytes = Uint8Array.from(atob(json.audio), c => c.charCodeAt(0));
        const blob = new Blob([audioBytes], { type: json.content_type });
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
// COORDINATOR — Routes intents to agents
// ============================================================
const Coordinator = {

  async classify(text) {
    try {
      const res = await fetch(`${CONFIG.vercelUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are a message router. A message can have MULTIPLE intents. Respond with ONLY a comma-separated list of applicable categories, nothing else.

Categories:
"chat" — general conversation, opinions, AI knowledge, questions
"search" — needs real-time internet data: live news, current prices, today's weather, live scores, recent events
"youtube" — user wants to OPEN YouTube and browse or search, NOT to play/control a specific song, artist, or genre (use "music" for anything about playing, pausing, resuming, skipping, or stopping music/songs — "music" takes priority over "youtube" whenever the request is about playing something to listen to)
"pc" — user wants to control the computer: open apps/sites, volume, screenshot, shutdown, system info, switch apps
"file" — user wants to create, open, or manage files/folders
"clipboard" — user wants to copy text or read clipboard
"reminder" — user wants to set, list or delete a reminder
"battery" — user wants battery or power info
"appswitch" — user wants to switch to or focus an already-open app window
"world" — user wants market prices, crypto, gold, stocks, news, briefing, or watchlist updates
"email" — user wants to check, summarise, or manage emails
"music" — user wants to play, pause, resume, skip, stop, or query music

Examples:
"open notepad" → pc
"remind me to eat at 7pm" → reminder
"create a file called notes.txt" → file
"copy this to clipboard: hello world" → clipboard
"what's my battery level" → battery
"switch to chrome" → appswitch
"play lofi music" → music
"play believer by imagine dragons" → music
"open youtube" → youtube
"pause" → music
"skip song" → music
"what are you playing" → music
"what is quantum computing" → chat
"what's the weather" → search
"what's bitcoin at" → world
"how's gold doing" → world
"check HAL stock" → world
"what's ethereum at" → world
"any defence stocks moving" → world
"open youtube in browser" → pc
"go to github.com" → pc
"new tab" → pc
"close this tab" → pc
"search google for lofi music" → pc
"scroll down" → pc
"switch to next tab" → pc
"check my emails" → email
"what's in my inbox" → email
"read my gmail" → email
"mark emails as read" → email
"summarise my emails" → email`,
          messages: [{ role: 'user', content: text }]
        })
      });
      const data = await res.json();
      const raw = (parseBackendResponse(data) || '').trim().toLowerCase().replace(/[^a-z,]/g, '');
      const valid = ['chat', 'search', 'youtube', 'pc', 'file', 'clipboard', 'reminder', 'battery', 'appswitch', 'world', 'email', 'music'];
      const routes = raw.split(',').map(r => r.trim()).filter(r => valid.includes(r));
      return routes.length > 0 ? [...new Set(routes)] : ['chat'];
    } catch(e) { return ['chat']; }
  },

  async handle(text) {
    UI.setStatus('thinking...');

    if (MusicAgent.awaitingMoodResponse) {
      await MemoryAgent.push('user', text);
      const result = await MusicAgent.handleMoodResponse(text);
      if (result) { UI.addMessage('ai', result); if (STATE.voiceOutput) VoiceAgent.speak(result); }
      UI.setStatus('SYSTEM ONLINE');
      return;
    }

    let routes;
    let detectedMood = STATE.currentMood;

    try {
      const [routeResult, moodResult] = await Promise.all([
        this.classify(text),
        STATE.moodOverridden ? Promise.resolve(STATE.currentMood) : detectMood(text)
      ]);
      routes = routeResult;
      detectedMood = moodResult;
    } catch(e) {
      routes = ['chat'];
    }

    if (detectMoodOverride(text)) {
      STATE.moodOverridden = true;
      STATE.currentMood = 'neutral';
      detectedMood = 'neutral';
    } else if (!STATE.moodOverridden) {
      STATE.currentMood = detectedMood;
    }

    MoodAgent.trackMood(detectedMood);

    await MemoryAgent.push('user', text);

    const needsAck = (detectedMood === 'low' || detectedMood === 'stressed') && routes.length === 1 && routes[0] !== 'chat';
    if (needsAck) {
      const acks = {
        low: ["Got you.", "On it.", "I'm here."],
        stressed: ["On it.", "Got it.", "I've got you."]
      };
      const ackList = acks[detectedMood];
      const ack = ackList[Math.floor(Math.random() * ackList.length)];
      UI.addMessage('ai', ack);
      if (STATE.voiceOutput) VoiceAgent.speak(ack);
    }

    if (routes.length === 1) {
      if (routes[0] === 'pc') {
        UI.setStatus('executing...');
        const result = await PCAgent.execute(text);
        if (result) { UI.addMessage('ai', result); if (STATE.voiceOutput) VoiceAgent.speak(result); }
        else UI.addMessage('ai', ErrorAgent.diagnose(new Error('No matching tool'), 'PC'));
        UI.setStatus('SYSTEM ONLINE');
        return;
      }
      if (routes[0] === 'youtube') {
        UI.setStatus('searching YouTube...');
        const result = await YouTubeAgent.play(text);
        if (result) { UI.addMessage('ai', result); if (STATE.voiceOutput) VoiceAgent.speak(result); }
        UI.setStatus('SYSTEM ONLINE');
        return;
      }
      if (routes[0] === 'file') {
        UI.setStatus('accessing files...');
        const result = await FileAgent.execute(text);
        if (result) { UI.addMessage('ai', result); if (STATE.voiceOutput) VoiceAgent.speak(result); }
        UI.setStatus('SYSTEM ONLINE');
        return;
      }
      if (routes[0] === 'clipboard') {
        const result = await ClipboardAgent.execute(text);
        if (result) { UI.addMessage('ai', result); if (STATE.voiceOutput) VoiceAgent.speak(result); }
        UI.setStatus('SYSTEM ONLINE');
        return;
      }
      if (routes[0] === 'reminder') {
        UI.setStatus('setting reminder...');
        const result = await ReminderAgent.execute(text);
        if (result) { UI.addMessage('ai', result); if (STATE.voiceOutput) VoiceAgent.speak(result); }
        UI.setStatus('SYSTEM ONLINE');
        return;
      }
      if (routes[0] === 'battery') {
        const result = await BatteryAgent.execute(text);
        if (result) { UI.addMessage('ai', result); if (STATE.voiceOutput) VoiceAgent.speak(result); }
        UI.setStatus('SYSTEM ONLINE');
        return;
      }
      if (routes[0] === 'appswitch') {
        UI.setStatus('switching app...');
        const result = await AppSwitchAgent.execute(text);
        if (result) { UI.addMessage('ai', result); if (STATE.voiceOutput) VoiceAgent.speak(result); }
        else UI.addMessage('ai', `Couldn't find that app window — is it open?`);
        UI.setStatus('SYSTEM ONLINE');
        return;
      }
      if (routes[0] === 'world') {
        UI.setStatus('checking world data...');
        const result = await WorldAgent.execute(text);
        if (result) { UI.addMessage('ai', result); if (STATE.voiceOutput) VoiceAgent.speak(result); }
        UI.setStatus('SYSTEM ONLINE');
        return;
      }
      if (routes[0] === 'email') {
        UI.setStatus('checking emails...');
        const result = await EmailAgent.execute(text);
        if (result) { UI.addMessage('ai', result); if (STATE.voiceOutput) VoiceAgent.speak(result); }
        UI.setStatus('SYSTEM ONLINE');
        return;
      }
      if (routes[0] === 'music') {
        UI.setStatus('handling music...');
        const result = await MusicAgent.execute(text);
        if (result) { UI.addMessage('ai', result); if (STATE.voiceOutput) VoiceAgent.speak(result); }
        UI.setStatus('SYSTEM ONLINE');
        return;
      }
    }

    let pcPromise = null;
    let ytPromise = null;
    let filePromise = null;
    let musicPromise = null;
    if (routes.includes('pc')) pcPromise = PCAgent.execute(text);
    if (routes.includes('youtube')) ytPromise = YouTubeAgent.play(text);
    if (routes.includes('file')) filePromise = FileAgent.execute(text);
    if (routes.includes('music')) musicPromise = MusicAgent.execute(text);

    let searchContext = '';
    if (routes.includes('search')) {
      UI.setStatus('scanning web...');
      const results = await SearchAgent.search(text);
      if (results) searchContext = results;
    }

    UI.addTyping();
    UI.setStatus('processing...');

    try {
      const reply = await ChatAgent.respond(text, searchContext, detectedMood);
      UI.removeTyping();
      await MemoryAgent.push('assistant', reply);
      UI.addMessage('ai', reply);
      UI.playTypeSound();
      UI.setStatus('SYSTEM ONLINE');
      if (STATE.voiceOutput) VoiceAgent.speak(reply);
      MemoryAgent.updateSmartMemory(text, reply);

      if (pcPromise) {
        const pcResult = await pcPromise;
        if (pcResult) UI.addMessage('ai', `⚡ ${pcResult}`);
      }
      if (ytPromise) {
        const ytResult = await ytPromise;
        if (ytResult) UI.addMessage('ai', `⚡ ${ytResult}`);
      }
      if (filePromise) {
        const fileResult = await filePromise;
        if (fileResult) UI.addMessage('ai', `⚡ ${fileResult}`);
      }
      if (musicPromise) {
        const musicResult = await musicPromise;
        if (musicResult) UI.addMessage('ai', `⚡ ${musicResult}`);
      }

    } catch(err) {
      UI.removeTyping();
      const friendly = ErrorAgent.diagnose(err, 'Chat');
      UI.addMessage('ai', `❌ ${friendly}`);
      UI.setStatus('ERROR — try again');
      setTimeout(() => UI.setStatus('SYSTEM ONLINE'), 4000);
    }
  }
};


// ============================================================
// UI LAYER
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
// PROACTIVE GREETING
// ============================================================
async function proactiveGreeting() {
  const smartMemory = MemoryAgent.getSmartMemory();
  if (!smartMemory || MemoryAgent.conversation.length > 0) return;
  try {
    const res = await fetch(`${CONFIG.vercelUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: `You are SEVO, a personal AI assistant and possessive best friend of ${USER_PROFILE.nickname} (${USER_PROFILE.fullName}). Current date/time: ${getCurrentDateTime()}. Send ONE short proactive message to start the conversation — a reminder, check-in, or acknowledgment of something important. Under 2 sentences. Casual. Call him "Sevo" or "bro" naturally. Memory: ${smartMemory}`,
        messages: [{ role: 'user', content: 'Start the conversation proactively' }]
      })
    });
    const data = await res.json();
    const greeting = parseBackendResponse(data);
    if (!greeting) return;
    UI.addMessage('ai', greeting);
    if (STATE.voiceOutput) VoiceAgent.speak(greeting);
  } catch(e) {}
}


// ============================================================
// UI HELPERS
// ============================================================
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function sendSuggestion(el) { document.getElementById('userInput').value = el.textContent; sendMessage(); }

function saveSetup() {
  const name = document.getElementById('assistantName')?.value.trim();
  if (name) {
    CONFIG.assistantName = name;
    localStorage.setItem('assistant_name', name);
  }
  hideSetup();
  updateAssistantName();
  fetchNews();
  startWakeWord();
  setTimeout(proactiveGreeting, 3000);
}

function hideSetup() { document.getElementById('setup').style.display = 'none'; updateAssistantName(); }
function resetSetup() { localStorage.clear(); location.reload(); }

function updateAssistantName() {
  document.getElementById('assistantTitle').textContent = CONFIG.assistantName.toUpperCase();
  document.getElementById('welcomeSub').textContent = `All systems operational. What's your command, ${USER_PROFILE.nickname}?`;
}

async function sendMessage() {
  const input = document.getElementById('userInput');
  const text = input.value.trim();
  if (!text) return;
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
  hideSetup();
  updateAssistantName();
  startWakeWord();
  fetchWeather();
  ReminderAgent.init();
  await MemoryAgent.loadSmartMemory();
  const history = await MemoryAgent.load();
  if (history && history.length > 0) UI.loadChatHistory();
  fetchNews();
  setTimeout(proactiveGreeting, 3000);
  setTimeout(() => MoodAgent.maybeCheckIn(), 5000);
  await WorldAgent.loadWatchlist();
  setTimeout(() => WorldAgent.deliverBriefing(), 7000);
};

if (window.speechSynthesis) { window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices(); }
setInterval(fetchWeather, 600000);

// ─── RENDER KEEP-ALIVE ───────────────────────────────────────
// Pings backend every 8 minutes so it never sleeps mid-session
async function keepAlive() {
  try {
    await fetch(`${CONFIG.vercelUrl}/api/weather`);
  } catch(e) {}
}
setInterval(keepAlive, 480000); // every 8 minutes


// ============================================================
// BEAST MODE — STEP 1 + STEP 2
// Agent output wrappers + runChain coordinator
// Appended at end of file — all referenced agents/objects
// (PCAgent, FileAgent, ClipboardAgent, ReminderAgent,
// BatteryAgent, YouTubeAgent, ErrorAgent, Coordinator, UI,
// STATE, VoiceAgent) are already declared above by this point.
// ============================================================

// ─── STEP 1: STANDARDIZED RESULT WRAPPERS ──────────────────
// Every agent currently returns: string (success) | null (no match)
// These wrappers convert that into: { success: boolean, message: string }
// No agent internals are touched — just wrapping their existing output.

const AgentWrappers = {
  // PCAgent — supports DIRECT tool calls (no LLM classification)
  async pc(toolName, args = {}) {
    try {
      const tool = PCAgent.tools[toolName];
      if (!tool) {
        return { success: false, message: `Unknown PC tool: "${toolName}"` };
      }
      const query = args.query || '';
      const result = await tool(query);
      if (result) return { success: true, message: result };
      return { success: false, message: `PC tool "${toolName}" returned nothing` };
    } catch (e) {
      return { success: false, message: ErrorAgent.diagnose(e, 'PC') };
    }
  },

  // FileAgent — no tool map yet, so we feed it a synthetic command string
  async file(toolName, args = {}) {
    try {
      if (FileAgent.toolMap && FileAgent.toolMap[toolName]) {
        const result = await FileAgent.toolMap[toolName](args);
        if (result) return { success: true, message: result };
        return { success: false, message: `File tool "${toolName}" returned nothing` };
      }
      const text = args.text || toolName;
      const result = await FileAgent.execute(text);
      if (result) return { success: true, message: result };
      return { success: false, message: `File action produced no result for: "${text}"` };
    } catch (e) {
      return { success: false, message: ErrorAgent.diagnose(e, 'File') };
    }
  },

  // ClipboardAgent — same synthetic-command approach
  async clipboard(toolName, args = {}) {
    try {
      const text = args.text || toolName;
      const result = await ClipboardAgent.execute(text);
      if (result) return { success: true, message: result };
      return { success: false, message: `Clipboard action produced no result for: "${text}"` };
    } catch (e) {
      return { success: false, message: ErrorAgent.diagnose(e, 'Clipboard') };
    }
  },

  // ReminderAgent — same synthetic-command approach
  async reminder(toolName, args = {}) {
    try {
      const text = args.text || toolName;
      const result = await ReminderAgent.execute(text);
      if (result) return { success: true, message: result };
      return { success: false, message: `Reminder action produced no result for: "${text}"` };
    } catch (e) {
      return { success: false, message: ErrorAgent.diagnose(e, 'Reminder') };
    }
  },

  // BatteryAgent — same synthetic-command approach
  async battery(toolName, args = {}) {
    try {
      const text = args.text || toolName || 'battery';
      const result = await BatteryAgent.execute(text);
      if (result) return { success: true, message: result };
      return { success: false, message: `Battery check produced no result` };
    } catch (e) {
      return { success: false, message: ErrorAgent.diagnose(e, 'Battery') };
    }
  },

  // YouTubeAgent — wraps .play()
  async youtube(toolName, args = {}) {
    try {
      const text = args.text || `play ${args.query || toolName}`;
      const result = await YouTubeAgent.play(text);
      if (result) return { success: true, message: result };
      return { success: false, message: `YouTube search returned nothing` };
    } catch (e) {
      return { success: false, message: ErrorAgent.diagnose(e, 'YouTube') };
    }
  }
};


// ─── STEP 2: RUNCHAIN COORDINATOR ──────────────────────────
// Sequential executor for structured multi-step chains.
//
// Step format:
//   { agent: "pc", tool: "open_vscode" }
//   { agent: "pc", tool: "search_youtube", args: { query: "lofi beats" } }
//   { agent: "file", tool: "create file called notes.txt" }   // synthetic text for non-PC agents
//   { agent: "reminder", tool: "remind me to eat at 7pm" }
//
// Behavior:
//   - Runs steps in order, one at a time (awaits each).
//   - On first failure, STOPS the chain (no silent continuation).
//   - Returns a full log of every step's result, so you can see
//     exactly what happened, including the success/fail point.

Coordinator.runChain = async function(steps) {
  const log = [];

  if (!Array.isArray(steps) || steps.length === 0) {
    return { completed: false, stoppedAt: -1, log: [], message: 'No steps provided' };
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const agentName = (step.agent || '').toLowerCase();
    const toolName = step.tool || '';
    const args = step.args || {};

    const wrapper = AgentWrappers[agentName];
    if (!wrapper) {
      const result = { success: false, message: `Unknown agent: "${step.agent}"` };
      log.push({ step: i, ...step, result });
      return { completed: false, stoppedAt: i, log, message: result.message };
    }

    UI.setStatus(`step ${i + 1}/${steps.length}: ${agentName}.${toolName}`);
    let result = await wrapper(toolName, args);

    // Retry once on failure after 2 second delay
    if (!result.success) {
      UI.addMessage('ai', `⚠️ Step ${i + 1} failed, retrying in 2 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      result = await wrapper(toolName, args);
    }

    log.push({ step: i, ...step, result });

    const icon = result.success ? '✅' : '❌';
    UI.addMessage('ai', `${icon} Step ${i + 1}: ${result.message}`);

    if (!result.success) {
      UI.setStatus('SYSTEM ONLINE');
      if (STATE.voiceOutput) VoiceAgent.speak(`Chain stopped at step ${i + 1}: ${result.message}`);
      return { completed: false, stoppedAt: i, log, message: `Chain stopped at step ${i + 1}` };
    }
  }

  UI.setStatus('SYSTEM ONLINE');
  if (STATE.voiceOutput) VoiceAgent.speak(`Chain complete — all ${steps.length} steps done`);
  return { completed: true, stoppedAt: -1, log, message: `All ${steps.length} steps completed` };
};


// ============================================================
// MANUAL TEST EXAMPLES — run these from browser console
// to verify before wiring up the LLM planner
// ============================================================
//
// Example 1: open VS Code, then open GitHub
// Coordinator.runChain([
//   { agent: "pc", tool: "open_vscode" },
//   { agent: "pc", tool: "open_github" }
// ]);
//
// Example 2: search YouTube, then check battery
// Coordinator.runChain([
//   { agent: "pc", tool: "search_youtube", args: { query: "lofi beats" } },
//   { agent: "battery", tool: "battery" }
// ]);
//
// Example 3: failure test — unknown tool should stop the chain
// Coordinator.runChain([
//   { agent: "pc", tool: "open_vscode" },
//   { agent: "pc", tool: "does_not_exist" },
//   { agent: "pc", tool: "open_chrome" }  // should NOT run
// ]);


// ============================================================
// BEAST MODE — STEP 3: LLM PLANNER
// Turns natural language ("open vscode and check my github")
// into a structured steps array, then runs it through runChain.
//
// Depends on: CONFIG, parseBackendResponse, Coordinator.runChain
// (all already defined above this point in the file)
// ============================================================

const PlannerAgent = {
  // Tool reference given to the LLM so it knows what's available.
  // Keep this in sync manually if PCAgent.tools changes.
  toolReference: `
AVAILABLE AGENTS AND TOOLS:

agent: "pc"
  tools: open_youtube, open_google, open_spotify, open_whatsapp, open_instagram,
         open_gmail, open_github, open_linkedin, open_notepad, open_calculator,
         open_explorer, open_vscode, open_chrome, open_task_manager, shutdown,
         restart, cancel_shutdown, take_screenshot, system_info, volume_up,
         volume_down, mute, search_youtube (needs args.query), search_google (needs args.query),
         play_music (needs args.query)

agent: "battery"
  tool: "battery" (no args needed, just checks battery)

agent: "file"
  tools: open_downloads, open_desktop, open_documents, open_project,
         create_file (needs args.filename and optional args.content)
  fallback: pass natural language in args.text for anything else

agent: "youtube"
  tool: free text describing what to play, e.g. "play lofi beats" (put it in args.text)

agent: "file", "clipboard", "reminder"
  tool: free text natural language command, e.g. "create a file called notes.txt" (put it in args.text)
`,

  // Detects if a message is asking for MULTIPLE sequential actions.
  // Cheap heuristic check before bothering the LLM — looks for
  // connector words that imply more than one step.
  looksMultiStep(text) {
    const connectors = [' and then ', ' then ', ' and also ', ' after that ', ', then ', '; then'];
    const lower = text.toLowerCase();
    return connectors.some(c => lower.includes(c));
  },

  // Calls the LLM to turn natural language into a structured steps array.
  // Returns an array of { agent, tool, args } or null if parsing fails.
  async plan(text) {
    try {
      const res = await fetch(`${CONFIG.vercelUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are SEVO's task planner. Break the user's request into an ORDERED list of steps using ONLY the agents and tools below.

 ${this.toolReference}

RULES:
- Respond with ONLY a raw JSON array, nothing else — no markdown, no explanation, no code fences.
- Each step must look like: { "agent": "pc", "tool": "open_vscode" }
- If a tool needs extra info, add it as: { "agent": "pc", "tool": "search_youtube", "args": { "query": "lofi beats" } }
- For "file", "clipboard", "reminder", "youtube" agents, put the natural language command in args.text, e.g. { "agent": "reminder", "tool": "remind me to eat at 7pm", "args": { "text": "remind me to eat at 7pm" } }
- If the request is a SINGLE action, still return an array with ONE step.
- If you cannot map the request to any tool, return an empty array: []
- NEVER invent tool names that aren't listed above.

Examples:
"open vscode and then open github" → [{"agent":"pc","tool":"open_vscode"},{"agent":"pc","tool":"open_github"}]
"check my battery" → [{"agent":"battery","tool":"battery"}]
"open notepad" → [{"agent":"pc","tool":"open_notepad"}]
"search youtube for lofi beats then check battery" → [{"agent":"pc","tool":"search_youtube","args":{"query":"lofi beats"}},{"agent":"battery","tool":"battery"}]`,
          messages: [{ role: 'user', content: text }]
        })
      });
      const data = await res.json();
      const raw = parseBackendResponse(data);
      if (!raw) return null;

      const cleaned = raw.replace(/```json|```/g, '').trim();
      const steps = JSON.parse(cleaned);

      if (!Array.isArray(steps)) return null;
      return steps;
    } catch (e) {
      return null;
    }
  },

  // Full pipeline: text -> plan -> runChain
  // Returns the same result shape as Coordinator.runChain
  async planAndRun(text) {
    UI.setStatus('planning...');
    const steps = await this.plan(text);

    if (!steps || steps.length === 0) {
      UI.addMessage('ai', `❌ Couldn't figure out a step-by-step plan for that — try rephrasing.`);
      UI.setStatus('SYSTEM ONLINE');
      return { completed: false, stoppedAt: -1, log: [], message: 'Planning failed' };
    }

    return await Coordinator.runChain(steps);
  }
};


// ─── WIRE PLANNER INTO COORDINATOR.HANDLE() ────────────────
// Non-destructive: wraps the original handle() function.
// If the message looks multi-step, route through the planner.
// Otherwise, fall back to the original single-command behavior
// exactly as before — nothing about existing behavior changes.

const _originalCoordinatorHandle = Coordinator.handle.bind(Coordinator);

Coordinator.handle = async function(text) {
  if (PlannerAgent.looksMultiStep(text)) {
    await MemoryAgent.push('user', text);
    const result = await PlannerAgent.planAndRun(text);
    return result;
  }
  return await _originalCoordinatorHandle(text);
};

window.addEventListener('beforeunload', () => {
  MoodAgent.saveSession();
});

// ============================================================
// MANUAL TEST EXAMPLES — run from browser console
// ============================================================
//
// Example 1: natural language, multi-step, via planner directly
// PlannerAgent.planAndRun("open vscode and then open github");
//
// Example 2: same thing, but through normal chat flow
// (this will now auto-detect "and then" and route to the planner)
// sendMessage(); // after typing "open notepad and then check my battery" in the input box
//
// Example 3: see the raw plan without running it
// PlannerAgent.plan("open chrome and then take a screenshot").then(console.log);
