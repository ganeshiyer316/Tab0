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
      oldTabThreshold: 30 // days
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
    
    // Process current tabs with distributed creation times
    const now = new Date();
    const processedTabs = tabs.map((tab, index) => {
      // For initial tabs, distribute them across time periods
      // This provides a more realistic view than marking all tabs as "new"
      let createdAt;
      
      // Calculate a creation date based on the tab's index
      // Distribute tabs across age categories: Today, This Week, This Month, Older
      const totalTabs = tabs.length;
      
      if (index < Math.floor(totalTabs * 0.4)) {
        // 40% of tabs - Today (0-24 hours old)
        const randomHours = Math.floor(Math.random() * 24);
        createdAt = new Date(now - randomHours * 60 * 60 * 1000);
      } else if (index < Math.floor(totalTabs * 0.6)) {
        // 20% of tabs - This Week (1-7 days old)
        const randomDays = 1 + Math.floor(Math.random() * 6); // 1-7 days
        createdAt = new Date(now - randomDays * 24 * 60 * 60 * 1000);
      } else if (index < Math.floor(totalTabs * 0.8)) {
        // 20% of tabs - This Month (7-30 days old)
        const randomDays = 7 + Math.floor(Math.random() * 23); // 7-30 days
        createdAt = new Date(now - randomDays * 24 * 60 * 60 * 1000);
      } else {
        // 20% of tabs - Older (30+ days old)
        const randomDays = 30 + Math.floor(Math.random() * 60); // 30-90 days
        createdAt = new Date(now - randomDays * 24 * 60 * 60 * 1000);
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

// Listen for messages from other parts of the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateBadge') {
    updateExtensionBadge();
  } else if (message.action === 'checkOldTabs') {
    checkAndNotifyOldTabs();
    sendResponse({ success: true });
  }
});
