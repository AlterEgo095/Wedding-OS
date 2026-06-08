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
      if (err) { resolve(''); return; }
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
      if (err) { resolve(false); return; }
      const ws = sftp.createWriteStream(remote);
      ws.on('close', () => { sftp.end(); resolve(true); });
      ws.on('error', () => { sftp.end(); resolve(false); });
      ws.end(readFileSync(local));
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected!');
  
  // Upload fixed Dockerfile (using npm i everywhere)
  console.log('📤 Uploading fixed Dockerfile (npm i for all lockfiles)...');
  const ok = await upload('/home/z/my-project/Dockerfile', `${DEPLOY_DIR}/Dockerfile`);
  console.log(`Uploaded: ${ok}`);
  
  // Verify
  const verify = await runCmd(`grep -c "npm i" ${DEPLOY_DIR}/Dockerfile`);
  console.log(`npm i count in Dockerfile: ${verify}`);
  
  // Clear Docker cache
  await runCmd('docker builder prune -f 2>&1 | tail -2');
  
  // Start build
  console.log('\n🔨 Starting Docker build...');
  await runCmd(`cd ${DEPLOY_DIR} && nohup bash -c 'docker compose -f docker-compose.prod.yml build --no-cache app 2>&1 && docker compose -f docker-compose.prod.yml up -d 2>&1 && echo "DEPLOY_SUCCESS $(date)" > /tmp/deploy-status.txt' > /tmp/deploy-build2.log 2>&1 &`);
  console.log('✅ Build started');
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
