// TabSearch - Popup Logic
// 100% local, no external calls

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const searchInput = document.getElementById('searchInput');
  const clearSearch = document.getElementById('clearSearch');
  const mainContent = document.getElementById('mainContent');
  const searchResults = document.getElementById('searchResults');
  const resultsList = document.getElementById('resultsList');
  const resultsCount = document.getElementById('resultsCount');
  const backToMain = document.getElementById('backToMain');
  const tabListView = document.getElementById('tabListView');
  const tabList = document.getElementById('tabList');
  const listTitle = document.getElementById('listTitle');
  const backFromList = document.getElementById('backFromList');
  const settingsBtn = document.getElementById('settingsBtn');
  const duplicatesAlert = document.getElementById('duplicatesAlert');
  const viewDuplicates = document.getElementById('viewDuplicates');
  const showAllDomains = document.getElementById('showAllDomains');

  // State
  let allTabs = [];
  let storedTabData = {};
  let selectedIndex = -1;

  // Initialize
  await loadData();
  updateDisplay();

  // Load all tab data
  async function loadData() {
    // Get live tabs from Chrome
    allTabs = await chrome.tabs.query({});

    // Get stored metadata (for creation times)
    const data = await chrome.storage.local.get(['tabs']);
    storedTabData = data.tabs || {};

    // Sync stored data with current tabs
    await syncTabData();
  }

  // Sync stored data with current tabs
  async function syncTabData() {
    const currentTabIds = new Set(allTabs.map(t => t.id));
    let updated = false;

    // Add new tabs
    for (const tab of allTabs) {
      if (!storedTabData[tab.id] && tab.url && !tab.url.startsWith('chrome://')) {
        storedTabData[tab.id] = {
          url: tab.url,
          title: tab.title || 'Untitled',
          domain: extractDomain(tab.url),
          favIconUrl: tab.favIconUrl || '',
          createdAt: new Date().toISOString(),
          isVerified: true
        };
        updated = true;
      }
    }

    // Remove closed tabs
    for (const tabId of Object.keys(storedTabData)) {
      if (!currentTabIds.has(parseInt(tabId))) {
        delete storedTabData[tabId];
        updated = true;
      }
    }

    if (updated) {
      await chrome.storage.local.set({ tabs: storedTabData });
    }
  }

  // Update all display elements
  function updateDisplay() {
    updateTotalCount();
    updateAgeCounts();
    updateDomainList();
    checkDuplicates();
  }

  // Update total tab count
  function updateTotalCount() {
    document.getElementById('totalCount').textContent = allTabs.length;
  }

  // Get calendar days difference (ignores time, just compares dates)
  function getCalendarDaysAgo(dateString) {
    const now = new Date();
    const then = new Date(dateString);

    // Reset to start of day for accurate calendar day comparison
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thenStart = new Date(then.getFullYear(), then.getMonth(), then.getDate());

    const diffMs = todayStart - thenStart;
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  }

  // Update age category counts
  function updateAgeCounts() {
    let today = 0, week = 0, month = 0, older = 0;

    for (const tab of allTabs) {
      const stored = storedTabData[tab.id];
      if (!stored || !stored.createdAt) {
        older++; // Unknown age counts as old
        continue;
      }

      const daysAgo = getCalendarDaysAgo(stored.createdAt);

      if (daysAgo === 0) today++;           // Opened today (same calendar day)
      else if (daysAgo <= 7) week++;        // 1-7 days ago
      else if (daysAgo <= 30) month++;      // 8-30 days ago
      else older++;                          // 30+ days ago
    }

    document.getElementById('todayCount').textContent = today;
    document.getElementById('weekCount').textContent = week;
    document.getElementById('monthCount').textContent = month;
    document.getElementById('olderCount').textContent = older;
  }

  // Update domain list
  function updateDomainList() {
    const domainCounts = {};

    for (const tab of allTabs) {
      if (tab.url && !tab.url.startsWith('chrome://')) {
        const domain = extractDomain(tab.url);
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      }
    }

    // Sort by count descending
    const sorted = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1]);

    const domainList = document.getElementById('domainList');
    domainList.innerHTML = '';

    const displayCount = Math.min(5, sorted.length);

    for (let i = 0; i < displayCount; i++) {
      const [domain, count] = sorted[i];
      const item = createDomainItem(domain, count);
      domainList.appendChild(item);
    }

    // Show "all domains" button if more than 5
    showAllDomains.style.display = sorted.length > 5 ? 'block' : 'none';
    showAllDomains.onclick = () => showAllDomainsView(sorted);
  }

  // Create domain list item
  function createDomainItem(domain, count) {
    const item = document.createElement('button');
    item.className = 'domain-item';
    item.innerHTML = `
      <span class="domain-name">${escapeHtml(domain)}</span>
      <span class="domain-count">${count}</span>
    `;
    item.onclick = () => showTabsByDomain(domain);
    return item;
  }

  // Check for duplicates
  function checkDuplicates() {
    const urlCounts = {};

    for (const tab of allTabs) {
      if (tab.url && !tab.url.startsWith('chrome://')) {
        const normalized = normalizeUrl(tab.url);
        urlCounts[normalized] = (urlCounts[normalized] || 0) + 1;
      }
    }

    let duplicateCount = 0;
    for (const count of Object.values(urlCounts)) {
      if (count > 1) duplicateCount += count - 1;
    }

    if (duplicateCount > 0) {
      duplicatesAlert.style.display = 'flex';
      document.getElementById('duplicateCount').textContent = duplicateCount;
    } else {
      duplicatesAlert.style.display = 'none';
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

  // Normalize URL for duplicate detection
  function normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return (urlObj.origin + urlObj.pathname.replace(/\/$/, '') + urlObj.search).toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  // Search functionality
  function performSearch(query) {
    if (!query || query.length < 2) {
      showMainView();
      return;
    }

    const lowerQuery = query.toLowerCase();
    const results = allTabs.filter(tab => {
      const title = (tab.title || '').toLowerCase();
      const url = (tab.url || '').toLowerCase();
      return title.includes(lowerQuery) || url.includes(lowerQuery);
    });

    showSearchResults(results, query);
  }

  // Show search results
  function showSearchResults(results, query) {
    mainContent.style.display = 'none';
    tabListView.style.display = 'none';
    searchResults.style.display = 'block';

    resultsCount.textContent = results.length;
    resultsList.innerHTML = '';
    selectedIndex = -1;

    if (results.length === 0) {
      resultsList.innerHTML = '<div class="no-results">No tabs found</div>';
      return;
    }

    results.forEach((tab, index) => {
      const item = createTabItem(tab, index, query);
      resultsList.appendChild(item);
    });
  }

  // Create tab list item
  function createTabItem(tab, index, highlightQuery = '') {
    const stored = storedTabData[tab.id];
    const age = getAgeLabel(stored);

    const item = document.createElement('div');
    item.className = 'tab-item';
    item.dataset.index = index;
    item.dataset.tabId = tab.id;

    let title = escapeHtml(tab.title || 'Untitled');
    let url = escapeHtml(truncateUrl(tab.url || ''));

    // Highlight search query
    if (highlightQuery) {
      title = highlightText(title, highlightQuery);
      url = highlightText(url, highlightQuery);
    }

    item.innerHTML = `
      <img class="tab-favicon" src="${tab.favIconUrl || 'data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"%23888\"><rect width=\"24\" height=\"24\" rx=\"4\"/></svg>'}"
           onerror="this.src='data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"%23888\"><rect width=\"24\" height=\"24\" rx=\"4\"/></svg>'">
      <div class="tab-info">
        <div class="tab-title">${title}</div>
        <div class="tab-url">${url}</div>
      </div>
      <span class="tab-age ${age.class}">${age.label}</span>
    `;

    item.onclick = () => switchToTab(tab.id);
    return item;
  }

  // Get age label for tab
  function getAgeLabel(stored) {
    if (!stored || !stored.createdAt) {
      return { label: '?', class: 'age-unknown' };
    }

    const daysAgo = getCalendarDaysAgo(stored.createdAt);

    if (daysAgo === 0) return { label: 'Today', class: 'age-today' };
    if (daysAgo === 1) return { label: '1d', class: 'age-week' };
    if (daysAgo <= 7) return { label: `${daysAgo}d`, class: 'age-week' };
    if (daysAgo <= 30) return { label: `${daysAgo}d`, class: 'age-month' };
    return { label: `${daysAgo}d`, class: 'age-older' };
  }

  // Switch to a tab
  async function switchToTab(tabId) {
    try {
      await chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      window.close();
    } catch (error) {
      console.error('Error switching to tab:', error);
    }
  }

  // Show tabs by age category
  function showTabsByAge(ageCategory) {
    const filtered = allTabs.filter(tab => {
      const stored = storedTabData[tab.id];
      if (!stored || !stored.createdAt) {
        return ageCategory === 'older';
      }

      const daysAgo = getCalendarDaysAgo(stored.createdAt);

      switch (ageCategory) {
        case 'today': return daysAgo === 0;
        case 'week': return daysAgo >= 1 && daysAgo <= 7;
        case 'month': return daysAgo > 7 && daysAgo <= 30;
        case 'older': return daysAgo > 30;
        default: return false;
      }
    });

    const titles = {
      today: 'Opened Today',
      week: '1-7 Days Old',
      month: '8-30 Days Old',
      older: '30+ Days Old'
    };

    showTabList(filtered, titles[ageCategory]);
  }

  // Show tabs by domain
  function showTabsByDomain(domain) {
    const filtered = allTabs.filter(tab => {
      return extractDomain(tab.url || '') === domain;
    });

    showTabList(filtered, domain);
  }

  // Show duplicates
  function showDuplicates() {
    const urlToTabs = {};

    for (const tab of allTabs) {
      if (tab.url && !tab.url.startsWith('chrome://')) {
        const normalized = normalizeUrl(tab.url);
        if (!urlToTabs[normalized]) urlToTabs[normalized] = [];
        urlToTabs[normalized].push(tab);
      }
    }

    const duplicates = [];
    for (const tabs of Object.values(urlToTabs)) {
      if (tabs.length > 1) {
        duplicates.push(...tabs);
      }
    }

    showTabList(duplicates, 'Duplicate Tabs', true);
  }

  // Show all domains view
  function showAllDomainsView(sortedDomains) {
    mainContent.style.display = 'none';
    searchResults.style.display = 'none';
    tabListView.style.display = 'block';

    listTitle.textContent = 'All Domains';
    tabList.innerHTML = '';

    for (const [domain, count] of sortedDomains) {
      const item = createDomainItem(domain, count);
      tabList.appendChild(item);
    }
  }

  // Show tab list view
  function showTabList(tabs, title, showCloseDupes = false) {
    mainContent.style.display = 'none';
    searchResults.style.display = 'none';
    tabListView.style.display = 'block';

    listTitle.textContent = `${title} (${tabs.length})`;
    tabList.innerHTML = '';

    if (showCloseDupes && tabs.length > 0) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'close-dupes-btn';
      closeBtn.textContent = 'Close duplicates (keep first)';
      closeBtn.onclick = () => closeDuplicates(tabs);
      tabList.appendChild(closeBtn);
    }

    tabs.forEach((tab, index) => {
      const item = createTabItem(tab, index);
      tabList.appendChild(item);
    });
  }

  // Close duplicate tabs
  async function closeDuplicates(tabs) {
    const urlToTabs = {};

    for (const tab of tabs) {
      const normalized = normalizeUrl(tab.url);
      if (!urlToTabs[normalized]) urlToTabs[normalized] = [];
      urlToTabs[normalized].push(tab);
    }

    const toClose = [];
    for (const tabGroup of Object.values(urlToTabs)) {
      if (tabGroup.length > 1) {
        // Keep first, close rest
        toClose.push(...tabGroup.slice(1).map(t => t.id));
      }
    }

    if (toClose.length > 0) {
      await chrome.tabs.remove(toClose);
      await loadData();
      updateDisplay();
      showMainView();
    }
  }

  // Show main view
  function showMainView() {
    mainContent.style.display = 'block';
    searchResults.style.display = 'none';
    tabListView.style.display = 'none';
    selectedIndex = -1;
  }

  // Utility functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function truncateUrl(url) {
    try {
      const urlObj = new URL(url);
      let display = urlObj.hostname + urlObj.pathname;
      if (display.length > 50) {
        display = display.substring(0, 47) + '...';
      }
      return display;
    } catch {
      return url.length > 50 ? url.substring(0, 47) + '...' : url;
    }
  }

  function highlightText(text, query) {
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Event Listeners
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearSearch.style.display = query ? 'block' : 'none';
    performSearch(query);
  });

  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    clearSearch.style.display = 'none';
    showMainView();
    searchInput.focus();
  });

  backToMain.addEventListener('click', () => {
    searchInput.value = '';
    clearSearch.style.display = 'none';
    showMainView();
  });

  backFromList.addEventListener('click', () => {
    showMainView();
  });

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  viewDuplicates.addEventListener('click', () => {
    showDuplicates();
  });

  // Age card clicks
  document.querySelectorAll('.age-card').forEach(card => {
    card.addEventListener('click', () => {
      showTabsByAge(card.dataset.age);
    });
  });

  // Keyboard navigation
  searchInput.addEventListener('keydown', (e) => {
    const items = resultsList.querySelectorAll('.tab-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelection(items);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      const tabId = parseInt(items[selectedIndex].dataset.tabId);
      switchToTab(tabId);
    }
  });

  function updateSelection(items) {
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === selectedIndex);
      if (index === selectedIndex) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }
});
