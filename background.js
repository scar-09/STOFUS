// Track recent blocks to prevent duplicate counting
const recentBlocks = new Map();
// Track recent checks to prevent redundant storage reads (Category C)
const lastChecks = new Map();

function checkAndBlock(tabId, urlString) {
    try {
        const url = new URL(urlString);
        if (!url.protocol.startsWith('http')) return;

        let hostname = url.hostname;
        if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
        }

        const checkKey = `${tabId}-${urlString}`;
        const now = Date.now();

        // Category C: Prevent redundant checks within 750ms for the exact same URL/Tab
        if (lastChecks.has(checkKey) && (now - lastChecks.get(checkKey) < 750)) {
            return;
        }
        lastChecks.set(checkKey, now);

        // Clean up lastChecks periodically (older than 30 seconds), not on every call
        if (lastChecks.size > 100) {
            for (const [key, timestamp] of lastChecks.entries()) {
                if (now - timestamp > 30000) lastChecks.delete(key);
            }
        }

        // Deduplication: check if we recently blocked this same tab+hostname
        const blockKey = `${tabId}-${hostname}`;
        if (recentBlocks.has(blockKey) && (now - recentBlocks.get(blockKey) < 2000)) {
            return; // Skip if we blocked this same tab+hostname within last 2 seconds
        }

        chrome.storage.local.get({ 
            blockedSites: []
        }, (data) => {
            const callbackNow = Date.now();
            const sites = data.blockedSites;

            if (!sites || sites.length === 0) return;
            let hasExpiredSites = false;
            const activeSites = [];
            
            let isTimerBlock = false;
            let isScheduleBlock = false;
            let blockTypeForUrl = 'timer'; // Default

            const date = new Date(callbackNow);
            const currentMins = date.getHours() * 60 + date.getMinutes();

            sites.forEach(site => {
                let isActive = false;

                if (site.type === 'schedule') {
                    activeSites.push(site); // Schedule sites don't expire from the list
                    
                    if (!site.startTime || !site.endTime) return;
                    const [sh, sm] = site.startTime.split(':').map(Number);
                    const [eh, em] = site.endTime.split(':').map(Number);
                    const startMins = sh * 60 + sm;
                    const endMins = eh * 60 + em;
                    
                    if (startMins < endMins) {
                        isActive = currentMins >= startMins && currentMins < endMins;
                    } else {
                        isActive = currentMins >= startMins || currentMins < endMins;
                    }

                } else {
                    if (callbackNow < site.expiryTimestamp) {
                        activeSites.push(site);
                        isActive = true;
                    } else {
                        hasExpiredSites = true;
                    }
                }
                
                if (isActive) {
                    // Domain Match including wildcard
                    const sUrl = site.url;
                    let isMatch = false;
                    
                    if (sUrl.startsWith('*.')) {
                        const baseDomain = sUrl.substring(2);
                        if (hostname === baseDomain || hostname.endsWith('.' + baseDomain)) {
                            isMatch = true;
                        }
                    } else if (hostname === sUrl || hostname.endsWith('.' + sUrl)) {
                        isMatch = true;
                    }
                    
                    if (isMatch) {
                        if (site.type === 'schedule') {
                            isScheduleBlock = true;
                            blockTypeForUrl = 'schedule';
                        } else {
                            isTimerBlock = true;
                            blockTypeForUrl = 'timer';
                        }
                    }
                }
            });

            let shouldBlock = false;
            if (isTimerBlock) {
                // Strict timer block - no bypass allowed
                shouldBlock = true;
            } else if (isScheduleBlock) {
                // Schedule block - bypass allowed
                shouldBlock = true;
            }

            if (hasExpiredSites) {
                chrome.storage.local.set({ blockedSites: activeSites });
            }

            if (shouldBlock) {
                // Record this block to prevent duplicate counting
                recentBlocks.set(blockKey, callbackNow);
                
                // Clean up old entries (older than 10 seconds)
                for (const [key, timestamp] of recentBlocks.entries()) {
                    if (callbackNow - timestamp > 10000) {
                        recentBlocks.delete(key);
                    }
                }
                
                // Track blocked attempt
                chrome.storage.local.get({ stats: {}, dailyAttempts: {} }, (data) => {
                    const stats = data.stats || { attemptsBlocked: 0, lastBreakTime: null, dailyFocusCompleted: {} };
                    stats.attemptsBlocked = (stats.attemptsBlocked || 0) + 1;

                    // Track per-site daily attempt
                    const todayStr = new Date().toISOString().split('T')[0];
                    let dailyAttempts = data.dailyAttempts || {};
                    if (!dailyAttempts[todayStr]) dailyAttempts[todayStr] = {};
                    if (!dailyAttempts[todayStr].sites) dailyAttempts[todayStr].sites = {};
                    dailyAttempts[todayStr].sites[hostname] = (dailyAttempts[todayStr].sites[hostname] || 0) + 1;

                    chrome.storage.local.set({ stats: stats, dailyAttempts: dailyAttempts });
                });
                
                try {
                    chrome.tabs.update(tabId, { url: chrome.runtime.getURL(`blocked.html?site=${encodeURIComponent(hostname)}&type=${blockTypeForUrl}&url=${encodeURIComponent(urlString)}`) });
                } catch (e) {
                    console.error('Stofus: Error updating tab:', e);
                }
            }
        });
    } catch (e) {
        console.error('Stofus: Error in checkAndBlock:', e);
    }
}

// Listen to ALL Navigation to catch 'Back' and 'Forward' buttons
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) { // Main frame only
        checkAndBlock(details.tabId, details.url);
    }
});

// Keep tabs.onUpdated as a fallback
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url) {
        checkAndBlock(tabId, tab.url);
    }
});



// Periodic cleanup - consolidated single alarm listener
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cleanupAlarm') {
        chrome.storage.local.get({ 
            blockedSites: [], 
            stats: null
        }, (data) => {
            const now = Date.now();
            
            const sites = data.blockedSites;
            if (!sites) return;

            const currentActiveSites = [];
            let hasExpiredSites = false;
            let newlyExpiredMinutes = 0;
            let upd = {};

            sites.forEach(s => {
                if (s.type === 'schedule') {
                    if (!s.startTime || !s.endTime) return;
                    currentActiveSites.push(s);
                } else {
                    if (now < s.expiryTimestamp) {
                        currentActiveSites.push(s);
                    } else {
                        hasExpiredSites = true;
                        // Calculate duration from durationMs or fallback to expiry difference
                        let dura = s.durationMs || 0;
                        if (dura === 0 && s.expiryTimestamp) {
                            dura = 60000;
                        }
                        if (dura > 0) {
                            newlyExpiredMinutes += Math.round(dura / 60000);
                        }
                    }
                }
            });
            
            if (hasExpiredSites) upd.blockedSites = currentActiveSites;
            
            // Update stats
            if (newlyExpiredMinutes > 0) {
                const todayStr = new Date().toISOString().split('T')[0];
                
                let stats = data.stats ? { ...data.stats } : { 
                    attemptsBlocked: 0, lastBreakTime: null, dailyFocusCompleted: {},
                    focusTimeMinutes: 0, streakCount: 0, lastStreakDate: ''
                };
                
                stats.focusTimeMinutes = (stats.focusTimeMinutes || 0) + newlyExpiredMinutes;
                
                if (!stats.dailyFocusCompleted) stats.dailyFocusCompleted = {};
                stats.dailyFocusCompleted[todayStr] = true;
                
                // Update Streak
                if (stats.lastStreakDate !== todayStr) {
                    const yesterday = new Date(now - 86400000).toISOString().split('T')[0];
                    if (stats.lastStreakDate === yesterday || !stats.streakCount) {
                        stats.streakCount = (stats.streakCount || 0) + 1;
                    } else if (stats.lastStreakDate) {
                        stats.streakCount = 1;
                    }
                    stats.lastStreakDate = todayStr;
                }
                
                upd.stats = stats;
            }

            if (Object.keys(upd).length > 0) {
                chrome.storage.local.set(upd);
            }
        });
    } else if (alarm.name.startsWith('keywordBypassExpire_')) {
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
                    tabId: tabId,
                    keyword: bypass.keyword
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
    }
});

chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create('cleanupAlarm', { periodInMinutes: 1 });
});
chrome.runtime.onInstalled.addListener((details) => {
    chrome.alarms.create('cleanupAlarm', { periodInMinutes: 1 });
    if (details.reason === 'install') {
        chrome.tabs.create({ url: 'welcome.html' });
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.blockedSites) {
        chrome.storage.local.get({ 
            focusSession: null
        }, (data) => {
            const now = Date.now();
            const date = new Date(now);
            const currentMins = date.getHours() * 60 + date.getMinutes();
            const allSites = changes.blockedSites.newValue || [];
            
            // Filter active sites: timer blocks check expiry, schedule blocks check time window
            const activeSites = allSites.filter(s => {
                if (s.type === 'schedule') {
                    const [sh, sm] = (s.startTime || '00:00').split(':').map(Number);
                    const [eh, em] = (s.endTime || '00:00').split(':').map(Number);
                    const startMins = sh * 60 + sm;
                    const endMins = eh * 60 + em;
                    if (startMins < endMins) {
                        return currentMins >= startMins && currentMins < endMins;
                    } else {
                        return currentMins >= startMins || currentMins < endMins;
                    }
                }
                return now < s.expiryTimestamp;
            });
            
            let upd = {};

            if (activeSites.length > 0) {
                // Track focus session - only create if no session exists
                if (data.focusSession == null) {
                    // Calculate max duration: timer blocks use durationMs, schedule blocks use schedule window
                    let maxDurationMs = 0;
                    for (const site of activeSites) {
                        if (site.type === 'schedule') {
                            const [sh, sm] = (site.startTime || '00:00').split(':').map(Number);
                            const [eh, em] = (site.endTime || '00:00').split(':').map(Number);
                            const startMins = sh * 60 + sm;
                            const endMins = eh * 60 + em;
                            let windowMins;
                            if (startMins < endMins) {
                                windowMins = endMins - startMins;
                            } else {
                                windowMins = (endMins + 24 * 60) - startMins;
                            }
                            maxDurationMs = Math.max(maxDurationMs, windowMins * 60 * 1000);
                        } else {
                            maxDurationMs = Math.max(maxDurationMs, site.durationMs || 0);
                        }
                    }
                    const focusSession = {
                        startTime: now,
                        duration: Math.round(maxDurationMs / 60000)
                    };
                    upd.focusSession = focusSession;
                }
            } else {
                // No active focus session
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

// Listener for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
});
