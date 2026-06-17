let strictKeywords = [];

// Prevent loop on the block page
if (window.location.href.startsWith(chrome.runtime.getURL('')) || window.location.href.includes("kw-blocked.html")) {
    // Stop execution for this script on our own pages
} else {
    // Load config on init
    chrome.storage.local.get({ 
        strictKeywords: [],
        keywordBypass: {}
    }, (data) => {
        strictKeywords = data.strictKeywords.map(k => k.toLowerCase());
        
        // Check keyword bypass first
        chrome.runtime.sendMessage({ action: 'checkMyTabId' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('chrome.runtime.sendMessage error:', chrome.runtime.lastError);
            }
            if (response && response.tabId) {
                const bypass = data.keywordBypass[response.tabId];
                const now = Date.now();
                
                if (bypass && bypass.active && now < bypass.expiresAt) {
                    // Keyword bypass is active - show timer overlay and skip filtering
                    showBypassTimerOverlay(bypass.expiresAt);
                    return; // ALLOW: Keyword bypass active for this tab
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
    if (document.body) {
        document.body.appendChild(overlay);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            document.body.appendChild(overlay);
        });
    }

    // Make it draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    let bypassInterval = null;

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

    const onTouchStart = dragStart;
    const onTouchEnd = dragEnd;
    const onTouchMove = drag;
    const onMouseDown = dragStart;
    const onMouseUp = dragEnd;
    const onMouseMove = drag;

    overlay.addEventListener('touchstart', onTouchStart, false);
    overlay.addEventListener('touchend', onTouchEnd, false);
    overlay.addEventListener('touchmove', onTouchMove, false);
    overlay.addEventListener('mousedown', onMouseDown, false);
    document.addEventListener('mouseup', onMouseUp, false);
    document.addEventListener('mousemove', onMouseMove, false);

    const cleanup = () => {
        overlay.removeEventListener('touchstart', onTouchStart, false);
        overlay.removeEventListener('touchend', onTouchEnd, false);
        overlay.removeEventListener('touchmove', onTouchMove, false);
        overlay.removeEventListener('mousedown', onMouseDown, false);
        document.removeEventListener('mouseup', onMouseUp, false);
        document.removeEventListener('mousemove', onMouseMove, false);
        window.removeEventListener('beforeunload', cleanup);
        if (bypassInterval !== null) {
            clearInterval(bypassInterval);
            bypassInterval = null;
        }
    };

    window.addEventListener('beforeunload', cleanup);

    bypassInterval = setInterval(() => {
        const now = Date.now();
        if (now < expiresAt) {
            const remaining = Math.ceil((expiresAt - now) / 1000);
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            overlay.textContent = `Bypass ${minutes}:${String(seconds).padStart(2, '0')}`;
        } else {
            cleanup();
            // Reload page to trigger keyword block again
            window.location.reload();
        }
    }, 1000);
}



// Listen for updates to storage (though "Run once" is preferred, keeping this for real-time updates)
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && !window.location.href.includes("blocked.html") && !window.location.href.includes("kw-blocked.html")) {
        if (changes.strictKeywords) {
            strictKeywords = changes.strictKeywords.newValue.map(k => k.toLowerCase());
        }
        
        // Check for keyword bypass changes
        if (changes.keywordBypass) {
            chrome.runtime.sendMessage({ action: 'checkMyTabId' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('chrome.runtime.sendMessage error:', chrome.runtime.lastError);
                }
                if (response && response.tabId) {
                    const newBypass = (changes.keywordBypass.newValue || {})[response.tabId];
                    const oldBypass = (changes.keywordBypass.oldValue || {})[response.tabId];
                    
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
        
        if (changes.strictKeywords) {
            chrome.runtime.sendMessage({ action: 'checkMyTabId' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('chrome.runtime.sendMessage error:', chrome.runtime.lastError);
                }
                if (response && response.tabId) {
                    chrome.storage.local.get({ keywordBypass: {} }, (data) => {
                        const bypass = (data.keywordBypass || {})[response.tabId];
                        const now = Date.now();
                        if (!(bypass && bypass.active && now < bypass.expiresAt)) {
                            checkAndBlock();
                        }
                    });
                } else {
                    checkAndBlock();
                }
            });
        }
    }
});

function checkAndBlock() {
    if (strictKeywords.length === 0) return;

    const pageUrl = window.location.href.toLowerCase();
    const pageTitle = document.title ? document.title.toLowerCase() : "";

    for (const keyword of strictKeywords) {
        // Match keyword with optional plural 's' to avoid false positives
        // like "cares" matching keyword "car" via the 'es' alternative
        const regex = new RegExp(`\\b${escapeRegExp(keyword)}s?\\b`, 'i');

        if (regex.test(pageUrl) || regex.test(pageTitle)) {
            // Track keyword attempt
            chrome.storage.local.get({ dailyAttempts: {} }, (data) => {
                const todayStr = new Date().toISOString().split('T')[0];
                const dailyAttempts = data.dailyAttempts || {};
                if (!dailyAttempts[todayStr]) dailyAttempts[todayStr] = {};
                if (!dailyAttempts[todayStr].keywords) dailyAttempts[todayStr].keywords = {};
                dailyAttempts[todayStr].keywords[keyword] = (dailyAttempts[todayStr].keywords[keyword] || 0) + 1;
                chrome.storage.local.set({ dailyAttempts: dailyAttempts });
            });
            window.location.replace(chrome.runtime.getURL(`kw-blocked.html?kw=${encodeURIComponent(keyword)}&url=${encodeURIComponent(window.location.href)}`));
            return; // STOP further execution
        }
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
