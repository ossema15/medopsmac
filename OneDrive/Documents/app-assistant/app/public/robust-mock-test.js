// Robust Mock Test - Better table detection and debugging
console.log('🚀 ROBUST MOCK TEST STARTING...');

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

function analyzeTableStructure() {
  logEvent('ANALYZING_TABLE_STRUCTURE');
  
  // Find all tables
  const tables = document.querySelectorAll('table');
  logEvent('TABLES_FOUND', { count: tables.length });
  
  tables.forEach((table, index) => {
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    const rows = table.querySelectorAll('tr');
    
    logEvent(`TABLE_${index}_INFO`, {
      hasThead: !!thead,
      hasTbody: !!tbody,
      totalRows: rows.length,
      className: table.className,
      id: table.id
    });
    
    // Analyze headers
    if (thead) {
      const headers = thead.querySelectorAll('th');
      const headerTexts = Array.from(headers).map(th => th.textContent.trim());
      logEvent(`TABLE_${index}_HEADERS`, { headers: headerTexts });
    }
    
    // Analyze first row for structure
    if (rows.length > 0) {
      const firstRow = rows[0];
      const cells = firstRow.querySelectorAll('td, th');
      const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
      logEvent(`TABLE_${index}_FIRST_ROW`, { cells: cellTexts });
    }
  });
  
  return tables;
}

function addMockPatient() {
  logEvent('ADDING_MOCK_PATIENT', 'Attempting to add mock patient');
  
  // First analyze the table structure
  const tables = analyzeTableStructure();
  
  if (tables.length === 0) {
    logEvent('ERROR', 'No tables found');
    return false;
  }
  
  // Try to find the main patients table
  let targetTable = null;
  let targetTbody = null;
  
  for (const table of tables) {
    const tbody = table.querySelector('tbody');
    if (tbody) {
      // Check if this looks like a patients table
      const firstRow = tbody.querySelector('tr');
      if (firstRow) {
        const cells = firstRow.querySelectorAll('td');
        if (cells.length >= 3) { // Should have name, phone, date, actions
          targetTable = table;
          targetTbody = tbody;
          logEvent('FOUND_PATIENTS_TABLE', { 
            tableIndex: Array.from(tables).indexOf(table),
            cellCount: cells.length 
          });
          break;
        }
      }
    }
  }
  
  if (!targetTbody) {
    logEvent('ERROR', 'No suitable table body found');
    return false;
  }
  
  // Analyze the structure of existing rows to match it
  const existingRows = targetTbody.querySelectorAll('tr');
  if (existingRows.length > 0) {
    const sampleRow = existingRows[0];
    const cells = sampleRow.querySelectorAll('td');
    logEvent('ANALYZING_ROW_STRUCTURE', { cellCount: cells.length });
    
    // Create a mock row that matches the structure
    const mockRow = document.createElement('tr');
    
    // Create cells based on the structure
    for (let i = 0; i < cells.length; i++) {
      const cell = document.createElement('td');
      
      if (i === 0) {
        cell.textContent = 'Test Patient';
      } else if (i === 1) {
        cell.textContent = '123456789';
      } else if (i === 2) {
        cell.textContent = '1990-01-01';
      } else if (i === cells.length - 1) {
        // Last cell should be the action/delete button
        cell.innerHTML = `
          <button class="btn btn-danger btn-sm" onclick="deletePatient('test_patient_123')">
            <i class="fas fa-trash"></i>
          </button>
        `;
      } else {
        cell.textContent = 'N/A';
      }
      
      mockRow.appendChild(cell);
    }
    
    // Add the row to the table
    targetTbody.appendChild(mockRow);
    logEvent('MOCK_PATIENT_ADDED', 'Mock patient row added to table');
    
    return true;
  } else {
    logEvent('ERROR', 'No existing rows to analyze structure');
    return false;
  }
}

async function runRobustMockTest() {
  console.log('📋 Starting robust mock test...');
  
  // Step 1: Navigate to AllPatients
  logEvent('STEP_1', 'Navigating to AllPatients');
  window.location.hash = '#/all-patients';
  await new Promise(r => setTimeout(r, 2000));
  
  let inputs = checkInputs();
  let blockers = checkBlockers();
  logEvent('STEP_1_COMPLETE', { inputs: inputs.length, blockers: blockers.length });
  
  // Step 2: Add mock patient
  logEvent('STEP_2', 'Adding mock patient');
  const patientAdded = addMockPatient();
  
  if (patientAdded) {
    await new Promise(r => setTimeout(r, 1000));
    
    inputs = checkInputs();
    blockers = checkBlockers();
    logEvent('STEP_2_COMPLETE', { inputs: inputs.length, blockers: blockers.length });
    
    // Step 3: Find and delete the mock patient
    logEvent('STEP_3', 'Looking for delete button');
    const deleteButtons = document.querySelectorAll('button.btn-danger');
    logEvent('DELETE_BUTTONS_FOUND', { count: deleteButtons.length });
    
    let deleteButton = null;
    
    for (const button of deleteButtons) {
      const row = button.closest('tr');
      if (row && row.textContent.includes('Test Patient')) {
        deleteButton = button;
        logEvent('FOUND_MOCK_PATIENT_DELETE_BUTTON');
        break;
      }
    }
    
    if (deleteButton) {
      logEvent('STEP_3', 'Found delete button, clicking');
      deleteButton.click();
      await new Promise(r => setTimeout(r, 1000));
      
      // Check for confirmation dialog
      const confirmButton = document.querySelector('button.btn-danger, button[class*="confirm"]');
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
  } else {
    logEvent('STEP_2_FAILED', 'Could not add mock patient');
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
  
  console.log('\n📊 ROBUST MOCK TEST RESULTS:');
  console.log('==============================');
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
console.log('🤖 Robust mock test will start in 2 seconds...');
setTimeout(runRobustMockTest, 2000);

// Export for manual execution
window.runRobustMockTest = runRobustMockTest; 