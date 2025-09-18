// Test script to help understand the input locking issue
// This script can be run in the browser console to monitor DOM state

console.log('=== INPUT LOCKING TEST SCRIPT LOADED ===');

// Function to monitor input states
function monitorInputStates() {
  const inputs = document.querySelectorAll('input, textarea, select, button');
  console.log(`[TEST] Found ${inputs.length} input elements`);
  
  let interactiveCount = 0;
  let blockedCount = 0;
  
  inputs.forEach((input, index) => {
    const rect = input.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;
    const isNotDisabled = !input.disabled;
    const hasPointerEvents = input.style.pointerEvents !== 'none';
    const isInteractive = isVisible && isNotDisabled && hasPointerEvents;
    
    if (isInteractive) {
      interactiveCount++;
    } else {
      blockedCount++;
      console.log(`[TEST] Blocked input ${index + 1}:`, {
        tagName: input.tagName,
        id: input.id,
        className: input.className,
        isVisible,
        isNotDisabled,
        hasPointerEvents,
        rect: rect,
        style: {
          display: input.style.display,
          visibility: input.style.visibility,
          opacity: input.style.opacity,
          pointerEvents: input.style.pointerEvents
        }
      });
    }
  });
  
  console.log(`[TEST] Input summary: ${interactiveCount} interactive, ${blockedCount} blocked`);
  return { interactiveCount, blockedCount };
}

// Function to test click events on inputs
function testInputClicks() {
  const testInputs = document.querySelectorAll('input[type="text"], textarea');
  console.log(`[TEST] Testing clicks on ${testInputs.length} text inputs`);
  
  testInputs.forEach((input, index) => {
    try {
      const rect = input.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // Try to focus the input
        input.focus();
        console.log(`[TEST] Input ${index + 1} (${input.id || input.className}) focus test:`, {
          success: document.activeElement === input,
          rect: rect,
          isVisible: rect.width > 0 && rect.height > 0
        });
      }
    } catch (error) {
      console.log(`[TEST] Error testing input ${index + 1}:`, error);
    }
  });
}

// Function to check for blocking elements
function checkBlockingElements() {
  console.log('[TEST] Checking for blocking elements...');
  
  // Check fixed positioned elements
  const fixedElements = document.querySelectorAll('[style*="position: fixed"], [style*="position:absolute"]');
  console.log(`[TEST] Found ${fixedElements.length} fixed/absolute positioned elements`);
  
  fixedElements.forEach((element, index) => {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && element.style.pointerEvents !== 'none') {
      console.log(`[TEST] Potential blocking element ${index + 1}:`, {
        tagName: element.tagName,
        className: element.className,
        id: element.id,
        style: {
          position: element.style.position,
          zIndex: element.style.zIndex,
          pointerEvents: element.style.pointerEvents,
          opacity: element.style.opacity,
          visibility: element.style.visibility,
          display: element.style.display
        },
        rect: rect
      });
    }
  });
  
  // Check high z-index elements
  const highZIndexElements = document.querySelectorAll('[style*="z-index: 1000"], [style*="z-index: 999"], [style*="z-index: 1001"]');
  console.log(`[TEST] Found ${highZIndexElements.length} high z-index elements`);
  
  // Check hidden overlays
  const hiddenOverlays = document.querySelectorAll('[style*="opacity: 0"][style*="position: fixed"], [style*="visibility: hidden"][style*="position: fixed"], [style*="display: none"][style*="position: fixed"]');
  console.log(`[TEST] Found ${hiddenOverlays.length} hidden overlays`);
}

// Function to run all tests
function runAllTests() {
  console.log('=== RUNNING INPUT LOCKING TESTS ===');
  monitorInputStates();
  testInputClicks();
  checkBlockingElements();
  console.log('=== TESTS COMPLETED ===');
}

// Make functions available globally
window.testInputLocking = {
  monitorInputStates,
  testInputClicks,
  checkBlockingElements,
  runAllTests
};

console.log('[TEST] Test functions available as window.testInputLocking');
console.log('[TEST] Run window.testInputLocking.runAllTests() to execute all tests');

// Auto-run tests every 5 seconds to monitor state changes
setInterval(() => {
  console.log('[TEST] Auto-monitoring input states...');
  monitorInputStates();
}, 5000);

console.log('[TEST] Auto-monitoring enabled (every 5 seconds)'); 