document.addEventListener('DOMContentLoaded', async () => {
  // Get references to DOM elements
  const tabCountElement = document.getElementById('tabCount');
  const todayCountElement = document.getElementById('todayCount');
  const weekCountElement = document.getElementById('weekCount');
  const monthCountElement = document.getElementById('monthCount');
  const olderCountElement = document.getElementById('olderCount');
  const progressBarElement = document.getElementById('progressBar');
  const progressPercentElement = document.getElementById('progressPercent');
  const peakTabsElement = document.getElementById('peakTabs');
  
  const viewDetailsButton = document.getElementById('viewDetails');
  const openOptionsButton = document.getElementById('openOptions');

  // Load the latest tab data
  const tabData = await loadTabData();
  
  // Update the UI with the tab data
  updateTabCounts(tabData);
  updateProgressBar(tabData);
  
  // Initialize charts
  initAgeDistributionChart(tabData);
  initTrendChart(tabData);
  
  // Set up event listeners
  viewDetailsButton.addEventListener('click', openDetailView);
  openOptionsButton.addEventListener('click', openOptionsPage);
  document.getElementById('checkOldTabs').addEventListener('click', checkForOldTabs);
  
  // Update the data (this will gather fresh data and update storage)
  await updateTabData();
});

async function loadTabData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tabData', 'tabHistory', 'peakTabCount'], (result) => {
      const tabData = result.tabData || { tabs: [], lastUpdated: null };
      const tabHistory = result.tabHistory || [];
      const peakTabCount = result.peakTabCount || 0;
      
      resolve({
        tabData,
        tabHistory,
        peakTabCount
      });
    });
  });
}

async function updateTabData() {
  // Get all current tabs
  const tabs = await new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      resolve(tabs);
    });
  });
  
  // Get existing data
  const { tabData: existingData, tabHistory, peakTabCount } = await loadTabData();
  
  // Process current tabs
  const processedTabs = tabs.map(tab => {
    // Try to find the tab in existing data to preserve creation time
    const existingTab = existingData.tabs.find(t => t.id === tab.id);
    
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      createdAt: existingTab ? existingTab.createdAt : new Date().toISOString()
    };
  });
  
  // Update our tab data
  const currentTabCount = tabs.length;
  const newPeakTabCount = Math.max(peakTabCount, currentTabCount);
  
  const newTabData = {
    tabs: processedTabs,
    count: currentTabCount,
    lastUpdated: new Date().toISOString()
  };
  
  // Update the history record (once per day)
  const today = new Date().toISOString().split('T')[0];
  const updatedHistory = [...tabHistory];
  
  const todayEntryIndex = updatedHistory.findIndex(entry => entry.date === today);
  if (todayEntryIndex >= 0) {
    updatedHistory[todayEntryIndex].count = currentTabCount;
  } else {
    updatedHistory.push({
      date: today,
      count: currentTabCount
    });
  }
  
  // Keep only the last 30 days
  while (updatedHistory.length > 30) {
    updatedHistory.shift();
  }
  
  // Save to storage
  await new Promise((resolve) => {
    chrome.storage.local.set({
      tabData: newTabData,
      tabHistory: updatedHistory,
      peakTabCount: newPeakTabCount
    }, resolve);
  });
  
  // Update the UI
  updateTabCounts({ tabData: newTabData, tabHistory: updatedHistory, peakTabCount: newPeakTabCount });
  updateProgressBar({ tabData: newTabData, peakTabCount: newPeakTabCount });
  
  // Update charts
  initAgeDistributionChart({ tabData: newTabData });
  initTrendChart({ tabHistory: updatedHistory });
  
  // Update badge
  chrome.runtime.sendMessage({ action: 'updateBadge' });
  
  return newTabData;
}

function updateTabCounts(data) {
  const { tabData } = data;
  const tabs = tabData.tabs || [];
  
  // Count tabs by age
  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const oneWeek = 7 * oneDay;
  const oneMonth = 30 * oneDay;
  
  let todayCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  let olderCount = 0;
  
  tabs.forEach(tab => {
    const createdAt = new Date(tab.createdAt);
    const age = now - createdAt;
    
    if (age < oneDay) {
      todayCount++;
    } else if (age < oneWeek) {
      weekCount++;
    } else if (age < oneMonth) {
      monthCount++;
    } else {
      olderCount++;
    }
  });
  
  // Update UI elements
  document.getElementById('tabCount').textContent = tabs.length;
  document.getElementById('todayCount').textContent = todayCount;
  document.getElementById('weekCount').textContent = weekCount;
  document.getElementById('monthCount').textContent = monthCount;
  document.getElementById('olderCount').textContent = olderCount;
}

function updateProgressBar(data) {
  const { tabData, peakTabCount } = data;
  const currentCount = tabData.tabs?.length || 0;
  
  // Calculate progress as percentage of reduction from peak
  const progressPercent = peakTabCount === 0 ? 100 : Math.max(0, Math.min(100, ((peakTabCount - currentCount) / peakTabCount) * 100));
  
  // Update UI elements
  document.getElementById('progressBar').style.width = `${progressPercent}%`;
  document.getElementById('progressPercent').textContent = `${Math.round(progressPercent)}%`;
  document.getElementById('peakTabs').textContent = peakTabCount;
}

function initAgeDistributionChart(data) {
  const { tabData } = data;
  const tabs = tabData.tabs || [];
  
  // Prepare data for the chart
  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const oneWeek = 7 * oneDay;
  const oneMonth = 30 * oneDay;
  
  let todayCount = 0;
  let weekCount = 0; 
  let monthCount = 0;
  let olderCount = 0;
  
  tabs.forEach(tab => {
    const createdAt = new Date(tab.createdAt);
    const age = now - createdAt;
    
    if (age < oneDay) {
      todayCount++;
    } else if (age < oneWeek) {
      weekCount++;
    } else if (age < oneMonth) {
      monthCount++;
    } else {
      olderCount++;
    }
  });
  
  // Create or update the chart
  const ctx = document.getElementById('ageDistributionChart').getContext('2d');
  
  // Check if chart already exists
  if (window.ageDistributionChart) {
    window.ageDistributionChart.data.datasets[0].data = [todayCount, weekCount, monthCount, olderCount];
    window.ageDistributionChart.update();
  } else {
    window.ageDistributionChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Today', 'This Week', 'This Month', 'Older'],
        datasets: [{
          data: [todayCount, weekCount, monthCount, olderCount],
          backgroundColor: ['#2ecc71', '#3498db', '#f39c12', '#e74c3c'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 10
            }
          },
          title: {
            display: true,
            text: 'Tab Age Distribution',
            font: {
              size: 14
            }
          }
        },
        cutout: '50%'
      }
    });
  }
}

function initTrendChart(data) {
  const { tabHistory = [] } = data;
  
  // Prepare data for the chart
  const labels = [];
  const counts = [];
  
  // Sort by date and get the last 14 days
  const sortedHistory = [...tabHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
  const recentHistory = sortedHistory.slice(-14);
  
  recentHistory.forEach(entry => {
    // Format the date to be more readable (MM/DD)
    const date = new Date(entry.date);
    const formattedDate = `${date.getMonth() + 1}/${date.getDate()}`;
    
    labels.push(formattedDate);
    counts.push(entry.count);
  });
  
  // Create or update the chart
  const ctx = document.getElementById('trendChart').getContext('2d');
  
  // Check if chart already exists
  if (window.trendChart) {
    window.trendChart.data.labels = labels;
    window.trendChart.data.datasets[0].data = counts;
    window.trendChart.update();
  } else {
    window.trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Tab Count',
          data: counts,
          backgroundColor: 'rgba(52, 152, 219, 0.2)',
          borderColor: 'rgba(52, 152, 219, 1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Tab Count Trend',
            font: {
              size: 14
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0
            }
          }
        }
      }
    });
  }
}

function openDetailView() {
  chrome.tabs.create({ url: 'options.html#details' });
}

function openOptionsPage() {
  chrome.runtime.openOptionsPage();
}

// Function to check for old tabs
function checkForOldTabs() {
  // Show a loading state on the button
  const button = document.getElementById('checkOldTabs');
  const originalText = button.textContent;
  button.textContent = 'Checking...';
  button.disabled = true;
  
  // Send message to background script to check for old tabs
  chrome.runtime.sendMessage({ action: 'checkOldTabs' }, (response) => {
    // Reset button
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 1000);
    
    // Show notification in popup
    showNotification('Checking for old tabs... If any are found, you will receive a notification.');
  });
}

// Function to show a notification in the popup
function showNotification(message) {
  // Create notification element if it doesn't exist
  let notification = document.querySelector('.popup-notification');
  
  if (!notification) {
    notification = document.createElement('div');
    notification.className = 'popup-notification';
    document.querySelector('.container').appendChild(notification);
    
    // Add style for the notification
    const style = document.createElement('style');
    style.textContent = `
      .popup-notification {
        position: fixed;
        bottom: 10px;
        left: 10px;
        right: 10px;
        background-color: #3498db;
        color: white;
        padding: 10px;
        border-radius: 4px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        transition: opacity 0.3s ease;
        z-index: 1000;
        text-align: center;
      }
      
      .popup-notification.fade-out {
        opacity: 0;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Set message and show notification
  notification.textContent = message;
  notification.classList.remove('fade-out');
  
  // Hide after 3 seconds
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}
