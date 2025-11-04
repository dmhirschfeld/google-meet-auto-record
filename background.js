// Background service worker for Google Meet Auto Record extension

const API_BASE_URL = 'https://workspaceevents.googleapis.com/v1';
const MEET_API_BASE_URL = 'https://meet.googleapis.com/v1';
let accessToken = null;
let subscriptionId = null;
let isAuthenticated = false;
let currentTabId = null;
let pollIntervalId = null;

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
        'https://www.googleapis.com/auth/meetings.space.readonly',
        'https://www.googleapis.com/auth/workspace.events'
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
// Note: Google Workspace Events API requires a Pub/Sub topic for webhooks.
// Since Chrome extensions can't easily host webhook endpoints, we'll use
// API polling to check for events instead of webhooks.
async function setupSubscription() {
  if (!accessToken || !currentTabId) {
    // Fallback to DOM detection if no auth or tab
    console.log('No auth token or tab, using DOM detection');
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

    // Try to get the meeting space resource name
    // Format: spaces/{meetingSpaceId}
    const targetResource = `spaces/${meetingSpaceId}`;
    
    // Attempt to create subscription via API
    // Note: This requires a Pub/Sub topic, which we'll handle gracefully
    const subscription = {
      targetResource: `//meet.googleapis.com/${targetResource}`,
      eventTypes: [
        'google.workspace.meet.participant.v1.joined',
        'google.workspace.meet.conference.v1.started'
      ],
      notificationEndpoint: {
        // For Chrome extensions, we can't host a webhook endpoint
        // So we'll use polling instead (see pollForEvents function)
        // If you have a server, you can set up a Pub/Sub topic here
        pubsubTopic: `projects/YOUR_PROJECT/topics/YOUR_TOPIC` // Requires server setup
      }
    };

    // Try to create subscription
    try {
      const response = await fetch(`${API_BASE_URL}/subscriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subscription)
      });

      if (response.ok) {
        const data = await response.json();
        subscriptionId = data.name;
        console.log('API subscription created:', subscriptionId);
        // Start polling for events from the API
        startPollingEvents(targetResource);
        return;
      } else {
        const errorData = await response.json();
        console.log('API subscription failed (expected for Chrome extension):', errorData.error?.message);
        // Fall back to polling API directly or DOM detection
        startPollingEvents(targetResource);
      }
    } catch (apiError) {
      console.log('API subscription not available, using event polling:', apiError);
      // Use API polling instead of webhooks
      startPollingEvents(targetResource);
    }
    
  } catch (error) {
    console.error('Error setting up subscription:', error);
    // Fallback: Use DOM detection
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

// Poll for events using Google Workspace Events API
// This is an alternative to webhooks that works in Chrome extensions
async function startPollingEvents(targetResource) {
  if (!accessToken || !targetResource) {
    startPollingForHostJoin();
    return;
  }

  // Clear any existing polling interval
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }

  console.log('Starting API event polling for:', targetResource);
  
  // Also try using Meet API to check participant status directly
  await checkMeetingParticipants(targetResource);
  
  // Poll for events every 5 seconds
  pollIntervalId = setInterval(async () => {
    if (!currentTabId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
      return;
    }

    // Check participants via Meet API (more reliable than Events API polling)
    await checkMeetingParticipants(targetResource);
  }, 5000);

  // Also start DOM-based detection as backup
  startPollingForHostJoin();
}

// Check meeting participants using Google Meet API
async function checkMeetingParticipants(targetResource) {
  if (!accessToken || !currentTabId) return;

  try {
    // Use Meet API to get current meeting participants
    // Format: spaces/{meetingSpaceId}
    const response = await fetch(`${MEET_API_BASE_URL}/${targetResource}/participants`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.participants) {
        // Check if host/organizer has joined
        const host = data.participants.find(p => 
          p.role === 'ORGANIZER' || p.role === 'HOST'
        );
        
        if (host && host.joined) {
          console.log('Host joined detected via Meet API:', host);
          // Clear polling interval
          if (pollIntervalId) {
            clearInterval(pollIntervalId);
            pollIntervalId = null;
          }
          // Notify content script
          chrome.tabs.sendMessage(currentTabId, {
            action: 'hostJoined',
            participant: host,
            source: 'api'
          }).catch(() => {});
        }
      }
    }
  } catch (error) {
    console.log('Meet API polling error:', error);
    // Fall back to DOM detection if API fails
  }
}

// Polling fallback: Check for host join via content script (DOM-based)
function startPollingForHostJoin() {
  if (!currentTabId) return;

  // Send message to content script to start DOM-based detection
  chrome.tabs.sendMessage(currentTabId, {
    action: 'startHostDetection',
    method: 'dom'
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

