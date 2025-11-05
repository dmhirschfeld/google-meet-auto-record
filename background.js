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
// NOTE: Disabled due to CORS restrictions - Chrome extensions cannot access these APIs directly
// We rely on DOM-based detection instead, which is more reliable for this use case.
async function setupSubscription() {
  // Google Meet API and Workspace Events API are not accessible from Chrome extensions
  // due to CORS restrictions. We use DOM-based detection instead.
  console.log('Using DOM-based host detection (API methods disabled due to CORS restrictions)');
  startPollingForHostJoin();
  return;
  
  /* Disabled due to CORS restrictions and server requirements
  if (!accessToken || !currentTabId) {
    console.log('No auth token or tab, using DOM detection');
    startPollingForHostJoin();
    return;
  }

  try {
    const tab = await chrome.tabs.get(currentTabId);
    const meetingSpaceId = extractMeetingSpaceId(tab.url);
    
    if (!meetingSpaceId) {
      console.log('No meeting space ID found in URL, using DOM detection');
      startPollingForHostJoin();
      return;
    }

    const targetResource = `spaces/${meetingSpaceId}`;
    
    const subscription = {
      targetResource: `//meet.googleapis.com/${targetResource}`,
      eventTypes: [
        'google.workspace.meet.participant.v1.joined',
        'google.workspace.meet.conference.v1.started'
      ],
      notificationEndpoint: {
        pubsubTopic: `projects/YOUR_PROJECT/topics/YOUR_TOPIC`
      }
    };

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
        startPollingEvents(targetResource);
        return;
      } else {
        const errorData = await response.json();
        console.log('API subscription failed:', errorData.error?.message);
        startPollingEvents(targetResource);
      }
    } catch (apiError) {
      console.log('API subscription not available:', apiError);
      startPollingEvents(targetResource);
    }
    
  } catch (error) {
    console.error('Error setting up subscription:', error);
    startPollingForHostJoin();
  }
  */
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
// NOTE: Disabled due to CORS restrictions - Chrome extensions cannot access these APIs directly
// We rely on DOM-based detection instead, which is more reliable for this use case.
async function startPollingEvents(targetResource) {
  // Google Meet API and Workspace Events API are not accessible from Chrome extensions
  // due to CORS restrictions. We use DOM-based detection instead.
  console.log('API polling disabled - using DOM-based detection instead (CORS restrictions)');
  startPollingForHostJoin();
  return;
  
  /* Disabled due to CORS restrictions
  if (!accessToken || !targetResource) {
    startPollingForHostJoin();
    return;
  }

  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }

  console.log('Starting API event polling for:', targetResource);
  
  await checkMeetingParticipants(targetResource);
  
  pollIntervalId = setInterval(async () => {
    if (!currentTabId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
      return;
    }

    await checkMeetingParticipants(targetResource);
  }, 5000);

  startPollingForHostJoin();
  */
}

// Check meeting participants using Google Meet API
// NOTE: Disabled due to CORS restrictions - Chrome extensions cannot access Meet API directly
// We rely on DOM-based detection instead, which is more reliable for this use case.
async function checkMeetingParticipants(targetResource) {
  // Google Meet API requires server-side authentication and is not accessible
  // from Chrome extensions due to CORS restrictions. We rely on DOM-based detection instead.
  console.log('Meet API polling disabled - using DOM-based detection instead (CORS restrictions)');
  return;
  
  /* Disabled due to CORS restrictions
  if (!accessToken || !currentTabId) return;

  try {
    const response = await fetch(`${MEET_API_BASE_URL}/${targetResource}/participants`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.participants) {
        const host = data.participants.find(p => 
          p.role === 'ORGANIZER' || p.role === 'HOST'
        );
        
        if (host && host.joined) {
          console.log('Host joined detected via Meet API:', host);
          if (pollIntervalId) {
            clearInterval(pollIntervalId);
            pollIntervalId = null;
          }
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
  }
  */
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

