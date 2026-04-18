// Track recent blocks to prevent duplicate counting
const recentBlocks = new Map();

function checkAndBlock(tabId, urlString) {
    try {
        const url = new URL(urlString);
        if (!url.protocol.startsWith('http')) return;

        let hostname = url.hostname;
        if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
        }

        // Deduplication: check if we recently blocked this same tab+hostname
        const blockKey = `${tabId}-${hostname}`;
        const now = Date.now();
        if (recentBlocks.has(blockKey) && (now - recentBlocks.get(blockKey) < 2000)) {
            return; // Skip if we blocked this same tab+hostname within last 2 seconds
        }

            chrome.storage.local.get({ 
                blockedSites: [], 
                bypassSites: [], 
                stats_focusTimeMinutes: 0, 
                stats_attempts: 0, 
                stats_history: {}, 
                streak_count: 0, 
                last_streak_date: '',
                emergencyUnlock: { active: false, tabId: null, expiresAt: null, sessionId: null, usedInSession: false, cooldownUntil: null },
                domainUnlocks: {}
            }, (data) => {
            const sites = data.blockedSites;
            
            // ✅ EMERGENCY UNLOCK BYPASS (CRITICAL: MUST BE FIRST)
            const eu = data.emergencyUnlock;
            if (eu.active && tabId === eu.tabId) {
                if (Date.now() < eu.expiresAt) {
                    return; // ALLOW: Active emergency unlock for this tab
                } else {
                    // Deactivate expired unlock
                    chrome.storage.local.set({ 
                        emergencyUnlock: { ...eu, active: false, tabId: null, expiresAt: null }
                    });
                }
            }

            // Check domain-based unlock
            const domainUnlocks = data.domainUnlocks || {};
            const domainUnlock = domainUnlocks[hostname];
            if (domainUnlock && domainUnlock.unlockExpiresAt && Date.now() < domainUnlock.unlockExpiresAt) {
                return; // ALLOW: Domain unlock active for this domain
            }

            if (!sites || sites.length === 0) return;

            const now = Date.now();
            let hasExpiredSites = false;
            const activeSites = [];
            let shouldBlock = false;

            sites.forEach(site => {
                if (now < site.expiryTimestamp) {
                    activeSites.push(site);
                    
                    // Domain Match including wildcard
                    const sUrl = site.url;
                    let isMatch = false;
                    
                    if (sUrl.startsWith('*.')) {
                        const baseDomain = sUrl.substring(2);
                        if (hostname === baseDomain || hostname.endsWith('.' + baseDomain)) {
                            isMatch = true;
                        }
                    } else if (hostname === sUrl || hostname.endsWith('.' + sUrl)) { // keeping the relaxed subdomains for non wildcard too? Actually prompt says don't break existing exact-match. The existing code uses `endsWith('.' + site.url)`. Wait, existing code had exactly that.
                        isMatch = true;
                    }
                    
                    if (isMatch) {
                        shouldBlock = true;
                    }
                } else {
                    hasExpiredSites = true;
                }
            });

            // Check if there is an active bypass
            if (shouldBlock && data.bypassSites) {
                const bypass = data.bypassSites.find(b => b.url === hostname || hostname.endsWith('.' + b.url));
                if (bypass && now < bypass.expiryTimestamp) {
                    shouldBlock = false; // Bypass overrides block
                }
            }

            if (hasExpiredSites) {
                chrome.storage.local.set({ blockedSites: activeSites });
            }

            if (shouldBlock) {
                // Record this block to prevent duplicate counting
                recentBlocks.set(blockKey, now);
                
                // Clean up old entries (older than 10 seconds)
                for (const [key, timestamp] of recentBlocks.entries()) {
                    if (now - timestamp > 10000) {
                        recentBlocks.delete(key);
                    }
                }
                
                // Track blocked attempt
                chrome.storage.local.get({ stats: {} }, (data) => {
                    const stats = data.stats || { attemptsBlocked: 0, lastBreakTime: null, emergencyUsedToday: 0, dailyFocusCompleted: {} };
                    stats.attemptsBlocked = (stats.attemptsBlocked || 0) + 1;
                    chrome.storage.local.set({ stats: stats });
                });
                
                chrome.tabs.update(tabId, { url: chrome.runtime.getURL(`blocked.html?site=${hostname}`) });
            }
        });
    } catch (e) { }
}

// Listen to ALL Navigation to catch 'Back' and 'Forward' buttons
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) { // Main frame only
        checkAndBlock(details.tabId, details.url);
    }
});

chrome.history.onVisited.addListener((historyItem) => {
    // We don't have tabId here easily, but we can query active tabs with this URL
    chrome.tabs.query({ url: historyItem.url }, (tabs) => {
        tabs.forEach(tab => {
            checkAndBlock(tab.id, tab.url);
        });
    });
});

// Keep tabs.onUpdated as a fallback
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url) {
        checkAndBlock(tabId, tab.url);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.get({ emergencyUnlock: {} }, (data) => {
        const eu = data.emergencyUnlock;
        if (eu.active && eu.tabId === tabId) {
            chrome.storage.local.set({ 
                emergencyUnlock: { ...eu, active: false, tabId: null, expiresAt: null }
            });
            chrome.alarms.clear('emergencyUnlockExpire');
        }
    });
});

// Periodic cleanup
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'emergencyUnlockExpire') {
        chrome.storage.local.get({ emergencyUnlock: {} }, (data) => {
            const eu = data.emergencyUnlock;
            const now = Date.now();
            const COOLDOWN_MIN = 60; // 60 minutes (1 hour)
            
            if (eu.tabId) {
                chrome.tabs.reload(eu.tabId, () => {
                    if (chrome.runtime.lastError) { /* tab might be closed */ }
                });
            }
            
            // Set cooldown when unlock expires
            const cooldownUntil = now + (COOLDOWN_MIN * 60 * 1000);
            chrome.storage.local.set({ 
                emergencyUnlock: { ...eu, active: false, tabId: null, expiresAt: null, cooldownUntil: cooldownUntil }
            });
        });
    }

    if (alarm.name === 'cleanupAlarm') {
        chrome.storage.local.get({ 
            blockedSites: [], bypassSites: [], 
            stats_focusTimeMinutes: 0, stats_history: {}, streak_count: 0, last_streak_date: ''
        }, (data) => {
            const now = Date.now();
            
            const sites = data.blockedSites;
            if (!sites) return;

            const currentActiveSites = [];
            let hasExpiredSites = false;
            let newlyExpiredMinutes = 0;
            let upd = {};

            sites.forEach(s => {
                if (now < s.expiryTimestamp) {
                    currentActiveSites.push(s);
                } else {
                    hasExpiredSites = true;
                    // Calculate duration from durationMs or fallback to expiry difference
                    let dura = s.durationMs || 0;
                    if (dura === 0 && s.expiryTimestamp) {
                        // Fallback: estimate duration from expiry timestamp if not stored
                        // This handles legacy sites without durationMs
                        dura = 60000; // Default to 1 minute if we can't determine
                    }
                    if (dura > 0) {
                        newlyExpiredMinutes += Math.round(dura / 60000);
                    }
                }
            });
            
            // Clean up bypasses too
            let hasExpiredBypass = false;
            const activeBypass = data.bypassSites.filter(b => {
                if (now < b.expiryTimestamp) return true;
                hasExpiredBypass = true;
                return false;
            });

            if (hasExpiredSites) upd.blockedSites = currentActiveSites;
            if (hasExpiredBypass) upd.bypassSites = activeBypass;
            
            // Update stats
            if (newlyExpiredMinutes > 0) {
                const todayStr = new Date().toISOString().split('T')[0];
                
                upd.stats_focusTimeMinutes = data.stats_focusTimeMinutes + newlyExpiredMinutes;
                
                let hist = { ...data.stats_history };
                if (!hist[todayStr]) hist[todayStr] = { focusTime: 0, attempts: 0 };
                hist[todayStr].focusTime += newlyExpiredMinutes;
                upd.stats_history = hist;
                
                // Update new metrics - mark today as focus completed
                let stats = { ...data.stats };
                if (!stats) stats = { attemptsBlocked: 0, lastBreakTime: null, emergencyUsedToday: 0, dailyFocusCompleted: {} };
                if (!stats.dailyFocusCompleted) stats.dailyFocusCompleted = {};
                stats.dailyFocusCompleted[todayStr] = true;
                upd.stats = stats;
                
                // Update Streak
                if (data.last_streak_date !== todayStr) {
                    const yesterday = new Date(now - 86400000).toISOString().split('T')[0];
                    if (data.last_streak_date === yesterday || data.streak_count === 0) {
                        upd.streak_count = data.streak_count + 1;
                    } else if (data.last_streak_date !== '') { // Broken streak
                        upd.streak_count = 1; 
                    }
                    upd.last_streak_date = todayStr;
                }
            }

            if (Object.keys(upd).length > 0) {
                chrome.storage.local.set(upd);
            }
        });
    }
});

chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create('cleanupAlarm', { periodInMinutes: 1 });
    
    // Restore/Clean emergency unlock
    chrome.storage.local.get({ emergencyUnlock: {} }, (data) => {
        const eu = data.emergencyUnlock;
        if (eu.active && eu.expiresAt) {
            if (Date.now() >= eu.expiresAt) {
                chrome.storage.local.set({ 
                    emergencyUnlock: { ...eu, active: false, tabId: null, expiresAt: null }
                });
            } else {
                chrome.alarms.create('emergencyUnlockExpire', { when: eu.expiresAt });
            }
        }
    });
});
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('cleanupAlarm', { periodInMinutes: 1 });
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.blockedSites) {
        chrome.storage.local.get({ 
            emergencyUnlock: { active: false, tabId: null, expiresAt: null, sessionId: null, usedInSession: false, cooldownUntil: null },
            focusSession: null
        }, (data) => {
            const now = Date.now();
            const activeSites = (changes.blockedSites.newValue || []).filter(s => now < s.expiryTimestamp);
            let eu = data.emergencyUnlock;
            let upd = {};

            if (activeSites.length > 0) {
                // Focus session is active
                if (!eu.sessionId) {
                    // New session starts
                    eu.sessionId = 'sess_' + now;
                    eu.usedInSession = false;
                    upd.emergencyUnlock = eu;
                }
                
                // Track focus session
                if (!data.focusSession) {
                    const longestDuration = Math.max(...activeSites.map(s => s.durationMs || 0));
                    const focusSession = {
                        startTime: now,
                        duration: Math.round(longestDuration / 60000) // Convert to minutes
                    };
                    upd.focusSession = focusSession;
                }
            } else {
                // No active focus session
                if (eu.sessionId) {
                    eu.sessionId = null;
                    eu.usedInSession = false;
                    eu.active = false;
                    eu.tabId = null;
                    eu.expiresAt = null;
                    upd.emergencyUnlock = eu;
                    chrome.alarms.clear('emergencyUnlockExpire');
                }
                
                // Clear focus session
                if (data.focusSession) {
                    upd.focusSession = null;
                }
            }

            if (Object.keys(upd).length > 0) {
                chrome.storage.local.set(upd);
            }
        });
    }
});

// Keyword bypass alarm handler
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith('keywordBypassExpire_')) {
        const tabId = parseInt(alarm.name.split('_')[1]);
        chrome.storage.local.get({ keywordBypass: {} }, (data) => {
            const allBypasses = data.keywordBypass || {};
            const bypass = allBypasses[tabId];
            
            if (bypass && bypass.active) {
                // Bypass expired - start cooldown
                const now = Date.now();
                allBypasses[tabId] = {
                    active: false,
                    cooldownUntil: now + (45 * 60 * 1000), // 45 minutes cooldown
                    tabId: tabId
                };
                
                chrome.storage.local.set({ keywordBypass: allBypasses });
                
                // Clear cooldown alarm after cooldown period
                chrome.alarms.create(`keywordBypassCooldown_${tabId}`, { 
                    when: now + (45 * 60 * 1000) 
                });
            }
        });
    } else if (alarm.name.startsWith('keywordBypassCooldown_')) {
        const tabId = parseInt(alarm.name.split('_')[1]);
        chrome.storage.local.get({ keywordBypass: {} }, (data) => {
            const allBypasses = data.keywordBypass || {};
            
            // Clear the bypass entry after cooldown
            delete allBypasses[tabId];
            chrome.storage.local.set({ keywordBypass: allBypasses });
        });
    } else if (alarm.name === 'domainUnlockCleanup') {
        cleanupExpiredDomainUnlocks();
    }
});

// Listener for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'nukeTab' && sender.tab) {
        let hostname = '';
        try { hostname = new URL(sender.tab.url).hostname.replace(/^www\./, ''); } catch (e) { }
        chrome.tabs.update(sender.tab.id, { url: chrome.runtime.getURL(`blocked.html?site=${hostname}`) });
    }

    if (request.action === 'checkMyTabId' && sender.tab) {
        sendResponse({ tabId: sender.tab.id });
        return;
    }

    if (request.action === 'createKeywordBypassAlarm' && request.tabId && request.expiresAt) {
        chrome.alarms.create(`keywordBypassExpire_${request.tabId}`, { 
            when: request.expiresAt 
        });
        sendResponse({ success: true });
        return;
    }

    if (request.action === 'activateEmergencyUnlock' && sender.tab) {
        const DURATION_SEC = 120; // 2 minutes
        const COOLDOWN_MIN = 60;   // 60 minutes (1 hour)
        
        chrome.storage.local.get({ 
            emergencyUnlock: { active: false, tabId: null, expiresAt: null, sessionId: null, usedInSession: false, cooldownUntil: null }
        }, (data) => {
            const eu = data.emergencyUnlock;
            const now = Date.now();
            
            // Validation
            if (eu.active) return sendResponse({ success: false, reason: 'Already active' });
            if (eu.cooldownUntil && now < eu.cooldownUntil) return sendResponse({ success: false, reason: 'In cooldown' });
            if (eu.usedInSession) return sendResponse({ success: false, reason: 'Already used in this session' });

            const expiresAt = now + (DURATION_SEC * 1000);
            
            const newState = {
                active: true,
                tabId: sender.tab.id,
                expiresAt: expiresAt,
                sessionId: eu.sessionId,
                usedInSession: true,
                cooldownUntil: null // Cooldown will be set when unlock expires
            };

            try {
                chrome.storage.local.set({ emergencyUnlock: newState }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Emergency Unlock storage write failed", chrome.runtime.lastError);
                    return sendResponse({ success: false, reason: 'Storage failure' });
                }
                chrome.alarms.create('emergencyUnlockExpire', { when: expiresAt });
                
                // Track emergency unlock usage
                chrome.storage.local.get({ stats: {} }, (data) => {
                    const stats = data.stats || { attemptsBlocked: 0, lastBreakTime: null, emergencyUsedToday: 0, dailyFocusCompleted: {} };
                    const todayStr = new Date().toISOString().split('T')[0];
                    
                    // Reset emergency used count if it's a new day
                    if (stats.emergencyUsedDate !== todayStr) {
                        stats.emergencyUsedToday = 0;
                        stats.emergencyUsedDate = todayStr;
                    }
                    
                    stats.emergencyUsedToday = (stats.emergencyUsedToday || 0) + 1;
                    stats.lastBreakTime = Date.now();
                    
                    chrome.storage.local.set({ stats: stats });
                });
                
                sendResponse({ success: true, expiresAt: expiresAt });
            });
            } catch (e) {
                console.error("Emergency Unlock failed", e);
                sendResponse({ success: false, reason: 'Internal error' });
            }
        });
        return true; // async response
    }
});

// Clean up expired domain unlocks
function cleanupExpiredDomainUnlocks() {
    chrome.storage.local.get({ domainUnlocks: {} }, (data) => {
        const domainUnlocks = data.domainUnlocks || {};
        const now = Date.now();
        let hasChanges = false;
        
        for (const [domain, unlock] of Object.entries(domainUnlocks)) {
            if (unlock.unlockExpiresAt && now >= unlock.unlockExpiresAt) {
                delete domainUnlocks[domain];
                hasChanges = true;
            }
        }
        
        if (hasChanges) {
            chrome.storage.local.set({ domainUnlocks: domainUnlocks });
        }
    });
}

// Run cleanup every 30 seconds
chrome.alarms.create('domainUnlockCleanup', { periodInMinutes: 0.5 });
