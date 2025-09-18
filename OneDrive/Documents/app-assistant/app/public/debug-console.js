// Comprehensive debug script for input locking issue
// Copy and paste this entire script into the browser console

console.log('=== INPUT LOCKING DEBUG SCRIPT LOADED ===');

// Function to monitor input states
function monitorInputStates() {
  const inputs = document.querySelectorAll('input, textarea, select, button');
  console.log(`[DEBUG] Found ${inputs.length} input elements`);
  
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
      console.log(`[DEBUG] Blocked input ${index + 1}:`, {
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
  
  console.log(`[DEBUG] Input summary: ${interactiveCount} interactive, ${blockedCount} blocked`);
  return { interactiveCount, blockedCount };
}

// Function to test click events on inputs
function testInputClicks() {
  const testInputs = document.querySelectorAll('input[type="text"], textarea');
  console.log(`[DEBUG] Testing clicks on ${testInputs.length} text inputs`);
  
  testInputs.forEach((input, index) => {
    try {
      const rect = input.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // Try to focus the input
        input.focus();
        console.log(`[DEBUG] Input ${index + 1} (${input.id || input.className}) focus test:`, {
          success: document.activeElement === input,
          rect: rect,
          isVisible: rect.width > 0 && rect.height > 0
        });
      }
    } catch (error) {
      console.log(`[DEBUG] Error testing input ${index + 1}:`, error);
    }
  });
}

// Function to check for blocking elements
function checkBlockingElements() {
  console.log('[DEBUG] Checking for blocking elements...');
  
  // Check fixed positioned elements
  const fixedElements = document.querySelectorAll('[style*="position: fixed"], [style*="position:absolute"]');
  console.log(`[DEBUG] Found ${fixedElements.length} fixed/absolute positioned elements`);
  
  fixedElements.forEach((element, index) => {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && element.style.pointerEvents !== 'none') {
      console.log(`[DEBUG] Potential blocking element ${index + 1}:`, {
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
  console.log(`[DEBUG] Found ${highZIndexElements.length} high z-index elements`);
  
  // Check hidden overlays
  const hiddenOverlays = document.querySelectorAll('[style*="opacity: 0"][style*="position: fixed"], [style*="visibility: hidden"][style*="position: fixed"], [style*="display: none"][style*="position: fixed"]');
  console.log(`[DEBUG] Found ${hiddenOverlays.length} hidden overlays`);
}

// Function to monitor specific elements that might be causing the issue
function monitorSpecificElements() {
  console.log('[DEBUG] Monitoring specific elements that might cause input locking...');
  
  // Monitor loading states
  const loadingElements = document.querySelectorAll('.spinner, .loader, [class*="loading"]');
  console.log(`[DEBUG] Loading elements: ${loadingElements.length}`);
  loadingElements.forEach((el, index) => {
    console.log(`[DEBUG] Loading element ${index + 1}:`, {
      className: el.className,
      style: {
        display: el.style.display,
        position: el.style.position,
        zIndex: el.style.zIndex,
        pointerEvents: el.style.pointerEvents
      }
    });
  });
  
  // Monitor modal states
  const modalElements = document.querySelectorAll('[style*="position: fixed"][style*="background-color: rgba(0, 0, 0, 0.5)"]');
  console.log(`[DEBUG] Modal overlays: ${modalElements.length}`);
  modalElements.forEach((el, index) => {
    console.log(`[DEBUG] Modal overlay ${index + 1}:`, {
      className: el.className,
      style: {
        display: el.style.display,
        position: el.style.position,
        zIndex: el.style.zIndex,
        pointerEvents: el.style.pointerEvents
      }
    });
  });
  
  // Monitor form states
  const formElements = document.querySelectorAll('form');
  console.log(`[DEBUG] Form elements: ${formElements.length}`);
  formElements.forEach((form, index) => {
    const inputs = form.querySelectorAll('input, textarea, select, button');
    console.log(`[DEBUG] Form ${index + 1} has ${inputs.length} inputs`);
  });
}

// Function to check if any inputs are actually blocked
function checkInputBlocking() {
  console.log('[DEBUG] Checking for actual input blocking...');
  
  const inputs = document.querySelectorAll('input, textarea, select, button');
  let blockedInputs = [];
  
  inputs.forEach((input, index) => {
    const rect = input.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;
    const isNotDisabled = !input.disabled;
    const hasPointerEvents = input.style.pointerEvents !== 'none';
    
    if (!isVisible || !isNotDisabled || !hasPointerEvents) {
      blockedInputs.push({
        index,
        element: input,
        reason: {
          notVisible: !isVisible,
          disabled: !isNotDisabled,
          noPointerEvents: !hasPointerEvents
        }
      });
    }
  });
  
  if (blockedInputs.length > 0) {
    console.log(`[DEBUG] Found ${blockedInputs.length} blocked inputs:`, blockedInputs);
  } else {
    console.log('[DEBUG] No blocked inputs found');
  }
  
  return blockedInputs;
}

// Function to run all tests
function runAllTests() {
  console.log('=== RUNNING INPUT LOCKING TESTS ===');
  monitorInputStates();
  testInputClicks();
  checkBlockingElements();
  monitorSpecificElements();
  checkInputBlocking();
  console.log('=== TESTS COMPLETED ===');
}

// Function to force enable all inputs
function forceEnableAllInputs() {
  console.log('[DEBUG] Force enabling all inputs...');
  const inputs = document.querySelectorAll('input, textarea, select, button');
  inputs.forEach((input, index) => {
    input.disabled = false;
    input.removeAttribute('disabled');
    input.style.pointerEvents = 'auto';
    input.style.opacity = '1';
    input.style.visibility = 'visible';
    input.style.display = input.tagName === 'BUTTON' ? 'inline-block' : 'block';
  });
  console.log(`[DEBUG] Force enabled ${inputs.length} inputs`);
}

// Function to remove blocking overlays
function removeBlockingOverlays() {
  console.log('[DEBUG] Removing blocking overlays...');
  
  // Remove hidden overlays
  const hiddenOverlays = document.querySelectorAll('[style*="opacity: 0"][style*="position: fixed"], [style*="visibility: hidden"][style*="position: fixed"], [style*="display: none"][style*="position: fixed"]');
  hiddenOverlays.forEach(overlay => {
    console.log('[DEBUG] Removing hidden overlay:', overlay);
    overlay.style.display = 'none';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '-1';
  });
  
  // Remove loading elements
  const loadingElements = document.querySelectorAll('.spinner, .loader, [class*="loading"]');
  loadingElements.forEach(loader => {
    if (loader.style.position === 'fixed' || loader.style.position === 'absolute') {
      console.log('[DEBUG] Removing loading element:', loader);
      loader.style.display = 'none';
      loader.style.pointerEvents = 'none';
      loader.style.zIndex = '-1';
    }
  });
  
  // Remove modal backdrops
  const modalBackdrops = document.querySelectorAll('[style*="background-color: rgba(0, 0, 0, 0.5)"], [style*="background-color: rgba(0,0,0,0.5)"]');
  modalBackdrops.forEach(backdrop => {
    if (!backdrop.querySelector('.modal, [role="dialog"]')) {
      console.log('[DEBUG] Removing modal backdrop:', backdrop);
      backdrop.style.display = 'none';
      backdrop.style.pointerEvents = 'none';
      backdrop.style.zIndex = '-1';
    }
  });
  
  console.log('[DEBUG] Blocking overlays removed');
}

// Function to emergency reset
function emergencyReset() {
  console.log('[DEBUG] Emergency reset triggered...');
  forceEnableAllInputs();
  removeBlockingOverlays();
  document.body.style.pointerEvents = 'auto';
  document.documentElement.style.pointerEvents = 'auto';
  console.log('[DEBUG] Emergency reset completed');
}

// Make functions available globally
window.debugTools = {
  monitorInputStates,
  testInputClicks,
  checkBlockingElements,
  monitorSpecificElements,
  checkInputBlocking,
  runAllTests,
  forceEnableAllInputs,
  removeBlockingOverlays,
  emergencyReset
};

console.log('[DEBUG] Debug functions available as window.debugTools');
console.log('[DEBUG] Run window.debugTools.runAllTests() to execute all tests');
console.log('[DEBUG] Run window.debugTools.emergencyReset() for emergency fix');

// Auto-run tests every 3 seconds to monitor state changes
setInterval(() => {
  console.log('[DEBUG] Auto-monitoring input states...');
  monitorInputStates();
}, 3000);

console.log('[DEBUG] Auto-monitoring enabled (every 3 seconds)'); 