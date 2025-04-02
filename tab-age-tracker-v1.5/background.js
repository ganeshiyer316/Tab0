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
      // Try to find the tab in existing data to preserve creation time and verification status
      const existingTab = tabData.tabs.find(t => t.id === tab.id);
      
      if (existingTab) {
        // Preserve existing tab's creation time and verification status
        return {
          id: tab.id,
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
          createdAt: existingTab.createdAt,
          isVerified: existingTab.isVerified !== undefined ? existingTab.isVerified : false
        };
      } else {
        // New tab we haven't seen before (rare case during normal operation, might occur if background page reloaded)
        return {
          id: tab.id,
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
          createdAt: now,
          isVerified: true // New tabs created after extension installation are always verified
        };
      }
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
    
    // Add the new tab with verified creation date
    const now = new Date().toISOString();
    tabData.tabs.push({
      id: tab.id,
      url: tab.url || '',
      title: tab.title || 'New Tab',
      favIconUrl: tab.favIconUrl || '',
      createdAt: now,
      isVerified: true // Mark that this is a verified creation date
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
      // Update the tab while preserving creation date and verification status
      tabData.tabs[tabIndex] = {
        ...tabData.tabs[tabIndex],
        url: tab.url || tabData.tabs[tabIndex].url,
        title: tab.title || tabData.tabs[tabIndex].title,
        favIconUrl: tab.favIconUrl || tabData.tabs[tabIndex].favIconUrl
        // isVerified and createdAt are preserved from the existing tab object
      };
    } else {
      // If the tab doesn't exist (shouldn't happen), add it as a new tab with verified date
      // This is a fallback, should rarely occur except for programmatically created tabs
      const now = new Date().toISOString();
      tabData.tabs.push({
        id: tab.id,
        url: tab.url || '',
        title: tab.title || 'New Tab',
        favIconUrl: tab.favIconUrl || '',
        createdAt: now,
        isVerified: true // Mark as verified since it's a new tab we're tracking from creation
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
      // First try to find tabs with verified creation dates
      const verifiedTabs = tabs.filter(tab => 
        tab.createdAt && (!tab.hasOwnProperty('isVerified') || tab.isVerified)
      );
      
      // Then try to find tabs with dates that can be extracted from URLs
      const tabsWithExtractableDates = tabs.filter(tab => {
        if (verifiedTabs.includes(tab)) return false; // Don't duplicate tabs that already have creation dates
        return tab.url && extractDateFromURL(tab.url) !== null;
      });
      
      if (verifiedTabs.length === 0 && tabsWithExtractableDates.length === 0) {
        // If no tabs have any date information, show a placeholder badge
        chrome.action.setBadgeText({ text: '?' });
        chrome.action.setBadgeBackgroundColor({ color: '#95a5a6' }); // Gray for unknown
        return;
      }
      
      let oldestTab, oldestDate, ageInDays;
      
      if (verifiedTabs.length > 0) {
        // First, check verified tabs with creation dates
        const sortedVerifiedTabs = [...verifiedTabs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        oldestTab = sortedVerifiedTabs[0];
        oldestDate = new Date(oldestTab.createdAt);
      }
      
      if (tabsWithExtractableDates.length > 0) {
        // Then check tabs with extractable dates from URLs
        const sortedExtractableTabs = [...tabsWithExtractableDates].sort((a, b) => {
          const dateA = extractDateFromURL(a.url);
          const dateB = extractDateFromURL(b.url);
          return dateA - dateB;
        });
        
        const oldestExtractableTab = sortedExtractableTabs[0];
        const oldestExtractableDate = extractDateFromURL(oldestExtractableTab.url);
        
        // Compare with the verified tabs' oldest date
        if (!oldestDate || oldestExtractableDate < oldestDate) {
          oldestTab = oldestExtractableTab;
          oldestDate = oldestExtractableDate;
        }
      }
      
      // Calculate age in days
      const now = new Date();
      ageInDays = Math.floor((now - oldestDate) / (1000 * 60 * 60 * 24));
      
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
    
    // Find tabs older than the threshold (using both creation dates and URL dates)
    const oldTabs = tabs.filter(tab => {
      // First check the creation date
      if (tab.createdAt && (tab.isVerified === undefined || tab.isVerified === true)) {
        const createdAt = new Date(tab.createdAt);
        const ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
        if (ageInDays >= threshold) {
          return true;
        }
      }
      
      // If no valid creation date, try to extract from URL
      if (tab.url) {
        const extractedDate = extractDateFromURL(tab.url);
        if (extractedDate) {
          const ageInDays = Math.floor((now - extractedDate) / (1000 * 60 * 60 * 24));
          return ageInDays >= threshold;
        }
      }
      
      // If no creation date and URL doesn't contain a date, skip the tab
      return false;
    });
    
    if (oldTabs.length > 0) {
      // Sort by age (oldest first)
      oldTabs.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : extractDateFromURL(a.url);
        const dateB = b.createdAt ? new Date(b.createdAt) : extractDateFromURL(b.url);
        
        // If both dates are valid, compare them
        if (dateA && dateB) {
          return dateA - dateB;
        }
        
        // If only one date is valid, that tab is considered "older"
        if (dateA) return -1;
        if (dateB) return 1;
        
        // If neither has a valid date, they're equal
        return 0;
      });
      
      // Get the oldest tab info for a more detailed message
      const oldestTab = oldTabs[0];
      let ageInDays;
      let ageSource;
      
      if (oldestTab.createdAt) {
        const createdAt = new Date(oldestTab.createdAt);
        ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
        ageSource = "tracking data";
      } else {
        const extractedDate = extractDateFromURL(oldestTab.url);
        ageInDays = Math.floor((now - extractedDate) / (1000 * 60 * 60 * 24));
        ageSource = "URL date";
      }
      
      // Create a more informative notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.svg',
        title: 'Old Tabs Detected',
        message: `You have ${oldTabs.length} tabs that are older than ${threshold} days. The oldest tab "${oldestTab.title.substring(0, 30)}${oldestTab.title.length > 30 ? '...' : ''}" is ${ageInDays} days old (based on ${ageSource}).`,
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

// Helper function to extract date from URLs
function extractDateFromURL(url) {
  if (!url) return null;
  
  try {
    // Pattern: /YYYY/MM/DD/ (e.g., /2024/04/02/)
    const slashPattern = /\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//;
    const slashMatch = url.match(slashPattern);
    if (slashMatch) {
      const [_, year, month, day] = slashMatch;
      const extractedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(extractedDate.getTime())) {
        return extractedDate;
      }
    }
    
    // Pattern: /YYYY-MM-DD/ or ?date=YYYY-MM-DD
    const dashPattern = /[\/\?].*?(\d{4}-\d{1,2}-\d{1,2})/;
    const dashMatch = url.match(dashPattern);
    if (dashMatch) {
      const dateStr = dashMatch[1];
      const extractedDate = new Date(dateStr);
      if (!isNaN(extractedDate.getTime())) {
        return extractedDate;
      }
    }
    
    // Pattern: publication dates for news sites (common formats)
    const pubDatePattern = /published[=\/](\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i;
    const pubMatch = url.match(pubDatePattern);
    if (pubMatch) {
      const dateStr = pubMatch[1];
      // Try dash format (YYYY-MM-DD)
      if (dateStr.includes('-')) {
        const extractedDate = new Date(dateStr);
        if (!isNaN(extractedDate.getTime())) {
          return extractedDate;
        }
      } else {
        // Try slash format (YYYY/MM/DD)
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const extractedDate = new Date(
            parseInt(parts[0]), 
            parseInt(parts[1]) - 1, 
            parseInt(parts[2])
          );
          if (!isNaN(extractedDate.getTime())) {
            return extractedDate;
          }
        }
      }
    }
    
    return null;
  } catch (e) {
    console.error("Error extracting date from URL:", e);
    return null;
  }
}

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
    
    // Process current tabs - all pre-existing tabs will have unknown creation time for 100% accuracy
    const now = new Date();
    const processedTabs = tabs.map((tab) => {
      // For pre-existing tabs at install time, try to extract date from URL first
      const extractedDate = extractDateFromURL(tab.url);
      
      // Attempt a more aggressive URL date extraction if simple method fails
      let createdAt = null;
      if (extractedDate) {
        createdAt = extractedDate.toISOString();
        console.log(`Date extracted from URL for ${tab.title}: ${createdAt}`);
      } else {
        // Try additional patterns for URL date extraction (done in utils.js now)
        console.log(`No date extracted from URL for ${tab.title}`);
      }
      
      return {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        createdAt: createdAt, // Use URL date or null if not found
        isVerified: false // Flag to indicate this is not a verified date
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
