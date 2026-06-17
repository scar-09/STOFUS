let bypassTimeoutId = null;

window.addEventListener('beforeunload', () => {
    if (bypassTimeoutId !== null) {
        clearTimeout(bypassTimeoutId);
        bypassTimeoutId = null;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const matchedKeywordEl = document.getElementById('matchedKeyword');
    const goBackBtn = document.getElementById('goBackBtn');
    const closeBtn = document.getElementById('closeBtn');
    const unintentionalBtn = document.getElementById('unintentionalBtn');

    // Parse keyword from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const kwMatch = urlParams.get('kw');

    if (kwMatch) {
        matchedKeywordEl.textContent = kwMatch;
    } else {
        matchedKeywordEl.textContent = 'a restricted keyword';
    }

    // Disable buttons until tab reference is confirmed
    closeBtn.disabled = true;
    document.getElementById('confirmNah').disabled = true;
    document.getElementById('confirmYep').disabled = true;

    // Cache current tab reference
    let currentTab = null;
    chrome.tabs.getCurrent((tab) => {
        currentTab = tab;
        closeBtn.disabled = false;
        document.getElementById('confirmNah').disabled = false;
        document.getElementById('confirmYep').disabled = false;

        if (tab) {
            chrome.storage.local.get({ keywordBypass: {} }, (data) => {
                const bypass = data.keywordBypass[tab.id] || {};
                updateBypassButton(bypass);
            });
        }
    });

    // Button actions
    goBackBtn.addEventListener('click', () => {
        window.history.back();
    });

    closeBtn.addEventListener('click', () => {
        if (currentTab) chrome.tabs.remove(currentTab.id);
    });

    // Unintentional bypass button
    unintentionalBtn.addEventListener('click', () => {
        const confirmPopup = document.getElementById('confirmPopup');
        const blockedKeywordSpan = document.getElementById('blockedKeyword');
        
        // Set the keyword in the popup message
        blockedKeywordSpan.textContent = kwMatch || 'a restricted keyword';
        
        // Show the confirmation popup
        confirmPopup.style.display = 'flex';
    });

    // Yep button - proceed with bypass
    document.getElementById('confirmYep').addEventListener('click', () => {
        if (!currentTab) return;
        const confirmPopup = document.getElementById('confirmPopup');
        confirmPopup.style.display = 'none';
        
        const now = Date.now();
        const bypass = {
            active: true,
            startTime: now,
            expiresAt: now + (3 * 60 * 1000), // 3 minutes
            tabId: currentTab.id,
            url: currentTab.url,
            keyword: kwMatch
        };

        chrome.storage.local.get({ keywordBypass: {} }, (data) => {
            const allBypasses = data.keywordBypass || {};
            allBypasses[currentTab.id] = bypass;
            
            chrome.storage.local.set({ keywordBypass: allBypasses }, () => {
                // Create alarm for bypass expiration
                chrome.runtime.sendMessage({
                    action: 'createKeywordBypassAlarm',
                    tabId: currentTab.id,
                    expiresAt: bypass.expiresAt
                });
                
                // Get the original URL before the block page
                const urlParams = new URLSearchParams(window.location.search);
                let originalUrl = urlParams.get('url');
                if (!originalUrl || originalUrl.includes('kw-blocked.html')) {
                    chrome.tabs.getCurrent(t => { if (t) chrome.tabs.remove(t.id); });
                    return;
                }
                
                // Redirect to original URL
                if ((!originalUrl.startsWith('http://') && !originalUrl.startsWith('https://')) || originalUrl.startsWith('chrome-extension://')) {
                    chrome.tabs.getCurrent(t => { if (t) chrome.tabs.remove(t.id); });
                    return;
                }
                window.location.href = originalUrl;
            });
        });
    });

    // Nah button - close tab
    document.getElementById('confirmNah').addEventListener('click', () => {
        if (currentTab) chrome.tabs.remove(currentTab.id);
    });
});

// Listen for storage changes to update button in real-time
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.keywordBypass) {
        if (!changes.keywordBypass.newValue) return;
        chrome.tabs.getCurrent((tab) => {
            if (tab) {
                const bypass = changes.keywordBypass.newValue[tab.id] || {};
                updateBypassButton(bypass);
            }
        });
    }
});

function updateBypassButton(bypass) {
    const btn = document.getElementById('unintentionalBtn');
    const now = Date.now();

    if (bypass.active && now < bypass.expiresAt) {
        // Bypass is active - show countdown
        const remaining = Math.ceil((bypass.expiresAt - now) / 1000);
        btn.textContent = `[BYPASS ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}]`;
        btn.disabled = true;
        
        // Update countdown every second
        if (bypassTimeoutId !== null) clearTimeout(bypassTimeoutId);
        bypassTimeoutId = setTimeout(() => {
            chrome.tabs.getCurrent((tab) => {
                if (tab) {
                    chrome.storage.local.get({ keywordBypass: {} }, (data) => {
                        const freshBypass = (data.keywordBypass || {})[tab.id] || {};
                        updateBypassButton(freshBypass);
                    });
                }
            });
        }, 1000);
    } else if (bypass.cooldownUntil && now < bypass.cooldownUntil) {
        // Cooldown is active - show cooldown
        const remaining = Math.ceil((bypass.cooldownUntil - now) / 1000);
        btn.textContent = `[COOLDOWN ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}]`;
        btn.disabled = true;
        
        // Update countdown every second
        if (bypassTimeoutId !== null) clearTimeout(bypassTimeoutId);
        bypassTimeoutId = setTimeout(() => {
            chrome.tabs.getCurrent((tab) => {
                if (tab) {
                    chrome.storage.local.get({ keywordBypass: {} }, (data) => {
                        const freshBypass = (data.keywordBypass || {})[tab.id] || {};
                        updateBypassButton(freshBypass);
                    });
                }
            });
        }, 1000);
    } else {
        // No active bypass or cooldown
        btn.textContent = 'Unintentional?';
        btn.disabled = false;
    }
}
