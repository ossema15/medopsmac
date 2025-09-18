// Wait for Table Test - Handle loading states and wait for table to render
console.log('⏳ WAIT FOR TABLE TEST STARTING...');

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

function analyzePageState() {
  console.log('\n📊 PAGE STATE ANALYSIS:');
  console.log('========================');
  
  // Check for loading states
  const spinner = document.querySelector('.spinner');
  const loadingText = document.querySelector('[class*="loading"]');
  const loadingDiv = document.querySelector('div:contains("loading")');
  
  console.log(`Spinner found: ${!!spinner}`);
  console.log(`Loading text found: ${!!loadingText}`);
  console.log(`Loading div found: ${!!loadingDiv}`);
  
  // Check for tables
  const tables = document.querySelectorAll('table');
  console.log(`Tables found: ${tables.length}`);
  
  // Check for any content
  const mainContent = document.querySelector('.main-content');
  const pageContent = document.querySelector('.page-content');
  const contentDivs = document.querySelectorAll('div');
  
  console.log(`Main content found: ${!!mainContent}`);
  console.log(`Page content found: ${!!pageContent}`);
  console.log(`Total divs: ${contentDivs.length}`);
  
  // Check for specific elements
  const searchInput = document.querySelector('input[placeholder*="Nom"]');
  const searchInputs = document.querySelectorAll('input');
  
  console.log(`Search input found: ${!!searchInput}`);
  console.log(`Total inputs: ${searchInputs.length}`);
  
  // List all inputs
  searchInputs.forEach((input, i) => {
    console.log(`  Input ${i+1}: ${input.tagName} - ${input.type} - ${input.placeholder || 'no placeholder'}`);
  });
  
  return {
    hasSpinner: !!spinner,
    hasLoadingText: !!loadingText,
    tablesCount: tables.length,
    inputsCount: searchInputs.length
  };
}

function waitForTable(maxWaitTime = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    function checkForTable() {
      const tables = document.querySelectorAll('table');
      const state = analyzePageState();
      
      logEvent('CHECKING_FOR_TABLE', state);
      
      if (tables.length > 0) {
        console.log('✅ Table found!');
        resolve(tables);
        return;
      }
      
      if (Date.now() - startTime > maxWaitTime) {
        console.log('❌ Timeout waiting for table');
        reject(new Error('Timeout waiting for table'));
        return;
      }
      
      // Check again in 1 second
      setTimeout(checkForTable, 1000);
    }
    
    checkForTable();
  });
}

function addMockPatient() {
  logEvent('ADDING_MOCK_PATIENT', 'Attempting to add mock patient');
  
  const tables = document.querySelectorAll('table');
  
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
      const firstRow = tbody.querySelector('tr');
      if (firstRow) {
        const cells = firstRow.querySelectorAll('td');
        if (cells.length >= 3) {
          targetTable = table;
          targetTbody = tbody;
          logEvent('FOUND_PATIENTS_TABLE', { 
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
  
  // Analyze the structure of existing rows
  const existingRows = targetTbody.querySelectorAll('tr');
  if (existingRows.length > 0) {
    const sampleRow = existingRows[0];
    const cells = sampleRow.querySelectorAll('td');
    logEvent('ANALYZING_ROW_STRUCTURE', { cellCount: cells.length });
    
    // Create a mock row that matches the structure
    const mockRow = document.createElement('tr');
    
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

async function runWaitForTableTest() {
  console.log('📋 Starting wait for table test...');
  
  // Step 1: Navigate to AllPatients
  logEvent('STEP_1', 'Navigating to AllPatients');
  window.location.hash = '#/all-patients';
  await new Promise(r => setTimeout(r, 2000));
  
  let inputs = checkInputs();
  let blockers = checkBlockers();
  logEvent('STEP_1_COMPLETE', { inputs: inputs.length, blockers: blockers.length });
  
  // Step 2: Wait for table to load
  logEvent('STEP_2', 'Waiting for table to load');
  try {
    await waitForTable(30000); // Wait up to 30 seconds
    logEvent('STEP_2_COMPLETE', 'Table found');
  } catch (error) {
    logEvent('STEP_2_FAILED', 'Table not found after timeout');
    console.log('❌ Could not find table after waiting');
    return;
  }
  
  // Step 3: Add mock patient
  logEvent('STEP_3', 'Adding mock patient');
  const patientAdded = addMockPatient();
  
  if (patientAdded) {
    await new Promise(r => setTimeout(r, 1000));
    
    inputs = checkInputs();
    blockers = checkBlockers();
    logEvent('STEP_3_COMPLETE', { inputs: inputs.length, blockers: blockers.length });
    
    // Step 4: Find and delete the mock patient
    logEvent('STEP_4', 'Looking for delete button');
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
      logEvent('STEP_4', 'Found delete button, clicking');
      deleteButton.click();
      await new Promise(r => setTimeout(r, 1000));
      
      // Check for confirmation dialog
      const confirmButton = document.querySelector('button.btn-danger, button[class*="confirm"]');
      if (confirmButton) {
        logEvent('STEP_4', 'Found confirm button, clicking');
        confirmButton.click();
        await new Promise(r => setTimeout(r, 3000));
        logEvent('STEP_4', 'Mock patient deleted');
      } else {
        logEvent('STEP_4', 'No confirm button found');
      }
    } else {
      logEvent('STEP_4', 'No delete button found for mock patient');
    }
  } else {
    logEvent('STEP_3_FAILED', 'Could not add mock patient');
  }
  
  // Step 5: Final check
  logEvent('STEP_5', 'Final state check');
  inputs = checkInputs();
  blockers = checkBlockers();
  
  const lockedInputs = inputs.filter(input => 
    input.disabled || 
    input.pointerEvents === 'none' || 
    input.opacity === '0' || 
    !input.canFocus
  );
  
  logEvent('STEP_5_COMPLETE', { 
    totalInputs: inputs.length, 
    lockedInputs: lockedInputs.length,
    blockers: blockers.length 
  });
  
  console.log('\n📊 WAIT FOR TABLE TEST RESULTS:');
  console.log('=================================');
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
console.log('🤖 Wait for table test will start in 2 seconds...');
setTimeout(runWaitForTableTest, 2000);

// Export for manual execution
window.runWaitForTableTest = runWaitForTableTest;
window.analyzePageState = analyzePageState;
window.waitForTable = waitForTable; 