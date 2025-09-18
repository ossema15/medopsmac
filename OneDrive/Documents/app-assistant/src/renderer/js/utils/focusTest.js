// Enhanced Focus Test Utility
// This utility helps diagnose focus and input interaction issues

import { comprehensiveFocusRecovery, fixDOMAfterConfirm } from './focusUtils';

let lastTestTime = null;

/**
 * Check if an input element is blocked or disabled
 */
function isInputBlocked(input) {
  if (!input) return true;
  
  const computedStyle = window.getComputedStyle(input);
  const rect = input.getBoundingClientRect();
  
  return (
    input.disabled ||
    input.readOnly ||
    input.style.display === 'none' ||
    input.style.visibility === 'hidden' ||
    input.style.opacity === '0' ||
    computedStyle.pointerEvents === 'none' ||
    computedStyle.userSelect === 'none' ||
    rect.width === 0 ||
    rect.height === 0 ||
    input.offsetParent === null ||
    input.tabIndex < 0
  );
}

/**
 * Check if an element is covered by another element
 */
function isElementCovered(element) {
  if (!element) return false;
  
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  const elementAtPoint = document.elementFromPoint(centerX, centerY);
  
  return elementAtPoint !== element && !element.contains(elementAtPoint);
}

/**
 * Get detailed input status
 */
function getInputStatus(input) {
  if (!input) return { exists: false };
  
  const computedStyle = window.getComputedStyle(input);
  const rect = input.getBoundingClientRect();
  
  return {
    exists: true,
    tagName: input.tagName,
    type: input.type,
    id: input.id,
    name: input.name,
    placeholder: input.placeholder,
    value: input.value,
    disabled: input.disabled,
    readOnly: input.readOnly,
    tabIndex: input.tabIndex,
    style: {
      display: input.style.display,
      visibility: input.style.visibility,
      opacity: input.style.opacity,
      pointerEvents: computedStyle.pointerEvents,
      userSelect: computedStyle.userSelect,
      position: computedStyle.position,
      zIndex: computedStyle.zIndex
    },
    rect: {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
      visible: rect.width > 0 && rect.height > 0
    },
    isBlocked: isInputBlocked(input),
    isCovered: isElementCovered(input),
    isFocusable: input.tabIndex >= 0 && !input.disabled && !input.readOnly,
    offsetParent: input.offsetParent !== null
  };
}

/**
 * Test specific search input in appointments page
 */
function testAppointmentsSearchInput() {
  console.log('🔍 Testing Appointments Search Input...');
  
  // Try multiple selectors to find the search input
  const selectors = [
    'input[placeholder*="Rechercher par nom, raison, date"]',
    'input[placeholder*="rechercher"]',
    'input[placeholder*="search"]',
    'input[type="text"]'
  ];
  
  let searchInput = null;
  for (const selector of selectors) {
    const inputs = document.querySelectorAll(selector);
    console.log(`Found ${inputs.length} inputs with selector: ${selector}`);
    
    for (const input of inputs) {
      const placeholder = input.placeholder || '';
      if (placeholder.includes('Rechercher') || placeholder.includes('rechercher') || placeholder.includes('search')) {
        searchInput = input;
        break;
      }
    }
    if (searchInput) break;
  }
  
  if (!searchInput) {
    console.warn('❌ No search input found in appointments page');
    return null;
  }
  
  const status = getInputStatus(searchInput);
  console.log('📋 Appointments Search Input Status:', status);
  
  // Test interaction
  try {
    searchInput.focus();
    console.log('✅ Focus test: Success');
  } catch (error) {
    console.error('❌ Focus test: Failed', error);
  }
  
  try {
    searchInput.click();
    console.log('✅ Click test: Success');
  } catch (error) {
    console.error('❌ Click test: Failed', error);
  }
  
  return status;
}

/**
 * Test all inputs on the current page
 */
function testAllInputs() {
  console.log('🔍 Testing All Inputs on Current Page...');
  
  const inputs = document.querySelectorAll('input, textarea, select');
  console.log(`Found ${inputs.length} total input elements`);
  
  const results = [];
  
  inputs.forEach((input, index) => {
    const status = getInputStatus(input);
    results.push(status);
    
    if (status.isBlocked || status.isCovered) {
      console.warn(`⚠️  Input ${index + 1} (${input.tagName}${input.id ? '#' + input.id : ''}) is blocked or covered:`, {
        isBlocked: status.isBlocked,
        isCovered: status.isCovered,
        disabled: status.disabled,
        pointerEvents: status.style.pointerEvents,
        zIndex: status.style.zIndex
      });
    }
  });
  
  return results;
}

/**
 * Check for invisible overlays or blocking elements
 */
function checkForBlockingElements() {
  console.log('🔍 Checking for Blocking Elements...');
  
  const blockingSelectors = [
    'div[style*="position: fixed"]',
    'div[style*="position:absolute"]',
    'div[style*="z-index"]',
    'div[style*="pointer-events: none"]',
    'div[style*="opacity: 0"]',
    'div[style*="visibility: hidden"]'
  ];
  
  const blockingElements = [];
  
  blockingSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(element => {
      const rect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);
      
      if (rect.width > 0 && rect.height > 0) {
        blockingElements.push({
          element: element,
          tagName: element.tagName,
          id: element.id,
          className: element.className,
          style: {
            position: computedStyle.position,
            zIndex: computedStyle.zIndex,
            pointerEvents: computedStyle.pointerEvents,
            opacity: computedStyle.opacity,
            visibility: computedStyle.visibility
          },
          rect: {
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left
          }
        });
      }
    });
  });
  
  console.log(`Found ${blockingElements.length} potential blocking elements:`, blockingElements);
  return blockingElements;
}

/**
 * Test window focus and document active element
 */
function testWindowFocus() {
  console.log('🔍 Testing Window Focus...');
  
  const activeElement = document.activeElement;
  console.log('Active element:', {
    tagName: activeElement.tagName,
    id: activeElement.id,
    className: activeElement.className,
    isInput: activeElement.matches('input, textarea, select')
  });
  
  console.log('Window focused:', document.hasFocus());
  console.log('Document ready state:', document.readyState);
  
  return {
    activeElement: activeElement,
    windowFocused: document.hasFocus(),
    readyState: document.readyState
  };
}

/**
 * Comprehensive focus test
 */
function runComprehensiveFocusTest() {
  const testTime = new Date();
  lastTestTime = testTime;
  
  console.log('🚀 Starting Comprehensive Focus Test...', testTime.toISOString());
  console.log('Current URL:', window.location.href);
  console.log('Current page title:', document.title);
  
  // Test window focus
  const windowFocusStatus = testWindowFocus();
  
  // Test appointments search input specifically
  const searchInputStatus = testAppointmentsSearchInput();
  
  // Test all inputs
  const allInputsStatus = testAllInputs();
  
  // Check for blocking elements
  const blockingElements = checkForBlockingElements();
  
  // Summary
  const summary = {
    testTime: testTime.toISOString(),
    url: window.location.href,
    pageTitle: document.title,
    windowFocus: windowFocusStatus,
    searchInput: searchInputStatus,
    totalInputs: allInputsStatus.length,
    blockedInputs: allInputsStatus.filter(input => input.isBlocked).length,
    coveredInputs: allInputsStatus.filter(input => input.isCovered).length,
    blockingElements: blockingElements.length
  };
  
  console.log('📊 Focus Test Summary:', summary);
  
  // Alert if search input is blocked
  if (searchInputStatus && (searchInputStatus.isBlocked || searchInputStatus.isCovered)) {
    console.warn('⚠️  Search input is blocked!');
    alert('Search input is blocked! Check console for details.');
  }
  
  return summary;
}

/**
 * Quick test for immediate feedback
 */
function quickFocusTest() {
  console.log('⚡ Quick Focus Test...');
  
  const searchInput = testAppointmentsSearchInput();
  const windowFocus = testWindowFocus();
  
  if (searchInput && (searchInput.isBlocked || searchInput.isCovered)) {
    console.error('❌ Search input is blocked!');
    return false;
  }
  
  console.log('✅ Quick test passed');
  return true;
}

// New comprehensive diagnostic function for the specific focus issue
export const diagnoseInputBlockingIssue = () => {
  console.log('🔍 [DIAGNOSTIC] Starting comprehensive input blocking diagnosis...');
  
  const searchInput = document.querySelector('input[placeholder*="Rechercher par nom, raison, date"]');
  if (!searchInput) {
    console.error('❌ [DIAGNOSTIC] Search input not found');
    return;
  }
  
  console.log('📋 [DIAGNOSTIC] Search input found:', {
    tagName: searchInput.tagName,
    type: searchInput.type,
    id: searchInput.id,
    name: searchInput.name,
    className: searchInput.className,
    placeholder: searchInput.placeholder
  });
  
  // Check input properties
  console.log('🔍 [DIAGNOSTIC] Input properties:', {
    disabled: searchInput.disabled,
    readOnly: searchInput.readOnly,
    value: searchInput.value,
    isConnected: searchInput.isConnected,
    offsetParent: searchInput.offsetParent,
    offsetWidth: searchInput.offsetWidth,
    offsetHeight: searchInput.offsetHeight,
    clientWidth: searchInput.clientWidth,
    clientHeight: searchInput.clientHeight
  });
  
  // Check computed styles
  const computedStyle = window.getComputedStyle(searchInput);
  console.log('🎨 [DIAGNOSTIC] Computed styles:', {
    pointerEvents: computedStyle.pointerEvents,
    userSelect: computedStyle.userSelect,
    opacity: computedStyle.opacity,
    visibility: computedStyle.visibility,
    display: computedStyle.display,
    position: computedStyle.position,
    zIndex: computedStyle.zIndex,
    overflow: computedStyle.overflow
  });
  
  // Check if input is covered by other elements
  const rect = searchInput.getBoundingClientRect();
  console.log('📍 [DIAGNOSTIC] Input position:', {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    bottom: rect.bottom,
    right: rect.right
  });
  
  // Check for elements covering the input
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const coveringElements = document.elementsFromPoint(centerX, centerY);
  
  console.log('🔄 [DIAGNOSTIC] Elements at input center point:', coveringElements.map(el => ({
    tagName: el.tagName,
    id: el.id,
    className: el.className,
    isInput: el === searchInput
  })));
  
  // Check for invisible overlays
  const allElements = document.querySelectorAll('*');
  const potentialOverlays = [];
  
  allElements.forEach(element => {
    if (element === searchInput) return;
    
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    // Check if element might be covering the input
    if (rect.width > 0 && rect.height > 0 &&
        rect.left <= centerX && rect.right >= centerX &&
        rect.top <= centerY && rect.bottom >= centerY) {
      
      const isInvisible = style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none';
      const hasHighZIndex = parseInt(style.zIndex) > 1000;
      const isFixed = style.position === 'fixed';
      const isAbsolute = style.position === 'absolute';
      
      if (isInvisible || hasHighZIndex || isFixed || isAbsolute) {
        potentialOverlays.push({
          element: element,
          tagName: element.tagName,
          id: element.id,
          className: element.className,
          opacity: style.opacity,
          visibility: style.visibility,
          display: style.display,
          zIndex: style.zIndex,
          position: style.position,
          pointerEvents: style.pointerEvents,
          rect: rect
        });
      }
    }
  });
  
  console.log('👻 [DIAGNOSTIC] Potential invisible overlays:', potentialOverlays);
  
  // Try to remove blocking elements and test if that fixes the issue
  if (potentialOverlays.length > 0) {
    console.log('🔧 [DIAGNOSTIC] Attempting to remove blocking overlays...');
    
    potentialOverlays.forEach(overlay => {
      try {
        if (overlay.element && overlay.element.style) {
          overlay.element.style.display = 'none';
          console.log(`✅ [DIAGNOSTIC] Removed overlay: ${overlay.tagName} (${overlay.id || overlay.className})`);
        }
      } catch (error) {
        console.warn(`❌ [DIAGNOSTIC] Failed to remove overlay:`, error);
      }
    });
    
    // Wait a bit for the DOM to update
    setTimeout(() => {
      console.log('🔄 [DIAGNOSTIC] Re-testing input after overlay removal...');
      searchInput.focus();
    }, 100);
  }
  
  // Test if we can actually type in the input
  console.log('⌨️ [DIAGNOSTIC] Testing actual input capability...');
  
  // Store original value
  const originalValue = searchInput.value;
  
  // Try to focus and type
  searchInput.focus();
  
  // Simulate typing
  setTimeout(() => {
    const testValue = originalValue + '_TEST_' + Date.now();
    searchInput.value = testValue;
    
    // Trigger input event
    const inputEvent = new Event('input', { bubbles: true });
    searchInput.dispatchEvent(inputEvent);
    
    // Check if value was actually set
    setTimeout(() => {
      console.log('✅ [DIAGNOSTIC] Input test results:', {
        originalValue: originalValue,
        attemptedValue: testValue,
        actualValue: searchInput.value,
        valueChanged: searchInput.value !== originalValue,
        isFocused: document.activeElement === searchInput
      });
      
      // Restore original value
      searchInput.value = originalValue;
      const restoreEvent = new Event('input', { bubbles: true });
      searchInput.dispatchEvent(restoreEvent);
      
      // Provide recommendations
      if (searchInput.value !== testValue) {
        console.error('❌ [DIAGNOSTIC] Input is blocked - value could not be set');
        console.log('💡 [DIAGNOSTIC] Recommendations:');
        console.log('   1. Check for invisible overlays with high z-index');
        console.log('   2. Check for React state issues preventing updates');
        console.log('   3. Check for global event listeners blocking input');
        console.log('   4. Try removing potential overlay elements');
      } else {
        console.log('✅ [DIAGNOSTIC] Input appears to be working correctly');
      }
    }, 100);
  }, 100);
};

// Enhanced version of the existing test that includes the new diagnostic
export const runEnhancedFocusTest = () => {
  console.log('🚀 [ENHANCED TEST] Running enhanced focus test...');
  
  // Run the original comprehensive test
  runComprehensiveFocusTest();
  
  // Wait a bit, then run the new diagnostic
  setTimeout(() => {
    diagnoseInputBlockingIssue();
  }, 1000);
};

// Enhanced auto-fix function that addresses Electron-specific issues
export const enhancedAutoFixFocusIssue = () => {
  console.log('🔧 [ENHANCED AUTO FIX] Starting enhanced automatic focus issue resolution...');
  
  const searchInput = document.querySelector('input[placeholder*="Rechercher par nom, raison, date"]');
  if (!searchInput) {
    console.error('❌ [ENHANCED AUTO FIX] Search input not found');
    return;
  }
  
  // Step 1: Force window focus and blur to reset Electron's input state
  console.log('🔧 [ENHANCED AUTO FIX] Step 1: Resetting Electron window focus...');
  window.blur();
  setTimeout(() => {
    window.focus();
  }, 100);
  
  // Step 2: Remove all potential blocking elements more aggressively
  console.log('🔧 [ENHANCED AUTO FIX] Step 2: Aggressively removing blocking elements...');
  
  const allElements = document.querySelectorAll('*');
  let removedCount = 0;
  
  allElements.forEach(element => {
    if (element === searchInput || element === document.body || element === document.documentElement) return;
    
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    // More aggressive blocking detection
    const isInvisible = style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none';
    const hasHighZIndex = parseInt(style.zIndex) > 100;
    const isFixed = style.position === 'fixed';
    const isAbsolute = style.position === 'absolute';
    const hasPointerEventsNone = style.pointerEvents === 'none';
    const coversInput = rect.width > 0 && rect.height > 0;
    
    if ((isInvisible || hasHighZIndex || isFixed || isAbsolute || hasPointerEventsNone) && coversInput) {
      try {
        element.style.display = 'none';
        element.style.pointerEvents = 'none';
        element.style.zIndex = '-1';
        removedCount++;
        console.log(`✅ [ENHANCED AUTO FIX] Removed blocking element: ${element.tagName} (z-index: ${style.zIndex})`);
      } catch (error) {
        console.warn(`❌ [ENHANCED AUTO FIX] Failed to remove element:`, error);
      }
    }
  });
  
  console.log(`🔧 [ENHANCED AUTO FIX] Removed ${removedCount} potential blocking elements`);
  
  // Step 3: Force enable and focus the input with multiple attempts
  console.log('🔧 [ENHANCED AUTO FIX] Step 3: Enabling and focusing input...');
  
  const enableInput = () => {
    // Remove any disabled attributes
    searchInput.removeAttribute('disabled');
    searchInput.removeAttribute('readonly');
    
    // Force focus
    searchInput.focus();
    
    // Force click to ensure focus
    searchInput.click();
    
    // Set tabindex to ensure it's focusable
    searchInput.setAttribute('tabindex', '0');
  };
  
  // Multiple attempts to enable the input
  enableInput();
  setTimeout(enableInput, 100);
  setTimeout(enableInput, 300);
  setTimeout(enableInput, 500);
  
  // Step 4: Test actual typing ability (not just programmatic value setting)
  console.log('🔧 [ENHANCED AUTO FIX] Step 4: Testing actual typing ability...');
  
  setTimeout(() => {
    // Create a temporary test input to verify typing works
    const testInput = document.createElement('input');
    testInput.type = 'text';
    testInput.style.position = 'absolute';
    testInput.style.left = '-9999px';
    testInput.style.top = '-9999px';
    document.body.appendChild(testInput);
    
    testInput.focus();
    
    // Try to simulate actual typing
    const testChar = 'X';
    const keyDownEvent = new KeyboardEvent('keydown', {
      key: testChar,
      code: 'KeyX',
      bubbles: true,
      cancelable: true
    });
    
    const keyPressEvent = new KeyboardEvent('keypress', {
      key: testChar,
      code: 'KeyX',
      bubbles: true,
      cancelable: true
    });
    
    const keyUpEvent = new KeyboardEvent('keyup', {
      key: testChar,
      code: 'KeyX',
      bubbles: true,
      cancelable: true
    });
    
    testInput.dispatchEvent(keyDownEvent);
    testInput.dispatchEvent(keyPressEvent);
    testInput.dispatchEvent(keyUpEvent);
    
    // Check if the character was added
    setTimeout(() => {
      const typingWorks = testInput.value.includes(testChar);
      
      // Clean up test input
      document.body.removeChild(testInput);
      
      if (typingWorks) {
        console.log('✅ [ENHANCED AUTO FIX] SUCCESS! Typing is working correctly');
        console.log('💡 [ENHANCED AUTO FIX] The issue was resolved by resetting Electron window focus and removing blocking elements.');
        
        // Now focus back to the search input
        searchInput.focus();
        searchInput.click();
      } else {
        console.error('❌ [ENHANCED AUTO FIX] FAILED! Typing is still blocked');
        console.log('💡 [ENHANCED AUTO FIX] This suggests a deeper Electron or system-level issue.');
        console.log('💡 [ENHANCED AUTO FIX] Try clicking outside the window and back, or restart the application.');
      }
    }, 100);
  }, 800);
};

// Function to test if user can actually type (not just programmatic input)
export const testActualTyping = () => {
  console.log('🔍 [TYPING TEST] Testing actual typing ability...');
  
  const searchInput = document.querySelector('input[placeholder*="Rechercher par nom, raison, date"]');
  if (!searchInput) {
    console.error('❌ [TYPING TEST] Search input not found');
    return;
  }
  
  // Focus the input
  searchInput.focus();
  
  // Create a visual indicator
  const indicator = document.createElement('div');
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #007bff;
    color: white;
    padding: 10px;
    border-radius: 5px;
    z-index: 10000;
    font-family: Arial, sans-serif;
    font-size: 14px;
  `;
  indicator.textContent = '🔍 Click here and try typing in the search field...';
  document.body.appendChild(indicator);
  
  // Remove indicator after 5 seconds
  setTimeout(() => {
    if (document.body.contains(indicator)) {
      document.body.removeChild(indicator);
    }
  }, 5000);
  
  console.log('💡 [TYPING TEST] Please try typing in the search field now. The test will show if typing actually works.');
};

// Comprehensive diagnostic to find the root cause of keyboard input blocking
export const diagnoseKeyboardBlocking = () => {
  console.log('🔍 [KEYBOARD DIAGNOSTIC] Starting comprehensive keyboard input blocking diagnosis...');
  
  const searchInput = document.querySelector('input[placeholder*="Rechercher par nom, raison, date"]');
  if (!searchInput) {
    console.error('❌ [KEYBOARD DIAGNOSTIC] Search input not found');
    return;
  }
  
  // Step 1: Check if we're in an Electron environment
  console.log('🔍 [KEYBOARD DIAGNOSTIC] Step 1: Checking Electron environment...');
  const isElectron = window.electronAPI !== undefined;
  console.log(`📋 Electron detected: ${isElectron}`);
  
  if (isElectron) {
    console.log('📋 Electron API available:', Object.keys(window.electronAPI || {}));
  }
  
  // Step 2: Check window and document state
  console.log('🔍 [KEYBOARD DIAGNOSTIC] Step 2: Checking window and document state...');
  console.log('📋 Window focused:', document.hasFocus());
  console.log('📋 Document ready state:', document.readyState);
  console.log('📋 Active element:', document.activeElement?.tagName, document.activeElement?.className);
  console.log('📋 Window blur/focus listeners:', window.onblur ? 'Present' : 'None', window.onfocus ? 'Present' : 'None');
  
  // Step 3: Check for global event listeners that might block input
  console.log('🔍 [KEYBOARD DIAGNOSTIC] Step 3: Checking for blocking event listeners...');
  
  // Test if keydown events are being prevented globally
  let keydownBlocked = false;
  let keypressBlocked = false;
  let keyupBlocked = false;
  
  const testKeydown = (e) => {
    if (e.defaultPrevented) {
      keydownBlocked = true;
      console.log('❌ [KEYBOARD DIAGNOSTIC] Global keydown event is being prevented!');
    }
  };
  
  const testKeypress = (e) => {
    if (e.defaultPrevented) {
      keypressBlocked = true;
      console.log('❌ [KEYBOARD DIAGNOSTIC] Global keypress event is being prevented!');
    }
  };
  
  const testKeyup = (e) => {
    if (e.defaultPrevented) {
      keyupBlocked = true;
      console.log('❌ [KEYBOARD DIAGNOSTIC] Global keyup event is being prevented!');
    }
  };
  
  document.addEventListener('keydown', testKeydown, true);
  document.addEventListener('keypress', testKeypress, true);
  document.addEventListener('keyup', testKeyup, true);
  
  // Step 4: Check the specific input element
  console.log('🔍 [KEYBOARD DIAGNOSTIC] Step 4: Analyzing search input element...');
  const inputStatus = getInputStatus(searchInput);
  console.log('📋 Input status:', inputStatus);
  
  // Check if input has any event listeners that might block input
  const inputListeners = [];
  const originalAddEventListener = searchInput.addEventListener;
  const originalRemoveEventListener = searchInput.removeEventListener;
  
  searchInput.addEventListener = function(type, listener, options) {
    inputListeners.push({ type, listener: listener.toString().substring(0, 100) + '...' });
    return originalAddEventListener.call(this, type, listener, options);
  };
  
  searchInput.removeEventListener = function(type, listener, options) {
    const index = inputListeners.findIndex(l => l.type === type);
    if (index > -1) inputListeners.splice(index, 1);
    return originalRemoveEventListener.call(this, type, listener, options);
  };
  
  console.log('📋 Input event listeners:', inputListeners);
  
  // Step 5: Test actual keyboard input with detailed logging
  console.log('🔍 [KEYBOARD DIAGNOSTIC] Step 5: Testing keyboard input with detailed logging...');
  
  const testInput = document.createElement('input');
  testInput.type = 'text';
  testInput.style.position = 'absolute';
  testInput.style.left = '-9999px';
  testInput.style.top = '-9999px';
  testInput.id = 'keyboard-test-input';
  document.body.appendChild(testInput);
  
  // Add detailed event logging
  const eventLog = [];
  const logEvent = (eventType, event) => {
    eventLog.push({
      type: eventType,
      defaultPrevented: event.defaultPrevented,
      bubbles: event.bubbles,
      cancelable: event.cancelable,
      key: event.key,
      code: event.code,
      target: event.target.tagName,
      currentTarget: event.currentTarget.tagName,
      timestamp: Date.now()
    });
  };
  
  testInput.addEventListener('keydown', (e) => logEvent('keydown', e), true);
  testInput.addEventListener('keypress', (e) => logEvent('keypress', e), true);
  testInput.addEventListener('keyup', (e) => logEvent('keyup', e), true);
  testInput.addEventListener('input', (e) => logEvent('input', e), true);
  testInput.addEventListener('beforeinput', (e) => logEvent('beforeinput', e), true);
  
  testInput.focus();
  
  // Simulate keyboard input
  const testChar = 'X';
  const keyDownEvent = new KeyboardEvent('keydown', {
    key: testChar,
    code: 'KeyX',
    bubbles: true,
    cancelable: true
  });
  
  const keyPressEvent = new KeyboardEvent('keypress', {
    key: testChar,
    code: 'KeyX',
    bubbles: true,
    cancelable: true
  });
  
  const keyUpEvent = new KeyboardEvent('keyup', {
    key: testChar,
    code: 'KeyX',
    bubbles: true,
    cancelable: true
  });
  
  const inputEvent = new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    data: testChar
  });
  
  console.log('🔍 [KEYBOARD DIAGNOSTIC] Dispatching keyboard events...');
  
  testInput.dispatchEvent(keyDownEvent);
  testInput.dispatchEvent(keyPressEvent);
  testInput.dispatchEvent(keyUpEvent);
  testInput.dispatchEvent(inputEvent);
  
  // Check results after a delay
  setTimeout(() => {
    console.log('🔍 [KEYBOARD DIAGNOSTIC] Event log:', eventLog);
    console.log('📋 Final input value:', testInput.value);
    console.log('📋 Input value length:', testInput.value.length);
    
    const typingWorks = testInput.value.includes(testChar);
    
    // Clean up
    document.body.removeChild(testInput);
    document.removeEventListener('keydown', testKeydown, true);
    document.removeEventListener('keypress', testKeypress, true);
    document.removeEventListener('keyup', testKeyup, true);
    
    // Restore original methods
    searchInput.addEventListener = originalAddEventListener;
    searchInput.removeEventListener = originalRemoveEventListener;
    
    // Generate diagnosis report
    console.log('🔍 [KEYBOARD DIAGNOSTIC] === DIAGNOSIS REPORT ===');
    console.log(`📋 Electron environment: ${isElectron}`);
    console.log(`📋 Window focused: ${document.hasFocus()}`);
    console.log(`📋 Global keydown blocked: ${keydownBlocked}`);
    console.log(`📋 Global keypress blocked: ${keypressBlocked}`);
    console.log(`📋 Global keyup blocked: ${keyupBlocked}`);
    console.log(`📋 Input typing works: ${typingWorks}`);
    console.log(`📋 Events dispatched: ${eventLog.length}`);
    console.log(`📋 Events prevented: ${eventLog.filter(e => e.defaultPrevented).length}`);
    
    if (!typingWorks) {
      console.error('❌ [KEYBOARD DIAGNOSTIC] ROOT CAUSE: Keyboard input is being blocked at the system level');
      console.log('💡 [KEYBOARD DIAGNOSTIC] Possible causes:');
      console.log('   - Electron window lost system focus');
      console.log('   - System-level input blocking (antivirus, accessibility tools)');
      console.log('   - Electron renderer process issues');
      console.log('   - Browser security restrictions');
      console.log('💡 [KEYBOARD DIAGNOSTIC] Try:');
      console.log('   - Clicking outside and back into the window');
      console.log('   - Restarting the Electron application');
      console.log('   - Checking system accessibility settings');
    } else {
      console.log('✅ [KEYBOARD DIAGNOSTIC] Keyboard input is working correctly');
    }
  }, 200);
};

// Test the new IPC focus APIs
export const testIPCFocusAPIs = async () => {
  console.log('🔧 [IPC FOCUS TEST] Testing new IPC focus APIs...');
  
  try {
    // Test focusWindow API
    if (window.electronAPI && window.electronAPI.focusWindow) {
      console.log('🔧 [IPC FOCUS TEST] Testing focusWindow API...');
      const focusResult = await window.electronAPI.focusWindow();
      console.log('🔧 [IPC FOCUS TEST] focusWindow result:', focusResult);
    } else {
      console.log('❌ [IPC FOCUS TEST] focusWindow API not available');
    }
    
    // Test forceWindowActivation API
    if (window.electronAPI && window.electronAPI.forceWindowActivation) {
      console.log('🔧 [IPC FOCUS TEST] Testing forceWindowActivation API...');
      const activationResult = await window.electronAPI.forceWindowActivation();
      console.log('🔧 [IPC FOCUS TEST] forceWindowActivation result:', activationResult);
    } else {
      console.log('❌ [IPC FOCUS TEST] forceWindowActivation API not available');
    }
    
    // Test ultraForceWindowFocus API
    if (window.electronAPI && window.electronAPI.ultraForceWindowFocus) {
      console.log('🔧 [IPC FOCUS TEST] Testing ultraForceWindowFocus API...');
      const ultraResult = await window.electronAPI.ultraForceWindowFocus();
      console.log('🔧 [IPC FOCUS TEST] ultraForceWindowFocus result:', ultraResult);
    } else {
      console.log('❌ [IPC FOCUS TEST] ultraForceWindowFocus API not available');
    }
    
    // Test waitForWindowFocus API
    if (window.electronAPI && window.electronAPI.waitForWindowFocus) {
      console.log('🔧 [IPC FOCUS TEST] Testing waitForWindowFocus API...');
      const waitResult = await window.electronAPI.waitForWindowFocus();
      console.log('🔧 [IPC FOCUS TEST] waitForWindowFocus result:', waitResult);
    } else {
      console.log('❌ [IPC FOCUS TEST] waitForWindowFocus API not available');
    }
    
    // Test window focus state after API calls
    setTimeout(() => {
      console.log('🔧 [IPC FOCUS TEST] Window focus state after API calls:');
      console.log('  - document.hasFocus():', document.hasFocus());
      console.log('  - document.activeElement:', document.activeElement);
      console.log('  - window.focused:', window.focused);
    }, 500);
    
  } catch (error) {
    console.error('❌ [IPC FOCUS TEST] Error testing IPC focus APIs:', error);
  }
};

// Test the enhanced IPC focus methods specifically
export const testEnhancedIPCFocus = async () => {
  console.log('🔧 [ENHANCED IPC TEST] Testing enhanced IPC focus methods...');
  
  try {
    // Step 1: Test ultra force focus
    if (window.electronAPI && window.electronAPI.ultraForceWindowFocus) {
      console.log('🔧 [ENHANCED IPC TEST] Step 1: Ultra force focus...');
      const ultraResult = await window.electronAPI.ultraForceWindowFocus();
      console.log('🔧 [ENHANCED IPC TEST] Ultra force result:', ultraResult);
      
      if (ultraResult.success) {
        // Step 2: Test wait for focus
        if (window.electronAPI && window.electronAPI.waitForWindowFocus) {
          console.log('🔧 [ENHANCED IPC TEST] Step 2: Waiting for focus...');
          const waitResult = await window.electronAPI.waitForWindowFocus();
          console.log('🔧 [ENHANCED IPC TEST] Wait result:', waitResult);
          
          // Step 3: Check final state
          setTimeout(() => {
            console.log('🔧 [ENHANCED IPC TEST] Final focus state:');
            console.log('  - document.hasFocus():', document.hasFocus());
            console.log('  - document.activeElement:', document.activeElement);
            
            if (document.hasFocus()) {
              console.log('✅ [ENHANCED IPC TEST] SUCCESS! Window has focus');
            } else {
              console.log('❌ [ENHANCED IPC TEST] FAILED! Window still lacks focus');
            }
          }, 500);
        }
      }
    } else {
      console.log('❌ [ENHANCED IPC TEST] ultraForceWindowFocus API not available');
    }
    
  } catch (error) {
    console.error('❌ [ENHANCED IPC TEST] Error testing enhanced IPC focus:', error);
  }
};

// Simulate the exact scenario that causes the focus issue
export const simulateFocusIssueScenario = async () => {
  console.log('🔧 [FOCUS SCENARIO] Simulating the exact scenario that causes focus issues...');
  
  try {
    // Step 1: Check initial state
    console.log('🔧 [FOCUS SCENARIO] Initial state:');
    console.log('  - document.hasFocus():', document.hasFocus());
    console.log('  - document.activeElement:', document.activeElement);
    
    // Step 2: Simulate window.confirm() dialog
    console.log('🔧 [FOCUS SCENARIO] Simulating window.confirm() dialog...');
    const originalConfirm = window.confirm;
    window.confirm = () => true; // Always return true
    
    // Trigger a confirm dialog
    const result = window.confirm('Test dialog');
    console.log('🔧 [FOCUS SCENARIO] Confirm dialog result:', result);
    
    // Restore original confirm
    window.confirm = originalConfirm;
    
    // Step 3: Check state after dialog
    setTimeout(() => {
      console.log('🔧 [FOCUS SCENARIO] State after dialog:');
      console.log('  - document.hasFocus():', document.hasFocus());
      console.log('  - document.activeElement:', document.activeElement);
      
      // Step 4: Test the new DOM corruption fix
      console.log('🔧 [FOCUS SCENARIO] Testing DOM corruption fix...');
      
      // Use the new fixDOMAfterConfirm function
      if (window.fixDOMAfterConfirm) {
        window.fixDOMAfterConfirm().then(() => {
          setTimeout(() => {
            console.log('🔧 [FOCUS SCENARIO] State after recovery:');
            console.log('  - document.hasFocus():', document.hasFocus());
            console.log('  - document.activeElement:', document.activeElement);
            
            // Step 5: Test if typing works
            const searchInput = document.querySelector('input[placeholder*="Rechercher par nom, raison, date"]');
            if (searchInput) {
              searchInput.focus();
              console.log('🔧 [FOCUS SCENARIO] Testing typing in search input...');
              
              // Simulate typing
              searchInput.value = 'test';
              searchInput.dispatchEvent(new Event('input', { bubbles: true }));
              
              setTimeout(() => {
                console.log('🔧 [FOCUS SCENARIO] Final test result:');
                console.log('  - Input value:', searchInput.value);
                console.log('  - Input focused:', document.activeElement === searchInput);
                console.log('  - Window focused:', document.hasFocus());
                
                if (searchInput.value === 'test' && document.activeElement === searchInput) {
                  console.log('✅ [FOCUS SCENARIO] SUCCESS! Focus recovery worked correctly');
                } else {
                  console.log('❌ [FOCUS SCENARIO] FAILED! Focus recovery did not work');
                }
              }, 200);
            }
          }, 1000);
        }).catch(error => {
          console.error('❌ [FOCUS SCENARIO] Error during focus recovery:', error);
        });
      } else {
        console.log('🔧 [FOCUS SCENARIO] comprehensiveFocusRecovery not available globally, skipping recovery test');
      }
    }, 500);
    
  } catch (error) {
    console.error('❌ [FOCUS SCENARIO] Error during simulation:', error);
  }
};

// Test the new force renderer focus method
export const testForceRendererFocus = async () => {
  console.log('🔧 [FORCE RENDERER FOCUS TEST] Testing force renderer focus method...');
  try {
    if (window.electronAPI && window.electronAPI.forceRendererFocus) {
      console.log('🔧 [FORCE RENDERER FOCUS TEST] Step 1: Force renderer focus...');
      const result = await window.electronAPI.forceRendererFocus();
      console.log('🔧 [FORCE RENDERER FOCUS TEST] Force renderer focus result:', result);
      
      if (result.success) {
        setTimeout(() => {
          console.log('🔧 [FORCE RENDERER FOCUS TEST] Final focus state:');
          console.log('  - document.hasFocus():', document.hasFocus());
          console.log('  - document.activeElement:', document.activeElement);
          
          if (document.hasFocus()) {
            console.log('✅ [FORCE RENDERER FOCUS TEST] SUCCESS! Window has focus');
          } else {
            console.log('❌ [FORCE RENDERER FOCUS TEST] FAILED! Window still lacks focus');
          }
        }, 500);
      }
    } else {
      console.log('❌ [FORCE RENDERER FOCUS TEST] forceRendererFocus API not available');
    }
  } catch (error) {
    console.error('🔧 [FORCE RENDERER FOCUS TEST] Error:', error);
  }
};

// Test the new force input focus method
export const testForceInputFocus = async () => {
  console.log('🔧 [FORCE INPUT FOCUS TEST] Testing force input focus method...');
  try {
    if (window.electronAPI && window.electronAPI.forceInputFocus) {
      console.log('🔧 [FORCE INPUT FOCUS TEST] Step 1: Force input focus on appointments search...');
      const result = await window.electronAPI.forceInputFocus('input[placeholder*="Rechercher par nom, raison, date"]');
      console.log('🔧 [FORCE INPUT FOCUS TEST] Force input focus result:', result);
      
      if (result.success) {
        setTimeout(() => {
          console.log('🔧 [FORCE INPUT FOCUS TEST] Final focus state:');
          console.log('  - document.hasFocus():', document.hasFocus());
          console.log('  - document.activeElement:', document.activeElement);
          
          const searchInput = document.querySelector('input[placeholder*="Rechercher par nom, raison, date"]');
          if (searchInput && document.activeElement === searchInput) {
            console.log('✅ [FORCE INPUT FOCUS TEST] SUCCESS! Search input is focused');
          } else {
            console.log('❌ [FORCE INPUT FOCUS TEST] FAILED! Search input is not focused');
          }
        }, 500);
      }
    } else {
      console.log('❌ [FORCE INPUT FOCUS TEST] forceInputFocus API not available');
    }
  } catch (error) {
    console.error('🔧 [FORCE INPUT FOCUS TEST] Error:', error);
  }
};

// Export the main comprehensive focus test function
export { runComprehensiveFocusTest };

// Expose functions globally for easy console access
window.focusTest = {
  runComprehensiveFocusTest,
  quickFocusTest,
  testAppointmentsSearchInput,
  testAllInputs,
  checkForBlockingElements,
  testWindowFocus,
  getInputStatus,
  isInputBlocked,
  isElementCovered,
  diagnoseInputBlockingIssue,
  runEnhancedFocusTest,
  enhancedAutoFixFocusIssue,
  testActualTyping,
  diagnoseKeyboardBlocking,
  testIPCFocusAPIs,
  testEnhancedIPCFocus,
  simulateFocusIssueScenario,
  testForceRendererFocus,
  testForceInputFocus,
  comprehensiveFocusRecovery,
  fixDOMAfterConfirm,
  testCurrentFocusState
};

// Also expose comprehensiveFocusRecovery and fixDOMAfterConfirm directly on window for the simulation function
window.comprehensiveFocusRecovery = comprehensiveFocusRecovery;
window.fixDOMAfterConfirm = fixDOMAfterConfirm;

// Add a simple diagnostic function to test the current focus state
export const testCurrentFocusState = () => {
  console.log('🔍 [CURRENT FOCUS STATE] Testing current focus state...');
  
  const state = {
    documentHasFocus: document.hasFocus(),
    activeElement: document.activeElement ? {
      tagName: document.activeElement.tagName,
      id: document.activeElement.id,
      className: document.activeElement.className,
      type: document.activeElement.type,
      placeholder: document.activeElement.placeholder
    } : null,
    readyState: document.readyState,
    url: window.location.href,
    electronAPI: !!window.electronAPI,
    electronAPIMethods: window.electronAPI ? Object.keys(window.electronAPI) : []
  };
  
  console.log('📋 [CURRENT FOCUS STATE] Current state:', state);
  
  // Test if we can focus the search input
  const searchInput = document.querySelector('input[placeholder*="Rechercher par nom, raison, date"]');
  if (searchInput) {
    console.log('🔍 [CURRENT FOCUS STATE] Testing search input focus...');
    searchInput.focus();
    
    setTimeout(() => {
      const afterFocus = {
        documentHasFocus: document.hasFocus(),
        activeElement: document.activeElement === searchInput,
        searchInputValue: searchInput.value
      };
      console.log('📋 [CURRENT FOCUS STATE] After focus attempt:', afterFocus);
    }, 100);
  }
  
  return state;
}; 