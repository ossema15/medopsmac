// Automated Test Monitor - Comprehensive State Monitoring
// This script will automate the entire workflow and monitor everything

console.log('🤖 AUTOMATED TEST MONITOR STARTING...');

// Global state tracking
const testState = {
  step: 0,
  startTime: Date.now(),
  patientCreated: false,
  patientDeleted: false,
  navigationCompleted: false,
  errors: [],
  warnings: [],
  domSnapshots: [],
  inputStates: [],
  blockingElements: [],
  loadingStates: [],
  eventLog: []
};

// Utility functions
function logEvent(event, data = {}) {
  const timestamp = Date.now() - testState.startTime;
  const logEntry = {
    timestamp,
    step: testState.step,
    event,
    data,
    url: window.location.hash
  };
  testState.eventLog.push(logEntry);
  console.log(`[${timestamp}ms][Step ${testState.step}] ${event}`, data);
}

function captureDOMSnapshot(description) {
  const snapshot = {
    timestamp: Date.now() - testState.startTime,
    step: testState.step,
    description,
    url: window.location.hash,
    inputs: [],
    buttons: [],
    forms: [],
    modals: [],
    overlays: [],
    loadingElements: [],
    blockingElements: []
  };

  // Capture all inputs
  document.querySelectorAll('input, textarea, select, button').forEach((el, index) => {
    const rect = el.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(el);
    snapshot.inputs.push({
      index,
      tagName: el.tagName,
      type: el.type,
      id: el.id,
      className: el.className,
      disabled: el.disabled,
      readonly: el.readOnly,
      value: el.value,
      visible: rect.width > 0 && rect.height > 0,
      position: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      },
      styles: {
        pointerEvents: computedStyle.pointerEvents,
        opacity: computedStyle.opacity,
        visibility: computedStyle.visibility,
        display: computedStyle.display,
        zIndex: computedStyle.zIndex,
        position: computedStyle.position
      }
    });
  });

  // Capture potential blocking elements
  document.querySelectorAll('*').forEach(el => {
    const computedStyle = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    
    if (computedStyle.position === 'fixed' || computedStyle.position === 'absolute') {
      snapshot.blockingElements.push({
        tagName: el.tagName,
        className: el.className,
        id: el.id,
        zIndex: computedStyle.zIndex,
        position: computedStyle.position,
        pointerEvents: computedStyle.pointerEvents,
        opacity: computedStyle.opacity,
        visible: rect.width > 0 && rect.height > 0,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        }
      });
    }
  });

  // Capture loading states
  document.querySelectorAll('.spinner, [class*="loading"], [class*="spinner"]').forEach(el => {
    snapshot.loadingElements.push({
      tagName: el.tagName,
      className: el.className,
      visible: el.offsetParent !== null
    });
  });

  testState.domSnapshots.push(snapshot);
  return snapshot;
}

function testInputInteractivity() {
  const results = [];
  document.querySelectorAll('input, textarea, select, button').forEach((input, index) => {
    const rect = input.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;
    const computedStyle = window.getComputedStyle(input);
    
    // Test if element can receive focus
    let canFocus = false;
    try {
      input.focus();
      canFocus = document.activeElement === input;
      input.blur();
    } catch (e) {
      canFocus = false;
    }

    // Test if element can be clicked
    let canClick = false;
    try {
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      canClick = input.dispatchEvent(clickEvent);
    } catch (e) {
      canClick = false;
    }

    results.push({
      index,
      tagName: input.tagName,
      type: input.type,
      id: input.id,
      className: input.className,
      disabled: input.disabled,
      readonly: input.readOnly,
      visible: isVisible,
      canFocus,
      canClick,
      pointerEvents: computedStyle.pointerEvents,
      opacity: computedStyle.opacity,
      zIndex: computedStyle.zIndex
    });
  });

  testState.inputStates.push({
    timestamp: Date.now() - testState.startTime,
    step: testState.step,
    results
  });

  return results;
}

function checkForBlockingElements() {
  const blockers = [];
  
  // Check for high z-index elements
  document.querySelectorAll('*').forEach(el => {
    const computedStyle = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    
    if (parseInt(computedStyle.zIndex) > 1000 && 
        computedStyle.position === 'fixed' && 
        rect.width > 0 && rect.height > 0) {
      blockers.push({
        element: el,
        zIndex: computedStyle.zIndex,
        position: computedStyle.position,
        pointerEvents: computedStyle.pointerEvents,
        rect: rect
      });
    }
  });

  testState.blockingElements.push({
    timestamp: Date.now() - testState.startTime,
    step: testState.step,
    blockers
  });

  return blockers;
}

function monitorLoadingStates() {
  const loadingStates = {
    hasSpinner: document.querySelector('.spinner') !== null,
    hasLoadingText: document.querySelector('[class*="loading"]') !== null,
    hasOverlay: document.querySelector('[class*="overlay"]') !== null,
    bodyClasses: document.body.className,
    htmlClasses: document.documentElement.className
  };

  testState.loadingStates.push({
    timestamp: Date.now() - testState.startTime,
    step: testState.step,
    ...loadingStates
  });

  return loadingStates;
}

// Step 1: Navigate to PatientPanel and create a patient
async function step1_createPatient() {
  testState.step = 1;
  logEvent('STEP_1_START', { action: 'Navigate to PatientPanel and create patient' });
  
  // Navigate to PatientPanel
  window.location.hash = '#/patients';
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  captureDOMSnapshot('After navigation to PatientPanel');
  testInputInteractivity();
  checkForBlockingElements();
  monitorLoadingStates();
  
  logEvent('STEP_1_NAVIGATED', { hash: window.location.hash });
  
  // Wait for page to load
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Fill patient form
  const nameInput = document.querySelector('input[placeholder*="Nom"]');
  const phoneInput = document.querySelector('input[placeholder*="Téléphone"]');
  const birthInput = document.querySelector('input[type="date"]');
  
  if (nameInput) {
    nameInput.value = 'Test Patient';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    logEvent('STEP_1_FILLED_NAME', { value: 'Test Patient' });
  }
  
  if (phoneInput) {
    phoneInput.value = '123456789';
    phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
    logEvent('STEP_1_FILLED_PHONE', { value: '123456789' });
  }
  
  if (birthInput) {
    birthInput.value = '1990-01-01';
    birthInput.dispatchEvent(new Event('input', { bubbles: true }));
    logEvent('STEP_1_FILLED_BIRTH', { value: '1990-01-01' });
  }
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Submit form
  const submitButton = document.querySelector('button[type="submit"]');
  if (submitButton) {
    logEvent('STEP_1_SUBMITTING_FORM');
    submitButton.click();
    
    // Wait for form submission
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    captureDOMSnapshot('After patient creation');
    testInputInteractivity();
    checkForBlockingElements();
    monitorLoadingStates();
    
    testState.patientCreated = true;
    logEvent('STEP_1_COMPLETED', { patientCreated: true });
  }
}

// Step 2: Navigate to AllPatients
async function step2_navigateToAllPatients() {
  testState.step = 2;
  logEvent('STEP_2_START', { action: 'Navigate to AllPatients' });
  
  // Navigate to AllPatients
  window.location.hash = '#/all-patients';
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  captureDOMSnapshot('After navigation to AllPatients');
  testInputInteractivity();
  checkForBlockingElements();
  monitorLoadingStates();
  
  logEvent('STEP_2_NAVIGATED', { hash: window.location.hash });
  
  // Wait for page to load
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  captureDOMSnapshot('After AllPatients page loaded');
  testInputInteractivity();
  checkForBlockingElements();
  monitorLoadingStates();
  
  testState.navigationCompleted = true;
  logEvent('STEP_2_COMPLETED', { navigationCompleted: true });
}

// Step 3: Delete the patient
async function step3_deletePatient() {
  testState.step = 3;
  logEvent('STEP_3_START', { action: 'Delete patient' });
  
  captureDOMSnapshot('Before delete operation');
  testInputInteractivity();
  checkForBlockingElements();
  monitorLoadingStates();
  
  // Find and click delete button for our test patient
  const deleteButtons = document.querySelectorAll('button.btn-danger');
  let deleteButton = null;
  
  for (const button of deleteButtons) {
    const row = button.closest('tr');
    if (row && row.textContent.includes('Test Patient')) {
      deleteButton = button;
      break;
    }
  }
  
  if (deleteButton) {
    logEvent('STEP_3_FOUND_DELETE_BUTTON', { 
      buttonText: deleteButton.textContent,
      buttonClasses: deleteButton.className 
    });
    
    // Click delete button
    deleteButton.click();
    logEvent('STEP_3_CLICKED_DELETE');
    
    // Wait for confirmation dialog
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    captureDOMSnapshot('After delete button clicked');
    testInputInteractivity();
    checkForBlockingElements();
    monitorLoadingStates();
    
    // Look for confirmation button
    const confirmButton = document.querySelector('button.btn-danger, button[class*="confirm"], button[class*="delete"]');
    if (confirmButton) {
      logEvent('STEP_3_FOUND_CONFIRM_BUTTON', { 
        buttonText: confirmButton.textContent,
        buttonClasses: confirmButton.className 
      });
      
      confirmButton.click();
      logEvent('STEP_3_CLICKED_CONFIRM');
      
      // Wait for deletion to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      captureDOMSnapshot('After patient deletion');
      testInputInteractivity();
      checkForBlockingElements();
      monitorLoadingStates();
      
      testState.patientDeleted = true;
      logEvent('STEP_3_COMPLETED', { patientDeleted: true });
    } else {
      logEvent('STEP_3_NO_CONFIRM_BUTTON_FOUND');
    }
  } else {
    logEvent('STEP_3_NO_DELETE_BUTTON_FOUND');
  }
}

// Step 4: Monitor for issues
async function step4_monitorForIssues() {
  testState.step = 4;
  logEvent('STEP_4_START', { action: 'Monitor for input locking issues' });
  
  // Monitor for 10 seconds
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const snapshot = captureDOMSnapshot(`Monitoring snapshot ${i + 1}`);
    const inputTest = testInputInteractivity();
    const blockers = checkForBlockingElements();
    const loadingState = monitorLoadingStates();
    
    // Check for locked inputs
    const lockedInputs = inputTest.filter(input => 
      input.disabled || 
      input.pointerEvents === 'none' || 
      input.opacity === '0' || 
      !input.canFocus || 
      !input.canClick
    );
    
    if (lockedInputs.length > 0) {
      logEvent('STEP_4_DETECTED_LOCKED_INPUTS', { 
        count: lockedInputs.length,
        inputs: lockedInputs 
      });
    }
    
    if (blockers.length > 0) {
      logEvent('STEP_4_DETECTED_BLOCKERS', { 
        count: blockers.length,
        blockers: blockers 
      });
    }
    
    logEvent('STEP_4_MONITORING_TICK', { 
      tick: i + 1,
      lockedInputs: lockedInputs.length,
      blockers: blockers.length
    });
  }
  
  logEvent('STEP_4_COMPLETED');
}

// Generate final report
function generateReport() {
  console.log('\n📊 COMPREHENSIVE TEST REPORT');
  console.log('=============================');
  
  console.log(`\n⏱️  Test Duration: ${Date.now() - testState.startTime}ms`);
  console.log(`📝 Total Events: ${testState.eventLog.length}`);
  console.log(`📸 DOM Snapshots: ${testState.domSnapshots.length}`);
  console.log(`🔍 Input Tests: ${testState.inputStates.length}`);
  console.log(`🚫 Blocking Elements: ${testState.blockingElements.length}`);
  console.log(`⏳ Loading States: ${testState.loadingStates.length}`);
  
  console.log('\n📋 Test Results:');
  console.log(`✅ Patient Created: ${testState.patientCreated}`);
  console.log(`✅ Navigation Completed: ${testState.navigationCompleted}`);
  console.log(`✅ Patient Deleted: ${testState.patientDeleted}`);
  
  // Analyze input locking
  const allInputTests = testState.inputStates.flatMap(state => state.results);
  const lockedInputs = allInputTests.filter(input => 
    input.disabled || 
    input.pointerEvents === 'none' || 
    input.opacity === '0' || 
    !input.canFocus || 
    !input.canClick
  );
  
  console.log(`🔒 Locked Inputs Detected: ${lockedInputs.length}`);
  
  if (lockedInputs.length > 0) {
    console.log('\n🚨 LOCKED INPUTS DETAILS:');
    lockedInputs.forEach((input, index) => {
      console.log(`  ${index + 1}. ${input.tagName} (${input.type}) - ${input.className}`);
      console.log(`     Disabled: ${input.disabled}, Focus: ${input.canFocus}, Click: ${input.canClick}`);
      console.log(`     Pointer Events: ${input.pointerEvents}, Opacity: ${input.opacity}`);
    });
  }
  
  // Analyze blocking elements
  const allBlockers = testState.blockingElements.flatMap(state => state.blockers);
  if (allBlockers.length > 0) {
    console.log('\n🚫 BLOCKING ELEMENTS:');
    allBlockers.forEach((blocker, index) => {
      console.log(`  ${index + 1}. ${blocker.element.tagName} (${blocker.element.className})`);
      console.log(`     Z-Index: ${blocker.zIndex}, Position: ${blocker.position}`);
      console.log(`     Pointer Events: ${blocker.pointerEvents}`);
    });
  }
  
  // Show timeline of events
  console.log('\n⏰ EVENT TIMELINE:');
  testState.eventLog.forEach(event => {
    console.log(`  [${event.timestamp}ms] ${event.event}`);
  });
  
  // Save detailed report to console
  console.log('\n📄 DETAILED REPORT DATA:');
  console.log('testState =', JSON.stringify(testState, null, 2));
  
  return testState;
}

// Main execution function
async function runAutomatedTest() {
  console.log('🚀 Starting automated test sequence...');
  
  try {
    await step1_createPatient();
    await step2_navigateToAllPatients();
    await step3_deletePatient();
    await step4_monitorForIssues();
    
    const report = generateReport();
    console.log('\n✅ Automated test completed!');
    
    return report;
  } catch (error) {
    console.error('❌ Automated test failed:', error);
    testState.errors.push(error);
    return testState;
  }
}

// Auto-start the test
console.log('🤖 Starting automated test in 3 seconds...');
setTimeout(() => {
  runAutomatedTest().then(report => {
    console.log('🎯 Test completed. Check the report above for details.');
  });
}, 3000);

// Export for manual execution
window.runAutomatedTest = runAutomatedTest;
window.testState = testState; 