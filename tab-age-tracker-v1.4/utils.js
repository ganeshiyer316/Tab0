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
 * @param {string} url - Tab URL, used to extract date if createdAt is null
 * @returns {Object} Object containing age information
 */
function calculateTabAge(createdAt, url) {
    let created = null;
    let fromURL = false;
    
    // Try to get creation date from provided timestamp
    if (createdAt) {
        created = new Date(createdAt);
    } 
    // If no creation date, try to extract from URL
    else if (url) {
        created = extractDateFromURL(url);
        if (created) {
            fromURL = true;
        }
    }
    
    // If still no date, return unknown age
    if (!created) {
        return {
            days: -1,
            weeks: -1,
            months: -1,
            category: 'unknown',
            label: 'Unknown Age',
            exact: 'Unknown',
            ageInDays: -1,
            fromURL: false
        };
    }
    
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
        exact: formatDate(created),
        ageInDays: diffDays,
        fromURL: fromURL
    };
}

/**
 * Generates a color based on the age of a tab
 * @param {string} createdAt - ISO date string of tab creation, or null if unknown
 * @param {string} url - Tab URL, used to extract date if createdAt is null
 * @returns {string} CSS color value
 */
function getAgeColor(createdAt, url) {
  const { category } = calculateTabAge(createdAt, url);
  
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
 * Extracts a date from URL patterns
 * @param {string} url - URL to extract date from
 * @returns {Date|null} Extracted date or null if no date found
 */
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
    
    // Pattern: /blog/YYYY/MM/DD/ (common blog URL pattern)
    const blogPattern = /\/blog\/(\d{4})\/(\d{1,2})\/(\d{1,2})/i;
    const blogMatch = url.match(blogPattern);
    if (blogMatch) {
      const [_, year, month, day] = blogMatch;
      const extractedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(extractedDate.getTime())) {
        return extractedDate;
      }
    }
    
    // Pattern: YouTube URL with timestamp
    const ytPattern = /youtube\.com\/(watch|shorts).*[\?&]v=([^&]+)/i;
    const ytMatch = url.match(ytPattern);
    if (ytMatch) {
      // YouTube URLs might contain a video ID that we can't directly map to a date
      // For this example, we'll consider YouTube videos to be from today
      // In a production environment, you might want to use the YouTube API to get actual upload dates
      return null;
    }
    
    // Extract dates from URL segments for article or news sites
    // This is a more generic approach
    const datePatterns = [
      // Match YYYY/MM/DD anywhere in URL
      /(\d{4})\/(\d{2})\/(\d{2})/,
      // Match YYYY-MM-DD anywhere in URL
      /(\d{4})-(\d{2})-(\d{2})/
    ];
    
    for (const pattern of datePatterns) {
      const match = url.match(pattern);
      if (match) {
        const [_, year, month, day] = match;
        // Only consider valid date ranges
        if (parseInt(year) >= 2000 && parseInt(year) <= new Date().getFullYear() &&
            parseInt(month) >= 1 && parseInt(month) <= 12 &&
            parseInt(day) >= 1 && parseInt(day) <= 31) {
          const extractedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
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

/**
 * Export tab data to CSV format
 * @param {Array} tabs - Array of tab objects
 * @returns {string} CSV content
 */
function exportToCsv(tabs) {
  if (!tabs || !tabs.length) return '';
  
  const headers = ['Title', 'URL', 'Created At', 'Age (Days)', 'Age Status', 'Date Source'];
  const rows = [headers];
  
  tabs.forEach(tab => {
    const age = calculateTabAge(tab.createdAt, tab.url);
    rows.push([
      `"${(tab.title || '').replace(/"/g, '""')}"`,
      `"${(tab.url || '').replace(/"/g, '""')}"`,
      `"${tab.createdAt ? formatDate(tab.createdAt) : (age.fromURL ? formatDate(new Date(Date.now() - age.days * 86400000)) : 'Unknown')}"`,
      `"${age.ageInDays >= 0 ? age.ageInDays : 'Unknown'}"`,
      `"${age.ageInDays >= 0 ? 'Verified' : 'Unverified'}"`,
      `"${age.fromURL ? 'From URL' : (tab.createdAt ? 'Creation Time' : 'Unknown')}"`
    ]);
  });
  
  return rows.map(row => row.join(',')).join('\n');
}
