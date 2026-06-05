import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join } from 'path';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';

const FILES_TO_UPDATE = [
  'src/components/GuestAuthProvider.tsx',
];

const conn = new Client();

function runCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`  → Running: ${cmd.substring(0, 80)}...`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('data', (data) => { stdout += data.toString(); });
      stream.stderr.on('data', (data) => { stderr += data.toString(); });
      stream.on('close', (code) => {
        if (stdout.trim()) console.log(`  ✓ ${stdout.trim().substring(0, 200)}`);
        if (stderr.trim() && !stderr.includes('WARNING')) console.log(`  ⚠ ${stderr.trim().substring(0, 200)}`);
        resolve({ code, stdout, stderr });
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected to VPS!');
  
  try {
    // Upload remaining files via base64 + echo
    console.log('\n📦 Uploading remaining files via base64...');
    for (const file of FILES_TO_UPDATE) {
      const localPath = join(process.cwd(), file);
      const remotePath = `${DEPLOY_DIR}/${file}`;
      const content = readFileSync(localPath, 'utf8');
      const b64 = Buffer.from(content).toString('base64');
      console.log(`  Uploading ${file} (${(b64.length / 1024).toFixed(1)}KB b64)...`);
      await runCommand(conn, `echo '${b64}' | base64 -d > "${remotePath}"`);
    }
    
    // Rebuild Docker
    console.log('\n🔨 Rebuilding Docker image...');
    await runCommand(conn, `cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml build --no-cache app 2>&1 | tail -5`);
    
    console.log('\n🚀 Restarting container...');
    await runCommand(conn, `cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml up -d 2>&1`);
    
    console.log('\n⏳ Waiting for app to start...');
    await new Promise(r => setTimeout(r, 20000));
    
    console.log('\n🔍 Checking container...');
    await runCommand(conn, `docker ps --filter name=wedding-app --format "{{.Names}}: {{.Status}}"`);
    
    console.log('\n🧪 Testing endpoints...');
    await runCommand(conn, `curl -s http://127.0.0.1:3080/api/guest/lookup?q=MATANDA 2>&1 | head -c 300`);
    
    console.log('\n✅ Deployment complete!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  conn.end();
});

conn.on('error', (err) => {
  console.error('❌ SSH error:', err.message);
});

console.log(`Connecting to ${VPS_USER}@${VPS_HOST}...`);
conn.connect({
  host: VPS_HOST,
  port: 22,
  username: VPS_USER,
  password: VPS_PASS,
  readyTimeout: 30000,
});
