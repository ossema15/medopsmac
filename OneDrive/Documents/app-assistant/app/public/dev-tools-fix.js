// Dev Tools Layout Fix
// This script helps fix the dev tools layout issue

console.log('=== DEV TOOLS LAYOUT FIX ===');

// Function to help with dev tools layout
function fixDevToolsLayout() {
  console.log('[DEVTOOLS] To fix the dev tools layout:');
  console.log('[DEVTOOLS] 1. Right-click on the dev tools tab bar');
  console.log('[DEVTOOLS] 2. Select "Dock to right" or "Dock to bottom"');
  console.log('[DEVTOOLS] 3. Or drag the dev tools window to dock it vertically');
  console.log('[DEVTOOLS] 4. You can also press Ctrl+Shift+I again to toggle the layout');
}

// Function to show keyboard shortcuts
function showKeyboardShortcuts() {
  console.log('[DEVTOOLS] Keyboard shortcuts:');
  console.log('[DEVTOOLS] - F12: Open/Close Dev Tools');
  console.log('[DEVTOOLS] - Ctrl+Shift+I: Open/Close Dev Tools');
  console.log('[DEVTOOLS] - Ctrl+Shift+C: Inspect Element');
  console.log('[DEVTOOLS] - Ctrl+Shift+J: Open Console');
  console.log('[DEVTOOLS] - Ctrl+Shift+M: Toggle Device Toolbar');
}

// Make functions available
window.devToolsFix = {
  fixDevToolsLayout,
  showKeyboardShortcuts
};

console.log('[DEVTOOLS] Run window.devToolsFix.fixDevToolsLayout() for layout help');
console.log('[DEVTOOLS] Run window.devToolsFix.showKeyboardShortcuts() for shortcuts');

// Auto-show help
fixDevToolsLayout(); 