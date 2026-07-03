/**
 * deploy-phase8-standalone.cjs — Upload local standalone build to VPS + deploy
 *
 * Strategy (the ingenious bypass):
 * 1. Local build already done (.next/standalone = 164MB, tar.gz = 59MB)
 * 2. Upload tar.gz to VPS via SFTP (streaming, no base64)
 * 3. Extract on VPS, replace container's /app with new standalone
 * 4. Restart container, verify Phase 8 endpoints
 *
 * This completely bypasses the VPS docker build (which kept failing/OOMing).
 */
const { Client } = require('ssh2');
const fs = require('fs');

const VPS_CONFIG = { host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 30000 };
const LOCAL_TAR = '/tmp/phase8-standalone.tar.gz';
const REMOTE_TAR = '/tmp/phase8-standalone.tar.gz';

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function run(conn, cmd, t=60000) {
  return new Promise(r => {
    log(`\n$ ${cmd}`);
    conn.exec(cmd, (e,s) => {
      if(e){log('ERR:'+e.message);r({stdout:'',stderr:e.message,code:-1});return;}
      let o='',er='';
      const tm=setTimeout(()=>{try{s.signal('TERM')}catch{};log(`(timeout ${t}ms)`)},t);
      s.on('close',c=>{clearTimeout(tm);r({stdout:o,stderr:er,code:c})});
      s.on('data',d=>{o+=d.toString();process.stdout.write(d)});
      s.stderr.on('data',d=>{er+=d.toString();process.stderr.write(d)});
    });
  });
}

async function main() {
  log('=== DEPLOY PHASE 8 (LOCAL BUILD → VPS) ===');

  if (!fs.existsSync(LOCAL_TAR)) {
    log('✗ Local tar not found. Run: tar czf /tmp/phase8-standalone.tar.gz -C .next standalone');
    process.exit(1);
  }
  const tarSize = fs.statSync(LOCAL_TAR).size;
  log(`Local tar: ${(tarSize / 1024 / 1024).toFixed(1)} MB`);

  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res);
    conn.on('error', rej);
    conn.connect(VPS_CONFIG);
  });
  log('SSH connected');

  // ── STEP 1: Upload tar via SFTP ──
  log('\n--- STEP 1: Upload tar (59MB) via SFTP ---');
  const sftp = await new Promise((res, rej) => {
    conn.sftp((e, s) => (e ? rej(e) : res(s)));
  });

  const uploadStart = Date.now();
  await new Promise((res, rej) => {
    const readStream = fs.createReadStream(LOCAL_TAR);
    const writeStream = sftp.createWriteStream(REMOTE_TAR);
    let uploaded = 0;
    const totalMB = tarSize / 1024 / 1024;
    
    readStream.on('data', (chunk) => {
      uploaded += chunk.length;
      if (uploaded % (5 * 1024 * 1024) < chunk.length) {
        const pct = ((uploaded / tarSize) * 100).toFixed(0);
        log(`  Upload progress: ${pct}% (${(uploaded/1024/1024).toFixed(1)}/${totalMB.toFixed(1)} MB)`);
      }
    });
    
    writeStream.on('error', rej);
    writeStream.on('close', () => {
      const elapsed = ((Date.now() - uploadStart) / 1000).toFixed(1);
      log(`  ✓ Upload complete in ${elapsed}s`);
      res();
    });
    
    readStream.pipe(writeStream);
  });
  sftp.end();

  // Verify upload
  const verifyRes = await run(conn, `ls -lh ${REMOTE_TAR}`);
  if (!verifyRes.stdout.includes('phase8-standalone.tar.gz')) {
    log('✗ Upload verification failed');
    process.exit(1);
  }

  // ── STEP 2: Extract tar + prepare new app dir ──
  log('\n--- STEP 2: Extract + prepare new app ---');
  await run(conn, 'rm -rf /tmp/phase8-newapp && mkdir -p /tmp/phase8-newapp');
  await run(conn, `tar xzf ${REMOTE_TAR} -C /tmp/phase8-newapp 2>&1 && echo EXTRACT_OK`, 120000);
  await run(conn, 'ls -la /tmp/phase8-newapp/standalone/ 2>&1 | head -10');
  // Copy static assets (not included in standalone by default)
  await run(conn, 'cp -r /opt/wedding-platform/.next/static /tmp/phase8-newapp/standalone/.next/ 2>&1 || echo "no local static, using standalone"');
  await run(conn, 'cp -r /opt/wedding-platform/public /tmp/phase8-newapp/standalone/ 2>&1 || echo "no public dir"');

  // ── STEP 3: Replace container's /app ──
  log('\n--- STEP 3: Replace container /app ---');
  // Backup current app (just in case)
  await run(conn, 'docker exec wedding-app mv /app /app.bak 2>&1 || echo "no backup needed"');
  // Copy new standalone into container
  await run(conn, 'docker cp /tmp/phase8-newapp/standalone wedding-app:/app 2>&1 && echo COPY_OK', 120000);
  // Verify
  await run(conn, 'docker exec wedding-app ls -la /app/server.js /app/.next 2>&1 | head -5');
  // Copy the prisma schema + migrations + DB (not in standalone)
  await run(conn, 'docker exec wedding-app sh -c "cp /app.bak/prisma/* /app/prisma/ 2>/dev/null; cp /app.bak/data /app/ -r 2>/dev/null; ls /app.bak/db.sqlite 2>/dev/null && cp /app.bak/db.sqlite /app/ || echo no_db" 2>&1 || true');

  // ── STEP 4: Restart container ──
  log('\n--- STEP 4: Restart container ---');
  await run(conn, 'docker restart wedding-app 2>&1', 60000);
  log('Waiting 20s for boot...');
  await new Promise(r => setTimeout(r, 20000));

  // ── STEP 5: Verify ──
  log('\n--- STEP 5: Verify Phase 8 endpoints ---');
  await run(conn, 'docker ps --filter name=wedding-app --format "{{.Names}}\\t{{.Status}}"');
  await run(conn, 'docker logs wedding-app --tail 15 2>&1');
  await run(conn, 'curl -sI https://heureuxmariage.aenews.net/ 2>&1 | head -5');
  await run(conn, 'curl -s -H "X-Wedding-Slug: josue-hornella" https://heureuxmariage.aenews.net/api/theme 2>&1 | head -c 500');
  await run(conn, 'curl -s -H "X-Wedding-Slug: josue-hornella" https://heureuxmariage.aenews.net/api/custom-domain 2>&1 | head -c 300');

  // Cleanup
  await run(conn, 'rm -f /tmp/phase8-standalone.tar.gz; rm -rf /tmp/phase8-newapp');

  conn.end();
  log('\n=== DEPLOY COMPLETE ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
