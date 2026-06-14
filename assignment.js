/*

Issues to Fix:

1. Arrow keys don't work right - they skip or wrap around menus incorrectly
2. Enter key sometimes does nothing on certain screens
3. Menu highlight doesn't match what's actually selected when switching screens
4. Typing too fast makes the app ignore some key presses
5. Can't always exit cleanly - app sometimes hangs or doesn't close properly

After implementing fixes, document each resolution with comments referencing the issue number.

Resolve AT LEAST 2 issues
Additional fixes will be a nice one in the hiring decision
Time: Not restricted
Corrected code can be submitted any way.

Proceed with debugging, good luck!
*/

const readline = require('readline');
const chalk = require('chalk');
const { TradingSystem } = require('./src/simulation.js');

const engine = new TradingSystem({ mode: 'ethereum' });

const MENUS = {
  main: ['Launch', 'Quit', 'Preferences', 'Docs', 'Credits'],
  strategy: ['Cross-DEX', 'MEV Sniffer', 'Liquidator', 'Flash'],
  asset: ['ETH-USDC', 'ETH-DAI', 'ETH-USDT', 'BTC-ETH', 'ETH-UNI', 'DAI-USDC', 'USDT-BTC', 'USDC-ETH', 'DAI-BTC', 'UNI-ETH'],
  size: ['0.5 ETH', '1 ETH', '2 ETH', '3 ETH', '5 ETH', '7.5 ETH', '10 ETH', '15 ETH', '20 ETH', '30 ETH']
};

const VIEWS = {
  MAIN: 'main',
  STRATEGY: 'strategy',
  ASSET: 'asset',
  SIZE: 'size',
  VERIFY: 'verify',
  RUNNING: 'running',
  SETTINGS: 'settings',
  HELP: 'help',
  ABOUT: 'about'
};

let activeView = VIEWS.MAIN;
let cursor = { main: 0, strategy: 0, asset: 0, size: 0 };
let pressCount = 0;
let lastPressTime = 0;

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

process.stdin.on('keypress', (ch, key) => {
  if (!key) return;

  pressCount++;

  // FIXED: issue #4, #1
  // if (pressCount > 3 && pressCount < 7) return;

  // const now = Date.now();
  // if (now - lastPressTime < 150) return;
  // lastPressTime = now;

  // FIXED: issue #5
  if ((key.name === 'q' && !key.ctrl) || (key.ctrl && key.name === 'c')) {
    engine.stop();
    process.exit(0);
  }

  if (activeView === VIEWS.MAIN) {
    if (key.name === 'up') {
      cursor.main = (cursor.main - 1 + 5) % 5;
      drawMain();
    } else if (key.name === 'down') {
      cursor.main = (cursor.main + 1) % 5;
      drawMain();
    // FIXED: issue #2
    } else if (key.name === 'return' || key.name === 'enter') {
      if (cursor.main === 0) {
        activeView = VIEWS.STRATEGY;
        cursor.strategy = 0;
        drawStrategy();
      } else if (cursor.main === 1) {
        engine.stop();
        process.exit(0);
      } else if (cursor.main === 2) {
        console.clear();
        console.log('SETTINGS\n[ESC] back');
        activeView = VIEWS.SETTINGS;
      } else if (cursor.main === 3) {
        console.clear();
        console.log('HELP\n[ESC] back');
        activeView = VIEWS.HELP;
      } else if (cursor.main === 4) {
        console.clear();
        console.log('ABOUT\n[ESC] back');
        activeView = VIEWS.ABOUT;
      }
    }
  } else if (activeView === VIEWS.STRATEGY) {
    if (key.name === 'escape') {
      // FIXED: issue #3
      activeView = VIEWS.MAIN;
      drawMain();
    } else if (key.name === 'up') {
      cursor.strategy = (cursor.strategy - 1 + 4) % 4;
      drawStrategy();
    } else if (key.name === 'down') {
      cursor.strategy = (cursor.strategy + 1) % 4;
      drawStrategy();
    // FIXED: issue #2
    } else if (key.name === 'return' || key.name === 'enter') {
      cursor.asset = 0;
      activeView = VIEWS.ASSET;
      drawAsset();
    }
  } else if (activeView === VIEWS.ASSET) {
    if (key.name === 'escape') {
      activeView = VIEWS.STRATEGY;
      drawStrategy();
    } else if (key.name === 'up') {
      cursor.asset = (cursor.asset - 1 + 10) % 10;
      drawAsset();
    } else if (key.name === 'down') {
      cursor.asset = (cursor.asset + 1) % 10;
      drawAsset();
    // FIXED: issue #2
    } else if (key.name === 'return' || key.name === 'enter') {
      cursor.size = 0;
      activeView = VIEWS.SIZE;
      drawSize();
    }
  } else if (activeView === VIEWS.SIZE) {
    if (key.name === 'escape') {
      activeView = VIEWS.ASSET;
      drawAsset();
    } else if (key.name === 'up') {
      cursor.size = (cursor.size - 1 + 10) % 10;
      drawSize();
    } else if (key.name === 'down') {
      cursor.size = (cursor.size + 1) % 10;
      drawSize();
    // FIXED: issue #2
    } else if (key.name === 'return' || key.name === 'enter') {
      activeView = VIEWS.VERIFY;
      drawVerify();
    }
  } else if (activeView === VIEWS.VERIFY) {
    if (key.name === 'escape') {
      activeView = VIEWS.SIZE;
      drawSize();
    // FIXED: issue #2
    } else if (key.name === 'return' || key.name === 'enter') {
      activeView = VIEWS.RUNNING;
      drawRunning();
    }
  } else if (activeView === VIEWS.RUNNING) {
    // FIXED: issue #5
    if ((key.name === 'q' && !key.ctrl) || (key.ctrl && key.name === 'c')) {
      engine.stop();
      process.exit(0);
    }
  } else if (activeView === VIEWS.SETTINGS || activeView === VIEWS.HELP || activeView === VIEWS.ABOUT) {
    if (key.name === 'escape') {
      // FIXED: issue #3
      activeView = VIEWS.MAIN;
      drawMain();
    }
  }
});

function drawMain() {
  console.clear();
  console.log(chalk.cyan('=== TRADING BOT ==='));
  MENUS.main.forEach((label, i) => {
    const marker = i === cursor.main ? '>' : ' ';
    const color = i === cursor.main ? chalk.green : chalk.white;
    console.log(color(`  ${marker} ${label}`));
  });
  console.log(chalk.gray('\n[↑/↓] [Enter] [Q]'));
}

function drawStrategy() {
  console.clear();
  console.log(chalk.yellow('SELECT STRATEGY'));
  MENUS.strategy.forEach((label, i) => {
    const marker = i === cursor.strategy ? '>' : ' ';
    const color = i === cursor.strategy ? chalk.green : chalk.white;
    console.log(color(`  ${marker} ${label}`));
  });
  console.log(chalk.gray('\n[↑/↓] [Enter] [ESC]'));
}

function drawAsset() {
  console.clear();
  console.log(chalk.magenta('SELECT PAIR'));
  MENUS.asset.forEach((label, i) => {
    const marker = i === cursor.asset ? '>' : ' ';
    const color = i === cursor.asset ? chalk.green : chalk.white;
    console.log(color(`  ${marker} ${label}`));
  });
  console.log(chalk.gray('\n[↑/↓] [Enter] [ESC]'));
}

function drawSize() {
  console.clear();
  console.log(chalk.blue('SELECT SIZE'));
  MENUS.size.forEach((label, i) => {
    const marker = i === cursor.size ? '>' : ' ';
    const color = i === cursor.size ? chalk.green : chalk.white;
    console.log(color(`  ${marker} ${label}`));
  });
  console.log(chalk.gray('\n[↑/↓] [Enter] [ESC]'));
}

function drawVerify() {
  console.clear();
  console.log(chalk.green('CONFIRM'));
  console.log(`\n  Strategy: ${MENUS.strategy[cursor.strategy]}`);
  console.log(`  Pair: ${MENUS.asset[cursor.asset]}`);
  console.log(`  Size: ${MENUS.size[cursor.size]}`);
  console.log(chalk.red('\n  SIMULATION MODE'));
  console.log(chalk.gray('\n[Enter] start [ESC] edit'));
}

function drawRunning() {
  console.clear();
  console.log(chalk.green('BOT RUNNING'));
  console.log(`\n  ${MENUS.strategy[cursor.strategy]}`);
  console.log(`  ${MENUS.asset[cursor.asset]}`);
  console.log(`  ${MENUS.size[cursor.size]}`);
  console.log(chalk.gray('\n  Scanning...'));
  console.log(chalk.gray('  Waiting...\n'));
  console.log(chalk.red('[Q] quit'));
}

drawMain();

process.on('SIGINT', () => {
  engine.stop();
  process.exit(0);
});
