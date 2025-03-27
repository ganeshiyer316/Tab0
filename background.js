// Initialize the extension when installed
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Tab Age Tracker extension installed');
  
  // Initialize storage with empty data
  const initialData = {
    tabData: {
      tabs: [],
      count: 0,
      lastUpdated: new Date().toISOString()
    },
    tabHistory: [],
    peakTabCount: 0,
    settings: {
      badgeDisplay: 'count',
      colorScheme: 'default',
      dataPeriod: '30',
      tabGoal: 20,
      enableReminders: true,
      notifyOldTabs: true,
      oldTabThreshold: 30, // days
      useServerDashboard: false,
      serverUrl: 'https://tab-age-tracker.replit.app'
    }
  };
  
  await chrome.storage.local.set(initialData);
  
  // Capture initial tab state - we'll distribute initial tabs across time periods
  await captureCurrentTabsWithDistribution();
  
  // Initialize badge
  updateExtensionBadge();
});

// Capture the current state of all tabs
async function captureCurrentTabs() {
  try {
    // Get all current tabs
    const tabs = await chrome.tabs.query({});
    
    // Get existing data
    const data = await chrome.storage.local.get(['tabData', 'tabHistory', 'peakTabCount']);
    
    let tabData = data.tabData || { tabs: [], lastUpdated: null };
    let tabHistory = data.tabHistory || [];
    let peakTabCount = data.peakTabCount || 0;
    
    // Process current tabs
    const now = new Date().toISOString();
    const processedTabs = tabs.map(tab => {
      // Try to find the tab in existing data to preserve creation time
      const existingTab = tabData.tabs.find(t => t.id === tab.id);
      
      return {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        createdAt: existingTab ? existingTab.createdAt : now
      };
    });
    
    // Update tab data
    const currentTabCount = tabs.length;
    const newPeakTabCount = Math.max(peakTabCount, currentTabCount);
    
    tabData = {
      tabs: processedTabs,
      count: currentTabCount,
      lastUpdated: now
    };
    
    // Update history if it's a new day
    const today = now.split('T')[0];
    
    const todayEntryIndex = tabHistory.findIndex(entry => entry.date === today);
    if (todayEntryIndex >= 0) {
      tabHistory[todayEntryIndex].count = currentTabCount;
    } else {
      tabHistory.push({
        date: today,
        count: currentTabCount
      });
    }
    
    // Keep only the last 30 days
    while (tabHistory.length > 30) {
      tabHistory.shift();
    }
    
    // Save to storage
    await chrome.storage.local.set({
      tabData,
      tabHistory,
      peakTabCount: newPeakTabCount
    });
  } catch (error) {
    console.error('Error capturing tabs:', error);
  }
}

// Listen for tab creation events
chrome.tabs.onCreated.addListener(async (tab) => {
  try {
    // Get existing data
    const data = await chrome.storage.local.get(['tabData', 'peakTabCount']);
    
    let tabData = data.tabData || { tabs: [], lastUpdated: null };
    let peakTabCount = data.peakTabCount || 0;
    
    // Add the new tab
    const now = new Date().toISOString();
    tabData.tabs.push({
      id: tab.id,
      url: tab.url || '',
      title: tab.title || 'New Tab',
      favIconUrl: tab.favIconUrl || '',
      createdAt: now
    });
    
    tabData.count = tabData.tabs.length;
    tabData.lastUpdated = now;
    
    // Update peak count if needed
    const newPeakTabCount = Math.max(peakTabCount, tabData.count);
    
    // Save to storage
    await chrome.storage.local.set({
      tabData,
      peakTabCount: newPeakTabCount
    });
  } catch (error) {
    console.error('Error handling new tab:', error);
  }
});

// Listen for tab removal events
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    // Get existing data
    const data = await chrome.storage.local.get(['tabData']);
    
    let tabData = data.tabData || { tabs: [], lastUpdated: null };
    
    // Remove the tab
    tabData.tabs = tabData.tabs.filter(tab => tab.id !== tabId);
    tabData.count = tabData.tabs.length;
    tabData.lastUpdated = new Date().toISOString();
    
    // Save to storage
    await chrome.storage.local.set({
      tabData
    });
  } catch (error) {
    console.error('Error handling tab removal:', error);
  }
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only process complete updates that change the URL
  if (changeInfo.status !== 'complete' && !changeInfo.url) {
    return;
  }
  
  try {
    // Get existing data
    const data = await chrome.storage.local.get(['tabData']);
    
    let tabData = data.tabData || { tabs: [], lastUpdated: null };
    
    // Find the tab
    const tabIndex = tabData.tabs.findIndex(t => t.id === tabId);
    
    if (tabIndex >= 0) {
      // Update the tab
      tabData.tabs[tabIndex] = {
        ...tabData.tabs[tabIndex],
        url: tab.url || tabData.tabs[tabIndex].url,
        title: tab.title || tabData.tabs[tabIndex].title,
        favIconUrl: tab.favIconUrl || tabData.tabs[tabIndex].favIconUrl
      };
    } else {
      // If the tab doesn't exist (shouldn't happen), add it
      tabData.tabs.push({
        id: tab.id,
        url: tab.url || '',
        title: tab.title || 'New Tab',
        favIconUrl: tab.favIconUrl || '',
        createdAt: new Date().toISOString()
      });
    }
    
    tabData.lastUpdated = new Date().toISOString();
    
    // Save to storage
    await chrome.storage.local.set({
      tabData
    });
  } catch (error) {
    console.error('Error handling tab update:', error);
  }
});

// Set up daily data capture
chrome.alarms.create('dailyCapture', {
  periodInMinutes: 60 * 24 // Once per day
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyCapture') {
    captureCurrentTabs();
    // Send data to the server for analytics and trend tracking
    syncDataWithServer();
  }
});

// Set up periodic refresh to keep data updated
chrome.alarms.create('refreshData', {
  periodInMinutes: 30 // Every 30 minutes
});

chrome.alarms.create('checkOldTabs', {
  periodInMinutes: 60 * 24 // Once per day
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refreshData') {
    captureCurrentTabs();
    updateExtensionBadge();
  } else if (alarm.name === 'checkOldTabs') {
    checkAndNotifyOldTabs();
  }
});

// Update the extension badge with current count or oldest tab
async function updateExtensionBadge() {
  try {
    const { tabData, settings } = await chrome.storage.local.get(['tabData', 'settings']);
    
    if (!tabData || !settings) return;
    
    const badgeType = settings.badgeDisplay || 'count';
    const tabs = tabData.tabs || [];
    
    if (badgeType === 'none') {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    
    if (badgeType === 'count') {
      chrome.action.setBadgeText({ text: tabs.length.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#3498db' });
      return;
    }
    
    if (badgeType === 'age' && tabs.length > 0) {
      // Find oldest tab
      const sortedTabs = [...tabs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      const oldestTab = sortedTabs[0];
      const createdAt = new Date(oldestTab.createdAt);
      const now = new Date();
      const ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
      
      chrome.action.setBadgeText({ text: ageInDays.toString() });
      
      // Color based on age
      let color = '#2ecc71'; // Green for new tabs
      if (ageInDays > 30) {
        color = '#e74c3c'; // Red for old tabs
      } else if (ageInDays > 7) {
        color = '#f39c12'; // Orange for medium-old tabs
      }
      
      chrome.action.setBadgeBackgroundColor({ color });
    }
  } catch (error) {
    console.error('Error updating badge:', error);
  }
}

// Check for old tabs and send notifications if enabled
async function checkAndNotifyOldTabs() {
  try {
    const { tabData, settings } = await chrome.storage.local.get(['tabData', 'settings']);
    
    if (!tabData || !settings || !settings.notifyOldTabs) return;
    
    const tabs = tabData.tabs || [];
    const threshold = settings.oldTabThreshold || 30; // Default 30 days
    const now = new Date();
    
    // Find tabs older than the threshold
    const oldTabs = tabs.filter(tab => {
      const createdAt = new Date(tab.createdAt);
      const ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
      return ageInDays >= threshold;
    });
    
    if (oldTabs.length > 0) {
      // Sort by age (oldest first)
      oldTabs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      
      // Get the oldest tab info for a more detailed message
      const oldestTab = oldTabs[0];
      const createdAt = new Date(oldestTab.createdAt);
      const ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
      
      // Create a more informative notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.svg',
        title: 'Old Tabs Detected',
        message: `You have ${oldTabs.length} tabs that are older than ${threshold} days. The oldest tab "${oldestTab.title.substring(0, 30)}${oldestTab.title.length > 30 ? '...' : ''}" is ${ageInDays} days old.`,
        contextMessage: 'Click "View Details" to see and manage your old tabs',
        buttons: [
          { title: 'View Details' }
        ],
        priority: 1
      });
    }
  } catch (error) {
    console.error('Error checking old tabs:', error);
  }
}

// Listen for notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    // Open the details page
    chrome.tabs.create({ url: 'options.html#details' });
  }
});

// Capture current tabs with distribution across age categories
// This is only used at initial installation to provide more meaningful data
async function captureCurrentTabsWithDistribution() {
  try {
    // Get all current tabs
    const tabs = await chrome.tabs.query({});
    
    // Get existing data
    const data = await chrome.storage.local.get(['tabData', 'tabHistory', 'peakTabCount']);
    
    let tabData = data.tabData || { tabs: [], lastUpdated: null };
    let tabHistory = data.tabHistory || [];
    let peakTabCount = data.peakTabCount || 0;
    
    // Process current tabs using more intelligent creation time assignment
    const now = new Date();
    const processedTabs = tabs.map((tab) => {
      // For initial tabs, we'll use heuristics to assign more realistic creation dates
      let createdAt;
      
      // First try to extract dates from URL or title for specific patterns
      // Check for date patterns in URL (like /2024/01/ or /2024-01-01/ or month names)
      const datePatterns = [
        { regex: /\/(20\d{2})[\/\-_](\d{1,2})[\/\-_](\d{1,2})\//, groups: [1, 2, 3] }, // /2024/01/01/
        { regex: /\/(20\d{2})[\-\/]?(\d{1,2})[\-\/]?(\d{1,2})/, groups: [1, 2, 3] },   // /2024-01-01
        { regex: /\/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\/\-_](20\d{2})/, // /jan-2024/
          process: (match) => {
            const months = {jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, 
                           jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11};
            return new Date(parseInt(match[2]), months[match[1].toLowerCase()], 15);
          }
        }
      ];
      
      // Try each pattern
      let dateFound = false;
      for (const pattern of datePatterns) {
        const urlMatch = tab.url.toLowerCase().match(pattern.regex);
        if (urlMatch) {
          if (pattern.process) {
            // Custom processing function
            createdAt = pattern.process(urlMatch);
          } else {
            // Standard group extraction
            const year = parseInt(urlMatch[pattern.groups[0]]);
            const month = parseInt(urlMatch[pattern.groups[1]]) - 1; // JS months are 0-indexed
            const day = parseInt(urlMatch[pattern.groups[2]]);
            createdAt = new Date(year, month, day);
          }
          
          // Verify the date is valid and in the past
          if (!isNaN(createdAt) && createdAt < now) {
            dateFound = true;
            break;
          }
        }
      }
      
      // Check for year/month keywords in title if no date found in URL
      if (!dateFound) {
        // Look for specific cases like "Things we learned in 2024"
        const yearTitleMatch = tab.title.match(/(20\d{2})/);
        if (yearTitleMatch && tab.title.toLowerCase().includes('learn')) {
          const year = parseInt(yearTitleMatch[1]);
          // Assume it's from December of that year
          createdAt = new Date(year, 11, 15); // December 15th of that year
          dateFound = true;
        }
      }
      
      // If we still don't have a date, use tab ID as a proxy for age
      if (!dateFound) {
        // Use tab ID - generally, lower IDs are older tabs
        // Find the lowest and highest tab IDs to create a relative scale
        const tabIds = tabs.map(t => t.id);
        const minTabId = Math.min(...tabIds);
        const maxTabId = Math.max(...tabIds);
        const range = maxTabId - minTabId;
        
        if (range > 0) {
          // Scale the tab's position in the ID range to days (newer tabs = higher IDs)
          const relativeAge = (tab.id - minTabId) / range;
          const maxAgeDays = 90; // Maximum age in days (3 months)
          // Older tabs (lower IDs) get older dates
          const estimatedAgeDays = Math.floor((1 - relativeAge) * maxAgeDays);
          createdAt = new Date(now.getTime() - estimatedAgeDays * 24 * 60 * 60 * 1000);
        } else {
          // Fallback if all tab IDs are the same (unlikely)
          createdAt = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)); // Default to 1 week old
        }
      }
      
      return {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        createdAt: createdAt.toISOString()
      };
    });
    
    // Update tab data
    const currentTabCount = tabs.length;
    const newPeakTabCount = Math.max(peakTabCount, currentTabCount);
    
    tabData = {
      tabs: processedTabs,
      count: currentTabCount,
      lastUpdated: now.toISOString()
    };
    
    // Update history
    const today = now.toISOString().split('T')[0];
    
    const todayEntryIndex = tabHistory.findIndex(entry => entry.date === today);
    if (todayEntryIndex >= 0) {
      tabHistory[todayEntryIndex].count = currentTabCount;
    } else {
      tabHistory.push({
        date: today,
        count: currentTabCount
      });
    }
    
    // Keep only the last 30 days
    while (tabHistory.length > 30) {
      tabHistory.shift();
    }
    
    // Save to storage
    await chrome.storage.local.set({
      tabData,
      tabHistory,
      peakTabCount: newPeakTabCount
    });
    
    console.log('Initialized tabs with distributed creation times');
  } catch (error) {
    console.error('Error capturing tabs with distribution:', error);
    // Fall back to regular capture if there's an error
    await captureCurrentTabs();
  }
}

// Sync data with the server for long-term analysis
async function syncDataWithServer() {
  try {
    // Get current data
    const data = await chrome.storage.local.get(['tabData', 'tabHistory', 'peakTabCount', 'settings']);
    
    // Get settings
    const settings = data.settings || {};
    
    // Only sync if the server dashboard is enabled
    if (!settings.useServerDashboard) {
      console.log('Server dashboard sync is disabled in settings');
      return;
    }
    
    // Create the request data
    const requestData = {
      tabData: data.tabData,
      tabHistory: data.tabHistory,
      peakTabCount: data.peakTabCount
    };
    
    // Get the web dashboard URL from settings or use a default
    const serverUrl = settings.serverUrl || 'https://tab-age-tracker.replit.app';
    
    // Send the data to the server
    const response = await fetch(`${serverUrl}/api/import-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    if (response.ok) {
      console.log('Data successfully synced with server');
    } else {
      console.error('Failed to sync data with server:', await response.text());
    }
  } catch (error) {
    console.error('Error syncing data with server:', error);
  }
}

// Listen for messages from other parts of the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateBadge') {
    updateExtensionBadge();
  } else if (message.action === 'checkOldTabs') {
    checkAndNotifyOldTabs();
    sendResponse({ success: true });
  } else if (message.action === 'syncData') {
    syncDataWithServer();
    sendResponse({ success: true });
  }
});
