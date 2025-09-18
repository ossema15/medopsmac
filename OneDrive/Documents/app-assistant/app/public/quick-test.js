// Quick Test Script - Paste this directly into console
console.log('🚀 QUICK TEST STARTING...');

const testState = {
  step: 0,
  startTime: Date.now(),
  events: []
};

function logEvent(event, data = {}) {
  const timestamp = Date.now() - testState.startTime;
  testState.events.push({ timestamp, event, data });
  console.log(`[${timestamp}ms] ${event}`, data);
}

function checkInputs() {
  const inputs = document.querySelectorAll('input, textarea, select, button');
  const results = [];
  
  inputs.forEach((input, index) => {
    const rect = input.getBoundingClientRect();
    const style = window.getComputedStyle(input);
    
    let canFocus = false;
    try {
      input.focus();
      canFocus = document.activeElement === input;
      input.blur();
    } catch (e) {
      canFocus = false;
    }
    
    results.push({
      index,
      tagName: input.tagName,
      type: input.type,
      className: input.className,
      disabled: input.disabled,
      visible: rect.width > 0 && rect.height > 0,
      canFocus,
      pointerEvents: style.pointerEvents,
      opacity: style.opacity,
      zIndex: style.zIndex
    });
  });
  
  return results;
}

function checkBlockers() {
  const blockers = [];
  document.querySelectorAll('*').forEach(el => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    
    if (parseInt(style.zIndex) > 1000 && 
        style.position === 'fixed' && 
        rect.width > 0 && rect.height > 0) {
      blockers.push({
        tagName: el.tagName,
        className: el.className,
        zIndex: style.zIndex,
        pointerEvents: style.pointerEvents
      });
    }
  });
  
  return blockers;
}

async function runQuickTest() {
  console.log('📋 Starting quick test...');
  
  // Step 1: Navigate to PatientPanel
  logEvent('STEP_1', 'Navigating to PatientPanel');
  window.location.hash = '#/patients';
  await new Promise(r => setTimeout(r, 2000));
  
  let inputs = checkInputs();
  let blockers = checkBlockers();
  logEvent('STEP_1_COMPLETE', { inputs: inputs.length, blockers: blockers.length });
  
  // Step 2: Fill form
  logEvent('STEP_2', 'Filling patient form');
  const nameInput = document.querySelector('input[placeholder*="Nom"]');
  const phoneInput = document.querySelector('input[placeholder*="Téléphone"]');
  const birthInput = document.querySelector('input[type="date"]');
  
  if (nameInput) {
    nameInput.value = 'Test Patient';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (phoneInput) {
    phoneInput.value = '123456789';
    phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (birthInput) {
    birthInput.value = '1990-01-01';
    birthInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  
  await new Promise(r => setTimeout(r, 500));
  
  // Step 3: Submit form
  logEvent('STEP_3', 'Submitting form');
  const submitButton = document.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.click();
    await new Promise(r => setTimeout(r, 3000));
  }
  
  inputs = checkInputs();
  blockers = checkBlockers();
  logEvent('STEP_3_COMPLETE', { inputs: inputs.length, blockers: blockers.length });
  
  // Step 4: Navigate to AllPatients
  logEvent('STEP_4', 'Navigating to AllPatients');
  window.location.hash = '#/all-patients';
  await new Promise(r => setTimeout(r, 2000));
  
  inputs = checkInputs();
  blockers = checkBlockers();
  logEvent('STEP_4_COMPLETE', { inputs: inputs.length, blockers: blockers.length });
  
  // Step 5: Find and delete patient
  logEvent('STEP_5', 'Looking for delete button');
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
    logEvent('STEP_5', 'Found delete button, clicking');
    deleteButton.click();
    await new Promise(r => setTimeout(r, 1000));
    
    const confirmButton = document.querySelector('button.btn-danger, button[class*="confirm"]');
    if (confirmButton) {
      logEvent('STEP_5', 'Found confirm button, clicking');
      confirmButton.click();
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  
  // Step 6: Final check
  logEvent('STEP_6', 'Final state check');
  inputs = checkInputs();
  blockers = checkBlockers();
  
  const lockedInputs = inputs.filter(input => 
    input.disabled || 
    input.pointerEvents === 'none' || 
    input.opacity === '0' || 
    !input.canFocus
  );
  
  logEvent('STEP_6_COMPLETE', { 
    totalInputs: inputs.length, 
    lockedInputs: lockedInputs.length,
    blockers: blockers.length 
  });
  
  console.log('\n📊 QUICK TEST RESULTS:');
  console.log('======================');
  console.log(`Total inputs: ${inputs.length}`);
  console.log(`Locked inputs: ${lockedInputs.length}`);
  console.log(`Blocking elements: ${blockers.length}`);
  
  if (lockedInputs.length > 0) {
    console.log('\n🔒 LOCKED INPUTS:');
    lockedInputs.forEach((input, i) => {
      console.log(`  ${i+1}. ${input.tagName} (${input.type}) - ${input.className}`);
      console.log(`     Disabled: ${input.disabled}, Focus: ${input.canFocus}`);
      console.log(`     Pointer Events: ${input.pointerEvents}, Opacity: ${input.opacity}`);
    });
  }
  
  if (blockers.length > 0) {
    console.log('\n🚫 BLOCKING ELEMENTS:');
    blockers.forEach((blocker, i) => {
      console.log(`  ${i+1}. ${blocker.tagName} (${blocker.className})`);
      console.log(`     Z-Index: ${blocker.zIndex}, Pointer Events: ${blocker.pointerEvents}`);
    });
  }
  
  console.log('\n⏰ EVENT TIMELINE:');
  testState.events.forEach(event => {
    console.log(`  [${event.timestamp}ms] ${event.event}`);
  });
  
  return { inputs, lockedInputs, blockers, events: testState.events };
}

// Auto-start
console.log('🤖 Quick test will start in 2 seconds...');
setTimeout(runQuickTest, 2000);

// Export for manual execution
window.runQuickTest = runQuickTest; 