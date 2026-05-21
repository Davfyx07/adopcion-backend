const originalExit = process.exit;
process.exit = (code) => {
  console.trace('PROCESS EXIT CALLED WITH CODE', code);
  originalExit(code);
};
require('./src/index.js');
