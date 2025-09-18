// Test scenario to reproduce the input locking issue
// This simulates the exact workflow: create patient/appointment -> delete/cancel -> check input states

console.log('=== INPUT LOCKING SCENARIO TEST ===');

// Test scenario 1: AllPatients page - Create patient then delete
async function testAllPatientsScenario() {
  console.log('[SCENARIO] Testing AllPatients page workflow...');
  
  // Step 1: Navigate to AllPatients page
  console.log('[SCENARIO] Step 1: Navigating to AllPatients page');
  // (This would be done by clicking the navigation)
  
  // Step 2: Create a test patient
  console.log('[SCENARIO] Step 2: Creating test patient');
  // (This would be done through the UI)
  
  // Step 3: Delete the patient
  console.log('[SCENARIO] Step 3: Deleting test patient');
  // (This would trigger the delete function)
  
  // Step 4: Check input states after deletion
  console.log('[SCENARIO] Step 4: Checking input states after deletion');
  setTimeout(() => {
    console.log('[SCENARIO] Input states after patient deletion:');
    if (window.testInputLocking) {
      window.testInputLocking.runAllTests();
    }
  }, 2000);
}

// Test scenario 2: Appointments page - Create appointment then cancel
async function testAppointmentsScenario() {
  console.log('[SCENARIO] Testing Appointments page workflow...');
  
  // Step 1: Navigate to Appointments page
  console.log('[SCENARIO] Step 1: Navigating to Appointments page');
  
  // Step 2: Create a test appointment
  console.log('[SCENARIO] Step 2: Creating test appointment');
  
  // Step 3: Cancel the appointment
  console.log('[SCENARIO] Step 3: Canceling test appointment');
  
  // Step 4: Check input states after cancellation
  console.log('[SCENARIO] Step 4: Checking input states after cancellation');
  setTimeout(() => {
    console.log('[SCENARIO] Input states after appointment cancellation:');
    if (window.testInputLocking) {
      window.testInputLocking.runAllTests();
    }
  }, 2000);
}

// Function to monitor specific elements that might be causing the issue
function monitorSpecificElements() {
  console.log('[MONITOR] Monitoring specific elements that might cause input locking...');
  
  // Monitor loading states
  const loadingElements = document.querySelectorAll('.spinner, .loader, [class*="loading"]');
  console.log(`[MONITOR] Loading elements: ${loadingElements.length}`);
  loadingElements.forEach((el, index) => {
    console.log(`[MONITOR] Loading element ${index + 1}:`, {
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
  console.log(`[MONITOR] Modal overlays: ${modalElements.length}`);
  modalElements.forEach((el, index) => {
    console.log(`[MONITOR] Modal overlay ${index + 1}:`, {
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
  console.log(`[MONITOR] Form elements: ${formElements.length}`);
  formElements.forEach((form, index) => {
    const inputs = form.querySelectorAll('input, textarea, select, button');
    console.log(`[MONITOR] Form ${index + 1} has ${inputs.length} inputs`);
  });
}

// Function to check if any inputs are actually blocked
function checkInputBlocking() {
  console.log('[CHECK] Checking for actual input blocking...');
  
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
    console.log(`[CHECK] Found ${blockedInputs.length} blocked inputs:`, blockedInputs);
  } else {
    console.log('[CHECK] No blocked inputs found');
  }
  
  return blockedInputs;
}

// Make scenario tests available globally
window.scenarioTests = {
  testAllPatientsScenario,
  testAppointmentsScenario,
  monitorSpecificElements,
  checkInputBlocking
};

console.log('[SCENARIO] Scenario test functions available as window.scenarioTests');
console.log('[SCENARIO] Run window.scenarioTests.testAllPatientsScenario() to test AllPatients workflow');
console.log('[SCENARIO] Run window.scenarioTests.testAppointmentsScenario() to test Appointments workflow');

// Auto-monitor every 3 seconds
setInterval(() => {
  console.log('[MONITOR] Auto-monitoring specific elements...');
  monitorSpecificElements();
  checkInputBlocking();
}, 3000);

console.log('[SCENARIO] Auto-monitoring enabled (every 3 seconds)'); 