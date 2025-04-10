/**
 * Configuration file for Tab Age Tracker v2.1.3
 * All analytics completely removed
 */

// Empty stub functions to prevent errors
function initializeAnalytics() {
    return false;
}

function trackEvent() {
    return false;
}

// Export functions for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeAnalytics,
        trackEvent
    };
}