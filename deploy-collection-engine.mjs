// ══════════════════════════════════════════════════════════════════════════════
// deploy-collection-engine.mjs — Phase 1 Collection Engine deploy to VPS
// ══════════════════════════════════════════════════════════════════════════════
// Uploads the Collection Engine bundle (10 files) to the VPS, extracts it
// in /opt/wedding-platform, then triggers a no-cache Docker rebuild so the
// init-db.js runs on next container start (creates Collection tables +
// adds Wedding.collectionId/variantId columns).
// ══════════════════════════════════════════════════════════════════════════════

import { Client } from 'ssh2';
import { readFileSync } from 'fs';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';
const BUNDLE_LOCAL = '/tmp/collection-engine-bundle.tar.gz';
const BUNDLE_REMOTE = '/tmp/collection-engine-bundle.tar.gz';

const conn = new Client();

function runCmd(cmd, timeout = 120000) {
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
      ws.on('error', (e) => { sftp.end(); resolve(`ERR:${e.message}`); });
      ws.end(readFileSync(local));
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ SSH connected to VPS');

  // 1. Upload bundle
  console.log('📤 Uploading Collection Engine bundle (30K, 10 files)...');
  const upRes = await upload(BUNDLE_LOCAL, BUNDLE_REMOTE);
  console.log(`   Upload: ${upRes}`);
  if (upRes !== 'OK') { conn.end(); process.exit(1); }

  // 2. Extract on VPS (preserves paths relative to DEPLOY_DIR)
  console.log('📦 Extracting bundle on VPS...');
  const exRes = await runCmd(`cd ${DEPLOY_DIR} && tar xzf ${BUNDLE_REMOTE} && echo EXTRACT_OK`);
  console.log(`   ${exRes.split('\n').pop()}`);

  // 3. Verify key files landed
  console.log('🔍 Verifying files on VPS...');
  const verify = await runCmd(
    `cd ${DEPLOY_DIR} && ` +
    `ls -la prisma/schema.prisma init-db.js ` +
    `src/lib/collections/index.ts ` +
    `src/components/collections/CollectionLibrary.tsx ` +
    `src/app/api/collections/route.ts ` +
    `src/app/api/collections/apply/route.ts ` +
    `2>&1 | wc -l`
  );
  console.log(`   ${verify} key files present`);

  // 4. Confirm new schema content is there
  const schemaCheck = await runCmd(
    `cd ${DEPLOY_DIR} && grep -c "model Collection" prisma/schema.prisma && ` +
    `grep -c "collectionId" init-db.js`
  );
  console.log(`   Schema 'model Collection' hits: ${schemaCheck.split('\n')[0]}`);
  console.log(`   init-db 'collectionId' hits: ${schemaCheck.split('\n')[1]}`);

  // 5. Kick off no-cache Docker rebuild in background
  console.log('\n🔨 Triggering no-cache Docker rebuild (background, ~3-5 min)...');
  await runCmd(
    `cd ${DEPLOY_DIR} && nohup bash -c ` +
    `'"docker compose -f docker-compose.prod.yml build --no-cache app 2>&1 && ` +
    `docker compose -f docker-compose.prod.yml up -d 2>&1 && ` +
    `echo "DEPLOY_SUCCESS $(date)" > /tmp/deploy-status.txt' ` +
    `> /tmp/deploy-collection-engine.log 2>&1 &'`
  );
  console.log('   ✅ Rebuild started in background');
  console.log('   Monitor: /tmp/deploy-status.txt and /tmp/deploy-collection-engine.log on VPS');

  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); process.exit(1); });
console.log('Connecting to VPS...');
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
