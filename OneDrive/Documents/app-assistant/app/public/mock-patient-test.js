// Mock Patient Test - Directly add patient to AllPatients and test deletion
console.log('🚀 MOCK PATIENT TEST STARTING...');

const testState = {
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

function addMockPatient() {
  logEvent('ADDING_MOCK_PATIENT', 'Adding mock patient to the table');
  
  // Find the table body
  const tableBody = document.querySelector('tbody');
  if (!tableBody) {
    logEvent('ERROR', 'No table body found');
    return false;
  }
  
  // Create a mock patient row
  const mockRow = document.createElement('tr');
  mockRow.innerHTML = `
    <td>Test Patient</td>
    <td>123456789</td>
    <td>1990-01-01</td>
    <td>
      <button class="btn btn-danger btn-sm" onclick="deletePatient('test_patient_123')">
        <i class="fas fa-trash"></i>
      </button>
    </td>
  `;
  
  // Add the row to the table
  tableBody.appendChild(mockRow);
  logEvent('MOCK_PATIENT_ADDED', 'Mock patient row added to table');
  
  return true;
}

async function runMockPatientTest() {
  console.log('📋 Starting mock patient test...');
  
  // Step 1: Navigate to AllPatients
  logEvent('STEP_1', 'Navigating to AllPatients');
  window.location.hash = '#/all-patients';
  await new Promise(r => setTimeout(r, 2000));
  
  let inputs = checkInputs();
  let blockers = checkBlockers();
  logEvent('STEP_1_COMPLETE', { inputs: inputs.length, blockers: blockers.length });
  
  // Step 2: Add mock patient
  logEvent('STEP_2', 'Adding mock patient to table');
  const patientAdded = addMockPatient();
  
  if (patientAdded) {
    await new Promise(r => setTimeout(r, 1000));
    
    inputs = checkInputs();
    blockers = checkBlockers();
    logEvent('STEP_2_COMPLETE', { inputs: inputs.length, blockers: blockers.length });
    
    // Step 3: Find and delete the mock patient
    logEvent('STEP_3', 'Looking for delete button for mock patient');
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
      logEvent('STEP_3', 'Found delete button, clicking');
      deleteButton.click();
      await new Promise(r => setTimeout(r, 1000));
      
      // Check for confirmation dialog
      const confirmButton = document.querySelector('button.btn-danger, button[class*="confirm"], button[class*="delete"]');
      if (confirmButton) {
        logEvent('STEP_3', 'Found confirm button, clicking');
        confirmButton.click();
        await new Promise(r => setTimeout(r, 3000));
        logEvent('STEP_3', 'Mock patient deleted');
      } else {
        logEvent('STEP_3', 'No confirm button found');
      }
    } else {
      logEvent('STEP_3', 'No delete button found for mock patient');
    }
  }
  
  // Step 4: Final check
  logEvent('STEP_4', 'Final state check');
  inputs = checkInputs();
  blockers = checkBlockers();
  
  const lockedInputs = inputs.filter(input => 
    input.disabled || 
    input.pointerEvents === 'none' || 
    input.opacity === '0' || 
    !input.canFocus
  );
  
  logEvent('STEP_4_COMPLETE', { 
    totalInputs: inputs.length, 
    lockedInputs: lockedInputs.length,
    blockers: blockers.length 
  });
  
  console.log('\n📊 MOCK PATIENT TEST RESULTS:');
  console.log('=============================');
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
console.log('🤖 Mock patient test will start in 2 seconds...');
setTimeout(runMockPatientTest, 2000);

// Export for manual execution
window.runMockPatientTest = runMockPatientTest; 