# Tab Age Tracker v2.0

A Chrome extension that helps you track and manage your browser tabs by monitoring their age and providing insightful analytics.

## New in v2.0

- **Feedback System**: Added a new feedback form in the web dashboard that allows users to submit feedback directly
- **Google Sheets Integration**: Feedback is now stored in Google Sheets for easier management (see GOOGLE_SHEETS_SETUP.md)
- **Bug Fixes**:
  - Fixed "View Details" button navigation in popup
  - Fixed sorting by "Newest First" in the dashboard
- **Improved Error Handling**: Better validation and user feedback for form submissions

## Features

- Track how long each browser tab has been open
- Categorize tabs by age (Today, This Week, This Month, Older)
- Monitor your tab usage over time with comprehensive analytics
- Set tab reduction goals and track your progress
- Receive notifications about old tabs
- View detailed statistics in the web dashboard
- Search and filter your tabs by age, title, or URL
- Get suggestions for tab grouping based on your browsing patterns
- Synchronize your tab data with the web dashboard

## Installation

1. Download the extension ZIP file
2. Extract the contents to a folder
3. In Chrome, go to chrome://extensions/
4. Enable "Developer mode"
5. Click "Load unpacked" and select the extracted folder

## Setup Google Sheets Integration (Optional)

For setting up the Google Sheets integration to collect user feedback, see the included GOOGLE_SHEETS_SETUP.md file.

## Usage

- Click the extension icon to see a summary of your tabs
- Click "View Details" to access the detailed options page
- Use the web dashboard for comprehensive analytics and feedback submission
- Use the search and filter options to find specific tabs
- Set your tab reduction goal in the settings

## Privacy

Tab Age Tracker respects your privacy:

- All detailed tab data is stored locally in your browser
- Only anonymous, aggregated analytics are sent to the server if you enable synchronization
- No browsing history or personal data is collected or transmitted
- Feedback submissions are optional and only sent when you explicitly submit the form

## License

MIT License