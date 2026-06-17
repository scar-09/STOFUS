document.addEventListener('DOMContentLoaded', () => {
  /* ── DOM refs ─────────────────────────────────────────────────────── */
  const urlInput        = document.getElementById('url');
  const timerInput      = document.getElementById('timer');
  const durationUnit    = document.getElementById('durationUnit');
  const blockBtn        = document.getElementById('blockBtn');
  const undoBtn         = document.getElementById('undoBtn');
  const urlError        = document.getElementById('urlError');
  const timerError      = document.getElementById('timerError');

  const modeRadios      = document.querySelectorAll('input[name="blockMode"]');
  const scheduleGroup   = document.getElementById('scheduleGroup');
  const timerGroup      = document.getElementById('timerGroup');
  const startTimeInput  = document.getElementById('startTime');
  const endTimeInput    = document.getElementById('endTime');
  const startHourSelect = document.getElementById('startHour');
  const startMinuteSelect = document.getElementById('startMinute');
  const endHourSelect   = document.getElementById('endHour');
  const endMinuteSelect = document.getElementById('endMinute');
  const startMeridiemBtn = document.getElementById('startMeridiem');
  const endMeridiemBtn   = document.getElementById('endMeridiem');
  const scheduleError   = document.getElementById('scheduleError');
  const timeFormatToggle = document.getElementById('timeFormatToggle');

  let use12HourFormat = false;

  if (timeFormatToggle) {
    timeFormatToggle.addEventListener('click', () => {
      use12HourFormat = !use12HourFormat;
      timeFormatToggle.textContent = use12HourFormat ? '12' : '24';
      chrome.storage.local.set({ use12HourFormat });
      
      rebuildTimePickers();
      updateCountdowns();
    });
  }

  function rebuildTimePickers() {
    const is12h = use12HourFormat;

    // Update hour display and meridiem for each picker
    [
      { input: startHourSelect, hiddenInput: startTimeInput, meridiemBtn: startMeridiemBtn },
      { input: endHourSelect, hiddenInput: endTimeInput, meridiemBtn: endMeridiemBtn }
    ].forEach(({ input, hiddenInput, meridiemBtn }) => {
      const [h24] = hiddenInput.value.split(':').map(Number);

      if (is12h) {
        const h12 = h24 % 12 || 12;
        input.value = String(h12).padStart(2, '0');
        if (meridiemBtn) meridiemBtn.textContent = h24 >= 12 ? 'PM' : 'AM';
      } else {
        input.value = String(h24).padStart(2, '0');
      }
    });

    // Show/hide meridiem buttons
    if (startMeridiemBtn && endMeridiemBtn) {
      startMeridiemBtn.style.display = is12h ? 'inline-flex' : 'none';
      endMeridiemBtn.style.display = is12h ? 'inline-flex' : 'none';
    }

    syncHiddenTimeInputs();
  }

  function onTimeInput(e) {
    const input = e.target;
    let val = input.value.replace(/\D/g, '');
    if (val.length > 2) val = val.slice(0, 2);
    input.value = val;
  }

  function onTimeBlur(e) {
    const input = e.target;
    const isHour = input.classList.contains('time-hour');
    const is12h = use12HourFormat;

    if (input.value === '') {
      input.value = isHour ? (is12h ? '12' : '00') : '00';
      syncHiddenTimeInputs();
      return;
    }

    let num = parseInt(input.value, 10);

    if (isHour) {
      const max = is12h ? 12 : 23;
      const min = is12h ? 1 : 0;
      if (num > max) num = max;
      if (num < min) num = min;
    } else {
      if (num > 59) num = 59;
    }

    input.value = String(num).padStart(2, '0');
    syncHiddenTimeInputs();
  }

  function syncHiddenTimeInputs() {
    const is12h = use12HourFormat;

    // Start time
    let startH = parseInt(startHourSelect.value, 10);
    const startM = parseInt(startMinuteSelect.value, 10);
    if (is12h) {
      const meridiem = startMeridiemBtn.textContent;
      if (meridiem === 'PM' && startH !== 12) startH += 12;
      if (meridiem === 'AM' && startH === 12) startH = 0;
    }
    startTimeInput.value = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;

    // End time
    let endH = parseInt(endHourSelect.value, 10);
    const endM = parseInt(endMinuteSelect.value, 10);
    if (is12h) {
      const meridiem = endMeridiemBtn.textContent;
      if (meridiem === 'PM' && endH !== 12) endH += 12;
      if (meridiem === 'AM' && endH === 12) endH = 0;
    }
    endTimeInput.value = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  function initTimePickers() {
    // Set initial values from hidden inputs
    const [startH, startM] = startTimeInput.value.split(':').map(Number);
    const [endH, endM] = endTimeInput.value.split(':').map(Number);

    startHourSelect.value = String(startH).padStart(2, '0');
    startMinuteSelect.value = String(startM).padStart(2, '0');
    endHourSelect.value = String(endH).padStart(2, '0');
    endMinuteSelect.value = String(endM).padStart(2, '0');
    rebuildTimePickers();

    // Set meridiem buttons for 12h mode
    if (use12HourFormat) {
      startMeridiemBtn.textContent = startH >= 12 ? 'PM' : 'AM';
      endMeridiemBtn.textContent = endH >= 12 ? 'PM' : 'AM';
    }

    // Event listeners for time inputs
    [startHourSelect, startMinuteSelect, endHourSelect, endMinuteSelect].forEach(input => {
      input.addEventListener('input', onTimeInput);
      input.addEventListener('blur', onTimeBlur);
      input.addEventListener('focus', (e) => e.target.select());
    });

    // Event listeners for meridiem buttons
    if (startMeridiemBtn) {
      startMeridiemBtn.addEventListener('click', () => {
        startMeridiemBtn.textContent = startMeridiemBtn.textContent === 'AM' ? 'PM' : 'AM';
        syncHiddenTimeInputs();
      });
    }
    if (endMeridiemBtn) {
      endMeridiemBtn.addEventListener('click', () => {
        endMeridiemBtn.textContent = endMeridiemBtn.textContent === 'AM' ? 'PM' : 'AM';
        syncHiddenTimeInputs();
      });
    }
  }

  // Initialize time pickers after storage load
  chrome.storage.local.get({ use12HourFormat: false }, (data) => {
    use12HourFormat = data.use12HourFormat;
    if (timeFormatToggle) timeFormatToggle.textContent = use12HourFormat ? '12' : '24';
    initTimePickers();
  });

  const keywordInput    = document.getElementById('keyword');
  const addKeywordBtn   = document.getElementById('addKeywordBtn');
  const keywordError    = document.getElementById('keywordError');

  modeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'schedule') {
        scheduleGroup.style.display = 'block';
        timerGroup.style.display = 'none';
      } else {
        scheduleGroup.style.display = 'none';
        timerGroup.style.display = 'block';
      }
    });
  });

  const statusEl        = document.getElementById('status');

  const countSites      = document.getElementById('countSites');
  const countKeywords   = document.getElementById('countKeywords');
  const protectionDot   = document.getElementById('protectionDot');
  const protectionText  = document.getElementById('protectionText');
  const nextExpiryRow   = document.getElementById('nextExpiryRow');
  const nextExpiryTime  = document.getElementById('nextExpiryTime');
  const patternsToggle  = document.getElementById('patternsToggle');
  const patternsArrow   = document.getElementById('patternsArrow');
  const patternsBody    = document.getElementById('patternsBody');
  const patternsList    = document.getElementById('patternsList');
  const cardSitesToggle = document.getElementById('cardSitesToggle');
  const cardKeywordsToggle = document.getElementById('cardKeywordsToggle');
  const listSitesWrap   = document.getElementById('listSitesWrap');
  const listKeywordsWrap = document.getElementById('listKeywordsWrap');
  const listSites       = document.getElementById('listSites');
  const listKeywords    = document.getElementById('listKeywords');

  /* ── Incognito Check ───────────────────────────────────────────────── */
  const incognitoWarning = document.getElementById('incognitoWarning');
  const openExtensionsBtn = document.getElementById('openExtensionsBtn');
  if (incognitoWarning && openExtensionsBtn) {
    // Note: chrome.extension.isAllowedIncognitoAccess has no MV3 equivalent
    chrome.extension.isAllowedIncognitoAccess((isAllowed) => {
      if (!isAllowed) {
        incognitoWarning.style.display = 'flex';
      }
    });
    openExtensionsBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    });
  }

  /* ── Undo state ───────────────────────────────────────────────────── */
  let undoSnapshot = null;   // { sites, undoneUrl }
  let countdownInterval = null;
  let undoInterval = null;
  let lastSiteCount = -1;
  let lastKwCount = -1;

  function clearAllIntervals() {
    if (countdownInterval !== null) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    if (undoInterval !== null) {
      clearInterval(undoInterval);
      undoInterval = null;
    }
  }

  window.addEventListener('beforeunload', clearAllIntervals);

  /* ── Accordion: single-open ───────────────────────────────────────── */
  const accordions = document.querySelectorAll('.accordion input[type="checkbox"]');
  accordions.forEach(acc => {
    acc.addEventListener('change', function () {
      if (this.checked) {
        accordions.forEach(other => { if (other !== this) other.checked = false; });
      }
    });
  });

  /* ── Patterns toggle ──────────────────────────── */
  let patternsAutoOpened = false;

  document.getElementById('acc3').addEventListener('change', function () {
    if (this.checked && !patternsAutoOpened) {
      patternsAutoOpened = true;
      patternsBody.classList.add('open');
      patternsArrow.textContent = '▼';
    }
  });

  patternsToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    patternsBody.classList.toggle('open');
    patternsArrow.textContent = patternsBody.classList.contains('open') ? '▼' : '▶';
  });

  /* ── Count card toggles (show/hide site/keyword lists) ─── */
  cardSitesToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = listSitesWrap.classList.contains('open');
    listSitesWrap.classList.toggle('open', !isOpen);
    listKeywordsWrap.classList.remove('open');
    cardSitesToggle.classList.toggle('status-card-open', !isOpen);
    cardKeywordsToggle.classList.remove('status-card-open');
  });

  cardKeywordsToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = listKeywordsWrap.classList.contains('open');
    listKeywordsWrap.classList.toggle('open', !isOpen);
    listSitesWrap.classList.remove('open');
    cardKeywordsToggle.classList.toggle('status-card-open', !isOpen);
    cardSitesToggle.classList.remove('status-card-open');
  });

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
    clearError(startTimeInput, scheduleError);
    clearError(endTimeInput, scheduleError);
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
      
      // Reject invalid hostnames: no dot (unless wildcard) or localhost
      if (host === 'localhost' || (!host.includes('.') && !host.startsWith('*.'))) {
        console.warn('normaliseUrl: invalid hostname (no TLD or localhost):', host);
        return null;
      }
      
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
      return { valid: false, value: '' };
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
    const unit = durationUnit.currentUnit;
    const rawValue = e.target.value;
    const result = validateDurationInput(rawValue, unit);
    
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
      if (numValue === limits.max && rawValue !== result.value && rawValue !== '') {
        setError(timerInput, timerError, `Maximum ${limits.max} ${unit}.`);
      } else {
        clearError(timerInput, timerError);
      }
    }
  });

  const UNIT_LABELS = { minutes: 'Minutes', hours: 'Hours', days: 'Days' };
  const UNIT_ORDER = ['minutes', 'hours', 'days'];
  durationUnit.currentUnit = 'minutes';

  // Unit cycle handler
  durationUnit.addEventListener('click', () => {
    const idx = UNIT_ORDER.indexOf(durationUnit.currentUnit);
    durationUnit.currentUnit = UNIT_ORDER[(idx + 1) % UNIT_ORDER.length];
    durationUnit.textContent = UNIT_LABELS[durationUnit.currentUnit];
    timerInput.value = unitDefaults[durationUnit.currentUnit].toString();
    clearError(timerInput, timerError);
  });

  // Prevent non-numeric input
  timerInput.addEventListener('keydown', (e) => {
    if (!/[0-9]/.test(e.key) && !['Backspace', 'Delete', 'Tab', 'Enter'].includes(e.key)) {
      e.preventDefault();
    }
  });

  timerInput.addEventListener('paste', (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text');
    const numeric = paste.replace(/[^0-9]/g, '');
    timerInput.value = numeric;
    timerInput.dispatchEvent(new Event('input', { bubbles: true }));
  });

  /* ── Block site ───────────────────────────────────────────────────── */
  blockBtn.addEventListener('click', () => {
    clearErrors();
    const rawUrl    = urlInput.value.trim();
    const mode      = document.querySelector('input[name="blockMode"]:checked').value;
    
    let valid = true;
    if (!rawUrl) {
      setError(urlInput, urlError, 'Enter a URL to block.');
      valid = false;
    }

    let url = normaliseUrl(rawUrl);
    if (!url) {
      setError(urlInput, urlError, 'Invalid URL — e.g. twitter.com');
      valid = false;
    } else if (!url.includes('.')) {
      setError(urlInput, urlError, 'Invalid URL — e.g. twitter.com');
      valid = false;
    }

    let siteData = { url: url };

    if (mode === 'schedule') {
      const start = startTimeInput.value;
      const end = endTimeInput.value;
      if (!start || !end) {
        setError(startTimeInput, scheduleError, 'Select start and end times.');
        valid = false;
      }
      
      // Hidden inputs are always in 24h format (maintained by syncHiddenTimeInputs)
      siteData.type = 'schedule';
      siteData.startTime = start;
      siteData.endTime = end;
      siteData.msg = `Scheduled ${url} (${start} - ${end})`;
    } else {
      const unit      = durationUnit.currentUnit;
      const timerVal  = parseInt(timerInput.value, 10);
      const minutes   = convertToMinutes(timerVal, unit);

      if (isNaN(timerVal) || timerVal < 1 || timerInput.value === '') {
        setError(timerInput, timerError, 'Enter a valid duration.');
        valid = false;
      }

      const limits = unitLimits[unit];
      if (timerVal > limits.max) {
        setError(timerInput, timerError, `Maximum ${limits.max} ${unit}.`);
        timerInput.value = limits.max.toString();
        valid = false;
      }
      
      const expiry = Date.now() + (minutes * 60 * 1000);
      siteData.type = 'timer';
      siteData.expiryTimestamp = expiry;
      siteData.durationMs = minutes * 60 * 1000;
      siteData.originalUnit = unit;
      siteData.intendedDurationMinutes = minutes;
      siteData.msg = `Timer block ${url} for ${timerVal}${unit.charAt(0)}`;
    }

    if (!valid) return;

    chrome.storage.local.get({ blockedSites: [], stats: { attemptsBlocked: 0 }, dailyAttempts: {} }, (data) => {
      const sites = data.blockedSites || [];

      // Save undo snapshot before mutation
      undoSnapshot = { sites: JSON.parse(JSON.stringify(sites)), undoneUrl: url };

      const idx = sites.findIndex(s => s.url === url);
      if (idx > -1) {
        sites[idx] = siteData;
      } else {
        sites.push(siteData);
      }

      // Track attempt (for manual blocking setup)
      const todayStr = new Date().toISOString().split('T')[0];
      const stats = data.stats || { attemptsBlocked: 0, lastBreakTime: null, dailyFocusCompleted: {} };
      stats.attemptsBlocked = (stats.attemptsBlocked || 0) + 1;
      const dailyAttempts = data.dailyAttempts || {};
      if (!dailyAttempts[todayStr]) dailyAttempts[todayStr] = {};
      if (!dailyAttempts[todayStr].sites) dailyAttempts[todayStr].sites = {};
      dailyAttempts[todayStr].sites[url] = (dailyAttempts[todayStr].sites[url] || 0) + 1;

      // Create/update focus session when blocking sites
      const longestDuration = Math.max(...sites.map(s => s.durationMs || 0), 0);
      const focusSession = {
          startTime: Date.now(),
          duration: Math.round(longestDuration / 60000)
      };

      chrome.storage.local.set({ 
          blockedSites: sites, 
          stats: stats,
          dailyAttempts: dailyAttempts,
          focusSession: focusSession
      }, () => {
        urlInput.value = '';
        updateCountdowns();

        showStatus(siteData.msg, '#F5F5F5');
        showUndo();

        // Redirect any open tabs matching this URL immediately
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            try {
              if (!tab.url) return;
              const h = new URL(tab.url).hostname.replace(/^www\./, '');
              if (h === url || h.endsWith('.' + url)) {
                chrome.tabs.update(tab.id, {
                  url: chrome.runtime.getURL(`blocked.html?site=${url}&type=${mode}&url=${encodeURIComponent(tab.url)}`)
                });
              }
            } catch (_) {}
          });
        });
      });
    });
  });

  /* ── Undo ─────────────────────────────────────────────────────────── */
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
    chrome.storage.local.get({ stats: { attemptsBlocked: 0 }, dailyAttempts: {} }, (data) => {
        // Decrement attempt if undone
        const todayStr = new Date().toISOString().split('T')[0];
        const stats = data.stats || { attemptsBlocked: 0, lastBreakTime: null, dailyFocusCompleted: {} };
        stats.attemptsBlocked = Math.max(0, (stats.attemptsBlocked || 0) - 1);
        const dailyAttempts = data.dailyAttempts || {};
        if (dailyAttempts[todayStr] && dailyAttempts[todayStr].sites && dailyAttempts[todayStr].sites[undoSnapshot.undoneUrl]) {
            dailyAttempts[todayStr].sites[undoSnapshot.undoneUrl] = Math.max(0, dailyAttempts[todayStr].sites[undoSnapshot.undoneUrl] - 1);
            if (dailyAttempts[todayStr].sites[undoSnapshot.undoneUrl] === 0) {
                delete dailyAttempts[todayStr].sites[undoSnapshot.undoneUrl];
            }
        }

        chrome.storage.local.set({ 
            blockedSites: undoSnapshot.sites,
            stats: stats,
            dailyAttempts: dailyAttempts
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
        showStatus(`Keyword "${kw}" added`, '#F5F5F5');
        updateCountdowns();
      });
    });
  });

  /* ── Remove site (via friction screen) ─────────────────────────── */
  function removeSite(urlToRemove, blockType) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0 || !tabs[0]) {
        console.error('chrome.tabs.query: no active tab found');
        return;
      }
      const currentTab = tabs[0];
      const frictionUrl = chrome.runtime.getURL(
        `friction.html?site=${encodeURIComponent(urlToRemove)}&reloadTabId=${currentTab.id}&type=${encodeURIComponent(blockType || 'timer')}`
      );
      chrome.tabs.create({ url: frictionUrl });
    });
  }

  /* ── Remove keyword inline ────────────────────────────────────────── */
  function removeKeyword(kwToRemove) {
    chrome.storage.local.get({ strictKeywords: [], keywordBypass: {} }, (data) => {
      const kws = (data.strictKeywords || []).filter(k => k !== kwToRemove);
      const bypasses = data.keywordBypass || {};
      const setData = { strictKeywords: kws };
      let cleaned = false;
      Object.keys(bypasses).forEach(tabIdStr => {
        if (bypasses[tabIdStr].keyword === kwToRemove) {
          delete bypasses[tabIdStr];
          cleaned = true;
          chrome.alarms.clear(`keywordBypassExpire_${tabIdStr}`);
          chrome.alarms.clear(`keywordBypassCooldown_${tabIdStr}`);
        }
      });
      if (cleaned) setData.keywordBypass = bypasses;
      chrome.storage.local.set(setData, () => {
        updateCountdowns();
      });
    });
  }

  
  /* ── Status message ───────────────────────────────────────────────── */
  let statusClear;
  function showStatus(msg, color) {
    statusEl.textContent = msg;
    statusEl.style.color = color;
    statusEl.style.opacity = '1';
    clearTimeout(statusClear);
    statusClear = setTimeout(() => { statusEl.style.opacity = '0'; }, 3200);
    setTimeout(() => { if (statusEl.style.opacity === '0') statusEl.textContent = ''; }, 3500);
  }

  
  /* ── Main update ──────────────────────────────────────────────────── */
  function updateCountdowns() {
    chrome.storage.local.get({
        blockedSites: [], strictKeywords: [],
        stats: { attemptsBlocked: 0 },
        dailyAttempts: {}
    }, (data) => {
      const now = Date.now();
      const date = new Date(now);
      const currentMins = date.getHours() * 60 + date.getMinutes();
      const todayStr = date.toISOString().split('T')[0];

      const allSites = data.blockedSites || [];

      // Determine which sites are currently enforcing
      let hasActiveBlock = false;
      let nearestTimerExpiry = Infinity;

      allSites.forEach(site => {
        if (site.type === 'schedule') {
          const [sh, sm] = (site.startTime || '00:00').split(':').map(Number);
          const [eh, em] = (site.endTime || '00:00').split(':').map(Number);
          const startMins = sh * 60 + sm;
          const endMins = eh * 60 + em;
          let inWindow;
          if (startMins < endMins) {
            inWindow = currentMins >= startMins && currentMins < endMins;
          } else {
            inWindow = currentMins >= startMins || currentMins < endMins;
          }
          if (inWindow) hasActiveBlock = true;
        } else if (now < site.expiryTimestamp) {
          hasActiveBlock = true;
          if (site.expiryTimestamp < nearestTimerExpiry) {
            nearestTimerExpiry = site.expiryTimestamp;
          }
        }
      });

      // 1. Protection status
      if (hasActiveBlock) {
        protectionDot.className = 'status-dot dot-active';
        protectionText.textContent = 'PROTECTION: ACTIVE';
      } else {
        protectionDot.className = 'status-dot dot-limited';
        protectionText.textContent = 'PROTECTION: LIMITED';
      }

      // 2. Counts (total configured, not just active)
      if (countSites) countSites.textContent = allSites.length;
      if (countKeywords) countKeywords.textContent = (data.strictKeywords || []).length;

      // Populate site list for management (only rebuild if count changed)
      if (allSites.length !== lastSiteCount) {
        lastSiteCount = allSites.length;
        listSites.innerHTML = '';
        if (allSites.length === 0) {
          const li = document.createElement('li');
          li.className = 'status-list-empty';
          li.textContent = 'No sites blocked';
          listSites.appendChild(li);
        } else {
          allSites.forEach(site => {
            const li = document.createElement('li');
            li.className = 'status-list-item';

            const span = document.createElement('span');
            span.className = 'status-list-url';
            span.textContent = site.url;

            li.appendChild(span);

            const btn = document.createElement('button');
            btn.className = 'status-list-btn';
            btn.textContent = 'Remove';
            btn.onclick = () => removeSite(site.url, site.type);
            li.appendChild(btn);

            listSites.appendChild(li);
          });
        }
      }

      // Populate keyword list for management (only rebuild if count changed)
      const keywords = data.strictKeywords || [];
      if (keywords.length !== lastKwCount) {
        lastKwCount = keywords.length;
        listKeywords.innerHTML = '';
        if (keywords.length === 0) {
          const li = document.createElement('li');
          li.className = 'status-list-empty';
          li.textContent = 'No keywords blocked';
          listKeywords.appendChild(li);
        } else {
          keywords.forEach(kw => {
            const li = document.createElement('li');
            li.className = 'status-list-item';

            const span = document.createElement('span');
            span.className = 'status-list-url';
            span.textContent = kw;

            const btn = document.createElement('button');
            btn.className = 'status-list-btn';
            btn.textContent = 'Remove';
            btn.onclick = () => removeKeyword(kw);

            li.appendChild(span);
            li.appendChild(btn);
            listKeywords.appendChild(li);
          });
        }
      }

      // 3. Next block ends in (timer blocks only)
      if (nearestTimerExpiry !== Infinity && nearestTimerExpiry > now) {
        const rem = nearestTimerExpiry - now;
        const totalSec = Math.floor(rem / 1000);
        const days = Math.floor(totalSec / 86400);
        const hours = Math.floor((totalSec % 86400) / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        let display = '';
        if (days > 0) display = `${days}d ${hours}h`;
        else if (hours > 0) display = `${hours}h ${minutes}m`;
        else display = `${minutes}m`;
        nextExpiryTime.textContent = display;
        nextExpiryRow.style.display = 'flex';
      } else {
        nextExpiryRow.style.display = 'none';
      }

      // 4. Patterns section — per-site and per-keyword attempts today
      patternsList.innerHTML = '';
      const todayData = (data.dailyAttempts || {})[todayStr] || {};

      // Migrate old flat format (site-only) to new nested format
      if (!todayData.sites && !todayData.keywords && Object.keys(todayData).length > 0) {
        todayData.sites = { ...todayData };
        Object.keys(todayData).forEach(k => { if (k !== 'sites') delete todayData[k]; });
        todayData.keywords = {};
        const mig = data.dailyAttempts || {};
        mig[todayStr] = todayData;
        chrome.storage.local.set({ dailyAttempts: mig });
      }

      const siteEntries = Object.entries(todayData.sites || {});
      const kwEntries   = Object.entries(todayData.keywords || {});

      if (siteEntries.length === 0 && kwEntries.length === 0) {
        const li = document.createElement('li');
        li.className = 'patterns-empty';
        li.textContent = 'No attempts recorded today';
        patternsList.appendChild(li);
      } else {
        function appendAttempts(entries, label) {
          const heading = document.createElement('li');
          heading.className = 'patterns-subhead';
          heading.textContent = label;
          patternsList.appendChild(heading);

          entries.forEach(([item, count]) => {
            const li = document.createElement('li');
            li.className = 'patterns-item';

            const span = document.createElement('span');
            span.className = 'patterns-site';
            span.textContent = item;

            const countSpan = document.createElement('span');
            countSpan.className = 'patterns-count';
            countSpan.textContent = `${count} attempt${count !== 1 ? 's' : ''} today`;

            li.appendChild(span);
            li.appendChild(countSpan);
            patternsList.appendChild(li);
          });
        }

        if (siteEntries.length > 0) appendAttempts(siteEntries, 'Websites');
        if (kwEntries.length > 0) appendAttempts(kwEntries, 'Keywords');
      }
    });
  }

  // Boot
  countdownInterval = setInterval(updateCountdowns, 1000);
});
