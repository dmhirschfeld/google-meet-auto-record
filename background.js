// Background service worker for Google Meet Auto Record extension

const API_BASE_URL = 'https://workspaceevents.googleapis.com/v1';
let accessToken = null;
let subscriptionId = null;
let isAuthenticated = false;
let currentTabId = null;

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Google Meet Auto Record extension installed');
  await checkAuthStatus();
});

// Listen for tab updates to detect Google Meet pages
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('meet.google.com')) {
    currentTabId = tabId;
    await checkAuthStatus();
    if (isAuthenticated) {
      await setupSubscription();
    }
  }
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkAuth') {
    checkAuthStatus().then(() => {
      sendResponse({ authenticated: isAuthenticated });
    });
    return true;
  }
  
  if (request.action === 'authenticate') {
    authenticate().then(() => {
      sendResponse({ success: isAuthenticated });
    });
    return true;
  }
  
  if (request.action === 'getStatus') {
    sendResponse({
      authenticated: isAuthenticated,
      subscriptionId: subscriptionId
    });
    return true;
  }
  
  if (request.action === 'recordingStarted') {
    console.log('Recording started successfully');
    return true;
  }
  
  if (request.action === 'recordingFailed') {
    console.error('Recording failed:', request.reason);
    return true;
  }
  
  if (request.action === 'recordingDetected') {
    console.log('Recording detected in UI');
    return true;
  }
  
  return false;
});

// Check authentication status
async function checkAuthStatus() {
  try {
    const token = await chrome.identity.getAuthToken({ interactive: false });
    if (token) {
      accessToken = token;
      isAuthenticated = true;
      await setupSubscription();
    } else {
      isAuthenticated = false;
    }
  } catch (error) {
    console.log('Not authenticated:', error);
    isAuthenticated = false;
  }
}

// Authenticate user
async function authenticate() {
  try {
    const token = await chrome.identity.getAuthToken({ 
      interactive: true,
      scopes: [
        'https://www.googleapis.com/auth/chat.meetingspace.readonly',
        'https://www.googleapis.com/auth/meetings.space.readonly'
      ]
    });
    
    if (token) {
      accessToken = token;
      isAuthenticated = true;
      await setupSubscription();
      return true;
    }
  } catch (error) {
    console.error('Authentication error:', error);
    isAuthenticated = false;
    return false;
  }
}

// Set up Google Workspace Events API subscription
// Note: Google Workspace Events API requires a Pub/Sub topic for webhooks,
// which is complex to set up in a Chrome extension. We'll primarily use
// DOM-based detection, but attempt API setup as a fallback approach.
async function setupSubscription() {
  if (!accessToken || !currentTabId) {
    // Fallback to DOM detection if no auth or tab
    startPollingForHostJoin();
    return;
  }

  try {
    // Get current meeting space ID from the tab
    const tab = await chrome.tabs.get(currentTabId);
    const meetingSpaceId = extractMeetingSpaceId(tab.url);
    
    if (!meetingSpaceId) {
      console.log('No meeting space ID found in URL, using DOM detection');
      startPollingForHostJoin();
      return;
    }

    // Note: Full API subscription requires a Pub/Sub topic webhook endpoint
    // which is not easily set up in a Chrome extension. We'll use DOM-based
    // detection as the primary method and attempt API calls for validation.
    
    // For now, use DOM-based detection as primary method
    console.log('Using DOM-based detection for host join');
    startPollingForHostJoin();
    
    // Optional: Try to validate meeting space exists via API
    // This would require additional API calls and Pub/Sub setup
    // which is beyond the scope of a simple extension
    
  } catch (error) {
    console.error('Error setting up subscription:', error);
    // Fallback: Use polling or DOM detection
    startPollingForHostJoin();
  }
}

// Extract meeting space ID from URL
function extractMeetingSpaceId(url) {
  try {
    const urlObj = new URL(url);
    // Google Meet URLs typically have format: meet.google.com/xxx-xxxx-xxx
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    if (pathParts.length > 0) {
      return pathParts[0];
    }
  } catch (error) {
    console.error('Error extracting meeting space ID:', error);
  }
  return null;
}

// Check subscription status
async function checkSubscriptionStatus() {
  if (!subscriptionId || !accessToken) return;

  try {
    const response = await fetch(`${API_BASE_URL}/${subscriptionId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      // Subscription expired or invalid, create new one
      subscriptionId = null;
      await setupSubscription();
    }
  } catch (error) {
    console.error('Error checking subscription:', error);
  }
}

// Polling fallback: Check for host join via content script
function startPollingForHostJoin() {
  if (!currentTabId) return;

  // Send message to content script to start DOM-based detection
  chrome.tabs.sendMessage(currentTabId, {
    action: 'startHostDetection',
    method: 'polling'
  }).catch(error => {
    console.log('Content script not ready:', error);
  });
}

// Handle external messages (webhook simulation - in production, you'd set up a webhook server)
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.type === 'meet.participant.joined') {
    const participant = request.participant;
    if (participant.role === 'ORGANIZER' || participant.role === 'HOST') {
      // Host joined, notify content script
      if (currentTabId) {
        chrome.tabs.sendMessage(currentTabId, {
          action: 'hostJoined',
          participant: participant
        });
      }
    }
  }
});

// Handle token refresh
chrome.identity.onSignInChanged.addListener(async (account, signedIn) => {
  if (signedIn) {
    await checkAuthStatus();
  } else {
    isAuthenticated = false;
    accessToken = null;
    subscriptionId = null;
  }
});

