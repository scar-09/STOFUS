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

    // Check bypass state
    chrome.tabs.getCurrent((tab) => {
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
        chrome.tabs.getCurrent(tab => chrome.tabs.remove(tab.id));
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
        const confirmPopup = document.getElementById('confirmPopup');
        confirmPopup.style.display = 'none';
        
        chrome.tabs.getCurrent((tab) => {
            if (tab) {
                const now = Date.now();
                const bypass = {
                    active: true,
                    startTime: now,
                    expiresAt: now + (3 * 60 * 1000), // 3 minutes
                    tabId: tab.id,
                    url: tab.url
                };

                chrome.storage.local.get({ keywordBypass: {} }, (data) => {
                    const allBypasses = data.keywordBypass || {};
                    allBypasses[tab.id] = bypass;
                    
                    chrome.storage.local.set({ keywordBypass: allBypasses }, () => {
                        // Create alarm for bypass expiration
                        chrome.runtime.sendMessage({
                            action: 'createKeywordBypassAlarm',
                            tabId: tab.id,
                            expiresAt: bypass.expiresAt
                        });
                        
                        // Get the original URL before the block page
                        const urlParams = new URLSearchParams(window.location.search);
                        const originalUrl = urlParams.get('url') || tab.url;
                        
                        // Redirect to original URL
                        window.location.href = originalUrl;
                    });
                });
            }
        });
    });

    // Nah button - close tab
    document.getElementById('confirmNah').addEventListener('click', () => {
        chrome.tabs.getCurrent(tab => chrome.tabs.remove(tab.id));
    });
});

// Listen for storage changes to update button in real-time
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.keywordBypass) {
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
        btn.textContent = `Bypass Active (${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')})`;
        btn.disabled = true;
        
        // Update countdown every second
        setTimeout(() => updateBypassButton(bypass), 1000);
    } else if (bypass.cooldownUntil && now < bypass.cooldownUntil) {
        // Cooldown is active - show cooldown
        const remaining = Math.ceil((bypass.cooldownUntil - now) / 1000);
        btn.textContent = `Cooldown (${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')})`;
        btn.disabled = true;
        
        // Update countdown every second
        setTimeout(() => updateBypassButton(bypass), 1000);
    } else {
        // No active bypass or cooldown
        btn.textContent = 'Unintentional?';
        btn.disabled = false;
    }
}
