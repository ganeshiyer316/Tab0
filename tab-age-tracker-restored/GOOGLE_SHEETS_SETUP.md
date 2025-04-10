# Google Sheets Integration for Tab Age Tracker Feedback

This document provides instructions for setting up the Google Sheets integration for collecting user feedback from the Tab Age Tracker extension.

## Prerequisites

1. A Google account
2. Access to [Google Cloud Console](https://console.cloud.google.com/)
3. A Google Sheet to store the feedback data

## Setup Instructions

### Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click on "Select a project" at the top of the page
3. Click "New Project"
4. Enter "Tab Age Tracker" (or your preferred name) as the Project name
5. Click "Create"

### Step 2: Enable the Google Sheets API

1. In your project, go to "APIs & Services" > "Library"
2. Search for "Google Sheets API"
3. Click on the Google Sheets API card
4. Click "Enable"

### Step 3: Create a Service Account

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Enter a name for your service account (e.g., "tab-age-tracker-feedback")
4. (Optional) Add a description
5. Click "Create and Continue"
6. For the "Grant this service account access to project" step, select "Editor" role
7. Click "Continue" and then "Done"

### Step 4: Create and Download the Service Account Key

1. On the Credentials page, click on the service account you just created
2. Go to the "Keys" tab
3. Click "Add Key" > "Create new key"
4. Choose "JSON" as the key type
5. Click "Create"
6. The key file will be downloaded to your computer

### Step 5: Create a Google Sheet for Feedback

1. Go to [Google Sheets](https://sheets.google.com/)
2. Create a new spreadsheet
3. Rename it to "Tab Age Tracker Feedback" (or your preferred name)
4. Add the following headers in the first row:
   - A1: "Timestamp"
   - B1: "Email"
   - C1: "Feedback"
5. Save the spreadsheet

### Step 6: Share the Spreadsheet with the Service Account

1. Open your Google Sheet
2. Click the "Share" button in the top-right corner
3. In the "Add people and groups" field, enter the service account email address (found in your JSON key file under "client_email")
4. Make sure the service account has "Editor" permissions
5. Uncheck "Notify people"
6. Click "Share"

### Step 7: Configure the Tab Age Tracker Application

1. Rename the downloaded JSON key file to `client_secret.json`
2. Place this file in the root directory of the Tab Age Tracker application
3. (Optional) Set the environment variable `FEEDBACK_SHEET_NAME` to your Google Sheet's name if it's different from "Tab Age Tracker Feedback"

## Testing the Integration

After completing the setup, test the integration by:

1. Submitting feedback through the Tab Age Tracker web dashboard
2. Checking your Google Sheet to verify that the feedback was recorded

## Troubleshooting

- If feedback is not being recorded in the Google Sheet, check the application logs for error messages
- Verify that the service account has permission to access and edit the spreadsheet
- Ensure the `client_secret.json` file is properly formatted and contains the correct credentials