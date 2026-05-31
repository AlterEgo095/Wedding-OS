#!/bin/bash
exec node -e "
const { spawn } = require('child_process');
const child = spawn('node', ['node_modules/.bin/next', 'dev', '-p', '3000'], {
  stdio: 'inherit',
  env: { ...process.env }
});
child.on('exit', (code, signal) => {
  console.log('Next.js exited: code=' + code + ' signal=' + signal);
  process.exit(code || 1);
});
"
