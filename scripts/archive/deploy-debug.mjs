import { Client } from 'ssh2';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';

const conn = new Client();

function runCmd(cmd) {
  return new Promise((resolve) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { resolve(''); return; }
      let out = '';
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => { out += d.toString(); });
      stream.on('close', () => resolve(out.trim()));
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected!');
  
  // Get full build log
  const log = await runCmd('cat /tmp/deploy-build.log 2>&1 | head -100');
  console.log(`Build log:\n${log.substring(0, 2000)}`);
  
  // Check if package.json and package-lock.json match
  const pkgCheck = await runCmd(`cd ${DEPLOY_DIR} && head -5 package.json && echo "---" && head -5 package-lock.json`);
  console.log(`\nPackage files:\n${pkgCheck}`);
  
  // Try a direct npm install to test
  console.log('\nTrying npm install on VPS directly...');
  const npmTest = await runCmd(`cd ${DEPLOY_DIR} && npm ci 2>&1 | tail -20`);
  console.log(`npm ci test: ${npmTest.substring(0, 500)}`);
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
