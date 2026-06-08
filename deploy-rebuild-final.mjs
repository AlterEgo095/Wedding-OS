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
  
  // Check current Dockerfile content
  console.log('📋 Current Dockerfile on VPS:');
  const currentDockerfile = await runCmd(`grep -n "bun.lock" ${DEPLOY_DIR}/Dockerfile`);
  console.log(currentDockerfile);
  
  // The issue: the build log shows OLD Dockerfile content
  // This means Docker might be using a cached context
  // Let's make sure the Dockerfile is correct and then force a fresh build
  
  // Upload fixed Dockerfile again
  console.log('\n📤 Re-uploading Dockerfile...');
  const ok = await upload('/home/z/my-project/Dockerfile', `${DEPLOY_DIR}/Dockerfile`);
  console.log(`Uploaded: ${ok}`);
  
  // Verify the upload
  const after = await runCmd(`grep -n "bun.lock" ${DEPLOY_DIR}/Dockerfile`);
  console.log(`After upload: ${after}`);
  
  // Also remove bun.lock from the VPS to avoid confusion
  console.log('\n🗑️ Removing bun.lock (will use package-lock.json instead)...');
  await runCmd(`rm -f ${DEPLOY_DIR}/bun.lock`);
  
  // Verify lockfiles present
  const locks = await runCmd(`ls -la ${DEPLOY_DIR}/package-lock.json ${DEPLOY_DIR}/bun.lock ${DEPLOY_DIR}/yarn.lock 2>&1`);
  console.log(`Lockfiles: ${locks}`);
  
  // Clear any Docker build cache and start fresh
  console.log('\n🧹 Clearing Docker build cache...');
  await runCmd('docker builder prune -f 2>&1 | tail -3');
  
  // Start build
  console.log('\n🔨 Starting fresh Docker build (no cache)...');
  await runCmd(`cd ${DEPLOY_DIR} && nohup bash -c 'docker compose -f docker-compose.prod.yml build --no-cache app 2>&1 && docker compose -f docker-compose.prod.yml up -d 2>&1 && echo "SUCCESS $(date)" > /tmp/deploy-status.txt' > /tmp/deploy-build.log 2>&1 &`);
  console.log('✅ Build started');
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
