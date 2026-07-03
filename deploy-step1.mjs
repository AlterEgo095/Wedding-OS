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

function runCommand(conn, cmd, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Command timeout')), timeout);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err); }
      let stdout = '', stderr = '';
      stream.on('data', (data) => { stdout += data.toString(); });
      stream.stderr.on('data', (data) => { stderr += data.toString(); });
      stream.on('close', (code) => {
        clearTimeout(timer);
        console.log(`  [exit:${code}] ${stdout.trim().substring(0, 150)}`);
        resolve({ code, stdout, stderr });
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected!');
  try {
    // Check which files already exist on VPS
    console.log('\n🔍 Checking existing files...');
    const check = await runCommand(conn, `ls -la ${DEPLOY_DIR}/src/lib/auth.ts ${DEPLOY_DIR}/src/lib/guest-auth.ts ${DEPLOY_DIR}/src/app/api/guest/auto-auth/route.ts ${DEPLOY_DIR}/src/app/api/guest/invite/route.ts ${DEPLOY_DIR}/src/components/GuestAuthProvider.tsx 2>&1`);
    
    // Upload remaining file
    console.log('\n📦 Uploading GuestAuthProvider.tsx...');
    const localPath = join(process.cwd(), 'src/components/GuestAuthProvider.tsx');
    const content = readFileSync(localPath, 'utf8');
    const b64 = Buffer.from(content).toString('base64');
    await runCommand(conn, `echo '${b64}' | base64 -d > "${DEPLOY_DIR}/src/components/GuestAuthProvider.tsx"`);
    
    // Verify
    console.log('\n✅ Verifying upload...');
    await runCommand(conn, `head -15 ${DEPLOY_DIR}/src/components/GuestAuthProvider.tsx`);
    
    console.log('\n✅ File upload complete!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  conn.end();
});

conn.on('error', (err) => console.error('SSH error:', err.message));
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
