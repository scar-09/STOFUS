document.addEventListener('DOMContentLoaded', () => {
    const countdownEl = document.getElementById('countdown');
    const closeBtn = document.getElementById('closeBtn');
    const emergencyBtn = document.getElementById('emergencyBtn');

    let stateBActive = false;
    let emergencyActive = false;

    // Timer logic
    const urlParams = new URLSearchParams(window.location.search);
    const targetSite = urlParams.get('site');
    const targetUrl = urlParams.get('url');

    // Emergency Unlock
    function updateEmergencyState() {
        chrome.storage.local.get({ 
            blockedSites: [],
            emergencyUnlock: { active: false, tabId: null, expiresAt: null, sessionId: null, usedInSession: false, cooldownUntil: null }
        }, (data) => {
            const eu = data.emergencyUnlock;
            const now = Date.now();
            const activeSites = (data.blockedSites || []).filter(s => now < s.expiryTimestamp);
            const isFocusSessionActive = activeSites.length > 0;
            const isBlocked = !!targetSite; // In blocked.html, if targetSite exists, it means we are in a block state

            // UI RESTRICTION: Only show on active block screen during focus session
            if (!isFocusSessionActive || !isBlocked || stateBActive) {
                emergencyBtn.style.display = 'none';
                return;
            }

            emergencyBtn.style.display = 'block';
            
            let label = "Unlock (2m)";
            let disabled = false;
            
            if (eu.active) {
                disabled = true;
                label = "Active";
            } else if (eu.cooldownUntil && now < eu.cooldownUntil) {
                disabled = true;
                const rem = Math.ceil((eu.cooldownUntil - now) / 60000);
                label = `Cooldown (${rem}m)`;
            } else if (eu.usedInSession) {
                disabled = true;
                label = "Used";
            }
            
            emergencyBtn.disabled = disabled;
            emergencyBtn.textContent = label;
        });
    }

    updateEmergencyState();
    setInterval(updateEmergencyState, 5000);

    emergencyBtn.addEventListener('click', () => {
        const confirmPopup = document.getElementById('emergencyConfirmPopup');
        confirmPopup.style.display = 'flex';
    });

    // Yep button - proceed with bypass
    document.getElementById('emergencyConfirmYep').addEventListener('click', () => {
        const confirmPopup = document.getElementById('emergencyConfirmPopup');
        confirmPopup.style.display = 'none';
        
        chrome.runtime.sendMessage({ action: 'activateEmergencyUnlock' }, (response) => {
            if (response && response.success) {
                emergencyActive = true;
                updateEmergencyState();
                // Wait a moment for storage to update, then redirect
                setTimeout(() => {
                    // Redirect to the original blocked website
                    if (targetUrl) {
                        window.location.href = targetUrl;
                    } else if (targetSite) {
                        let urlTarget = targetSite;
                        if (!urlTarget.startsWith('http')) {
                            urlTarget = 'https://' + urlTarget;
                        }
                        window.location.href = urlTarget;
                    }
                }, 100);
            } else {
                alert(response ? response.reason : 'Activation failed');
            }
        });
    });

    // Nah button - close popup
    document.getElementById('emergencyConfirmNah').addEventListener('click', () => {
        const confirmPopup = document.getElementById('emergencyConfirmPopup');
        confirmPopup.style.display = 'none';
    });

    // Close tab
    closeBtn.addEventListener('click', () => {
        if (stateBActive) {
            if (targetUrl) {
                chrome.tabs.getCurrent(tab => chrome.tabs.update(tab.id, { url: targetUrl }));
            } else if (targetSite) {
                let urlTarget = targetSite;
                if (!urlTarget.startsWith('http')) {
                    urlTarget = 'https://' + urlTarget;
                }
                chrome.tabs.getCurrent(tab => chrome.tabs.update(tab.id, { url: urlTarget }));
            }
        } else {
            chrome.tabs.getCurrent(tab => chrome.tabs.remove(tab.id));
        }
    });

    function triggerStateB() {
        if (stateBActive) return;
        stateBActive = true;

        // Completion pulse on timer element
        countdownEl.classList.add('pulse');
        countdownEl.addEventListener('animationend', () => {
            countdownEl.textContent = '00:00';
            countdownEl.classList.remove('pulse');
        }, { once: true });

        // Reward card glow
        const card = document.querySelector('.glass-card');
        if (card) card.classList.add('reward-mode');

        // Content swap (slight delay so pulse plays first)
        setTimeout(() => {
            document.querySelector('h1').textContent = 'GO AHEAD, YOU EARNED IT.';
        }, 400);

        // Notify canvas to switch to reward intensity
        window.dispatchEvent(new CustomEvent('bg-mode-change', { detail: { mode: 'reward' } }));



        // Button transform
        closeBtn.textContent = 'Reload page';
        closeBtn.classList.add('success-mode');
    }

    function formatTimerDisplay(totalSeconds) {
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (totalSeconds < 3600) {
            // Less than 1 hour: MM:SS
            return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else if (totalSeconds < 86400) {
            // Less than 24 hours: HH:MM:SS
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else {
            // 24 hours or more: DD : HH : MM (no seconds)
            return `${String(days).padStart(2, '0')} : ${String(hours).padStart(2, '0')} : ${String(minutes).padStart(2, '0')}`;
        }
    }

    function createDaySegments(totalSeconds) {
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);

        return `
            <div class="timer-segments">
                <div class="timer-segment">
                    <div class="timer-value">${String(days).padStart(2, '0')}</div>
                    <div class="timer-unit">D</div>
                </div>
                <div class="timer-colon">:</div>
                <div class="timer-segment">
                    <div class="timer-value">${String(hours).padStart(2, '0')}</div>
                    <div class="timer-unit">H</div>
                </div>
                <div class="timer-colon">:</div>
                <div class="timer-segment">
                    <div class="timer-value">${String(minutes).padStart(2, '0')}</div>
                    <div class="timer-unit">M</div>
                </div>
            </div>
        `;
    }

    function updateTimer() {
        chrome.storage.local.get({ blockedSites: [] }, (data) => {
            const now = Date.now();
            let activeSites = data.blockedSites.filter(s => now < s.expiryTimestamp);

            if (activeSites.length > 0) {
                let siteBlock;
                if (targetSite) {
                    siteBlock = activeSites.find(s => {
                        if (s.url.startsWith('*.')) {
                            const bd = s.url.substring(2);
                            return targetSite === bd || targetSite.endsWith('.' + bd);
                        }
                        return s.url === targetSite || targetSite.endsWith('.' + s.url);
                    });
                }

                if (!siteBlock) {
                    const maxExpiry = Math.max(...activeSites.map(s => s.expiryTimestamp));
                    siteBlock = { expiryTimestamp: maxExpiry };
                }

                const remainingTime = siteBlock.expiryTimestamp - now;

                if (remainingTime > 0) {
                    const totalSeconds = Math.floor(remainingTime / 1000);
                    
                    // Clear any existing segments
                    const existingSegments = countdownEl.querySelector('.timer-segments');
                    if (existingSegments) {
                        existingSegments.remove();
                    }

                    if (totalSeconds >= 86400) {
                        // Use segmented display for days format
                        countdownEl.innerHTML = createDaySegments(totalSeconds);
                    } else {
                        // Use standard text display for hours/minutes
                        countdownEl.textContent = formatTimerDisplay(totalSeconds);
                    }
                } else {
                    triggerStateB();
                }
            } else {
                triggerStateB();
            }
        });
    }

    updateTimer();
    setInterval(updateTimer, 1000);
});
