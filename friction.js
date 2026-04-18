document.addEventListener('DOMContentLoaded', () => {
    /* ── Parse params ─────────────────────────────────────────────────── */
    const urlParams = new URLSearchParams(window.location.search);
    const siteToUnblock = urlParams.get('site');
    const reloadTabId = parseInt(urlParams.get('reloadTabId'));

    const siteNameEl = document.getElementById('siteName');
    const timerDisplay = document.getElementById('timerDisplay');
    const timerSection = document.getElementById('timerSection');
    const inputSection = document.getElementById('inputSection');
    const phraseInput = document.getElementById('phraseInput');
    const unlockBtn = document.getElementById('unlockBtn');
    const inputError = document.getElementById('inputError');
    const statusMessage = document.getElementById('statusMessage');

    const REQUIRED_PHRASE = 'I choose to unlock this website';

    let timeRemaining = 45; // Default, will be updated based on block duration
    let originalTimeRemaining = 45; // Store original duration for resets
    let countdownInterval = null;
    let tabLostFocus = false;
    let isCompleted = false;

    /* ── Initialize ───────────────────────────────────────────────────── */
    if (siteToUnblock) {
        siteNameEl.textContent = siteToUnblock;
        
        // Get the block duration to calculate friction delay
        chrome.storage.local.get({ blockedSites: [] }, (data) => {
            const blockedSite = data.blockedSites.find(site => {
                const siteUrl = site.url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
                const targetDomain = siteToUnblock.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
                return siteUrl === targetDomain;
            });
            
            if (blockedSite && blockedSite.intendedDurationMinutes && blockedSite.originalUnit) {
                timeRemaining = calculateFrictionDelay(blockedSite.intendedDurationMinutes, blockedSite.originalUnit);
                originalTimeRemaining = timeRemaining; // Store original duration
                updateTimerDisplay(); // Update display with new time
            }
        });
    } else {
        document.querySelector('.header p').textContent = 'Error: No website specified.';
        return;
    }

    /* ── Tab focus tracking ───────────────────────────────────────────── */
    let focusLostTimeout = null;
    
    function handleFocusLoss() {
        if (!isCompleted && !focusLostTimeout) {
            focusLostTimeout = setTimeout(() => {
                tabLostFocus = true;
                resetTimer();
                focusLostTimeout = null;
            }, 200); // Slightly longer delay to prevent false triggers
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
    
    // Also track page visibility changes
    document.addEventListener('webkitvisibilitychange', () => {
        if (document.webkitHidden) {
            handleFocusLoss();
        } else {
            handleFocusGain();
        }
    });
    
    // Track mouse leaving the window
    document.addEventListener('mouseleave', () => {
        handleFocusLoss();
    });
    
    document.addEventListener('mouseenter', () => {
        handleFocusGain();
    });

    /* ── Scaling Friction ───────────────────────────────────────────── */
    function calculateFrictionDelay(durationMinutes, durationUnit) {
        const totalMinutes = durationMinutes * (durationUnit === 'minutes' ? 1 : durationUnit === 'hours' ? 60 : 1440);
        
        if (totalMinutes < 60) {
            return 30; // < 1 hour → 30s
        } else if (totalMinutes < 1440) {
            return 60; // 1-24 hours → 60s
        } else if (totalMinutes < 4320) {
            return 120; // 1-3 days → 2min
        } else if (totalMinutes < 10080) {
            return 300; // 3-7 days → 5min
        } else if (totalMinutes < 43200) {
            return 600; // 7-30 days → 10min
        } else {
            return 600; // > 30 days → 10min (max)
        }
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
        // Reset timeRemaining to original duration
        timeRemaining = originalTimeRemaining;
        updateTimerDisplay();
        startTimer();
    }

    function completeTimer() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
        isCompleted = true;
        
        // Hide timer, show input section
        timerSection.style.display = 'none';
        inputSection.classList.add('active');
        unlockBtn.classList.add('active');
        
        statusMessage.textContent = 'Timer completed - type the phrase to continue';
        statusMessage.className = 'status-message success';
        
        // Focus on input
        setTimeout(() => {
            phraseInput.focus();
        }, 500);
    }

    /* ── Input validation ─────────────────────────────────────────────── */
    phraseInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        
        // Clear error on input
        inputError.textContent = '';
        phraseInput.classList.remove('error');
        
        // Enable/disable unlock button
        if (value.toLowerCase() === REQUIRED_PHRASE.toLowerCase()) {
            unlockBtn.disabled = false;
        } else {
            unlockBtn.disabled = true;
        }
    });

    // Prevent paste
    phraseInput.addEventListener('paste', (e) => {
        e.preventDefault();
        inputError.textContent = 'Copy-paste is not allowed';
        phraseInput.classList.add('error');
        setTimeout(() => {
            inputError.textContent = '';
            phraseInput.classList.remove('error');
        }, 2000);
    });

    // Handle Enter key
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

        // Disable input and button
        phraseInput.disabled = true;
        unlockBtn.disabled = true;
        unlockBtn.textContent = 'Unlocking...';
        
        statusMessage.textContent = 'Unlocking website...';
        statusMessage.className = 'status-message success';

        // Perform domain-based unlock
        chrome.storage.local.get({ blockedSites: [], domainUnlocks: {} }, (data) => {
            // Remove the site from blockedSites
            const blockedSites = data.blockedSites || [];
            const updatedBlockedSites = blockedSites.filter(site => {
                const siteUrl = site.url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
                const targetDomain = siteToUnblock.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
                return siteUrl !== targetDomain;
            });
            
            // Create domain unlock entry
            const domainUnlocks = data.domainUnlocks || {};
            const domain = siteToUnblock.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
            
            domainUnlocks[domain] = {
                domain: domain,
                unlockExpiresAt: Date.now() + (2 * 60 * 1000) // 2 minutes
            };
            
            // Store both the updated blockedSites and domain unlock
            chrome.storage.local.set({ 
                blockedSites: updatedBlockedSites,
                domainUnlocks: domainUnlocks 
            }, () => {
                // Wait 1-2 seconds before reloading the original tab
                setTimeout(() => {
                    if (reloadTabId) {
                        // Reload the original tab (Tab 1)
                        chrome.tabs.reload(parseInt(reloadTabId), () => {
                            if (chrome.runtime.lastError) {
                                console.error('Failed to reload original tab:', chrome.runtime.lastError);
                            }
                        });
                    }
                    
                    // Close this friction tab (Tab 2)
                    chrome.tabs.getCurrent((tab) => {
                        if (tab) {
                            chrome.tabs.remove(tab.id);
                        }
                    });
                }, 1500);
            });
        });
    });

    /* ── Start the timer ───────────────────────────────────────────────── */
    startTimer();
});
