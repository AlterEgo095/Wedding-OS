import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join } from 'path';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';

const FILES_TO_UPLOAD = [
  'src/components/GuestPersonalSpace.tsx',
];

const conn = new Client();

function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '', err2 = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => err2 += d);
      stream.on('close', () => resolve({ out, err: err2 }));
    });
  });
}

async function uploadB64(localPath, remotePath) {
  const content = readFileSync(localPath, 'utf8');
  const b64 = Buffer.from(content).toString('base64');
  const dir = remotePath.substring(0, remotePath.lastIndexOf('/'));
  await runCmd(`mkdir -p "${dir}"`);
  
  if (b64.length <= 55000) {
    await runCmd(`echo '${b64}' | base64 -d > "${remotePath}"`);
  } else {
    await runCmd(`printf '' > "${remotePath}"`);
    for (let i = 0; i < b64.length; i += 55000) {
      const chunk = b64.substring(i, i + 55000);
      await runCmd(`echo '${chunk}' | base64 -d >> "${remotePath}"`);
    }
  }
}

conn.on('ready', async () => {
  console.log('✅ Connected!');
  const t0 = Date.now();
  
  try {
    // Phase 1: Upload files
    console.log('\n📤 Uploading premium invitation files...');
    for (const file of FILES_TO_UPLOAD) {
      const localPath = join(process.cwd(), file);
      const remotePath = `${DEPLOY_DIR}/${file}`;
      await uploadB64(localPath, remotePath);
      console.log(`  ✅ ${file}`);
    }

    // Verify
    const c1 = await runCmd(`grep -c "Placement" ${DEPLOY_DIR}/src/components/GuestPersonalSpace.tsx`);
    console.log(`  "Placement" refs: ${c1.out.trim()}`);
    const c2 = await runCmd(`grep -c "QR Code" ${DEPLOY_DIR}/src/components/GuestPersonalSpace.tsx`);
    console.log(`  "QR Code" refs: ${c2.out.trim()}`);
    const c3 = await runCmd(`grep -c "scale: 3" ${DEPLOY_DIR}/src/components/GuestPersonalSpace.tsx`);
    console.log(`  "scale: 3" refs (HD download): ${c3.out.trim()}`);

    // Phase 2: Start Docker rebuild in background
    console.log('\n🔨 Starting Docker rebuild in background...');
    await runCmd(`cd ${DEPLOY_DIR} && rm -f /tmp/wedding-rebuild.status && nohup bash -c 'docker compose -f docker-compose.prod.yml build --no-cache app >> /tmp/wedding-rebuild.log 2>&1 && docker compose -f docker-compose.prod.yml up -d >> /tmp/wedding-rebuild.log 2>&1 && echo "DONE $(date)" > /tmp/wedding-rebuild.status' > /dev/null 2>&1 &`);
    console.log('  ✅ Rebuild started in background');

    console.log(`\n✅ Files uploaded in ${((Date.now()-t0)/1000).toFixed(1)}s`);
    console.log('\n📋 Check rebuild status: node vps-cmd.mjs "cat /tmp/wedding-rebuild.status 2>/dev/null || echo Still building..."');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  conn.end();
});

conn.on('error', (err) => console.error('❌ SSH error:', err.message));

console.log('Connecting...');
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
