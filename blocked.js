document.addEventListener('DOMContentLoaded', () => {
    const countdownEl = document.getElementById('countdown');
    const closeBtn = document.getElementById('closeBtn');
    const reloadBtn = document.getElementById('reloadBtn');
    const blockedState = document.getElementById('blockedState');
    const unblockedState = document.getElementById('unblockedState');

    let stateBActive = false;
    let timerInterval = null;
    let currentTab = null;
    let cachedBlockedSites = [];

    function clearAllIntervals() {
        if (timerInterval !== null) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    window.addEventListener('beforeunload', clearAllIntervals);

    // Timer logic
    const urlParams = new URLSearchParams(window.location.search);
    const targetSite = urlParams.get('site');
    const targetUrl = urlParams.get('url');
    // Disable buttons until tab reference is confirmed
    closeBtn.disabled = true;

    // Cache current tab reference
    chrome.tabs.getCurrent(tab => {
        currentTab = tab;
        if (currentTab) {
            closeBtn.disabled = false;
            if (reloadBtn) reloadBtn.disabled = false;
        }
    });

    closeBtn.addEventListener('click', () => {
        if (!currentTab) return;
        chrome.tabs.remove(currentTab.id);
    });

    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            if (!currentTab) return;
            if (targetUrl) {
                chrome.tabs.update(currentTab.id, { url: targetUrl });
            } else if (targetSite) {
                let urlTarget = targetSite;
                if (!urlTarget.startsWith('http')) {
                    urlTarget = 'https://' + urlTarget;
                }
                chrome.tabs.update(currentTab.id, { url: urlTarget });
            }
        });
    }

    function triggerStateB() {
        if (stateBActive) return;
        stateBActive = true;
        clearAllIntervals();

        if (blockedState) blockedState.style.display = 'none';
        if (unblockedState) unblockedState.style.display = 'block';
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
        if (stateBActive) return;
        const now = Date.now();
        let activeSites = [];
        
        const date = new Date(now);
        const currentMins = date.getHours() * 60 + date.getMinutes();

        if (!Array.isArray(cachedBlockedSites)) return;
        cachedBlockedSites.forEach(s => {
                if (s.type === 'schedule') {
                    if (!s.startTime || !s.endTime) return;
                    const [sh, sm] = s.startTime.split(':').map(Number);
                    const [eh, em] = s.endTime.split(':').map(Number);
                    const startMins = sh * 60 + sm;
                    const endMins = eh * 60 + em;
                    let isActive = false;
                    if (startMins < endMins) {
                        isActive = currentMins >= startMins && currentMins < endMins;
                    } else {
                        isActive = currentMins >= startMins || currentMins < endMins;
                    }
                    if (isActive) activeSites.push(s);
                } else {
                    if (now < s.expiryTimestamp) activeSites.push(s);
                }
            });

            if (activeSites.length > 0) {
                let siteBlock;
                if (targetSite) {
                    siteBlock = activeSites.find(s => {
                        if (!s.url) return false;
                        if (s.url.startsWith('*.')) {
                            const bd = s.url.substring(2);
                            return targetSite === bd || targetSite.endsWith('.' + bd);
                        }
                        return s.url === targetSite || targetSite.endsWith('.' + s.url);
                    });
                }

                if (!siteBlock) {
                    return;
                }

                if (siteBlock.type === 'schedule') {
                     // For schedule blocks, we don't show a countdown in the same way,
                     // but we could show time until end of schedule. For now, let's just
                     // clear segments and say "Scheduled" or calculate remaining time today.
                     if (!siteBlock.endTime) return;
                     const [eh, em] = siteBlock.endTime.split(':').map(Number);
                     const endMins = eh * 60 + em;
                     let diffMins = endMins - currentMins;
                     if (diffMins < 0) diffMins += 24 * 60; // Overnight
                     
                     const totalSeconds = Math.max(0, diffMins * 60 - date.getSeconds());
                     if (totalSeconds > 0) {
                        const existingSegments = countdownEl.querySelector('.timer-segments');
                        if (existingSegments) existingSegments.remove();
                        countdownEl.textContent = formatTimerDisplay(totalSeconds);
                     } else {
                        triggerStateB();
                     }
                } else {
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
                }
            } else {
                triggerStateB();
            }
    }

    chrome.storage.local.get({ blockedSites: [] }, (data) => {
        cachedBlockedSites = data.blockedSites;
        updateTimer();
        timerInterval = setInterval(updateTimer, 1000);
    });
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.blockedSites) {
            cachedBlockedSites = changes.blockedSites.newValue;
        }
    });
});
