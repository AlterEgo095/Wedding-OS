// ══════════════════════════════════════════════════════════════════════════════
// deploy-phase2-modules.mjs — Phase 2 Module Slots deploy to VPS
// ══════════════════════════════════════════════════════════════════════════════
// Uploads the full src/ + prisma/ + init-db.js + package.json bundle to the VPS,
// extracts it in /opt/wedding-platform, then triggers a no-cache Docker rebuild.
// On next container start, init-db.js creates the CollectionModule table + index.
// ensureCollectionsSeeded() then backfills the 34 module slots for each of the
// 12 existing Collections (12 × 34 = 408 module rows).
// ══════════════════════════════════════════════════════════════════════════════

import { Client } from 'ssh2';
import { createReadStream } from 'fs';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';
const BUNDLE_LOCAL = '/tmp/phase2-sync.tar.gz';
const BUNDLE_REMOTE = '/tmp/phase2-sync.tar.gz';

const conn = new Client();

function runCmd(cmd, timeout = 300000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve('TIMEOUT'), timeout);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(t); resolve(`ERR:${err.message}`); return; }
      let out = '';
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => { out += d.toString(); });
      stream.on('close', () => { clearTimeout(t); resolve(out.trim()); });
    });
  });
}

function upload(local, remote) {
  return new Promise((resolve) => {
    conn.sftp((err, sftp) => {
      if (err) { resolve(`SFTP_ERR:${err.message}`); return; }
      const ws = sftp.createWriteStream(remote);
      ws.on('close', () => { sftp.end(); resolve('OK'); });
      ws.on('error', (e) => { resolve(`UPLOAD_ERR:${e.message}`); });
      const rs = createReadStream(local);
      rs.on('error', (e) => { resolve(`READ_ERR:${e.message}`); });
      rs.pipe(ws);
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected to VPS');

  // 1. Upload bundle
  console.log('1. Uploading phase2-sync.tar.gz (350K)...');
  const upRes = await upload(BUNDLE_LOCAL, BUNDLE_REMOTE);
  console.log(`   ${upRes}`);
  if (upRes !== 'OK') { conn.end(); process.exit(1); }

  // 2. Extract to deploy dir
  console.log('2. Extracting to /opt/wedding-platform...');
  const ex = await runCmd(`cd ${DEPLOY_DIR} && tar -xzf ${BUNDLE_REMOTE} && echo EXTRACT_OK`);
  console.log(`   ${ex.includes('EXTRACT_OK') ? 'OK' : 'FAIL'}`);

  // 3. Verify key Phase 2 files landed
  console.log('3. Verifying Phase 2 files...');
  const verify = await runCmd(
    `cd ${DEPLOY_DIR} && ` +
    `grep -c "CollectionModule" prisma/schema.prisma && ` +
    `grep -c "MODULE_SLOTS" src/lib/collections/index.ts && ` +
    `grep -c "CollectionModule" init-db.js && ` +
    `ls src/components/collections/CollectionModulesManager.tsx && ` +
    `ls "src/app/api/collections/[id]/modules/route.ts" && ` +
    `ls "src/app/api/collections/[id]/completeness/route.ts" && ` +
    `echo VERIFY_OK`
  );
  console.log(`   ${verify.includes('VERIFY_OK') ? 'OK' : 'FAIL'}`);
  console.log(`   ${verify.split('\n').slice(0, 6).join(' | ')}`);

  // 4. Write rebuild script (avoids quoting issues)
  console.log('4. Writing rebuild script...');
  const rebuildScript = `#!/bin/bash
cd ${DEPLOY_DIR}
echo "[$(date)] Starting no-cache rebuild for Phase 2" > /tmp/phase2-deploy.log
docker compose build --no-cache >> /tmp/phase2-deploy.log 2>&1
echo "[$(date)] Build done, starting container..." >> /tmp/phase2-deploy.log
docker compose up -d >> /tmp/phase2-deploy.log 2>&1
echo "[$(date)] DEPLOY_SUCCESS" >> /tmp/phase2-deploy.log
`;
  await runCmd(`cat > /tmp/rebuild-phase2.sh << 'SCRIPT_EOF'\n${rebuildScript}\nSCRIPT_EOF`);
  await runCmd('chmod +x /tmp/rebuild-phase2.sh');

  // 5. Trigger rebuild (async — don't wait for the full build)
  console.log('5. Triggering no-cache Docker rebuild (async)...');
  const trigger = await runCmd('nohup /tmp/rebuild-phase2.sh > /dev/null 2>&1 & echo TRIGGERED', 10000);
  console.log(`   ${trigger.includes('TRIGGERED') ? 'OK — rebuild running in background' : trigger}`);

  console.log('\n📋 Monitor: ssh aenews@VPS "tail -f /tmp/phase2-deploy.log"');
  console.log('⏱️  Build takes ~3-4 minutes. Check /tmp/phase2-deploy.log for DEPLOY_SUCCESS.');

  conn.end();
});

conn.on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); });
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS });
