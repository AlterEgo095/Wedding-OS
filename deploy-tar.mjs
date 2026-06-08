import { Client } from 'ssh2';
import { readFileSync } from 'fs';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';

const conn = new Client();

function runCmd(cmd) {
  return new Promise((resolve) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { resolve(`ERR:${err.message}`); return; }
      let out = '';
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => { out += d.toString(); });
      stream.on('close', () => resolve(out.trim()));
    });
  });
}

function upload(local, remote) {
  return new Promise((resolve) => {
    conn.sftp((err, sftp) => {
      if (err) { resolve(`SFTP_ERR:${err.message}`); return; }
      const ws = sftp.createWriteStream(remote);
      ws.on('close', () => { sftp.end(); resolve('OK'); });
      ws.on('error', (e) => { sftp.end(); resolve(`ERR:${e.message}`); });
      ws.end(readFileSync(local));
    });
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

conn.on('ready', async () => {
  console.log('✅ Connected!');
  
  // Step 1: Upload the tar bundle
  console.log('📤 Uploading tar bundle...');
  const result = await upload('/tmp/src-bundle.tar.gz', '/tmp/src-bundle.tar.gz');
  console.log(`Upload result: ${result}`);
  
  if (result === 'OK') {
    // Step 2: Extract on VPS
    console.log('📦 Extracting on VPS...');
    const extractResult = await runCmd(`cd ${DEPLOY_DIR} && tar xzf /tmp/src-bundle.tar.gz`);
    console.log(`Extract: ${extractResult.substring(0, 200)}`);
    
    // Step 3: Verify key files
    console.log('🔍 Verifying...');
    const verify = await runCmd(`ls -la ${DEPLOY_DIR}/src/components/effects/ && ls -la ${DEPLOY_DIR}/src/components/admin/AppearanceManager.tsx && ls -la ${DEPLOY_DIR}/src/lib/visual-effects-store.ts`);
    console.log(`Verify: ${verify.substring(0, 300)}`);
    
    // Step 4: Start Docker rebuild in background
    console.log('🔨 Starting Docker rebuild...');
    await runCmd(`cd ${DEPLOY_DIR} && nohup bash -c 'docker compose -f docker-compose.prod.yml build --no-cache app && docker compose -f docker-compose.prod.yml up -d && echo "DONE" > /tmp/rebuild-status.txt' > /tmp/rebuild.log 2>&1 &`);
    console.log('✅ Rebuild started in background');
    console.log('   Monitor: Check /tmp/rebuild-status.txt on VPS for "DONE"');
  }
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
console.log('Connecting...');
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
