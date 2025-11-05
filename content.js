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

  // Try "More options" menu first - look for "Manage recording" option
  const moreOptionsButton = findMoreOptionsButton();
  if (moreOptionsButton) {
    console.log('[Auto Record] More options button found, opening menu...');
    // Click to open menu
    moreOptionsButton.click();
    
    // Wait 1-2 seconds for menu to fully open and stabilize before trying to click
    console.log('[Auto Record] Waiting for menu to open...');
    setTimeout(() => {
      const manageRecordingOption = findManageRecordingOption();
      if (manageRecordingOption) {
        console.log('[Auto Record] ✅ Found "Manage recording" option, clicking...');
        manageRecordingOption.click();
        
        // Wait for recording panel/slideout to appear
        setTimeout(() => {
          handleRecordingDialog();
        }, 1000);
      } else {
        console.log('[Auto Record] ⚠️ "Manage recording" option not found, retrying once...');
        // Retry once after another delay
        setTimeout(() => {
          const manageRecordingOption = findManageRecordingOption();
          if (manageRecordingOption) {
            console.log('[Auto Record] ✅ Found "Manage recording" option on retry, clicking...');
            manageRecordingOption.click();
            setTimeout(() => {
              handleRecordingDialog();
            }, 1000);
          } else {
            console.log('[Auto Record] ❌ "Manage recording" option not found after retry');
          }
        }, 1000);
      }
    }, 1500); // Wait 1.5 seconds for menu to open and stabilize
  }
  
  // Fallback: Try "Activities" menu (opens Meeting Tools) if More options didn't work
  const activitiesButton = document.querySelector('[aria-label*="Activities"]') ||
                          document.querySelector('[data-tooltip*="Activities"]') ||
                          document.querySelector('button[aria-label*="activities" i]');
  if (activitiesButton && !moreOptionsButton) {
    console.log('[Auto Record] Activities button found, opening Meeting Tools...');
    activitiesButton.click();
    
    // Wait for Meeting Tools menu to open and find Recording
    setTimeout(() => {
      const recordingOption = findRecordingInMeetingTools();
      if (recordingOption) {
        console.log('[Auto Record] ✅ Found Recording option in Meeting Tools, clicking...');
        recordingOption.click();
        
        // Wait for recording dialog to appear
        setTimeout(() => {
          handleRecordingDialog();
        }, 1000);
      } else {
        console.log('[Auto Record] ⚠️ Recording option not found in Meeting Tools');
      }
    }, 1500); // Wait for menu to open
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

// Find "Manage recording" option in the More options menu
function findManageRecordingOption() {
  console.log('[Auto Record] Searching for "Manage recording" option...');
  
  // First, try to find the menu that's open
  const menuSelectors = [
    '[role="menu"]',
    '[role="listbox"]',
    'div[role="menu"]',
    'ul[role="menu"]',
    '[role="list"]'
  ];
  
  let menu = null;
  for (const selector of menuSelectors) {
    const menus = document.querySelectorAll(selector);
    for (const m of menus) {
      const style = window.getComputedStyle(m);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        const menuText = (m.textContent || m.innerText || '').toLowerCase();
        if (menuText.includes('manage recording') || menuText.includes('cast this meeting')) {
          menu = m;
          console.log('[Auto Record] Found open menu with selector:', selector);
          break;
        }
      }
    }
    if (menu) break;
  }
  
  // Search in the menu if found, otherwise search everywhere
  const searchRoot = menu || document;
  
  // Look for elements with "Manage recording" text (may have icon prefixes like "radio_button_checkedManage recording")
  const allElements = searchRoot.querySelectorAll('div, button, [role="button"], [role="menuitem"], span, li');
  for (const element of allElements) {
    const text = (element.textContent || element.innerText || '').trim();
    const ariaLabel = (element.getAttribute('aria-label') || '').trim();
    
    // Check if it contains "Manage recording" (case insensitive, ignore icon prefixes)
    const fullText = (text + ' ' + ariaLabel).toLowerCase();
    
    // Match "manage recording" even if there's text before it (like icon names)
    if (fullText.includes('manage recording')) {
      // Make sure it's clickable and visible
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      
      if (style.display !== 'none' && 
          style.visibility !== 'hidden' &&
          rect.width > 0 && 
          rect.height > 0) {
        console.log('[Auto Record] ✅ Found "Manage recording" option:', text || ariaLabel);
        // Try to find the clickable parent if this is a text element
        if (element.tagName === 'SPAN' || element.tagName === 'DIV' || element.tagName === 'LI') {
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
  const ariaElements = searchRoot.querySelectorAll('[aria-label*="Manage recording" i], [aria-label*="manage recording"]');
  for (const element of ariaElements) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.display !== 'none' && 
        style.visibility !== 'hidden' &&
        rect.width > 0 && 
        rect.height > 0) {
      console.log('[Auto Record] ✅ Found "Manage recording" option by aria-label:', element.getAttribute('aria-label'));
      return element;
    }
  }
  
  console.log('[Auto Record] ⚠️ "Manage recording" option not found');
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
  
  // Wait longer for recording panel/slideout to fully appear (it can take 5+ seconds)
  let dialogAttempts = 0;
  const processDialog = () => {
    dialogAttempts++;
    console.log(`[Auto Record] Processing dialog (attempt ${dialogAttempts})...`);
    
    // Check if recording panel is visible by looking for "Record your video call" or "Start recording" text
    const recordingPanel = document.querySelector('[role="dialog"]') || 
                          document.querySelector('[role="complementary"]') ||
                          document.querySelector('div[class*="sidebar"]') ||
                          document.querySelector('div[class*="panel"]');
    
    const panelText = (recordingPanel ? (recordingPanel.textContent || recordingPanel.innerText || '') : '').toLowerCase();
    const hasRecordingPanel = recordingPanel && 
      (panelText.includes('record') || panelText.includes('captions') || panelText.includes('transcript'));
    
    // Also check for Start recording button as indicator
    const startButton = findStartRecordingButton();
    const hasStartButton = !!startButton;
    
    console.log('[Auto Record] Panel found:', !!recordingPanel, 'Has start button:', hasStartButton);
    
    if ((!hasRecordingPanel || !hasStartButton) && dialogAttempts === 1) {
      console.log('[Auto Record] Recording panel not fully loaded yet, waiting longer...');
      setTimeout(processDialog, 2000); // Wait 2 more seconds
      return;
    }
    
    if (!hasRecordingPanel && !hasStartButton) {
      console.log('[Auto Record] ⚠️ Recording panel not found after retry');
      return;
    }
    
    // Find and check "Include captions in the recording" checkbox
    console.log('[Auto Record] Looking for captions checkbox...');
    const captionsCheckbox = findCheckboxByLabel('Include captions');
    if (captionsCheckbox) {
      console.log('[Auto Record] Found captions checkbox, checking it...');
      const style = window.getComputedStyle(captionsCheckbox);
      console.log('[Auto Record] Captions checkbox visibility:', style.display, style.visibility, 'checked:', captionsCheckbox.checked);
      
      if (!captionsCheckbox.checked) {
        // Try clicking the label first if it exists
        const label = captionsCheckbox.closest('label');
        if (label) {
          console.log('[Auto Record] Clicking label for captions checkbox');
          label.click();
        } else {
          // Scroll into view first
          captionsCheckbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            captionsCheckbox.click();
            console.log('[Auto Record] ✅ Captions checkbox clicked');
          }, 200);
        }
      } else {
        console.log('[Auto Record] Captions checkbox already checked');
      }
    } else {
      console.log('[Auto Record] ⚠️ Captions checkbox not found');
      logAllCheckboxes();
    }
    
    // Find and check "Also start a transcript" checkbox
    console.log('[Auto Record] Looking for transcript checkbox...');
    const transcriptCheckbox = findCheckboxByLabel('Also start a transcript') ||
                               findCheckboxByLabel('start a transcript') ||
                               findCheckboxByLabel('transcript');
    if (transcriptCheckbox) {
      console.log('[Auto Record] Found transcript checkbox, checking it...');
      const style = window.getComputedStyle(transcriptCheckbox);
      console.log('[Auto Record] Transcript checkbox visibility:', style.display, style.visibility, 'checked:', transcriptCheckbox.checked);
      
      if (!transcriptCheckbox.checked) {
        // Try clicking the label first if it exists
        const label = transcriptCheckbox.closest('label');
        if (label) {
          console.log('[Auto Record] Clicking label for transcript checkbox');
          label.click();
        } else {
          // Scroll into view first
          transcriptCheckbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            transcriptCheckbox.click();
            console.log('[Auto Record] ✅ Transcript checkbox clicked');
          }, 200);
        }
      } else {
        console.log('[Auto Record] Transcript checkbox already checked');
      }
    } else {
      console.log('[Auto Record] ⚠️ Transcript checkbox not found');
      logAllCheckboxes();
      
      // Retry once if not found
      if (dialogAttempts === 1) {
        setTimeout(processDialog, 2000);
        return;
      }
    }
    
    // Wait a bit for checkboxes to update, then click Start
    setTimeout(() => {
      // Verify checkboxes were actually checked
      const captionsCheckbox = findCheckboxByLabel('Include captions');
      const transcriptCheckbox = findCheckboxByLabel('Also start a transcript') ||
                                 findCheckboxByLabel('start a transcript') ||
                                 findCheckboxByLabel('transcript');
      
      console.log('[Auto Record] Final checkbox status - Captions:', captionsCheckbox?.checked, 'Transcript:', transcriptCheckbox?.checked);
      
      // First, handle consent dialog if it exists
      const consentStartButton = findConsentStartButton();
      if (consentStartButton) {
        console.log('[Auto Record] Found consent dialog Start button, clicking...');
        consentStartButton.click();
        // After clicking consent, wait and then click the main Start button
        setTimeout(() => {
          clickStartRecordingButton();
        }, 500);
      } else {
        // No consent dialog, go straight to Start button
        clickStartRecordingButton();
      }
    }, 800); // Increased delay for checkbox clicks to register
  };
  
  // Start processing after longer delay to let panel fully render (5+ seconds)
  setTimeout(processDialog, 2500); // Wait 2.5 seconds initially
  setTimeout(() => processDialog(), 5000); // Retry after 5 seconds if first attempt failed
}

// Helper function to log all checkboxes for debugging
function logAllCheckboxes() {
  const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
  console.log(`[Auto Record] Found ${allCheckboxes.length} checkboxes total`);
  for (let i = 0; i < allCheckboxes.length; i++) {
    const cb = allCheckboxes[i];
    const label = cb.closest('label');
    const labelText = label ? (label.textContent || label.innerText || '').trim() : '';
    const ariaLabel = cb.getAttribute('aria-label') || '';
    const ariaLabelledBy = cb.getAttribute('aria-labelledby');
    let labelledByText = '';
    if (ariaLabelledBy) {
      const labelEl = document.getElementById(ariaLabelledBy);
      if (labelEl) {
        labelledByText = (labelEl.textContent || labelEl.innerText || '').trim();
      }
    }
    const style = window.getComputedStyle(cb);
    const rect = cb.getBoundingClientRect();
    console.log(`[Auto Record] Checkbox ${i}: checked=${cb.checked}, visible=${style.display !== 'none' && style.visibility !== 'hidden'}, ` +
                `display=${style.display}, position=(${rect.left},${rect.top}), ` +
                `label="${labelText}", aria-label="${ariaLabel}", aria-labelledby="${labelledByText}"`);
  }
}

// Find checkbox by label text (more comprehensive search)
function findCheckboxByLabel(labelText) {
  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
  const searchText = labelText.toLowerCase();
  
  // First, try to find visible checkboxes
  const visibleCheckboxes = [];
  for (const checkbox of checkboxes) {
    const style = window.getComputedStyle(checkbox);
    const rect = checkbox.getBoundingClientRect();
    // Check if checkbox is visible (not hidden, has dimensions)
    if (style.display !== 'none' && 
        style.visibility !== 'hidden' &&
        rect.width > 0 && 
        rect.height > 0) {
      visibleCheckboxes.push(checkbox);
    }
  }
  
  console.log(`[Auto Record] Searching for "${labelText}" in ${visibleCheckboxes.length} visible checkboxes`);
  
  for (const checkbox of visibleCheckboxes) {
    // Check the label associated with this checkbox
    const label = checkbox.closest('label');
    if (label) {
      const labelTextContent = (label.textContent || label.innerText || '').toLowerCase();
      if (labelTextContent.includes(searchText)) {
        console.log(`[Auto Record] Found checkbox by label: "${labelTextContent.substring(0, 50)}"`);
        return checkbox;
      }
    }
    
    // Check aria-label
    const ariaLabel = (checkbox.getAttribute('aria-label') || '').toLowerCase();
    if (ariaLabel.includes(searchText)) {
      console.log(`[Auto Record] Found checkbox by aria-label: "${ariaLabel}"`);
      return checkbox;
    }
    
    // Check aria-labelledby
    const labelledBy = checkbox.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelElement = document.getElementById(labelledBy);
      if (labelElement) {
        const labelTextContent = (labelElement.textContent || labelElement.innerText || '').toLowerCase();
        if (labelTextContent.includes(searchText)) {
          console.log(`[Auto Record] Found checkbox by aria-labelledby: "${labelTextContent.substring(0, 50)}"`);
          return checkbox;
        }
      }
    }
    
    // Check parent elements for label text (more thorough)
    let parent = checkbox.parentElement;
    let depth = 0;
    while (parent && depth < 10) {
      const parentText = (parent.textContent || parent.innerText || '').toLowerCase();
      // Check if parent contains the label text
      if (parentText.includes(searchText)) {
        // Make sure we're not matching something too generic
        // Check if there's a more specific text element nearby
        const textElements = parent.querySelectorAll('span, div, p, label');
        for (const textEl of textElements) {
          const textContent = (textEl.textContent || textEl.innerText || '').toLowerCase();
          if (textContent.includes(searchText) && textContent.length < 200) {
            console.log(`[Auto Record] Found checkbox by parent text element: "${textContent.substring(0, 50)}"`);
            return checkbox;
          }
        }
        console.log(`[Auto Record] Found checkbox by parent text: "${parentText.substring(0, 50)}"`);
        return checkbox;
      }
      parent = parent.parentElement;
      depth++;
    }
    
    // Check sibling elements (including previous siblings)
    const nextSibling = checkbox.nextElementSibling;
    if (nextSibling) {
      const siblingText = (nextSibling.textContent || nextSibling.innerText || '').toLowerCase();
      if (siblingText.includes(searchText)) {
        console.log(`[Auto Record] Found checkbox by next sibling: "${siblingText.substring(0, 50)}"`);
        return checkbox;
      }
    }
    
    const prevSibling = checkbox.previousElementSibling;
    if (prevSibling) {
      const siblingText = (prevSibling.textContent || prevSibling.innerText || '').toLowerCase();
      if (siblingText.includes(searchText)) {
        console.log(`[Auto Record] Found checkbox by previous sibling: "${siblingText.substring(0, 50)}"`);
        return checkbox;
      }
    }
  }
  
  return null;
}

// Find consent dialog Start button ("Make sure everyone is ready")
function findConsentStartButton() {
  const buttons = document.querySelectorAll('button, [role="button"]');
  for (const button of buttons) {
    const text = (button.textContent || button.innerText || '').trim().toLowerCase();
    const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
    
    // Look for "Start" button in consent dialog (not "Start recording")
    if ((text === 'start' || text === 'start recording') &&
        (ariaLabel.includes('start') || ariaLabel.includes('recording') || ariaLabel === '')) {
      // Check if it's in a dialog that mentions consent/ready
      const dialog = button.closest('[role="dialog"], div[class*="dialog"], div[class*="modal"]');
      if (dialog) {
        const dialogText = (dialog.textContent || dialog.innerText || '').toLowerCase();
        if (dialogText.includes('ready') || dialogText.includes('consent') || dialogText.includes('everyone')) {
          console.log('[Auto Record] ✅ Found consent dialog Start button');
          return button;
        }
      }
    }
  }
  
  return null;
}

// Find and click "Start recording" button in the dialog
function clickStartRecordingButton() {
  const buttons = document.querySelectorAll('button, [role="button"]');
  for (const button of buttons) {
    const text = (button.textContent || button.innerText || '').trim().toLowerCase();
    const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
    
    // Look for "Start recording" button (in the sidebar panel)
    if ((text.includes('start recording') || text === 'start recording') ||
        (ariaLabel.includes('start recording'))) {
      // Make sure it's visible and clickable
      const style = window.getComputedStyle(button);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        console.log('[Auto Record] ✅ Found Start recording button, clicking...');
        button.click();
        recordingStarted = true;
        chrome.runtime.sendMessage({
          action: 'recordingStarted',
          success: true
        });
        return true;
      }
    }
  }
  
  console.log('[Auto Record] ⚠️ Start recording button not found');
  return false;
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


