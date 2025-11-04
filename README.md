# Google Meet Auto Record Chrome Extension

A Chrome extension that automatically starts recording when the host joins a Google Meet session using the Google Workspace Events API.

## Features

- Automatically detects when the meeting host joins the session
- Programmatically clicks the "Start Recording" button in Google Meet
- OAuth authentication with Google Workspace
- Real-time status monitoring via extension popup
- Fallback DOM-based detection if API is unavailable

## Requirements

- Google Chrome browser
- Google Workspace account (not personal Gmail account)
- Google Cloud Console project with OAuth 2.0 credentials
- Google Workspace Events API enabled

## Setup Instructions

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Google Workspace Events API
   - Google Meet API (if available)

### 2. OAuth 2.0 Configuration

1. Navigate to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Chrome App** as the application type
4. Add the following authorized redirect URI:
   ```
   https://<extension-id>.chromiumapp.org/
   ```
   Note: You'll need to get your extension ID after loading the extension (see step 4 below)

### 3. Configure Extension

1. Open `manifest.json`
2. Replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your actual OAuth client ID from Google Cloud Console
3. Save the file

### 4. Icon Files

The extension requires icon files (icon16.png, icon48.png, icon128.png). You can:
- Create your own icons (16x16, 48x48, and 128x128 pixels)
- Use placeholder icons temporarily
- Remove the icon references from `manifest.json` if you don't need them

### 5. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the extension directory
5. Copy your extension ID from the extensions page (format: `abcdefghijklmnopqrstuvwxyz123456`)
6. Go back to Google Cloud Console and update the redirect URI with your actual extension ID

### 6. Authentication

1. Click the extension icon in Chrome toolbar
2. Click **Authenticate with Google**
3. Grant permissions when prompted
4. The extension will now monitor Google Meet sessions

## Usage

1. Open a Google Meet session as the host
2. Join the meeting
3. The extension will automatically detect when you join and start recording
4. Check the extension popup for status updates

## How It Works

1. **Detection**: The extension uses the Google Workspace Events API to detect when the host joins a meeting
2. **Fallback**: If the API is unavailable, it falls back to DOM-based detection
3. **Recording**: Once host join is detected, the extension programmatically clicks the "Start Recording" button in Google Meet's UI

## Files Structure

- `manifest.json` - Extension configuration and permissions
- `background.js` - OAuth authentication and API subscription handling
- `content.js` - DOM interaction and recording button click logic
- `popup.html` - Extension popup UI
- `popup.js` - Popup logic and status display
- `styles.css` - Popup styling
- `README.md` - This file

## Permissions

The extension requires the following permissions:

- `identity` - For OAuth authentication
- `activeTab` - To interact with Google Meet tabs
- `tabs` - To monitor tab updates
- `scripting` - To inject content scripts

## Troubleshooting

### Authentication Issues

- Ensure you're using a Google Workspace account (not personal Gmail)
- Verify OAuth client ID is correctly configured in `manifest.json`
- Check that redirect URI matches your extension ID

### Recording Not Starting

- Verify you're the meeting host (recording button only appears for hosts)
- Check extension popup for error messages
- Ensure Google Workspace Events API is enabled in Cloud Console
- Try refreshing the Google Meet page

### API Errors

- The extension will automatically fall back to DOM-based detection
- Check browser console for detailed error messages
- Verify API quotas and limits in Google Cloud Console

## Limitations

- Requires Google Workspace account (personal Gmail accounts won't work)
- Recording feature must be enabled for your Google Workspace domain
- OAuth token expiration requires re-authentication
- API subscriptions may expire and need renewal

## Privacy

This extension:
- Only accesses Google Meet pages
- Requires explicit user authentication
- Does not store or transmit meeting content
- Only interacts with Google Meet's UI to start recording

## License

MIT License

## Support

For issues or questions, please check the troubleshooting section or create an issue in the repository.

