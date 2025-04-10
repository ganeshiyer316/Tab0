/**
 * Configuration file for Tab Age Tracker
 * Analytics completely disabled in this version for security
 */

// Analytics is disabled
const GA_MEASUREMENT_ID = null;

/**
 * Stub function for analytics (disabled in this version)
 */
function initializeAnalytics() {
    console.log('Analytics is disabled in this security-enhanced version');
    return false;
}

/**
 * Stub function for event tracking (disabled in this version)
 */
function trackEvent(category, action, label = null, value = null) {
    // Analytics disabled - do nothing
    return false;
}

// Export functions for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        GA_MEASUREMENT_ID,
        initializeAnalytics,
        trackEvent
    };
}