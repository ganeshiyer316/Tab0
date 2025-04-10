# Google Analytics Setup Guide for Tab Age Tracker

This guide explains how to access and analyze the Google Analytics data collected from Tab Age Tracker extension and web dashboard.

## Analytics Overview

Tab Age Tracker uses Google Analytics 4 (GA4) to collect anonymous usage data to help improve the user experience. The following events are tracked:

### Extension Events
- Extension popup opened
- Options page opened
- Tab searches performed
- Feedback submissions
- Web dashboard access
- Old tab notifications
- Settings changes

### Web Dashboard Events
- Dashboard page views
- Tab sorting and filtering actions
- Chart interactions
- Feedback submissions

## Accessing Analytics Data

1. Visit [Google Analytics](https://analytics.google.com/)
2. Sign in with the Google account associated with the tracking ID: `G-W6JZET80BN`
3. Select "Tab Age Tracker" from the account dropdown

## Key Reports to Monitor

### 1. Real-time Dashboard
- Shows current active users
- Navigate to: Reports → Realtime

### 2. User Engagement Overview
- Shows overall usage patterns
- Navigate to: Reports → Engagement → Overview

### 3. Event Analysis
- Shows specific user interactions
- Navigate to: Reports → Engagement → Events

### 4. User Demographics
- Shows user locations and devices
- Navigate to: Reports → User → Demographics

## Understanding Key Metrics

### DAU (Daily Active Users)
- Found in: Reports → User → Overview
- Shows how many unique users open the extension each day

### Extension Usage Frequency
- Found in: Reports → Engagement → Overview
- Shows how often users interact with the extension

### Most Common Actions
- Found in: Reports → Engagement → Events
- Shows the most frequent user actions

### Retention Rate
- Found in: Reports → User → Retention
- Shows how many users continue using the extension over time

## Custom Reports

You can create custom reports to analyze specific aspects of user behavior:

1. Navigate to "Explore" in the left sidebar
2. Click "Create new exploration"
3. Select dimensions (e.g., "Event name", "Page title") and metrics (e.g., "Event count", "Users")
4. Apply any filters to focus on specific user segments

## Event Naming Conventions

Tab Age Tracker uses the following event naming conventions:

- `engagement_popup_opened`: User opened the extension popup
- `interaction_search_tabs`: User searched for tabs
- `engagement_options_opened`: User opened the options page
- `interaction_feedback_submit`: User submitted feedback
- `interaction_sort_newest`: User sorted tabs by newest first
- `interaction_sort_oldest`: User sorted tabs by oldest first
- `notification_old_tabs`: Old tab notification was shown

## Setting Up Analytics Alerts

You can set up alerts to be notified of important changes in usage patterns:

1. Navigate to "Admin" → "Data Studio" → "Custom Alerts"
2. Click "Create"
3. Configure alert conditions (e.g., significant drop in active users)
4. Set up email notifications

## Privacy Considerations

Tab Age Tracker's analytics implementation respects user privacy:

- No personally identifiable information (PII) is collected
- No browsing history or tab URLs are collected
- Only aggregate usage patterns and counts are tracked
- No IP addresses are stored permanently
- Data is stored securely in Google Analytics

## Need Help?

If you need assistance with Google Analytics for Tab Age Tracker, contact the developer at support@tabagetracker.com.