import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join } from 'path';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';

// Files that need to be updated on VPS
const FILES_TO_UPDATE = [
  'src/lib/auth.ts',
  'src/lib/guest-auth.ts',
  'src/app/api/guest/auto-auth/route.ts',
  'src/app/api/guest/invite/route.ts',
  'src/app/api/guest/auth/route.ts',
  'src/components/GuestAuthProvider.tsx',
];

const conn = new Client();

function runCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`  → Running: ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('data', (data) => { stdout += data.toString(); });
      stream.stderr.on('data', (data) => { stderr += data.toString(); });
      stream.on('close', (code) => {
        if (stdout.trim()) console.log(`  ✓ stdout: ${stdout.trim().substring(0, 200)}`);
        if (stderr.trim()) console.log(`  ⚠ stderr: ${stderr.trim().substring(0, 200)}`);
        resolve({ code, stdout, stderr });
      });
    });
  });
}

function uploadFile(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    const content = readFileSync(localPath);
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const stream = sftp.createWriteStream(remotePath);
      stream.on('close', () => { console.log(`  ✓ Uploaded: ${remotePath}`); resolve(); });
      stream.on('error', reject);
      stream.end(content);
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected to VPS!');
  
  try {
    // Step 1: Upload changed files
    console.log('\n📦 Step 1: Uploading changed files...');
    for (const file of FILES_TO_UPDATE) {
      const localPath = join(process.cwd(), file);
      const remotePath = `${DEPLOY_DIR}/${file}`;
      await uploadFile(conn, localPath, remotePath);
    }
    
    // Step 2: Rebuild and restart the Docker container
    console.log('\n🔨 Step 2: Rebuilding Docker image...');
    await runCommand(conn, `cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml build --no-cache app 2>&1 | tail -30`);
    
    console.log('\n🚀 Step 3: Restarting container...');
    await runCommand(conn, `cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml up -d 2>&1`);
    
    console.log('\n⏳ Step 4: Waiting for health check...');
    await new Promise(r => setTimeout(r, 15000));
    
    console.log('\n🔍 Step 5: Checking container status...');
    await runCommand(conn, `docker ps --filter name=wedding-app --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"`);
    
    console.log('\n🧪 Step 6: Testing API endpoints...');
    await runCommand(conn, `curl -s http://127.0.0.1:3080/api/guest/lookup?q=MATANDA | head -c 200`);
    await runCommand(conn, `curl -s -X POST http://127.0.0.1:3080/api/guest/auto-auth -H "Content-Type: application/json" -d '{}' | head -c 200`);
    
    console.log('\n✅ Deployment complete!');
  } catch (err) {
    console.error('❌ Deployment error:', err);
  }
  
  conn.end();
});

conn.on('error', (err) => {
  console.error('❌ SSH connection error:', err.message);
});

console.log(`Connecting to ${VPS_USER}@${VPS_HOST}...`);
conn.connect({
  host: VPS_HOST,
  port: 22,
  username: VPS_USER,
  password: VPS_PASS,
  readyTimeout: 30000,
});
