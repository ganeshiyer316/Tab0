// TabSearch - Background Service Worker
// 100% local, no external calls, no tracking

// Initialize extension on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('TabSearch installed');

  // Initialize storage with default settings
  const initialData = {
    tabs: {},
    settings: {
      oldTabThreshold: 30,
      notificationsEnabled: true,
      badgeDisplay: 'count'
    }
  };

  await chrome.storage.local.set(initialData);

  // Capture all existing tabs
  await captureExistingTabs();

  // Update badge
  await updateBadge();

  // Set up daily alarm for old tab check
  chrome.alarms.create('checkOldTabs', {
    periodInMinutes: 60 * 24 // Once per day
  });
});

// Capture existing tabs at install time
async function captureExistingTabs() {
  try {
    const allTabs = await chrome.tabs.query({});
    const tabsData = {};

    for (const tab of allTabs) {
      if (tab.url && !tab.url.startsWith('chrome://')) {
        tabsData[tab.id] = {
          url: tab.url,
          title: tab.title || 'Untitled',
          domain: extractDomain(tab.url),
          favIconUrl: tab.favIconUrl || '',
          createdAt: new Date().toISOString(),
          isVerified: false // Pre-existing tabs have unverified age
        };
      }
    }

    await chrome.storage.local.set({ tabs: tabsData });
    console.log(`Captured ${Object.keys(tabsData).length} existing tabs`);
  } catch (error) {
    console.error('Error capturing existing tabs:', error);
  }
}

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

// Listen for new tabs
chrome.tabs.onCreated.addListener(async (tab) => {
  try {
    const { tabs } = await chrome.storage.local.get(['tabs']);
    const tabsData = tabs || {};

    tabsData[tab.id] = {
      url: tab.url || '',
      title: tab.title || 'New Tab',
      domain: tab.url ? extractDomain(tab.url) : 'unknown',
      favIconUrl: tab.favIconUrl || '',
      createdAt: new Date().toISOString(),
      isVerified: true // New tabs have verified creation time
    };

    await chrome.storage.local.set({ tabs: tabsData });
    await updateBadge();
  } catch (error) {
    console.error('Error tracking new tab:', error);
  }
});

// Listen for tab updates (URL/title changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only process when loading is complete or URL changes
  if (changeInfo.status !== 'complete' && !changeInfo.url) {
    return;
  }

  try {
    const { tabs } = await chrome.storage.local.get(['tabs']);
    const tabsData = tabs || {};

    if (tabsData[tabId]) {
      // Update existing tab, preserve creation time
      tabsData[tabId] = {
        ...tabsData[tabId],
        url: tab.url || tabsData[tabId].url,
        title: tab.title || tabsData[tabId].title,
        domain: tab.url ? extractDomain(tab.url) : tabsData[tabId].domain,
        favIconUrl: tab.favIconUrl || tabsData[tabId].favIconUrl
      };
    } else if (tab.url && !tab.url.startsWith('chrome://')) {
      // New tab we haven't seen
      tabsData[tabId] = {
        url: tab.url,
        title: tab.title || 'Untitled',
        domain: extractDomain(tab.url),
        favIconUrl: tab.favIconUrl || '',
        createdAt: new Date().toISOString(),
        isVerified: true
      };
    }

    await chrome.storage.local.set({ tabs: tabsData });
  } catch (error) {
    console.error('Error updating tab:', error);
  }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const { tabs } = await chrome.storage.local.get(['tabs']);
    const tabsData = tabs || {};

    delete tabsData[tabId];

    await chrome.storage.local.set({ tabs: tabsData });
    await updateBadge();
  } catch (error) {
    console.error('Error removing tab:', error);
  }
});

// Update extension badge
async function updateBadge() {
  try {
    const allTabs = await chrome.tabs.query({});
    const count = allTabs.length;

    const { settings } = await chrome.storage.local.get(['settings']);
    const badgeDisplay = settings?.badgeDisplay || 'count';

    if (badgeDisplay === 'none') {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }

    if (badgeDisplay === 'duplicates') {
      const duplicateCount = await countDuplicates();
      if (duplicateCount > 0) {
        await chrome.action.setBadgeText({ text: duplicateCount.toString() });
        await chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
      } else {
        await chrome.action.setBadgeText({ text: count.toString() });
        await chrome.action.setBadgeBackgroundColor({ color: '#3498db' });
      }
      return;
    }

    // Default: show count
    await chrome.action.setBadgeText({ text: count.toString() });
    await chrome.action.setBadgeBackgroundColor({ color: '#3498db' });
  } catch (error) {
    console.error('Error updating badge:', error);
  }
}

// Count duplicate tabs
async function countDuplicates() {
  try {
    const allTabs = await chrome.tabs.query({});
    const urlCounts = {};

    for (const tab of allTabs) {
      if (tab.url && !tab.url.startsWith('chrome://')) {
        const normalizedUrl = normalizeUrl(tab.url);
        urlCounts[normalizedUrl] = (urlCounts[normalizedUrl] || 0) + 1;
      }
    }

    let duplicateCount = 0;
    for (const count of Object.values(urlCounts)) {
      if (count > 1) {
        duplicateCount += count - 1; // Count extra copies
      }
    }

    return duplicateCount;
  } catch (error) {
    console.error('Error counting duplicates:', error);
    return 0;
  }
}

// Normalize URL for duplicate detection (remove trailing slashes, fragments)
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    // Remove fragment and trailing slash
    let normalized = urlObj.origin + urlObj.pathname.replace(/\/$/, '') + urlObj.search;
    return normalized.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkOldTabs') {
    await checkAndNotifyOldTabs();
  }
});

// Check for old tabs and send notification
async function checkAndNotifyOldTabs() {
  try {
    const { tabs, settings } = await chrome.storage.local.get(['tabs', 'settings']);

    if (!settings?.notificationsEnabled) {
      return;
    }

    const threshold = settings?.oldTabThreshold || 30;
    const now = new Date();
    const thresholdMs = threshold * 24 * 60 * 60 * 1000;

    let oldTabCount = 0;

    for (const tabData of Object.values(tabs || {})) {
      if (tabData.createdAt && tabData.isVerified) {
        const age = now - new Date(tabData.createdAt);
        if (age >= thresholdMs) {
          oldTabCount++;
        }
      }
    }

    if (oldTabCount > 0) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Old Tabs Detected',
        message: `You have ${oldTabCount} tab${oldTabCount > 1 ? 's' : ''} older than ${threshold} days. Click the TabSearch icon to review.`,
        priority: 1
      });
    }
  } catch (error) {
    console.error('Error checking old tabs:', error);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateBadge') {
    updateBadge().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'checkOldTabs') {
    checkAndNotifyOldTabs().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'getTabData') {
    chrome.storage.local.get(['tabs']).then((data) => {
      sendResponse({ tabs: data.tabs || {} });
    });
    return true;
  }
});

// Update badge periodically
chrome.alarms.create('updateBadge', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'updateBadge') {
    updateBadge();
  }
});
