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
  if (hostJoined) {
    console.log('[Auto Record] Already detected host join');
    return;
  }

  console.log('[Auto Record] Checking for host join... (attempt ' + (retryCount + 1) + ')');

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
    '[data-meeting-title]',
    // Bottom control bar
    '[aria-label*="Leave call"]',
    '[aria-label*="Leave"]',
    // Additional indicators
    'button[aria-label*="Leave"]',
    '[aria-label*="Mute microphone"]',
    '[aria-label*="Turn off camera"]'
  ];

  const foundIndicators = [];
  indicators.forEach(selector => {
    const element = document.querySelector(selector);
    if (element) {
      foundIndicators.push(selector);
    }
  });

  const hasJoined = foundIndicators.length > 0;
  console.log('[Auto Record] Join indicators found:', foundIndicators);

  if (hasJoined) {
    // Additional check: verify we're actually in a meeting (not just pre-join screen)
    const joinButton = document.querySelector('[jsname="Qx7uuf"]') || 
                      document.querySelector('[aria-label*="Join"]');
    
    console.log('[Auto Record] Join button found:', !!joinButton);
    
    if (!joinButton || joinButton.textContent.trim() === '') {
      console.log('[Auto Record] User has joined, checking for host status...');
      
      // For instant meetings, the creator is always the host
      // Check if recording button is available (indicates host)
      const recordingButton = findRecordingButton();
      console.log('[Auto Record] Recording button found:', !!recordingButton);
      
      if (recordingButton) {
        // User is host and recording button is available
        console.log('[Auto Record] ✅ Host detected - recording button found');
        hostJoined = true;
        handleHostJoined();
        return;
      }
      
      // Check for host controls indicator
      const hostControlsSelectors = [
        '[aria-label*="Host controls"]',
        '[data-tooltip*="Host"]',
        '[aria-label*="More options"]',
        'button[aria-label*="More options"]'
      ];
      
      let hostControls = null;
      for (const selector of hostControlsSelectors) {
        hostControls = document.querySelector(selector);
        if (hostControls) {
          console.log('[Auto Record] Host controls found:', selector);
          break;
        }
      }
      
      // For instant meetings, if user created it, they're the host
      // Check URL or other indicators
      const isInstantMeeting = window.location.href.includes('meet.google.com');
      const hasMeetingControls = document.querySelector('[aria-label*="Present"]') ||
                                 document.querySelector('[aria-label*="Activities"]') ||
                                 document.querySelector('[aria-label*="People"]');
      
      console.log('[Auto Record] Meeting controls found:', !!hasMeetingControls);
      
      // For instant meetings created by the user, they are always the host
      // Be more aggressive - if we're in a meeting and have controls, assume host
      if (hostControls || (isInstantMeeting && hasMeetingControls)) {
        console.log('[Auto Record] ✅ Host detected - proceeding to find recording button');
        // User is likely host, proceed anyway (button might be in menu)
        hostJoined = true;
        handleHostJoined();
      } else if (isInstantMeeting && hasJoined) {
        // For instant meetings, if user has joined, assume they're the host
        console.log('[Auto Record] ✅ Instant meeting detected - assuming host status');
        hostJoined = true;
        handleHostJoined();
      } else {
        // Retry to check if recording button appears
        console.log('[Auto Record] Host status unclear, retrying...');
        setTimeout(() => {
          if (!hostJoined && retryCount < MAX_RETRIES) {
            retryCount++;
            detectHostJoinViaDOM();
          } else if (retryCount >= MAX_RETRIES) {
            console.log('[Auto Record] ❌ Max retries reached, could not detect host');
            // Last resort: if in meeting, try anyway
            if (hasJoined && isInstantMeeting) {
              console.log('[Auto Record] 🔄 Last resort: proceeding anyway for instant meeting');
              hostJoined = true;
              handleHostJoined();
            }
          }
        }, RETRY_DELAY);
      }
    } else {
      console.log('[Auto Record] Still on pre-join screen, retrying...');
      setTimeout(() => {
        if (!hostJoined && retryCount < MAX_RETRIES) {
          retryCount++;
          detectHostJoinViaDOM();
        }
      }, RETRY_DELAY);
    }
  } else {
    // Retry after delay
    console.log('[Auto Record] No join indicators found, retrying...');
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
  console.log('[Auto Record] Starting recording...');
  const recordingButton = findRecordingButton();
  
  if (recordingButton) {
    try {
      console.log('[Auto Record] ✅ Recording button found, clicking...');
      // Click the recording button
      recordingButton.click();
      recordingStarted = true;
      console.log('[Auto Record] ✅ Recording button clicked successfully');
      
      // Notify background script
      chrome.runtime.sendMessage({
        action: 'recordingStarted',
        success: true
      });
    } catch (error) {
      console.error('[Auto Record] ❌ Error clicking recording button:', error);
      retryRecording();
    }
  } else {
    // Recording button not found, retry
    console.log('[Auto Record] ⚠️ Recording button not found, retrying...');
    retryRecording();
  }
}

// Find the recording button in the DOM
function findRecordingButton() {
  console.log('[Auto Record] Searching for recording button...');
  
  // Multiple selectors to try, as Google Meet uses dynamic class names
  
  // First, try to find all buttons and check their labels
  const allButtons = document.querySelectorAll('button, [role="button"]');
  console.log('[Auto Record] Total buttons found:', allButtons.length);
  
  // Log all button labels for debugging (first 20 buttons)
  const buttonLabels = [];
  for (let i = 0; i < Math.min(allButtons.length, 20); i++) {
    const button = allButtons[i];
    const ariaLabel = button.getAttribute('aria-label') || '';
    const textContent = button.textContent || '';
    const label = (ariaLabel || textContent).trim();
    if (label) {
      buttonLabels.push(label);
    }
  }
  console.log('[Auto Record] Sample button labels:', buttonLabels);
  
  for (const button of allButtons) {
    const ariaLabel = button.getAttribute('aria-label') || '';
    const textContent = button.textContent || '';
    const tooltip = button.getAttribute('data-tooltip') || '';
    const title = button.getAttribute('title') || '';
    const label = (ariaLabel + ' ' + textContent + ' ' + tooltip + ' ' + title).toLowerCase();
    
    // Check for recording-related text (more lenient)
    if (label.includes('record') && 
        !label.includes('stop') && 
        !label.includes('end') &&
        !label.includes('paused')) {
      console.log('[Auto Record] ✅ Found recording button:', ariaLabel || textContent || tooltip || title);
      return button;
    }
  }
  
  console.log('[Auto Record] Recording button not found in main buttons, checking menu...');
  
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
    console.log('[Auto Record] More options button found, opening menu...');
    // Click to open menu
    moreOptionsButton.click();
    
    // Wait for menu to open and search again - try multiple times with delays
    let menuCheckAttempts = 0;
    const checkMenu = () => {
      menuCheckAttempts++;
      const recordingButton = findRecordingButtonInMenu();
      if (recordingButton) {
        console.log('[Auto Record] ✅ Found recording button in menu, clicking...');
        recordingButton.click();
        recordingStarted = true;
        chrome.runtime.sendMessage({
          action: 'recordingStarted',
          success: true
        });
        return recordingButton;
      } else if (menuCheckAttempts < 5) {
        // Retry checking menu after delay (menu might be animating)
        setTimeout(checkMenu, 500);
      } else {
        console.log('[Auto Record] ⚠️ Recording button not found in menu after multiple attempts');
      }
    };
    
    // Start checking after initial delay
    setTimeout(checkMenu, 1000);
  }
  
  // Try "Activities" menu (opens Meeting Tools) - this is the primary method
  const activitiesButton = document.querySelector('[aria-label*="Activities"]') ||
                          document.querySelector('[data-tooltip*="Activities"]') ||
                          document.querySelector('button[aria-label*="activities" i]');
  if (activitiesButton) {
    console.log('[Auto Record] Activities button found, opening Meeting Tools...');
    activitiesButton.click();
    
    // Wait for Meeting Tools menu to open and find Recording
    // Try multiple times as menu might take time to render
    let meetingToolsAttempts = 0;
    const checkMeetingTools = () => {
      meetingToolsAttempts++;
      const recordingOption = findRecordingInMeetingTools();
      if (recordingOption) {
        console.log('[Auto Record] ✅ Found Recording option in Meeting Tools, clicking...');
        recordingOption.click();
        
        // Wait for recording dialog to appear
        setTimeout(() => {
          handleRecordingDialog();
        }, 1000);
      } else if (meetingToolsAttempts < 5) {
        // Retry after delay
        setTimeout(checkMeetingTools, 500);
      } else {
        console.log('[Auto Record] ⚠️ Recording option not found in Meeting Tools after multiple attempts');
      }
    };
    
    setTimeout(checkMeetingTools, 1000);
    return null; // Return early since we're handling this path
  }
  
  // Also try "Host controls" menu if it exists
  const hostControlsButton = document.querySelector('[aria-label*="Host controls"]') ||
                            document.querySelector('[data-tooltip*="Host controls"]');
  if (hostControlsButton) {
    console.log('[Auto Record] Host controls button found, trying that...');
    hostControlsButton.click();
    setTimeout(() => {
      const recordingButton = findRecordingButtonInMenu();
      if (recordingButton) {
        console.log('[Auto Record] ✅ Found recording button in host controls menu');
        recordingButton.click();
        recordingStarted = true;
        chrome.runtime.sendMessage({
          action: 'recordingStarted',
          success: true
        });
        return recordingButton;
      }
    }, 1000);
  }

  console.log('[Auto Record] ❌ Recording button not found');
  return null;
}

// Find Recording option in Meeting Tools menu
function findRecordingInMeetingTools() {
  console.log('[Auto Record] Searching for Recording in Meeting Tools...');
  
  // Look for elements with "Recording" text
  const allElements = document.querySelectorAll('div, button, [role="button"], [role="menuitem"], span, [data-value]');
  for (const element of allElements) {
    const text = (element.textContent || element.innerText || '').trim();
    const ariaLabel = element.getAttribute('aria-label') || '';
    const title = element.getAttribute('title') || '';
    
    // Check if it contains "Recording" (case insensitive)
    const fullText = (text + ' ' + ariaLabel + ' ' + title).toLowerCase();
    
    if (fullText.includes('recording')) {
      // Make sure it's clickable and visible
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      
      if (style.display !== 'none' && 
          style.visibility !== 'hidden' &&
          rect.width > 0 && 
          rect.height > 0) {
        console.log('[Auto Record] ✅ Found Recording option:', text || ariaLabel || title);
        // Try to find the clickable parent if this is a text element
        if (element.tagName === 'SPAN' || element.tagName === 'DIV') {
          const clickable = element.closest('button, [role="button"], [role="menuitem"]');
          if (clickable) {
            return clickable;
          }
        }
        return element;
      }
    }
  }
  
  // Also try aria-label selectors
  const ariaElements = document.querySelectorAll('[aria-label*="Recording" i], [aria-label*="recording"]');
  for (const element of ariaElements) {
    const style = window.getComputedStyle(element);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      console.log('[Auto Record] ✅ Found Recording option by aria-label:', element.getAttribute('aria-label'));
      return element;
    }
  }
  
  console.log('[Auto Record] ⚠️ Recording option not found in Meeting Tools');
  return null;
}

// Handle the recording dialog - check captions and transcript, then start
function handleRecordingDialog() {
  console.log('[Auto Record] Handling recording dialog...');
  
  // Wait a bit for dialog to fully render
  setTimeout(() => {
    // Find and check "Include captions in the recording" checkbox
    const captionsCheckbox = findCheckboxByLabel('Include captions');
    if (captionsCheckbox) {
      console.log('[Auto Record] Found captions checkbox, checking it...');
      if (!captionsCheckbox.checked) {
        captionsCheckbox.click();
      }
    } else {
      console.log('[Auto Record] ⚠️ Captions checkbox not found');
    }
    
    // Find and check "Also start a transcript" checkbox
    const transcriptCheckbox = findCheckboxByLabel('Also start a transcript');
    if (transcriptCheckbox) {
      console.log('[Auto Record] Found transcript checkbox, checking it...');
      if (!transcriptCheckbox.checked) {
        transcriptCheckbox.click();
      }
    } else {
      console.log('[Auto Record] ⚠️ Transcript checkbox not found');
    }
    
    // Wait a bit for checkboxes to update
    setTimeout(() => {
      // Find and click "Start recording" button
      const startRecordingButton = findStartRecordingButton();
      if (startRecordingButton) {
        console.log('[Auto Record] ✅ Clicking Start recording button...');
        startRecordingButton.click();
        recordingStarted = true;
        chrome.runtime.sendMessage({
          action: 'recordingStarted',
          success: true
        });
      } else {
        console.log('[Auto Record] ⚠️ Start recording button not found in dialog');
      }
    }, 500);
  }, 500);
}

// Find checkbox by label text
function findCheckboxByLabel(labelText) {
  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
  for (const checkbox of checkboxes) {
    // Check the label associated with this checkbox
    const label = checkbox.closest('label');
    if (label) {
      const labelTextContent = label.textContent || label.innerText || '';
      if (labelTextContent.toLowerCase().includes(labelText.toLowerCase())) {
        return checkbox;
      }
    }
    
    // Check aria-label
    const ariaLabel = checkbox.getAttribute('aria-label') || '';
    if (ariaLabel.toLowerCase().includes(labelText.toLowerCase())) {
      return checkbox;
    }
    
    // Check parent elements for label text
    let parent = checkbox.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
      const parentText = parent.textContent || parent.innerText || '';
      if (parentText.toLowerCase().includes(labelText.toLowerCase())) {
        return checkbox;
      }
      parent = parent.parentElement;
      depth++;
    }
  }
  
  return null;
}

// Find "Start recording" button in the dialog
function findStartRecordingButton() {
  const buttons = document.querySelectorAll('button, [role="button"]');
  for (const button of buttons) {
    const text = (button.textContent || button.innerText || '').trim();
    const ariaLabel = button.getAttribute('aria-label') || '';
    
    if ((text.toLowerCase().includes('start recording') ||
         text.toLowerCase() === 'start recording') ||
        (ariaLabel.toLowerCase().includes('start recording'))) {
      console.log('[Auto Record] ✅ Found Start recording button:', text || ariaLabel);
      return button;
    }
  }
  
  return null;
}

// Find the "More options" menu button
function findMoreOptionsButton() {
  // Find the three dots button in the bottom control bar
  // It's usually near the microphone/camera controls
  const selectors = [
    // Bottom bar three dots
    'button[aria-label*="More options"]',
    'button[aria-label*="more options"]',
    'button[aria-label*="More actions"]',
    'button[data-tooltip*="More"]',
    // Bottom control bar - look for three dots icon
    'div[role="toolbar"] button:has(svg)',
    'div[role="toolbar"] button[aria-label*="More"]',
    // Alternative selector
    'button[jsname="b3VHJd"]',
  ];

  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      // Find the one that's actually visible and in the bottom bar
      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        // Check if button is visible and in bottom part of screen
        if (style.display !== 'none' && 
            style.visibility !== 'hidden' &&
            rect.bottom > window.innerHeight * 0.7) { // Bottom 30% of screen
          const ariaLabel = element.getAttribute('aria-label') || '';
          if (ariaLabel.toLowerCase().includes('more') || 
              ariaLabel.toLowerCase().includes('options')) {
            return element;
          }
        }
      }
    } catch (error) {
      // Invalid selector, continue
      continue;
    }
  }

  return null;
}

// Find recording button in menu
function findRecordingButtonInMenu() {
  console.log('[Auto Record] Searching in menu...');
  
  // Search in the opened menu - try multiple menu selectors
  const menuSelectors = [
    '[role="menu"]',
    '[role="listbox"]',
    '[jsname="b3VHJd"]',
    '[aria-label*="More options"]',
    'div[role="menu"]',
    'ul[role="menu"]',
    '[role="dialog"]', // Some menus use dialog
    '[role="list"]' // Some menus use list
  ];
  
  for (const menuSelector of menuSelectors) {
    const menus = document.querySelectorAll(menuSelector);
    console.log(`[Auto Record] Found ${menus.length} menus with selector: ${menuSelector}`);
    
    for (const menu of menus) {
      // Check if menu is visible
      const style = window.getComputedStyle(menu);
      if (style.display === 'none' || style.visibility === 'hidden') {
        continue;
      }
      
      const buttons = menu.querySelectorAll('button, [role="button"], [role="menuitem"], div[role="menuitem"], span[role="button"]');
      console.log(`[Auto Record] Found ${buttons.length} items in menu`);
      
      // Log ALL menu items for debugging
      const allMenuItems = [];
      for (const button of buttons) {
        const ariaLabel = button.getAttribute('aria-label') || '';
        const textContent = button.textContent || '';
        const innerText = button.innerText || '';
        const title = button.getAttribute('title') || '';
        const label = (ariaLabel + ' ' + textContent + ' ' + innerText + ' ' + title).toLowerCase();
        
        const itemText = ariaLabel || textContent || innerText || title || 'unnamed';
        allMenuItems.push(itemText);
        
        // Log recording-related items
        if (label.includes('record') || label.includes('start') || label.includes('meeting') || label.includes('capture')) {
          console.log(`[Auto Record] ⚠️ Found relevant menu item: "${itemText}"`);
        }
        
        // Check for recording-related text (more lenient - try multiple patterns)
        if ((label.includes('record') && !label.includes('stop') && !label.includes('end') && !label.includes('paused')) ||
            (label.includes('start') && label.includes('recording')) ||
            (label.includes('start') && label.includes('meeting') && label.includes('record')) ||
            (label.includes('meeting') && label.includes('record'))) {
          console.log('[Auto Record] ✅ Found recording button in menu:', itemText);
          return button;
        }
      }
      
      // Log all menu items if no recording button found
      if (allMenuItems.length > 0 && allMenuItems.length < 20) {
        console.log('[Auto Record] All menu items:', allMenuItems);
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

