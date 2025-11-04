// Popup script for Google Meet Auto Record extension

document.addEventListener('DOMContentLoaded', async () => {
  await initializePopup();
});

async function initializePopup() {
  // Check authentication status
  await checkAuthStatus();
  
  // Check if extension is enabled
  await checkExtensionStatus();
  
  // Check current meeting status
  await checkMeetingStatus();
  
  // Set up event listeners
  setupEventListeners();
}

async function checkAuthStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
    
    if (response && response.authenticated) {
      updateAuthStatus('authenticated', 'Authenticated');
      document.getElementById('authButton').style.display = 'none';
    } else {
      updateAuthStatus('not-authenticated', 'Not Authenticated');
      document.getElementById('authButton').style.display = 'block';
    }
  } catch (error) {
    console.error('Error checking auth status:', error);
    updateAuthStatus('error', 'Error');
    document.getElementById('authButton').style.display = 'block';
  }
}

async function checkExtensionStatus() {
  try {
    const result = await chrome.storage.local.get(['extensionEnabled']);
    const enabled = result.extensionEnabled !== false; // Default to true
    document.getElementById('extensionToggle').checked = enabled;
  } catch (error) {
    console.error('Error checking extension status:', error);
  }
}

async function checkMeetingStatus() {
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url && tab.url.includes('meet.google.com')) {
      updateMeetingStatus('In Meeting');
      
      // Check if recording is active
      chrome.tabs.sendMessage(tab.id, { action: 'getRecordingStatus' }, (response) => {
        if (response && response.recording) {
          updateRecordingStatus('active', 'Recording');
        } else {
          updateRecordingStatus('waiting', 'Waiting for host...');
        }
      });
    } else {
      updateMeetingStatus('Not in Meeting');
      updateRecordingStatus('none', '-');
    }
  } catch (error) {
    console.error('Error checking meeting status:', error);
    updateMeetingStatus('Error');
  }
}

function setupEventListeners() {
  // Authentication button
  const authButton = document.getElementById('authButton');
  authButton.addEventListener('click', async () => {
    authButton.disabled = true;
    authButton.textContent = 'Authenticating...';
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'authenticate' });
      
      if (response && response.success) {
        await checkAuthStatus();
        showMessage('Authentication successful!', 'success');
      } else {
        showMessage('Authentication failed. Please try again.', 'error');
        authButton.disabled = false;
        authButton.textContent = 'Authenticate with Google';
      }
    } catch (error) {
      console.error('Authentication error:', error);
      showMessage('Authentication error. Please check your Google Workspace account.', 'error');
      authButton.disabled = false;
      authButton.textContent = 'Authenticate with Google';
    }
  });
  
  // Extension toggle
  const extensionToggle = document.getElementById('extensionToggle');
  extensionToggle.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await chrome.storage.local.set({ extensionEnabled: enabled });
    
    if (enabled) {
      showMessage('Extension enabled', 'success');
    } else {
      showMessage('Extension disabled', 'info');
    }
  });
}

function updateAuthStatus(status, text) {
  const authStatus = document.getElementById('authStatus');
  authStatus.textContent = text;
  authStatus.className = `status-value status-${status}`;
}

function updateMeetingStatus(status) {
  const meetingStatus = document.getElementById('meetingStatus');
  meetingStatus.textContent = status;
  meetingStatus.className = `status-value ${status === 'In Meeting' ? 'status-active' : ''}`;
}

function updateRecordingStatus(status, text) {
  const recordingStatus = document.getElementById('recordingStatus');
  recordingStatus.textContent = text;
  recordingStatus.className = `status-value status-${status}`;
}

function showMessage(message, type) {
  const errorMessage = document.getElementById('errorMessage');
  errorMessage.textContent = message;
  errorMessage.className = `error-message message-${type}`;
  errorMessage.style.display = 'block';
  
  setTimeout(() => {
    errorMessage.style.display = 'none';
  }, 3000);
}

// Refresh status periodically
setInterval(async () => {
  await checkMeetingStatus();
}, 5000);

