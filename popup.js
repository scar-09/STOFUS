document.addEventListener('DOMContentLoaded', () => {
  /* ── DOM refs ─────────────────────────────────────────────────────── */
  const urlInput        = document.getElementById('url');
  const timerInput      = document.getElementById('timer');
  const durationUnit    = document.getElementById('durationUnit');
  const blockBtn        = document.getElementById('blockBtn');
  const undoBtn         = document.getElementById('undoBtn');
  const urlError        = document.getElementById('urlError');
  const timerError      = document.getElementById('timerError');

  const keywordInput    = document.getElementById('keyword');
  const addKeywordBtn   = document.getElementById('addKeywordBtn');
  const keywordError    = document.getElementById('keywordError');

  const statusEl        = document.getElementById('status');

  const blockedListEl   = document.getElementById('blockedList');
  const keywordListEl   = document.getElementById('keywordList');
  const cardSites       = document.getElementById('cardSites');
  const cardKeywords    = document.getElementById('cardKeywords');
  const listSitesContainer    = document.getElementById('listSitesContainer');
  const listKeywordsContainer = document.getElementById('listKeywordsContainer');
  const countSites      = document.getElementById('countSites');
  const countKeywords   = document.getElementById('countKeywords');
  
  const statAttemptsBlocked = document.getElementById('statAttemptsBlocked');

  /* ── Undo state ───────────────────────────────────────────────────── */
  let undoSnapshot = null;   // { sites, undoneUrl }
  let undoTimer    = null;

  /* ── Accordion: single-open ───────────────────────────────────────── */
  const accordions = document.querySelectorAll('.accordion input[type="checkbox"]');
  accordions.forEach(acc => {
    acc.addEventListener('change', function () {
      if (this.checked) {
        accordions.forEach(other => { if (other !== this) other.checked = false; });
      }
    });
  });

  /* ── Dashboard card toggles (stats clickable → open lists) ─────── */
  function toggleList(showContainer, hideContainer, showCard, hideCard) {
    const isOpen = showContainer.classList.contains('open');
    showContainer.classList.toggle('open', !isOpen);
    showCard.classList.toggle('active', !isOpen);
    hideContainer.classList.remove('open');
    hideCard.classList.remove('active');
  }

  cardSites.addEventListener('click', () =>
    toggleList(listSitesContainer, listKeywordsContainer, cardSites, cardKeywords));
  cardKeywords.addEventListener('click', () =>
    toggleList(listKeywordsContainer, listSitesContainer, cardKeywords, cardSites));

  /* ── Pre-fill URL from active tab ─────────────────────────────────── */
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      try {
        const u = new URL(tabs[0].url);
        if (u.protocol.startsWith('http')) {
          urlInput.value = u.hostname.replace(/^www\./, '');
        }
      } catch (_) {}
    }
  });

  /* ── Restore persisted keyword input state ────────────────────────── */
  chrome.storage.local.get({ _pendingKeyword: '' }, (d) => {
    if (d._pendingKeyword) keywordInput.value = d._pendingKeyword;
  });

  keywordInput.addEventListener('input', () => {
    chrome.storage.local.set({ _pendingKeyword: keywordInput.value });
  });

  /* ── Keyboard shortcuts ───────────────────────────────────────────── */
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); timerInput.focus(); }
  });

  timerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); blockBtn.click(); }
  });

  keywordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addKeywordBtn.click(); }
  });

  /* ── Inline validation helpers ────────────────────────────────────── */
  function setError(input, hintEl, msg) {
    hintEl.textContent = msg;
    input.classList.toggle('error', !!msg);
  }

  function clearError(input, errorEl) {
    input.classList.remove('error');
    errorEl.textContent = '';
  }

  function clearErrors() {
    clearError(urlInput, urlError);
    clearError(timerInput, timerError);
    clearError(keywordInput, keywordError);
  }

  /* ── Normalise URL ────────────────────────────────────────────────── */
  function normaliseUrl(raw) {
    let u = raw.trim();
    if (!u) return null;
    if (!u.startsWith('http')) u = 'https://' + u;
    try {
      let host = new URL(u).hostname;
      if (host.startsWith('www.')) host = host.slice(4);
      return host;
    } catch (_) {
      // Fallback: strip common prefixes
      return raw.trim().replace(/^(https?:\/\/)?(www\.)?/, '');
    }
  }

  /* ── Duration validation ───────────────────────────────────────────── */
  const unitDefaults = {
    minutes: 30,
    hours: 1,
    days: 1
  };

  const unitLimits = {
    minutes: { min: 1, max: 180 },
    hours: { min: 1, max: 72 },
    days: { min: 1, max: 30 }
  };

  function validateDurationInput(value, unit) {
    // Handle empty input
    if (value === '' || value === '0') {
      return { valid: true, value: '' };
    }
    
    // Strip leading zeros but keep single zero if that's all there is
    value = value.replace(/^0+/, '') || '0';
    
    // Only allow positive integers - reject any non-numeric input
    if (!/^\d+$/.test(value)) {
      return { valid: false, value: '' };
    }
    
    const numValue = parseInt(value, 10);
    const limits = unitLimits[unit];
    
    // Clamp to allowed range
    if (numValue < limits.min) {
      return { valid: true, value: limits.min.toString() };
    }
    if (numValue > limits.max) {
      return { valid: true, value: limits.max.toString() };
    }
    
    return { valid: true, value: value };
  }

  function validateAndClampDuration(value, unit) {
    const numValue = parseInt(value, 10);
    const limits = unitLimits[unit];
    
    if (isNaN(numValue) || numValue < 1) {
      return { valid: false, value: limits.min.toString() };
    }
    
    // Clamp within allowed range
    if (numValue < limits.min) {
      return { valid: true, value: limits.min.toString() };
    }
    if (numValue > limits.max) {
      return { valid: true, value: limits.max.toString() };
    }
    
    return { valid: true, value: value };
  }

  function convertToMinutes(value, unit) {
    const multipliers = {
      minutes: 1,
      hours: 60,
      days: 24 * 60
    };
    return value * multipliers[unit];
  }

  // Timer input validation
  timerInput.addEventListener('input', (e) => {
    const unit = durationUnit.value;
    const result = validateDurationInput(e.target.value, unit);
    
    // Update the value if validation changed it (clamping or clearing invalid input)
    if (e.target.value !== result.value) {
      e.target.value = result.value;
    }
    
    if (!result.valid) {
      setError(timerInput, timerError, 'Enter a positive number.');
    } else {
      // Check if value was clamped to show appropriate message
      const numValue = parseInt(result.value, 10);
      const limits = unitLimits[unit];
      if (numValue === limits.max && e.target.value !== result.value) {
        setError(timerInput, timerError, `Maximum ${limits.max} ${unit}.`);
      } else {
        clearError(timerInput, timerError);
      }
    }
  });

  // Unit change handler
  durationUnit.addEventListener('change', (e) => {
    const newUnit = e.target.value;
    timerInput.value = unitDefaults[newUnit].toString();
    clearError(timerInput, timerError);
  });

  // Prevent non-numeric input
  timerInput.addEventListener('keypress', (e) => {
    if (!/[0-9]/.test(e.key) && !['Backspace', 'Delete', 'Tab', 'Enter'].includes(e.key)) {
      e.preventDefault();
    }
  });

  timerInput.addEventListener('paste', (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text');
    const numeric = paste.replace(/[^0-9]/g, '');
    document.execCommand('insertText', false, numeric);
  });

  /* ── Block site ───────────────────────────────────────────────────── */
  blockBtn.addEventListener('click', () => {
    clearErrors();
    const rawUrl    = urlInput.value.trim();
    const unit      = durationUnit.value;
    const timerVal  = parseInt(timerInput.value, 10);
    const minutes   = convertToMinutes(timerVal, unit);
    let valid = true;

    if (!rawUrl) {
      setError(urlInput, urlError, 'Enter a URL to block.');
      valid = false;
    }

    if (isNaN(timerVal) || timerVal < 1 || timerInput.value === '') {
      setError(timerInput, timerError, 'Enter a valid duration.');
      valid = false;
    }

    // Check limits and clamp if needed
    const limits = unitLimits[unit];
    if (timerVal > limits.max) {
      setError(timerInput, timerError, `Maximum ${limits.max} ${unit}.`);
      // Clamp the value to the maximum
      timerInput.value = limits.max.toString();
      valid = false;
    }

    if (!valid) return;

    const url = normaliseUrl(rawUrl);
    if (!url || !url.includes('.')) {
      setError(urlInput, urlError, 'Invalid URL — e.g. twitter.com');
      return;
    }

    const expiry = Date.now() + (minutes * 60 * 1000);

    chrome.storage.local.get({ blockedSites: [] }, (data) => {
      const sites = data.blockedSites || [];
      const isDuplicate = sites.some(s => s.url === url);

      // Save undo snapshot before mutation
      undoSnapshot = { sites: JSON.parse(JSON.stringify(sites)), undoneUrl: url };

      const idx = sites.findIndex(s => s.url === url);
      if (idx > -1) {
        sites[idx].expiryTimestamp = expiry;
        sites[idx].durationMs = minutes * 60 * 1000;
        sites[idx].originalUnit = unit;
        sites[idx].intendedDurationMinutes = minutes;
      } else {
        sites.push({ 
           url, 
           expiryTimestamp: expiry, 
           durationMs: minutes * 60 * 1000,
           originalUnit: unit,
           intendedDurationMinutes: minutes
        });
      }

      // Track attempt (for manual blocking setup)
      const todayStr = new Date().toISOString().split('T')[0];
      const history = data.stats_history || {};
      if (!history[todayStr]) history[todayStr] = { focusTime: 0, attempts: 0 };
      history[todayStr].attempts += 1;

      // Create/update focus session when blocking sites
      const longestDuration = Math.max(...sites.map(s => s.durationMs || 0));
      const focusSession = {
          startTime: Date.now(),
          duration: Math.round(longestDuration / 60000)
      };

      chrome.storage.local.set({ 
          blockedSites: sites, 
          stats_history: history,
          stats_attempts: (data.stats_attempts || 0) + 1,
          focusSession: focusSession
      }, () => {
        urlInput.value = '';
        updateCountdowns();

        const msg = isDuplicate
          ? `Updated ${url} → +${timerVal}m`
          : `Blocking ${url} for ${timerVal}m`;
        showStatus(msg, '#22d3ee');
        showUndo();

        // Redirect any open tabs matching this URL immediately
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            try {
              if (!tab.url) return;
              const h = new URL(tab.url).hostname.replace(/^www\./, '');
              if (h === url || h.endsWith('.' + url)) {
                chrome.tabs.update(tab.id, {
                  url: chrome.runtime.getURL(`blocked.html?site=${url}`)
                });
              }
            } catch (_) {}
          });
        });
      });
    });
  });

  /* ── Undo ─────────────────────────────────────────────────────────── */
  let undoInterval = null;
  function showUndo() {
    undoBtn.classList.remove('hidden');
    let timeLeft = 5;
    undoBtn.textContent = `↩ Undo (${timeLeft}s)`;
    
    clearInterval(undoInterval);
    undoInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) {
        undoBtn.classList.add('hidden');
        undoSnapshot = null;
        clearInterval(undoInterval);
      } else {
        undoBtn.textContent = `↩ Undo (${timeLeft}s)`;
      }
    }, 1000);
  }

  undoBtn.addEventListener('click', () => {
    if (!undoSnapshot) return;
    chrome.storage.local.get({ stats_attempts: 0, stats_history: {} }, (data) => {
        // Decrement attempt if undone
        const todayStr = new Date().toISOString().split('T')[0];
        const history = data.stats_history;
        if (history[todayStr] && history[todayStr].attempts > 0) {
            history[todayStr].attempts -= 1;
        }

        chrome.storage.local.set({ 
            blockedSites: undoSnapshot.sites,
            stats_history: history,
            stats_attempts: Math.max(0, data.stats_attempts - 1)
        }, () => {
          showStatus(`Unblocked ${undoSnapshot.undoneUrl}`, '#fbbf24');
          undoSnapshot = null;
          undoBtn.classList.add('hidden');
          clearInterval(undoInterval);
          updateCountdowns();
          
          // Reload the current tab to apply the unblock
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
              chrome.tabs.reload(tabs[0].id);
            }
          });
        });
    });
  });

  /* ── Add keyword ──────────────────────────────────────────────────── */
  addKeywordBtn.addEventListener('click', () => {
    setError(keywordInput, keywordError, '');
    const kw = keywordInput.value.trim().toLowerCase();

    if (!kw) {
      setError(keywordInput, keywordError, 'Enter a keyword.');
      return;
    }

    chrome.storage.local.get({ strictKeywords: [] }, (data) => {
      const kws = data.strictKeywords || [];
      if (kws.includes(kw)) {
        setError(keywordInput, keywordError, 'Already exists.');
        return;
      }
      kws.push(kw);
      chrome.storage.local.set({ strictKeywords: kws, _pendingKeyword: '' }, () => {
        keywordInput.value = '';
        showStatus(`Keyword "${kw}" added`, '#22d3ee');
        updateCountdowns();
      });
    });
  });

  /* ── Remove site (via friction screen) ─────────────────────────── */
  window.removeSite = function (urlToRemove) {
    // Get the current active tab to reload it later
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      const frictionUrl = chrome.runtime.getURL(
        `friction.html?site=${encodeURIComponent(urlToRemove)}&reloadTabId=${currentTab.id}`
      );
      chrome.tabs.create({ url: frictionUrl });
    });
  };

  /* ── Remove keyword inline ────────────────────────────────────────── */
  window.removeKeyword = function (kwToRemove) {
    chrome.storage.local.get({ strictKeywords: [] }, (data) => {
      const kws = (data.strictKeywords || []).filter(k => k !== kwToRemove);
      chrome.storage.local.set({ strictKeywords: kws }, () => {
        updateCountdowns();
      });
    });
  };

  /* ── Helper functions for new metrics ───────────────────────────────── */
  function formatTime(minutes) {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Never';
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  
  /* ── Status message ───────────────────────────────────────────────── */
  let statusClear;
  function showStatus(msg, color) {
    statusEl.textContent = msg;
    statusEl.style.color = color;
    clearTimeout(statusClear);
    statusClear = setTimeout(() => { statusEl.textContent = ''; }, 3500);
  }

  
  /* ── Main update ──────────────────────────────────────────────────── */
  function updateCountdowns() {
    chrome.storage.local.get({ 
        blockedSites: [], strictKeywords: [],
        stats_history: {}, streak_count: 0,
        stats: { attemptsBlocked: 0, lastBreakTime: null, emergencyUsedToday: 0, dailyFocusCompleted: {} },
        focusSession: null
    }, (data) => {
      const now = Date.now();
      const activeSites = (data.blockedSites || []).filter(s => now < s.expiryTimestamp);
      const expiredExists = (data.blockedSites || []).length > activeSites.length;

      if (expiredExists) chrome.storage.local.set({ blockedSites: activeSites });

      const keywords = data.strictKeywords || [];
      const todayStr = new Date().toISOString().split('T')[0];
      const todayStats = data.stats_history[todayStr] || { focusTime: 0, attempts: 0 };
      const stats = data.stats || {};

      if(countSites) countSites.textContent    = activeSites.length;
      if(countKeywords) countKeywords.textContent = keywords.length;
      
      // Update metrics
      if(statAttemptsBlocked) statAttemptsBlocked.textContent = stats.attemptsBlocked || 0;

      /* ── Blocked sites list ── */
      blockedListEl.innerHTML = '';
      if (activeSites.length === 0) {
        const li = document.createElement('li');
        li.innerHTML = '<span class="url-text" style="color:#475569">No active blocks</span>';
        blockedListEl.appendChild(li);
      } else {
        activeSites.forEach(site => {
          const rem = site.expiryTimestamp - now;
          const totalSec = Math.floor(Math.max(0, rem) / 1000);
          const m = Math.floor(totalSec / 60);
          const s = totalSec % 60;
          const displayTime = `${m}:${String(s).padStart(2, '0')}`;

          const li = document.createElement('li');

          const left = document.createElement('div');
          left.className = 'item-left';

          const urlSpan = document.createElement('span');
          urlSpan.className = 'url-text';
          urlSpan.textContent = site.url;

          const timerSpan = document.createElement('span');
          timerSpan.className = 'timer-text';
          timerSpan.textContent = `${displayTime} remaining`;

          left.appendChild(urlSpan);
          left.appendChild(timerSpan);

          const cancelBtn = document.createElement('button');
          cancelBtn.className = 'action-btn';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.onclick = () => window.removeSite(site.url);

          li.appendChild(left);
          li.appendChild(cancelBtn);
          blockedListEl.appendChild(li);
        });
      }

      /* ── Keywords list ── */
      keywordListEl.innerHTML = '';
      if (keywords.length === 0) {
        const li = document.createElement('li');
        li.innerHTML = '<span class="url-text" style="color:#475569">No keywords</span>';
        keywordListEl.appendChild(li);
      } else {
        keywords.forEach(kw => {
          const li = document.createElement('li');

          const kwSpan = document.createElement('span');
          kwSpan.className = 'url-text';
          kwSpan.textContent = kw;

          const trashBtn = document.createElement('button');
          trashBtn.className = 'icon-btn';
          trashBtn.textContent = '🗑️';
          trashBtn.title = `Remove "${kw}"`;
          trashBtn.onclick = () => window.removeKeyword(kw);

          li.appendChild(kwSpan);
          li.appendChild(trashBtn);
          keywordListEl.appendChild(li);
        });
      }
    });
  }

  // Boot
  updateCountdowns();
  setInterval(updateCountdowns, 1000);
});
