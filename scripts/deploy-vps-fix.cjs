/**
 * FIX: Re-upload DB + disable init-db.js + rebuild + verify
 *
 * Root cause: init-db.js runs on every container start and overwrites the
 * uploaded DB data. The Phase 3 deploy guard patch failed (string mismatch).
 * Solution: comment out the init-db.js call in docker-entrypoint.sh entirely.
 */
const { Client } = require('ssh2');
const fs = require('fs');
const VPS_CONFIG = { host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 30000 };
const REMOTE_ROOT = '/opt/wedding-platform';

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function run(conn, cmd, t=120000) {
  return new Promise(r => {
    conn.exec(cmd, (e,s) => {
      if(e){r({out:'ERR: '+e.message,code:-1});return;}
      let o=''; const tmr=setTimeout(()=>{try{s.signal('TERM')}catch{};r({out:o+'\n(TIMEOUT)',code:-1})},t);
      s.on('close',c=>{clearTimeout(tmr);r({out:o,code:c})});
      s.on('data',d=>{o+=d.toString(); if(t>120000) process.stdout.write(d);});
      s.stderr.on('data',d=>{o+=d.toString(); if(t>120000) process.stderr.write(d);});
    });
  });
}
function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err) => err ? reject(err) : resolve());
  });
}

async function main() {
  const conn = new Client();
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      log('SSH connected');
      const sftp = await new Promise((res, rej) => conn.sftp((err, s) => err ? rej(err) : res(s)));

      // 1. Stop container
      log('--- Stop container ---');
      await run(conn, `cd ${REMOTE_ROOT} && docker compose stop app 2>&1`, 60000);

      // 2. Re-upload local DB to volume
      log('--- Re-upload local DB ---');
      const localDbPath = '/home/z/my-project/db/custom.db';
      const remoteTmpDb = '/tmp/deploy-custom.db';
      await uploadFile(sftp, localDbPath, remoteTmpDb);
      log(`  Uploaded (${fs.statSync(localDbPath).size} bytes)`);

      const volPath = '/var/lib/docker/volumes/wedding-platform_wedding-db/_data';
      await run(conn, `cp ${remoteTmpDb} ${volPath}/custom.db 2>&1`);
      await run(conn, `chown 1000:1000 ${volPath}/custom.db 2>&1 || true`);
      await run(conn, `chmod 660 ${volPath}/custom.db 2>&1 || true`);

      // Also upload WAL+SHM if they exist
      for (const ext of ['-wal', '-shm']) {
        const localExt = localDbPath + ext;
        if (fs.existsSync(localExt)) {
          await uploadFile(sftp, localExt, remoteTmpDb + ext);
          await run(conn, `cp ${remoteTmpDb + ext} ${volPath}/custom.db${ext} 2>&1 || true`);
          log(`  ✓ Uploaded ${ext}`);
        }
      }

      // Verify file size
      const dbStat = await run(conn, `ls -la ${volPath}/custom.db 2>&1`);
      log(`  Volume DB: ${dbStat.out.trim()}`);

      // 3. Patch docker-entrypoint.sh to skip init-db.js
      log('--- Patch docker-entrypoint.sh ---');
      const entrypointPatch = `cd ${REMOTE_ROOT} && node -e "
const fs = require('fs');
let content = fs.readFileSync('docker-entrypoint.sh', 'utf8');
if (!content.includes('Phase 3 deploy: skip init-db.js')) {
  // Comment out the init-db.js call
  content = content.replace(
    /echo \\"📦 Initializing database...\\".*?node init-db\\.js.*?(?=\\n)/s,
    'echo \\"⏭️  Phase 3 deploy: skip init-db.js (DB is pre-migrated)\\"\\n# su-exec nextjs node init-db.js 2>/dev/null || node init-db.js'
  );
  fs.writeFileSync('docker-entrypoint.sh', content);
  console.log('✓ Patched docker-entrypoint.sh');
} else {
  console.log('⏭️  Already patched');
}
" 2>&1`;
      const patchResult = await run(conn, entrypointPatch);
      log(`  ${patchResult.out.trim()}`);

      // Verify patch
      const entrypointCheck = await run(conn, `grep -A1 "init-db" ${REMOTE_ROOT}/docker-entrypoint.sh 2>&1`);
      log(`  Entrypoint check:\n${entrypointCheck.out}`);

      // 4. Upload patched entrypoint to VPS (in case the node -e patch failed)
      log('--- Upload patched entrypoint directly ---');
      const localEntrypoint = '/home/z/my-project/docker-entrypoint.sh';
      let entrypointContent = fs.readFileSync(localEntrypoint, 'utf8');
      // Apply the patch locally and upload
      if (!entrypointContent.includes('Phase 3 deploy: skip init-db.js')) {
        entrypointContent = entrypointContent.replace(
          /echo "📦 Initializing database..."\n.*?node init-db\.js.*?(?=\n)/s,
          'echo "⏭️  Phase 3 deploy: skip init-db.js (DB is pre-migrated)"\n# su-exec nextjs node init-db.js 2>/dev/null || node init-db.js'
        );
      }
      // Write patched version to /tmp and upload
      const patchedPath = '/tmp/deploy-entrypoint.sh';
      fs.writeFileSync(patchedPath, entrypointContent);
      await uploadFile(sftp, patchedPath, `${REMOTE_ROOT}/docker-entrypoint.sh`);
      await run(conn, `chmod +x ${REMOTE_ROOT}/docker-entrypoint.sh 2>&1`);
      log('  ✓ Uploaded patched entrypoint');

      // Verify
      const verifyPatch = await run(conn, `grep -c "Phase 3 deploy" ${REMOTE_ROOT}/docker-entrypoint.sh 2>&1`);
      log(`  Patch verified: ${verifyPatch.out.trim()} matches`);

      // 5. Rebuild (with cache — should be fast, only entrypoint changed)
      log('--- Rebuild Docker image ---');
      const buildResult = await run(conn, `cd ${REMOTE_ROOT} && docker compose build app 2>&1`, 600000);
      log(`\n  Build exit code: ${buildResult.code}`);
      log(`  Build output (last 300): ${buildResult.out.slice(-300)}`);

      // 6. Start container
      log('--- Start container ---');
      const upResult = await run(conn, `cd ${REMOTE_ROOT} && docker compose up -d app 2>&1`, 60000);
      log(`  ${upResult.out.trim()}`);

      log('  Waiting 25s...');
      await new Promise(r => setTimeout(r, 25000));

      const status = await run(conn, 'docker ps --format "{{.Names}} | {{.Status}}" | grep wedding');
      log(`  Status: ${status.out.trim()}`);

      // 7. Verify everything
      log('--- Verification ---');
      const checks = {
        'HTTP direct': 'curl -s -o /dev/null -w "%{http_code} %{time_total}s" http://127.0.0.1:3080/',
        'HTTP public': 'curl -s -o /dev/null -w "%{http_code} %{time_total}s" https://heureuxmariage.aenews.net/',
        'Platform admin': 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/platform/admin',
        'Onboarding': 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/onboarding',
        'Wedding admin': 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/w/josue-hornella/admin',
      };
      const results = {};
      for (const [name, cmd] of Object.entries(checks)) {
        const r = await run(conn, cmd);
        results[name] = r.out.trim();
        log(`  ${name}: ${r.out.trim()}`);
      }

      // API checks
      const settings = await run(conn, 'curl -s http://127.0.0.1:3080/api/settings 2>&1 | head -c 500');
      log(`  API settings: ${settings.out}`);
      results.apiSettings = settings.out;

      const timeline = await run(conn, `curl -s http://127.0.0.1:3080/api/timeline 2>&1 | python3 -c "import sys,json;d=json.load(sys.stdin);print('events:',len(d.get('events',[])))" 2>&1`);
      log(`  API timeline: ${timeline.out.trim()}`);
      results.apiTimeline = timeline.out.trim();

      // DB counts
      const dbCounts = await run(conn, `docker exec wedding-app sh -c 'cd /app && node -e "const{PrismaClient}=require(\\"@prisma/client\\");const p=new PrismaClient();Promise.all([p.wedding.count(),p.guest.count(),p.table.count(),p.adminUser.count(),p.settings.count(),p.eventTimeline.count()]).then(r=>{console.log(JSON.stringify({weddings:r[0],guests:r[1],tables:r[2],admins:r[3],settings:r[4],timeline:r[5]}));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"' 2>&1`);
      log(`  DB counts: ${dbCounts.out.trim()}`);
      results.dbCounts = dbCounts.out.trim();

      // Container logs
      const logs = await run(conn, 'docker logs wedding-app --tail 20 2>&1');
      log(`  Container logs:\n${logs.out.split('\n').map(l => '    ' + l).join('\n')}`);

      // Cleanup temp files
      await run(conn, `rm -f ${remoteTmpDb} ${remoteTmpDb}-wal ${remoteTmpDb}-shm /tmp/deploy-entrypoint.sh 2>&1`);

      conn.end();

      fs.writeFileSync('/home/z/my-project/deploy-result.json', JSON.stringify(results, null, 2));
      log('✓ Results saved');
      resolve(results);
    });
    conn.on('error', reject);
    conn.connect(VPS_CONFIG);
  });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
