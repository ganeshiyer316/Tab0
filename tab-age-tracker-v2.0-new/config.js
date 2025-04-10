/**
 * Configuration file for Tab Age Tracker
 * Contains shared configuration settings across different components
 */

// Replace GA_MEASUREMENT_ID with your actual Google Analytics measurement ID
const GA_MEASUREMENT_ID = 'GA_MEASUREMENT_ID';

// Google Analytics configuration
function initializeAnalytics() {
  // Only run in browser context
  if (typeof window !== 'undefined') {
    // Check if script is already loaded
    if (!document.querySelector('script[src*="googletagmanager"]')) {
      const gaScript = document.createElement('script');
      gaScript.async = true;
      gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
      document.head.appendChild(gaScript);
    }
    
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID);
    
    // Make gtag available globally
    window.gtag = gtag;
  }
}

// Track events in Google Analytics
function trackEvent(category, action, label = null, value = null) {
  try {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', action, {
        'event_category': category,
        'event_label': label,
        'value': value
      });
    }
  } catch (e) {
    console.error('Error tracking event:', e);
  }
}

// Export the functions for use in other components
// Note: In Chrome extension context, this is accessible globally