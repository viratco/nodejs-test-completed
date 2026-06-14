# 🎯 Node Test Assignment (Completed)

This repository contains the completed and fully debugged version of the simulated trading bot CLI application. All 5 documented issues have been identified and resolved in `assignment.js` with minimal, clean code modifications.

---

## 🛠️ Summary of Fixed Issues

### 1. Arrow keys skipping & wrapping issues (Issue #1)
* **Root Cause**: The application had an arbitrary keypress filter (`pressCount > 3 && pressCount < 7`) which silently ignored keypresses 4, 5, and 6. This made the pointer skip and wrap around unpredictably.
* **Fix**: Commented out the `pressCount` check. Arrow navigation now tracks perfectly on all menus.

### 2. Enter key ignoring inputs on some screens (Issue #2)
* **Root Cause**: Similar to Issue #1, the keypress filter could drop the `Enter` press if it landed on keypress #4–6. Additionally, certain terminal emulators/keyboards send the name `'enter'` instead of `'return'`, which was unhandled.
* **Fix**: Added support for `key.name === 'enter'` alongside `'return'` on all screens, and disabled the throttle filters.

### 3. Menu highlight resetting when navigating back (Issue #3)
* **Root Cause**: The escape key logic for returning to the main menu (from screens like `STRATEGY` or `SETTINGS/HELP/ABOUT`) explicitly reset `cursor.main` back to `0` (Launch). 
* **Fix**: Removed the reset (`cursor.main = 0;`) on these back paths to preserve the user's previous menu choice.

### 4. Fast typing ignoring keypresses (Issue #4)
* **Root Cause**: A 150ms debounce throttle (`now - lastPressTime < 150`) was discarding any fast consecutive keystrokes (such as rapid arrow key navigation).
* **Fix**: Commented out the time-based throttle. Keystroke inputs are now processed immediately.

### 5. App hanging on Ctrl+C and exit sequences (Issue #5)
* **Root Cause**: Setting standard input to `rawMode(true)` intercepts default system events. Without manual propagation, `Ctrl+C` was captured as standard keyboard input but was never handled, preventing the shell from receiving `SIGINT` and causing the CLI to hang.
* **Fix**: Added an explicit check for `key.ctrl && key.name === 'c'` inside the keypress handler on all views to ensure clean shutdowns and resources release.

---

## 🚀 How to Run & Test

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the interactive interface:
   ```bash
   npm run start
   ```

### Navigation Controls
* **Up / Down Arrow Keys**: Select items (wraps correctly and reacts instantly).
* **Enter / Return**: Confirm selection (works 100% of the time, on all screens).
* **Escape**: Go back to previous screen (saves your menu highlight).
* **Q** or **Ctrl + C**: Stop the simulation engine and exit cleanly.
