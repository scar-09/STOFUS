document.addEventListener('DOMContentLoaded', () => {
    /* ── Parse params ─────────────────────────────────────────────────── */
    const urlParams = new URLSearchParams(window.location.search);
    const siteToUnblock = urlParams.get('site');
    const reloadTabId = parseInt(urlParams.get('reloadTabId'), 10);
    const blockType = urlParams.get('type');
    if (isNaN(reloadTabId)) {
        console.error('friction.js: invalid reloadTabId param');
    }

    const siteNameEl = document.getElementById('siteName');
    const timerDisplay = document.getElementById('timerDisplay');
    const timerSection = document.getElementById('timerSection');
    const inputSection = document.getElementById('inputSection');
    const phraseInput = document.getElementById('phraseInput');
    const unlockBtn = document.getElementById('unlockBtn');
    let pasteErrorTimeout;
    const inputError = document.getElementById('inputError');
    const statusMessage = document.getElementById('statusMessage');
    const reflectionSection = document.getElementById('reflectionSection');
    const reflectionCountdown = document.getElementById('reflectionCountdown');
    const scheduleInfo = document.getElementById('scheduleInfo');
    const scheduleEndTime = document.getElementById('scheduleEndTime');
    const timerLabel = document.getElementById('timerLabel');

    const REQUIRED_PHRASE = 'I choose to unlock this website';

    function extractDomain(url) {
        if (!url) return '';
        if (url.startsWith('*.')) {
            return url.substring(2);
        }
        try {
            return new URL(url).hostname;
        } catch (_) {
            return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        }
    }

    let timeRemaining = 45;
    let originalTimeRemaining = 45;
    let countdownInterval = null;
    let reflectionInterval = null;
    let tabLostFocus = false;
    let isCompleted = false;
    let scheduleEndTimeValue = '';

    /* ── Initialize ───────────────────────────────────────────────────── */
    if (siteToUnblock) {
        siteNameEl.textContent = siteToUnblock;

        chrome.storage.local.get({ blockedSites: [] }, (data) => {
            const targetDomain = extractDomain(siteToUnblock);
            const blockedSite = data.blockedSites.find(site => {
                const siteUrl = extractDomain(site.url);
                return siteUrl === targetDomain;
            });

            if (blockedSite) {
                if (blockType === 'schedule') {
                    timeRemaining = 0;
                    scheduleEndTimeValue = blockedSite.endTime || '';
                } else {
                    timeRemaining = calculateFrictionDelay(blockedSite.intendedDurationMinutes);
                }
                originalTimeRemaining = timeRemaining;
                updateTimerDisplay();
            }

            startReflection();
        });
    } else {
        document.querySelector('.header p').textContent = 'Error: No website specified.';
        return;
    }

    /* ── Tab focus tracking ───────────────────────────────────────────── */
    let focusLostTimeout = null;

    function handleFocusLoss() {
        if (!isCompleted && !focusLostTimeout && !reflectionInterval) {
            focusLostTimeout = setTimeout(() => {
                tabLostFocus = true;
                resetTimer();
                focusLostTimeout = null;
            }, 200);
        }
    }

    function handleFocusGain() {
        if (focusLostTimeout) {
            clearTimeout(focusLostTimeout);
            focusLostTimeout = null;
        }

        if (tabLostFocus && !isCompleted) {
            statusMessage.textContent = 'Timer reset - stay focused on this page';
            statusMessage.className = 'status-message warning';
            setTimeout(() => {
                statusMessage.textContent = 'Please wait...';
                statusMessage.className = 'status-message';
            }, 3000);
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            handleFocusLoss();
        } else {
            handleFocusGain();
        }
    });

    window.addEventListener('blur', handleFocusLoss);
    window.addEventListener('focus', handleFocusGain);

    /* ── Scaling Friction ───────────────────────────────────────────── */
    function calculateFrictionDelay(durationMinutes) {
        if (!durationMinutes) return 0;
        if (durationMinutes < 1440) return 60;
        if (durationMinutes <= 10080) return 180;
        return 300;
    }

    /* ── Reflection phase ──────────────────────────────────────────── */
    function startReflection() {
        timerSection.style.display = 'none';
        inputSection.classList.remove('active');
        unlockBtn.classList.remove('active');
        reflectionSection.classList.add('active');

        let remaining = 30;
        reflectionCountdown.textContent = remaining;
        reflectionCountdown.classList.remove('timer-warning');

        reflectionInterval = setInterval(() => {
            remaining--;
            reflectionCountdown.textContent = remaining;

            if (remaining <= 10) {
                reflectionCountdown.classList.add('timer-warning');
            }

            if (remaining <= 0) {
                clearInterval(reflectionInterval);
                reflectionInterval = null;
                reflectionSection.classList.remove('active');

                if (timeRemaining > 0) {
                    startTimer();
                } else if (blockType === 'schedule') {
                    showScheduleInfo();
                } else {
                    completeTimer();
                }
            }
        }, 1000);
    }

    /* ── Schedule info phase ────────────────────────────────────────── */
    function showScheduleInfo() {
        timerSection.style.display = 'none';
        inputSection.classList.add('active');
        unlockBtn.classList.add('active');
        scheduleInfo.style.display = 'block';
        scheduleEndTime.textContent = scheduleEndTimeValue;

        statusMessage.textContent = 'Timer completed - type the phrase to continue';
        statusMessage.className = 'status-message success';

        setTimeout(() => {
            phraseInput.focus();
        }, 500);
    }

    /* ── Timer functions ───────────────────────────────────────────────── */
    function startTimer() {
        countdownInterval = setInterval(() => {
            timeRemaining--;
            updateTimerDisplay();

            if (timeRemaining <= 0) {
                completeTimer();
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        timerDisplay.textContent = timeRemaining;

        if (timeRemaining <= 10) {
            timerDisplay.classList.add('timer-warning');
        } else {
            timerDisplay.classList.remove('timer-warning');
        }
    }

    function resetTimer() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
        timeRemaining = originalTimeRemaining;
        updateTimerDisplay();
        startTimer();
    }

    function completeTimer() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
        isCompleted = true;

        timerSection.style.display = 'none';
        inputSection.classList.add('active');
        unlockBtn.classList.add('active');

        statusMessage.textContent = 'Timer completed - type the phrase to continue';
        statusMessage.className = 'status-message success';

        setTimeout(() => {
            phraseInput.focus();
        }, 500);
    }

    /* ── Input validation ─────────────────────────────────────────────── */
    phraseInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();

        inputError.textContent = '';
        phraseInput.classList.remove('error');

        if (value.toLowerCase() === REQUIRED_PHRASE.toLowerCase()) {
            unlockBtn.disabled = false;
        } else {
            unlockBtn.disabled = true;
        }
    });

    phraseInput.addEventListener('paste', (e) => {
        e.preventDefault();
        inputError.textContent = 'Copy-paste is not allowed';
        phraseInput.classList.add('error');
        clearTimeout(pasteErrorTimeout);
        pasteErrorTimeout = setTimeout(() => {
            inputError.textContent = '';
            phraseInput.classList.remove('error');
        }, 2000);
    });

    phraseInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !unlockBtn.disabled) {
            unlockBtn.click();
        }
    });

    /* ── Unlock process ───────────────────────────────────────────────── */
    unlockBtn.addEventListener('click', () => {
        const value = phraseInput.value.trim();

        if (value.toLowerCase() !== REQUIRED_PHRASE.toLowerCase()) {
            inputError.textContent = 'Phrase does not match exactly';
            phraseInput.classList.add('error');
            return;
        }

        phraseInput.disabled = true;
        unlockBtn.disabled = true;
        unlockBtn.textContent = 'Unlocking...';

        statusMessage.textContent = 'Unlocking website...';
        statusMessage.className = 'status-message success';

        chrome.storage.local.get({ blockedSites: [] }, (data) => {
            const targetDomain = extractDomain(siteToUnblock);
            const blockedSites = data.blockedSites || [];
            const updatedBlockedSites = blockedSites.filter(site => {
                const siteUrl = extractDomain(site.url);
                return siteUrl !== targetDomain;
            });

            chrome.storage.local.set({
                blockedSites: updatedBlockedSites
            }, () => {
                setTimeout(() => {
                    if (reloadTabId && !isNaN(reloadTabId)) {
                        chrome.tabs.reload(reloadTabId, () => {
                            if (chrome.runtime.lastError) {
                                console.error('Failed to reload original tab:', chrome.runtime.lastError);
                            }
                        });
                    }

                    chrome.tabs.getCurrent((tab) => {
                        if (tab) {
                            chrome.tabs.remove(tab.id);
                        }
                    });
                }, 1500);
            });
        });
    });

});
