import { Client } from 'ssh2';
import { readFileSync } from 'fs';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';

const conn = new Client();

function runCmd(cmd, timeout = 60000) {
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

conn.on('ready', async () => {
  console.log('✅ Connected!');
  
  // Upload bundle
  console.log('📤 Uploading comprehensive bundle...');
  const result = await upload('/tmp/src-bundle3.tar.gz', '/tmp/src-bundle3.tar.gz');
  console.log(`Upload: ${result}`);
  
  if (result === 'OK') {
    // Extract
    console.log('📦 Extracting...');
    await runCmd(`cd ${DEPLOY_DIR} && tar xzf /tmp/src-bundle3.tar.gz`);
    
    // Verify
    console.log('🔍 Verifying files...');
    const check = await runCmd(`ls ${DEPLOY_DIR}/src/components/effects/ && echo "---" && ls ${DEPLOY_DIR}/Dockerfile && echo "---" && ls ${DEPLOY_DIR}/package-lock.json && echo "---" && ls ${DEPLOY_DIR}/src/lib/visual-effects-store.ts`);
    console.log(check.substring(0, 400));
    
    // Start rebuild
    console.log('\n🔨 Starting Docker rebuild (background)...');
    await runCmd(`cd ${DEPLOY_DIR} && nohup bash -c 'docker compose -f docker-compose.prod.yml build --no-cache app 2>&1 && docker compose -f docker-compose.prod.yml up -d 2>&1 && echo "DEPLOY_SUCCESS" > /tmp/deploy-status.txt && date >> /tmp/deploy-status.txt' > /tmp/deploy-final.log 2>&1 &`);
    console.log('✅ Rebuild started in background');
    console.log('   This takes ~3-5 minutes on the VPS');
    console.log('   Monitor: Check /tmp/deploy-status.txt on VPS');
  }
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
console.log('Connecting...');
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
