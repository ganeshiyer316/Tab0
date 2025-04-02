/**
 * Utility functions for Tab Age Tracker
 */

/**
 * Formats a date to a readable string
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  if (typeof date === 'string') {
    date = new Date(date);
  }
  
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Formats a time to a readable string
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted time string
 */
function formatTime(date) {
  if (typeof date === 'string') {
    date = new Date(date);
  }
  
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Calculates the age of a tab based on its creation date
 * @param {string} createdAt - ISO date string of tab creation, or null if unknown
 * @returns {Object} Object containing age information
 */
function calculateTabAge(createdAt) {
    // If creation date is unknown, return unknown age
    if (!createdAt) {
        return {
            days: -1,
            weeks: -1,
            months: -1,
            category: 'unknown',
            label: 'Unknown Age',
            exact: 'Unknown',
            ageInDays: -1
        };
    }
  const created = new Date(createdAt);
  const now = new Date();
  
  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  
  let ageCategory;
  let ageLabel;
  
  if (diffDays < 1) {
    // Opened Today
    ageCategory = 'today';
    ageLabel = 'Today';
  } else if (diffDays === 1) {
    // Opened Yesterday
    ageCategory = 'yesterday';
    ageLabel = 'Yesterday';
  } else if (diffDays < 7) {
    // Open 1-7 Days
    ageCategory = 'week';
    ageLabel = `${diffDays} days`;
  } else if (diffDays < 30) {
    // Open 8-30 Days
    ageCategory = 'month';
    ageLabel = `${diffWeeks} week${diffWeeks === 1 ? '' : 's'}`;
  } else {
    // Open >30 Days
    ageCategory = 'older';
    ageLabel = `${diffMonths} month${diffMonths === 1 ? '' : 's'}`;
  }
  
  return {
    days: diffDays,
    weeks: diffWeeks,
    months: diffMonths,
    category: ageCategory,
    label: ageLabel,
    exact: formatDate(created)
  };
}

/**
 * Generates a color based on the age of a tab
 * @param {string} createdAt - ISO date string of tab creation, or null if unknown
 * @returns {string} CSS color value
 */
function getAgeColor(createdAt) {
  const { category } = calculateTabAge(createdAt);
  
  const colorMap = {
    today: '#2ecc71',      // Green
    yesterday: '#3498db',  // Blue
    week: '#f39c12',       // Orange
    month: '#e67e22',      // Dark Orange
    older: '#e74c3c',      // Red
    unknown: '#95a5a6'     // Gray
  };
  
  return colorMap[category] || colorMap.unknown;
}

/**
 * Truncates a string to a specified length
 * @param {string} str - String to truncate
 * @param {number} length - Maximum length
 * @returns {string} Truncated string
 */
function truncateString(str, length = 50) {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

/**
 * Sanitizes a string for safe HTML insertion
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitize(str) {
  if (!str) return '';
  const temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
}

/**
 * Gets a favicon fallback for tabs without favicons
 * @param {string} url - Tab URL
 * @returns {string} URL for the favicon or a fallback icon
 */
function getFaviconFallback(url) {
  if (!url) return '';
  
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}`;
  } catch (e) {
    return '';
  }
}

/**
 * Export tab data to CSV format
 * @param {Array} tabs - Array of tab objects
 * @returns {string} CSV content
 */
function exportToCsv(tabs) {
  if (!tabs || !tabs.length) return '';
  
  const headers = ['Title', 'URL', 'Created At', 'Age (Days)', 'Age Status'];
  const rows = [headers];
  
  tabs.forEach(tab => {
    const age = calculateTabAge(tab.createdAt);
    rows.push([
      `"${(tab.title || '').replace(/"/g, '""')}"`,
      `"${(tab.url || '').replace(/"/g, '""')}"`,
      `"${tab.createdAt ? formatDate(tab.createdAt) : 'Unknown'}"`,
      `"${age.ageInDays >= 0 ? age.ageInDays : 'Unknown'}"`,
      `"${age.ageInDays >= 0 ? 'Verified' : 'Unverified'}"`
    ]);
  });
  
  return rows.map(row => row.join(',')).join('\n');
}
