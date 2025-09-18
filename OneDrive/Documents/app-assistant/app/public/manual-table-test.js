// Manual Table Test - Analyze table structure
console.log('🔍 MANUAL TABLE TEST STARTING...');

function analyzeTableStructure() {
  console.log('\n📊 TABLE STRUCTURE ANALYSIS:');
  console.log('============================');
  
  // Find all tables
  const tables = document.querySelectorAll('table');
  console.log(`Found ${tables.length} tables`);
  
  tables.forEach((table, index) => {
    console.log(`\n📋 TABLE ${index + 1}:`);
    console.log(`  Class: ${table.className}`);
    console.log(`  ID: ${table.id}`);
    
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    const rows = table.querySelectorAll('tr');
    
    console.log(`  Has thead: ${!!thead}`);
    console.log(`  Has tbody: ${!!tbody}`);
    console.log(`  Total rows: ${rows.length}`);
    
    // Analyze headers
    if (thead) {
      const headers = thead.querySelectorAll('th');
      const headerTexts = Array.from(headers).map(th => th.textContent.trim());
      console.log(`  Headers: [${headerTexts.join(', ')}]`);
    }
    
    // Analyze first row for structure
    if (rows.length > 0) {
      const firstRow = rows[0];
      const cells = firstRow.querySelectorAll('td, th');
      const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
      console.log(`  First row cells: [${cellTexts.join(', ')}]`);
      
      // Check for delete buttons
      const deleteButtons = firstRow.querySelectorAll('button.btn-danger');
      console.log(`  Delete buttons in first row: ${deleteButtons.length}`);
    }
  });
  
  return tables;
}

function tryAddMockPatient() {
  console.log('\n➕ ATTEMPTING TO ADD MOCK PATIENT:');
  console.log('==================================');
  
  const tables = document.querySelectorAll('table');
  
  if (tables.length === 0) {
    console.log('❌ No tables found');
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
          console.log(`✅ Found suitable table with ${cells.length} cells`);
          break;
        }
      }
    }
  }
  
  if (!targetTbody) {
    console.log('❌ No suitable table body found');
    return false;
  }
  
  // Analyze the structure of existing rows
  const existingRows = targetTbody.querySelectorAll('tr');
  if (existingRows.length > 0) {
    const sampleRow = existingRows[0];
    const cells = sampleRow.querySelectorAll('td');
    console.log(`📋 Analyzing row structure with ${cells.length} cells`);
    
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
    console.log('✅ Mock patient row added successfully');
    
    return true;
  } else {
    console.log('❌ No existing rows to analyze structure');
    return false;
  }
}

function runManualTableTest() {
  console.log('🚀 Starting manual table test...');
  
  // Navigate to AllPatients
  console.log('📍 Navigating to AllPatients...');
  window.location.hash = '#/all-patients';
  
  // Wait a bit then analyze
  setTimeout(() => {
    console.log('\n🔍 Analyzing table structure...');
    analyzeTableStructure();
    
    setTimeout(() => {
      console.log('\n➕ Trying to add mock patient...');
      const success = tryAddMockPatient();
      
      if (success) {
        console.log('\n✅ Mock patient added successfully!');
        console.log('🔍 You should now see "Test Patient" in the table');
      } else {
        console.log('\n❌ Failed to add mock patient');
      }
    }, 1000);
  }, 2000);
}

// Auto-start
console.log('🤖 Manual table test will start in 2 seconds...');
setTimeout(runManualTableTest, 2000);

// Export for manual execution
window.runManualTableTest = runManualTableTest;
window.analyzeTableStructure = analyzeTableStructure;
window.tryAddMockPatient = tryAddMockPatient; 