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
  
  // Step 1: Kill any running builds
  console.log('Killing old build processes...');
  await runCmd('pkill -f "docker compose" || true');
  await runCmd('rm -f /tmp/rebuild-status.txt /tmp/deploy-status.txt');
  
  // Step 2: Upload fixed Dockerfile
  console.log('Uploading fixed Dockerfile...');
  const dockerfileOk = await upload('/home/z/my-project/Dockerfile', `${DEPLOY_DIR}/Dockerfile`);
  console.log(`Dockerfile uploaded: ${dockerfileOk}`);
  
  // Step 3: Also upload package-lock.json (critical for npm ci)
  console.log('Uploading package-lock.json...');
  const lockOk = await upload('/home/z/my-project/package-lock.json', `${DEPLOY_DIR}/package-lock.json`);
  console.log(`package-lock.json uploaded: ${lockOk}`);
  
  // Step 4: Verify the Dockerfile is correct
  const dockerfileContent = await runCmd(`head -30 ${DEPLOY_DIR}/Dockerfile | grep -A2 "bun.lock"`);
  console.log(`Dockerfile bun.lock section: ${dockerfileContent}`);
  
  // Step 5: Start fresh build
  console.log('\n🔨 Starting fresh Docker build...');
  await runCmd(`cd ${DEPLOY_DIR} && nohup bash -c 'docker compose -f docker-compose.prod.yml build --no-cache app 2>&1 && docker compose -f docker-compose.prod.yml up -d 2>&1 && echo "SUCCESS $(date)" > /tmp/deploy-status.txt' > /tmp/deploy-final.log 2>&1 &`);
  console.log('✅ Build started in background');
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
