let strictKeywords = [];

// Prevent loop on the block page
if (window.location.href.includes("blocked.html") || window.location.href.includes("kw-blocked.html")) {
    // Stop execution for this script on our own pages
} else {
    // Load config on init
    chrome.storage.local.get({ 
        strictKeywords: [],
        emergencyUnlock: { active: false, tabId: null, expiresAt: null, sessionId: null, usedInSession: false, cooldownUntil: null },
        keywordBypass: {},
        domainUnlocks: {} // domain-scoped temporary unlocks
    }, (data) => {
        strictKeywords = data.strictKeywords.map(k => k.toLowerCase());
        
        // Check keyword bypass first
        chrome.runtime.sendMessage({ action: 'checkMyTabId' }, (response) => {
            if (response && response.tabId) {
                const bypass = data.keywordBypass[response.tabId];
                const now = Date.now();
                
                if (bypass && bypass.active && now < bypass.expiresAt) {
                    // Keyword bypass is active - show timer overlay and skip filtering
                    showBypassTimerOverlay(bypass.expiresAt);
                    return; // ALLOW: Keyword bypass active for this tab
                }
            }
            
            // Check domain-based unlock
            const currentDomain = window.location.hostname;
            const domainUnlock = data.domainUnlocks[currentDomain];
            if (domainUnlock && domainUnlock.unlockExpiresAt && Date.now() < domainUnlock.unlockExpiresAt) {
                // Domain unlock is active - show timer overlay and skip blocking
                showDomainUnlockTimerOverlay(domainUnlock.unlockExpiresAt);
                return; // ALLOW: Domain unlock active for this domain
            }
            
            // Check emergency unlock
            const eu = data.emergencyUnlock;
            if (eu.active && Date.now() < eu.expiresAt) {
                // Check if this tab is the one unlocked
                if (response && response.tabId === eu.tabId) {
                    showUnlockOverlay(eu.expiresAt);
                    return; // ALLOW: Emergency unlock active for this tab
                }
            }
            
            // No bypass active - proceed with keyword blocking
            checkAndBlock();
        });
    });
}

function showBypassTimerOverlay(expiresAt) {
    if (document.getElementById('kw-bypass-timer-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'kw-bypass-timer-overlay';
    overlay.style.cssText = `
        position: fixed; top: 12px; right: 12px; 
        background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.4);
        color: #fbbf24; padding: 8px 16px; border-radius: 20px;
        font-family: 'Montserrat', sans-serif; font-size: 0.75rem;
        font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;
        z-index: 10000; backdrop-filter: blur(10px);
        cursor: move; user-select: none;
        box-shadow: 0 4px 12px rgba(251, 191, 36, 0.2);
    `;
    document.body.appendChild(overlay);

    // Make it draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    const dragStart = (e) => {
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }

        if (e.target === overlay) {
            isDragging = true;
        }
    };

    const dragEnd = () => {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    };

    const drag = (e) => {
        if (isDragging) {
            e.preventDefault();
            
            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }

            xOffset = currentX;
            yOffset = currentY;

            overlay.style.transform = `translate(${currentX}px, ${currentY}px)`;
        }
    };

    overlay.addEventListener('touchstart', dragStart, false);
    overlay.addEventListener('touchend', dragEnd, false);
    overlay.addEventListener('touchmove', drag, false);
    overlay.addEventListener('mousedown', dragStart, false);
    overlay.addEventListener('mouseup', dragEnd, false);
    overlay.addEventListener('mousemove', drag, false);

    const updateTimer = () => {
        const now = Date.now();
        if (now < expiresAt) {
            const remaining = Math.ceil((expiresAt - now) / 1000);
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            overlay.textContent = `Bypass ${minutes}:${String(seconds).padStart(2, '0')}`;
            requestAnimationFrame(updateTimer);
        } else {
            overlay.remove();
            // Reload page to trigger keyword block again
            window.location.reload();
        }
    };
    updateTimer();
}

function showUnlockOverlay(expiresAt) {
    if (document.getElementById('fb-unlock-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'fb-unlock-overlay';
    overlay.style.cssText = `
        position: fixed; top: 12px; right: 12px; 
        background: rgba(34, 211, 238, 0.15); border: 1px solid rgba(34, 211, 238, 0.4);
        color: #22d3ee; padding: 8px 16px; border-radius: 20px;
        font-family: 'Montserrat', sans-serif; font-size: 0.75rem;
        font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;
        z-index: 10000; backdrop-filter: blur(10px);
        cursor: move; user-select: none;
        box-shadow: 0 4px 12px rgba(34, 211, 238, 0.2);
    `;
    document.body.appendChild(overlay);

    // Make it draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    const dragStart = (e) => {
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }

        if (e.target === overlay) {
            isDragging = true;
        }
    };

    const dragEnd = () => {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    };

    const drag = (e) => {
        if (isDragging) {
            e.preventDefault();
            
            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }

            xOffset = currentX;
            yOffset = currentY;

            overlay.style.transform = `translate(${currentX}px, ${currentY}px)`;
        }
    };

    overlay.addEventListener('touchstart', dragStart, false);
    overlay.addEventListener('touchend', dragEnd, false);
    overlay.addEventListener('touchmove', drag, false);
    overlay.addEventListener('mousedown', dragStart, false);
    overlay.addEventListener('mouseup', dragEnd, false);
    overlay.addEventListener('mousemove', drag, false);

    const updateTimer = () => {
        const now = Date.now();
        if (now < expiresAt) {
            const remaining = Math.ceil((expiresAt - now) / 1000);
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            overlay.textContent = `Unlock ${minutes}:${String(seconds).padStart(2, '0')}`;
            requestAnimationFrame(updateTimer);
        } else {
            overlay.remove();
            checkAndBlock();
        }
    };
    updateTimer();
}

function showDomainUnlockTimerOverlay(expiresAt) {
    if (document.getElementById('domain-unlock-timer-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'domain-unlock-timer-overlay';
    overlay.style.cssText = `
        position: fixed; top: 12px; right: 12px; 
        background: rgba(34, 211, 238, 0.15); border: 1px solid rgba(34, 211, 238, 0.4);
        color: #22d3ee; padding: 8px 16px; border-radius: 20px;
        font-family: 'Montserrat', sans-serif; font-size: 0.75rem;
        font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;
        z-index: 10000; backdrop-filter: blur(10px);
        cursor: move; user-select: none;
        box-shadow: 0 4px 12px rgba(34, 211, 238, 0.2);
    `;
    document.body.appendChild(overlay);

    // Make it draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    const dragStart = (e) => {
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }

        if (e.target === overlay) {
            isDragging = true;
        }
    };

    const dragEnd = () => {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    };

    const drag = (e) => {
        if (isDragging) {
            e.preventDefault();
            
            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }

            xOffset = currentX;
            yOffset = currentY;

            overlay.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        }
    };

    overlay.addEventListener('touchstart', dragStart, { passive: false });
    overlay.addEventListener('touchend', dragEnd, { passive: false });
    overlay.addEventListener('touchmove', drag, { passive: false });

    overlay.addEventListener('mousedown', dragStart);
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('mousemove', drag);

    // Update timer
    const updateTimer = () => {
        const now = Date.now();
        if (expiresAt > now) {
            const remaining = Math.ceil((expiresAt - now) / 1000);
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            overlay.textContent = `Unlock ${minutes}:${String(seconds).padStart(2, '0')}`;
            requestAnimationFrame(updateTimer);
        } else {
            overlay.remove();
            // Check if domain unlock still exists and expired
            chrome.storage.local.get({ domainUnlocks: {} }, (data) => {
                const currentDomain = window.location.hostname;
                const domainUnlock = data.domainUnlocks[currentDomain];
                if (!domainUnlock || Date.now() >= domainUnlock.unlockExpiresAt) {
                    checkAndBlock(); // Re-enable blocking
                }
            });
        }
    };
    updateTimer();
}

// Listen for updates to storage (though "Run once" is preferred, keeping this for real-time updates)
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && !window.location.href.includes("blocked.html")) {
        if (changes.strictKeywords) {
            strictKeywords = changes.strictKeywords.newValue.map(k => k.toLowerCase());
        }
        
        // Check for keyword bypass changes
        if (changes.keywordBypass) {
            chrome.runtime.sendMessage({ action: 'checkMyTabId' }, (response) => {
                if (response && response.tabId) {
                    const newBypass = changes.keywordBypass.newValue[response.tabId];
                    const oldBypass = changes.keywordBypass.oldValue[response.tabId];
                    
                    // Remove overlay if bypass expired or went to cooldown
                    if (oldBypass && oldBypass.active && (!newBypass || !newBypass.active)) {
                        const overlay = document.getElementById('kw-bypass-timer-overlay');
                        if (overlay) overlay.remove();
                        
                        // Reload page if bypass expired to trigger keyword block again
                        if (!newBypass || newBypass.cooldownUntil) {
                            window.location.reload();
                        }
                    }
                }
            });
        }
        
        // Check for emergency unlock changes
        if (changes.emergencyUnlock) {
            const eu = changes.emergencyUnlock.newValue;
            if (eu.active && Date.now() < eu.expiresAt) {
                chrome.runtime.sendMessage({ action: 'checkMyTabId' }, (response) => {
                    if (response && response.tabId === eu.tabId) {
                        showUnlockOverlay(eu.expiresAt);
                    }
                });
            } else if (changes.emergencyUnlock.oldValue && changes.emergencyUnlock.oldValue.active) {
                // Emergency unlock expired
                const overlay = document.getElementById('fb-unlock-overlay');
                if (overlay) overlay.remove();
                checkAndBlock();
            }
        }
        
        // Check for domain unlock changes
        if (changes.domainUnlocks) {
            const currentDomain = window.location.hostname;
            const newDomainUnlock = changes.domainUnlocks.newValue[currentDomain];
            const oldDomainUnlock = changes.domainUnlocks.oldValue?.[currentDomain];
            
            if (newDomainUnlock && newDomainUnlock.unlockExpiresAt && Date.now() < newDomainUnlock.unlockExpiresAt) {
                // Domain unlock activated or updated
                showDomainUnlockTimerOverlay(newDomainUnlock.unlockExpiresAt);
            } else if (oldDomainUnlock && oldDomainUnlock.unlockExpiresAt && (!newDomainUnlock || Date.now() >= newDomainUnlock.unlockExpiresAt)) {
                // Domain unlock expired
                const overlay = document.getElementById('domain-unlock-timer-overlay');
                if (overlay) overlay.remove();
                checkAndBlock();
            }
        }
        
        if (changes.strictKeywords) {
            checkAndBlock();
        }
    }
});

function checkAndBlock() {
    if (strictKeywords.length === 0) return;

    const pageUrl = window.location.href.toLowerCase();
    const pageTitle = document.title ? document.title.toLowerCase() : "";

    for (const keyword of strictKeywords) {
        // Enhanced regex: \bkeyword(s|es|ed|ing)?\b (Case-insensitive)
        // Handles: pineapple, pineapples, pineapples, pineappled, pineappling
        const regex = new RegExp(`\\b${escapeRegExp(keyword)}(s|es|ed|ing)?\\b`, 'i');

        if (regex.test(pageUrl) || regex.test(pageTitle)) {
            window.location.replace(chrome.runtime.getURL(`kw-blocked.html?kw=${encodeURIComponent(keyword)}&url=${encodeURIComponent(window.location.href)}`));
            return; // STOP further execution
        }
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
