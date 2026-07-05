/**
 * deploy-phases1-7-vps.cjs — Deploy all multi-tenant phases (1-7) to production VPS
 *
 * Task ID: 8-DEPLOY
 *
 * This is the FIRST production deployment of the multi-tenant transformation.
 * Previously, phases 1-7 were developed + verified locally only.
 *
 * STRATEGY:
 *   1. Backup production DB (volume snapshot)
 *   2. Create tarball of local code (excluding node_modules, .next, db, uploads, .env, etc.)
 *   3. Upload tarball to VPS + extract to /opt/wedding-platform/ (overwrites old code, preserves .env)
 *   4. Rebuild Docker image (docker compose build app) — 8 min timeout
 *   5. Restart container (docker compose up -d --no-deps app)
 *   6. Run prisma db push inside container (creates new tables + weddingId columns)
 *   7. docker cp migrate-prod.js into container + run it (backfills weddingId + default wedding)
 *   8. Verify production health (curl checks + DB state)
 *
 * VPS: 95.111.226.63, user: aenews, container: wedding-app, port 3080
 * Path on VPS: /opt/wedding-platform/
 * Production URL: https://heureuxmariage.aenews.net
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VPS_CONFIG = {
  host: '95.111.226.63',
  port: 22,
  username: 'aenews',
  password: 'AeNews2025Secure!',
  readyTimeout: 30000,
};

const PROJECT_ROOT = '/home/z/my-project';
const VPS_PATH = '/opt/wedding-platform';
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const TARBALL_NAME = `wedding-platform-phases1-7-${TIMESTAMP}.tar.gz`;
const TARBALL_LOCAL = path.join(PROJECT_ROOT, TARBALL_NAME);
const TARBALL_REMOTE = `/tmp/${TARBALL_NAME}`;

// Directories/files to EXCLUDE from the tarball (preserved on VPS or not needed)
const EXCLUDES = [
  'node_modules',
  '.next',
  'db',
  'public/uploads',
  'backups',
  'screenshots',
  'backup-frontend',
  'dev.log',
  'worklog.md',
  'tool-results',
  '.env',
  '.env.local',
  '.env.production',
  '.env.deploy',
  'custom.db*',
  '*.tar.gz',
  'scripts/deploy-vps-*.cjs',
  'scripts/vps-*.cjs',
  'scripts/migrate-prod.js', // uploaded separately
  'docs',
  'examples',
  'home',
  'download',
  '*.png',
  '*.jpeg',
  '*.jpg',
  '*.mp3',
  '*.mp4',
  '*.webm',
  'build.log',
  'dev.log*',
  '.git',
];

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function run(conn, cmd, timeoutMs = 60000, opts = {}) {
  return new Promise((resolve) => {
    log(`\n$ ${cmd}`);
    conn.exec(cmd, opts, (err, stream) => {
      if (err) { log(`ERR: ${err.message}`); return resolve({ stdout: '', stderr: err.message, code: -1 }); }
      let stdout = '', stderr = '';
      const timer = setTimeout(() => {
        try { stream.signal('TERM'); } catch {}
        log(`  (timeout ${timeoutMs}ms — terminating)`);
      }, timeoutMs);
      stream.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code });
      });
      stream.on('data', (d) => { stdout += d.toString(); process.stdout.write(d); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); process.stderr.write(d); });
    });
  });
}

function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(localPath).size;
    log(`  Uploading ${path.relative(PROJECT_ROOT, localPath)} → ${remotePath} (${(size/1024/1024).toFixed(2)} MB)`);
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) return reject(err);
      log('  ✓ Uploaded');
      resolve();
    });
  });
}

async function main() {
  log('═══════════════════════════════════════════════════════════════');
  log('  DEPLOY PHASES 1-7 TO PRODUCTION VPS');
  log('  Target: https://heureuxmariage.aenews.net');
  log(`  Timestamp: ${TIMESTAMP}`);
  log('═══════════════════════════════════════════════════════════════\n');

  // === STEP 0: Create local tarball ===
  log('[STEP 0] Creating local tarball of code...');
  const excludeArgs = EXCLUDES.map(e => `--exclude='${e}'`).join(' ');
  // tar exits with code 1 (warning) when files change during read (dev.log etc.) — that's OK
  // tar exits with code 2 on real errors. We accept 0 or 1.
  const tarCmd = `tar czf ${TARBALL_LOCAL} ${excludeArgs} -C ${PROJECT_ROOT} . || [ $? -eq 1 ]`;
  log(`  $ ${tarCmd}`);
  try {
    execSync(tarCmd, { stdio: 'inherit' });
  } catch (e) {
    log(`✗ Tarball creation failed: ${e.message}`);
    process.exit(1);
  }
  if (!fs.existsSync(TARBALL_LOCAL)) {
    log('✗ Tarball was not created');
    process.exit(1);
  }
  const tarSize = fs.statSync(TARBALL_LOCAL).size;
  log(`  ✓ Tarball created: ${TARBALL_NAME} (${(tarSize/1024/1024).toFixed(2)} MB)`);

  // Also prepare the migration script for separate upload
  const migrateScriptLocal = path.join(PROJECT_ROOT, 'scripts', 'migrate-prod.js');
  if (!fs.existsSync(migrateScriptLocal)) {
    log(`✗ Migration script not found: ${migrateScriptLocal}`);
    process.exit(1);
  }

  // === Connect to VPS ===
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', () => { log('\n✓ SSH connected to VPS'); resolve(); });
    conn.on('error', reject);
    conn.connect(VPS_CONFIG);
  });

  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => err ? reject(err) : resolve(sftp));
  });

  try {
    // === STEP 1: Pre-deploy VPS state snapshot ===
    log('\n[STEP 1] Pre-deploy VPS state snapshot...');
    await run(conn, 'docker ps --filter name=wedding-app --format "{{.Names}}\\t{{.Status}}\\t{{.Image}}"');
    await run(conn, `ls -la ${VPS_PATH}/ | head -20`);
    await run(conn, 'docker exec wedding-app sh -c "ls -la /app/db/custom.db"');

    // === STEP 2: Backup production DB ===
    log('\n[STEP 2] Backing up production DB...');
    const backupCmd = `docker exec wedding-app sh -c 'cp /app/db/custom.db /app/db/custom.db.pre-phase8-${TIMESTAMP} && ls -lah /app/db/custom.db*'`;
    await run(conn, backupCmd);

    // Also backup the code directory's key config files
    log('\n[STEP 2b] Backing up VPS .env + prisma schema...');
    await run(conn, `cp ${VPS_PATH}/.env ${VPS_PATH}/.env.pre-phase8-${TIMESTAMP} 2>/dev/null || echo "(no .env to backup)"`);
    await run(conn, `cp ${VPS_PATH}/prisma/schema.prisma ${VPS_PATH}/prisma/schema.prisma.pre-phase8-${TIMESTAMP} 2>/dev/null || echo "(no schema to backup)"`);

    // === STEP 3: Upload tarball + migration script ===
    log('\n[STEP 3] Uploading tarball + migration script...');
    await uploadFile(sftp, TARBALL_LOCAL, TARBALL_REMOTE);
    const migrateRemote = `/tmp/migrate-prod-${TIMESTAMP}.js`;
    await uploadFile(sftp, migrateScriptLocal, migrateRemote);
    sftp.end();

    // === STEP 4: Extract tarball over VPS code (preserves .env, db volume, uploads volume) ===
    log('\n[STEP 4] Extracting tarball over VPS code...');
    // Extract to a temp dir first, then rsync into place (safer than extracting directly over running code)
    const extractDir = `/tmp/wedding-platform-new-${TIMESTAMP}`;
    await run(conn, `mkdir -p ${extractDir}`);
    await run(conn, `tar xzf ${TARBALL_REMOTE} -C ${extractDir}`);
    await run(conn, `ls -la ${extractDir}/ | head -20`);

    // Preserve the .env from the existing deployment (critical — has production secrets)
    log('\n[STEP 4b] Preserving .env from existing deployment...');
    await run(conn, `cp ${VPS_PATH}/.env ${extractDir}/.env`);

    // Also preserve any nginx config (not in our tarball)
    if (await run(conn, `test -d ${VPS_PATH}/nginx && echo exists || echo missing`).then(r => r.stdout.trim()) === 'exists') {
      log('\n[STEP 4c] Preserving nginx config...');
      await run(conn, `cp -r ${VPS_PATH}/nginx ${extractDir}/nginx 2>/dev/null || echo "(nginx preserved)"`);
    }

    // Swap: move old code to backup, move new code into place
    log('\n[STEP 4d] Swapping code directories...');
    const backupDir = `${VPS_PATH}-backup-${TIMESTAMP}`;
    await run(conn, `mv ${VPS_PATH} ${backupDir}`);
    await run(conn, `mv ${extractDir} ${VPS_PATH}`);
    await run(conn, `ls -la ${VPS_PATH}/ | head -20`);
    await run(conn, `cat ${VPS_PATH}/.env | grep -v -i -E "PASSWORD|SECRET|KEY|TOKEN" | head -10`);

    // Clean up tarball
    await run(conn, `rm -f ${TARBALL_REMOTE}`);

    // === STEP 5: Rebuild Docker image ===
    log('\n[STEP 5] Rebuilding Docker image (this may take 6-8 minutes)...');
    log('  NOTE: VPS CPU is limited. Build timeout is 9 minutes.');
    const buildCmd = `cd ${VPS_PATH} && docker compose build app 2>&1 | tail -40`;
    const buildRes = await run(conn, buildCmd, 540000); // 9 min timeout
    log(`\nBuild exit code: ${buildRes.code}`);
    if (buildRes.code !== 0) {
      log('✗ Build FAILED. Rolling back code directory...');
      await run(conn, `rm -rf ${VPS_PATH}`);
      await run(conn, `mv ${backupDir} ${VPS_PATH}`);
      log('✗ Code rolled back. Aborting deploy.');
      process.exit(1);
    }

    // === STEP 6: Restart container with new image ===
    log('\n[STEP 6] Restarting container with new image...');
    const restartRes = await run(conn, `cd ${VPS_PATH} && docker compose up -d --no-deps app 2>&1`, 60000);
    log(`\nRestart exit code: ${restartRes.code}`);

    log('\n[STEP 6b] Waiting 15s for app to boot...');
    await new Promise(r => setTimeout(r, 15000));

    log('\n[STEP 6c] Container status:');
    await run(conn, 'docker ps --filter name=wedding-app --format "{{.Names}}\\t{{.Status}}\\t{{.Image}}"');

    log('\n[STEP 6d] App logs (last 40 lines):');
    await run(conn, `cd ${VPS_PATH} && docker compose logs app --tail 40 2>&1`);

    // === STEP 7: Run prisma db push (creates new tables + weddingId columns) ===
    log('\n[STEP 7] Running prisma db push inside container...');
    const pushRes = await run(conn, 'docker exec wedding-app npx prisma db push --schema=/app/prisma/schema.prisma --accept-data-loss 2>&1', 120000);
    log(`\nPrisma db push exit code: ${pushRes.code}`);
    if (pushRes.code !== 0) {
      log('⚠️  prisma db push failed — check output above. Container is still running with new code but DB schema may be incomplete.');
    }

    // === STEP 8: Copy migration script into container + run it ===
    log('\n[STEP 8] Running migration script inside container...');
    await run(conn, `docker cp /tmp/migrate-prod-${TIMESTAMP}.js wedding-app:/app/migrate-prod.js`);
    const migrateRes = await run(conn, 'docker exec wedding-app node /app/migrate-prod.js 2>&1', 120000);
    log(`\nMigration exit code: ${migrateRes.code}`);

    // === STEP 9: Restart container to pick up clean state ===
    log('\n[STEP 9] Restarting container for clean state...');
    await run(conn, `cd ${VPS_PATH} && docker compose restart app 2>&1`, 30000);
    await new Promise(r => setTimeout(r, 10000));
    await run(conn, 'docker ps --filter name=wedding-app --format "{{.Names}}\\t{{.Status}}"');

    // === STEP 10: Verify production ===
    log('\n[STEP 10] Verifying production...');
    log('\n[V1] HTTP status of /:');
    await run(conn, 'curl -sI https://heureuxmariage.aenews.net/ 2>&1 | head -5');

    log('\n[V2] /api/settings (should show Josué & Hornella):');
    await run(conn, 'curl -s https://heureuxmariage.aenews.net/api/settings 2>&1 | head -200');

    log('\n[V3] /platform/login page:');
    await run(conn, 'curl -sI https://heureuxmariage.aenews.net/platform/login 2>&1 | head -5');

    log('\n[V4] DB state — weddings + users + guests counts:');
    const dbVerify = `docker exec wedding-app sh -c 'node -e "
      const { PrismaClient } = require(\\"@prisma/client\\");
      const p = new PrismaClient();
      (async () => {
        try {
          const wc = await p.wedding.count();
          const w = await p.wedding.findMany({ select: { slug: true, coupleLabel: true, status: true, plan: true, isDefault: true } });
          console.log(\\"Weddings:\\", wc, JSON.stringify(w));
          const uc = await p.adminUser.count();
          const ur = await p.adminUser.groupBy({ by: [\\"role\\"], _count: true });
          console.log(\\"Users:\\", uc, JSON.stringify(ur));
          const gc = await p.guest.count();
          const gw = await p.guest.count({ where: { weddingId: { not: null } } });
          console.log(\\"Guests:\\", gc, \\"with weddingId:\\", gw);
          const sc = await p.subscription.count();
          console.log(\\"Subscriptions:\\", sc);
          const tc = await p.theme.count();
          console.log(\\"Themes:\\", tc);
          const lc = await p.lead.count();
          console.log(\\"Leads:\\", lc);
          const t = await p.\\$queryRawUnsafe(\\"SELECT name FROM sqlite_master WHERE type=\\\\\\"table\\\\\\" ORDER BY name\\");
          console.log(\\"Tables:\\", t.map(x => x.name).join(\\", \\"));
        } catch (e) { console.error(\\"ERR:\\", e.message); }
        finally { await p.\\$disconnect(); }
      })();
    "' 2>&1`;
    await run(conn, dbVerify, 30000);

    log('\n[V5] App logs (last 20 lines post-restart):');
    await run(conn, `cd ${VPS_PATH} && docker compose logs app --tail 20 2>&1`);

    // === Cleanup old backup dir (keep latest 1) ===
    log('\n[STEP 11] Cleanup old backups (keeping only the latest)...');
    await run(conn, `ls -d ${VPS_PATH}-backup-* 2>/dev/null | head -n -1 | xargs rm -rf 2>/dev/null || echo "(no old backups to clean)"`);

    // Clean up local tarball
    try { fs.unlinkSync(TARBALL_LOCAL); } catch {}

    log('\n═══════════════════════════════════════════════════════════════');
    log('  DEPLOY COMPLETE — verify production manually:');
    log('  https://heureuxmariage.aenews.net');
    log('  https://heureuxmariage.aenews.net/platform/login');
    log('  https://heureuxmariage.aenews.net/w/josue-hornella');
    log('═══════════════════════════════════════════════════════════════');
    log(`\nRollback instructions (if needed):`);
    log(`  ssh aenews@95.111.226.63`);
    log(`  cd /opt && mv wedding-platform wedding-platform-failed-${TIMESTAMP}`);
    log(`  mv ${VPS_PATH}-backup-${TIMESTAMP} wedding-platform`);
    log(`  cd wedding-platform && docker compose up -d --no-deps app`);
    log(`  # Restore DB: docker exec wedding-app cp /app/db/custom.db.pre-phase8-${TIMESTAMP} /app/db/custom.db`);

  } catch (err) {
    log(`✗ DEPLOY FAILED: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    conn.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
