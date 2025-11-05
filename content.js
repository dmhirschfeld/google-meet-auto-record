// Content script for Google Meet Auto Record extension

let hostJoined = false;
let recordingStarted = false;
let detectionMethod = 'dom'; // 'api' or 'dom' or 'polling'
let retryCount = 0;
const MAX_RETRIES = 10;
const RETRY_DELAY = 2000; // 2 seconds

// Initialize when page loads
(function() {
  'use strict';
  
  console.log('Google Meet Auto Record content script loaded');
  
  // Listen for messages from background script and popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'hostJoined') {
      handleHostJoined();
      sendResponse({ success: true });
    } else if (request.action === 'startHostDetection') {
      detectionMethod = request.method || 'dom';
      startHostDetection();
      sendResponse({ success: true });
    } else if (request.action === 'getRecordingStatus') {
      sendResponse({ 
        recording: recordingStarted,
        hostJoined: hostJoined
      });
      return true;
    }
    return true;
  });

  // Start detection when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startHostDetection);
  } else {
    startHostDetection();
  }
})();

// Start host detection based on method
async function startHostDetection() {
  // Check if extension is enabled
  const result = await chrome.storage.local.get(['extensionEnabled']);
  const enabled = result.extensionEnabled !== false; // Default to true
  
  if (!enabled) {
    console.log('Extension is disabled');
    return;
  }
  
  if (detectionMethod === 'polling' || detectionMethod === 'dom') {
    detectHostJoinViaDOM();
  }
  // API method will be triggered by background script message
}

// Detect host join via DOM monitoring
function detectHostJoinViaDOM() {
  if (hostJoined) return;

  // Check for indicators that user has joined the meeting
  const indicators = [
    // Meeting controls/toolbar
    '[data-self-name]',
    '[jsname="BOHaEe"]', // Common Meet control container
    '[aria-label*="microphone"]',
    '[aria-label*="camera"]',
    // Participant info
    '[data-participant-id]',
    // Meeting header
    '[data-meeting-title]'
  ];

  const hasJoined = indicators.some(selector => {
    return document.querySelector(selector) !== null;
  });

  if (hasJoined) {
    // Additional check: verify we're actually in a meeting (not just pre-join screen)
    const joinButton = document.querySelector('[jsname="Qx7uuf"]') || 
                      document.querySelector('[aria-label*="Join"]');
    
    if (!joinButton || joinButton.textContent.trim() === '') {
      // User has joined, start recording process
      hostJoined = true;
      handleHostJoined();
    }
  } else {
    // Retry after delay
    setTimeout(() => {
      if (!hostJoined && retryCount < MAX_RETRIES) {
        retryCount++;
        detectHostJoinViaDOM();
      }
    }, RETRY_DELAY);
  }
}

// Handle host joined event
async function handleHostJoined() {
  if (recordingStarted) {
    console.log('Recording already started');
    return;
  }

  // Check if extension is enabled
  const result = await chrome.storage.local.get(['extensionEnabled']);
  const enabled = result.extensionEnabled !== false; // Default to true
  
  if (!enabled) {
    console.log('Extension is disabled, skipping recording');
    return;
  }

  console.log('Host joined detected, looking for recording button...');
  startRecording();
}

// Start recording by clicking the recording button
function startRecording() {
  const recordingButton = findRecordingButton();
  
  if (recordingButton) {
    try {
      // Click the recording button
      recordingButton.click();
      recordingStarted = true;
      console.log('Recording button clicked successfully');
      
      // Notify background script
      chrome.runtime.sendMessage({
        action: 'recordingStarted',
        success: true
      });
    } catch (error) {
      console.error('Error clicking recording button:', error);
      retryRecording();
    }
  } else {
    // Recording button not found, retry
    retryRecording();
  }
}

// Find the recording button in the DOM
function findRecordingButton() {
  // Multiple selectors to try, as Google Meet uses dynamic class names
  
  // First, try to find all buttons and check their labels
  const allButtons = document.querySelectorAll('button, [role="button"]');
  for (const button of allButtons) {
    const ariaLabel = button.getAttribute('aria-label') || '';
    const textContent = button.textContent || '';
    const tooltip = button.getAttribute('data-tooltip') || '';
    const label = (ariaLabel + ' ' + textContent + ' ' + tooltip).toLowerCase();
    
    // Check for recording-related text
    if ((label.includes('record') && label.includes('start')) || 
        (label.includes('record') && !label.includes('stop') && !label.includes('end'))) {
      console.log('Found recording button:', ariaLabel || textContent || tooltip);
      return button;
    }
  }
  
  // Try direct selectors
  const selectors = [
    // By aria-label (most reliable)
    '[aria-label*="Start recording"]',
    '[aria-label*="start recording"]',
    '[aria-label*="Record meeting"]',
    '[aria-label*="record meeting"]',
    '[aria-label*="Record"]',
    '[aria-label*="record"]',
    '[data-tooltip*="record"]',
    '[data-tooltip*="Record"]',
    
    // By role and text
    'button[role="button"][aria-label*="record" i]',
  ];

  // Try each selector
  for (const selector of selectors) {
    try {
      // Handle :has-text pseudo-selector manually
      if (selector.includes(':has-text')) {
        const buttons = document.querySelectorAll('button[role="button"]');
        for (const button of buttons) {
          const label = button.getAttribute('aria-label') || button.textContent || '';
          if (label.toLowerCase().includes('record') && 
              (label.toLowerCase().includes('start') || label.toLowerCase().includes('record'))) {
            return button;
          }
        }
      } else {
        const element = document.querySelector(selector);
        if (element) {
          return element;
        }
      }
    } catch (error) {
      // Invalid selector, continue
      continue;
    }
  }

  // If not found, try searching in the "More options" menu
  const moreOptionsButton = findMoreOptionsButton();
  if (moreOptionsButton) {
    // Click to open menu
    moreOptionsButton.click();
    
    // Wait for menu to open and search again
    setTimeout(() => {
      const recordingButton = findRecordingButtonInMenu();
      if (recordingButton) {
        recordingButton.click();
        recordingStarted = true;
      }
    }, 500);
  }

  return null;
}

// Find the "More options" menu button
function findMoreOptionsButton() {
  const selectors = [
    '[aria-label*="More options"]',
    '[aria-label*="more options"]',
    '[aria-label*="More actions"]',
    '[data-tooltip*="More"]',
    'button[jsname="b3VHJd"]', // Common Meet button selector
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }

  return null;
}

// Find recording button in menu
function findRecordingButtonInMenu() {
  // Search in the opened menu - try multiple menu selectors
  const menuSelectors = [
    '[role="menu"]',
    '[role="listbox"]',
    '[jsname="b3VHJd"]',
    '[aria-label*="More options"]',
    'div[role="menu"]',
    'ul[role="menu"]'
  ];
  
  for (const menuSelector of menuSelectors) {
    const menu = document.querySelector(menuSelector);
    if (menu) {
      const buttons = menu.querySelectorAll('button, [role="button"], [role="menuitem"]');
      for (const button of buttons) {
        const ariaLabel = button.getAttribute('aria-label') || '';
        const textContent = button.textContent || '';
        const label = (ariaLabel + ' ' + textContent).toLowerCase();
        
        // Check for recording-related text
        if ((label.includes('record') && label.includes('start')) ||
            (label.includes('record') && !label.includes('stop') && !label.includes('end'))) {
          console.log('Found recording button in menu:', ariaLabel || textContent);
          return button;
        }
      }
    }
  }

  return null;
}

// Retry recording with exponential backoff
function retryRecording() {
  if (recordingStarted) return;
  
  retryCount++;
  if (retryCount >= MAX_RETRIES) {
    console.error('Max retries reached, could not start recording');
    chrome.runtime.sendMessage({
      action: 'recordingFailed',
      reason: 'max_retries'
    });
    return;
  }

  const delay = Math.min(RETRY_DELAY * Math.pow(2, retryCount - 1), 30000); // Max 30 seconds
  
  console.log(`Retrying recording in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`);
  
  setTimeout(() => {
    startRecording();
  }, delay);
}

// Monitor for recording status changes
function monitorRecordingStatus() {
  const observer = new MutationObserver(() => {
    // Check if recording indicator appears
    const recordingIndicator = document.querySelector('[aria-label*="recording"]') ||
                              document.querySelector('[data-tooltip*="recording"]');
    
    if (recordingIndicator && !recordingStarted) {
      recordingStarted = true;
      chrome.runtime.sendMessage({
        action: 'recordingDetected',
        success: true
      });
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label', 'data-tooltip']
  });
}

// Start monitoring for recording status
monitorRecordingStatus();

