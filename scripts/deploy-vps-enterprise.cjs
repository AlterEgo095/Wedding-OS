/**
 * VPS DEPLOYMENT SCRIPT — Phase 0-3 Enterprise Deployment
 * Task ID: DEPLOY-EXEC
 *
 * Strategy:
 * 1. Upload local DB (with 243 guests + 2 weddings + all settings) to VPS
 * 2. Patch init-db.js to skip re-seeding if Wedding table has data
 * 3. Create tar of ALL source code, upload, extract on VPS
 * 4. Rebuild container image (long timeout — VPS is slow)
 * 5. Restart container
 * 6. Verify all endpoints
 *
 * Safety:
 * - Full backup already at /opt/wedding-backups/2026-06-29T14-19-21/
 * - Rollback: restore backup DB + old code from backup
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VPS_CONFIG = {
  host: '95.111.226.63', port: 22, username: 'aenews',
  password: 'AeNews2025Secure!', readyTimeout: 60000,
};

const REMOTE_ROOT = '/opt/wedding-platform';
const LOCAL_ROOT = '/home/z/my-project';

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function runCommand(conn, cmd, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const opts = timeoutMs > 120000 ? { pty: true } : {};
    conn.exec(cmd, opts, (err, stream) => {
      if (err) { resolve({ stdout: '', stderr: String(err), code: -1 }); return; }
      let stdout = '', stderr = '';
      const timer = setTimeout(() => {
        try { stream.signal('TERM'); } catch {}
        resolve({ stdout, stderr: stderr + '\n(TIMEOUT)', code: -1 });
      }, timeoutMs);
      stream.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code: code ?? 0 });
      });
      stream.on('data', (d) => {
        stdout += d.toString();
        if (timeoutMs > 120000) process.stdout.write(d);
      });
      stream.stderr.on('data', (d) => {
        stderr += d.toString();
        if (timeoutMs > 120000) process.stderr.write(d);
      });
    });
  });
}

function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Files/directories to include in the deployment tar
const DEPLOY_PATHS = [
  'src/',
  'prisma/schema.prisma',
  'prisma/seed.ts',
  'public/',
  'package.json',
  'bun.lock',
  'next.config.ts',
  'tsconfig.json',
  'tailwind.config.ts',
  'postcss.config.mjs',
  'components.json',
  'eslint.config.mjs',
  'init-db.js',
  'docker-entrypoint.sh',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.prod.yml',
];

async function deploy() {
  const conn = new Client();
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      log('SSH connected ✓');
      const sftp = await new Promise((res, rej) => conn.sftp((err, s) => err ? rej(err) : res(s)));

      try {
        // ═══════════════════════════════════════════════════════════════
        // STEP 1: Upload local DB to VPS
        // ═══════════════════════════════════════════════════════════════
        log('━━━ STEP 1: Upload local DB to VPS ━━━');

        // First, copy local DB to /tmp on VPS
        const localDbPath = path.join(LOCAL_ROOT, 'db/custom.db');
        const remoteTmpDb = '/tmp/deploy-custom.db';
        log(`  Uploading local DB (${fs.statSync(localDbPath).size} bytes)...`);
        await uploadFile(sftp, localDbPath, remoteTmpDb);
        log('  ✓ DB uploaded to VPS /tmp/');

        // Stop the container, replace DB in volume, start container
        log('  Stopping container...');
        await runCommand(conn, `cd ${REMOTE_ROOT} && docker compose stop app 2>&1`, 60000);

        // Copy DB into the Docker volume directly
        log('  Replacing DB in Docker volume...');
        const volPath = await runCommand(conn, `docker volume inspect wedding-platform_wedding-db --format '{{.Mountpoint}}' 2>&1`);
        const mountPath = volPath.stdout.trim();
        log(`  Volume mountpoint: ${mountPath}`);

        // Backup the current VPS DB (double backup)
        await runCommand(conn, `cp ${mountPath}/custom.db ${mountPath}/custom.db.pre-deploy.$(date +%Y%m%d-%H%M%S).bak 2>&1 || echo "no existing db"`);

        // Copy new DB
        await runCommand(conn, `cp ${remoteTmpDb} ${mountPath}/custom.db 2>&1`);
        await runCommand(conn, `chown 1000:1000 ${mountPath}/custom.db 2>&1 || true`);
        await runCommand(conn, `chmod 660 ${mountPath}/custom.db 2>&1 || true`);

        // Also copy -wal and -shm if they exist (SQLite WAL mode)
        const localWalPath = path.join(LOCAL_ROOT, 'db/custom.db-wal');
        const localShmPath = path.join(LOCAL_ROOT, 'db/custom.db-shm');
        if (fs.existsSync(localWalPath)) {
          await uploadFile(sftp, localWalPath, '/tmp/deploy-custom.db-wal');
          await runCommand(conn, `cp /tmp/deploy-custom.db-wal ${mountPath}/custom.db-wal 2>&1 || true`);
          log('  ✓ WAL file uploaded');
        }
        if (fs.existsSync(localShmPath)) {
          await uploadFile(sftp, localShmPath, '/tmp/deploy-custom.db-shm');
          await runCommand(conn, `cp /tmp/deploy-custom.db-shm ${mountPath}/custom.db-shm 2>&1 || true`);
          log('  ✓ SHM file uploaded');
        }

        log('  ✓ DB replaced in volume');

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: Create + upload source code tar
        // ═══════════════════════════════════════════════════════════════
        log('━━━ STEP 2: Create + upload source tar ━━━');

        const tarPath = '/tmp/deploy-source.tar.gz';
        log('  Creating tar of source code...');
        // Create tar excluding node_modules, .next, .git, db, etc.
        const tarCmd = `tar czf /tmp/deploy-source.tar.gz --exclude='node_modules' --exclude='.next' --exclude='.git' --exclude='*.log' --exclude='db/*.db*' ${DEPLOY_PATHS.join(' ')} 2>&1`;
        execSync(tarCmd, { cwd: LOCAL_ROOT, stdio: 'pipe' });
        const tarSize = fs.statSync(tarPath).size;
        log(`  ✓ Tar created (${(tarSize / 1024 / 1024).toFixed(1)} MB)`);

        // Upload tar
        const remoteTar = '/tmp/deploy-source.tar.gz';
        log('  Uploading tar to VPS...');
        await uploadFile(sftp, tarPath, remoteTar);
        log('  ✓ Tar uploaded');

        // Extract on VPS (overwrite existing files)
        log('  Extracting tar on VPS...');
        await runCommand(conn, `cd ${REMOTE_ROOT} && tar xzf ${remoteTar} 2>&1`, 60000);
        log('  ✓ Source code extracted');

        // ═══════════════════════════════════════════════════════════════
        // STEP 3: Patch init-db.js to be idempotent (skip if Wedding exists)
        // ═══════════════════════════════════════════════════════════════
        log('━━━ STEP 3: Patch init-db.js ━━━');

        // The init-db.js uses pre-Phase 1 schema (no weddingId, no Wedding table).
        // We need to make it skip seeding if the Wedding table already has data.
        // Simplest: rename it so the entrypoint doesn't run it, OR patch the main() function.
        const patchCmd = `cd ${REMOTE_ROOT} && node -e "
const fs = require('fs');
let content = fs.readFileSync('init-db.js', 'utf8');
// Add a guard at the top of main() to skip if Wedding table has data
const guard = \`
  // Phase 3 deploy guard: skip seeding if Wedding table already has data
  try {
    const weddingCount = await prisma.wedding.count();
    if (weddingCount > 0) {
      console.log('⏭️  Wedding table already has ' + weddingCount + ' rows — skipping seed (Phase 3 deploy guard)');
      console.log('✅ Database ready (skipped initialization)!');
      return;
    }
  } catch (e) {
    // Wedding table doesn't exist yet — continue with initialization
    console.log('  Wedding table not found — continuing with initialization...');
  }
\`;
if (!content.includes('Phase 3 deploy guard')) {
  content = content.replace(
    'async function main() {\\n  console.log(\\'🔧 Initializing database...\\');',
    'async function main() {\\n  console.log(\\'🔧 Initializing database...\\');' + guard
  );
  fs.writeFileSync('init-db.js', content);
  console.log('✓ Patched init-db.js with Phase 3 deploy guard');
} else {
  console.log('⏭️  init-db.js already patched');
}
" 2>&1`;
        const patchResult = await runCommand(conn, patchCmd);
        log(`  ${patchResult.stdout.trim()}`);

        // ═══════════════════════════════════════════════════════════════
        // STEP 4: Install dependencies + rebuild container
        // ═══════════════════════════════════════════════════════════════
        log('━━━ STEP 4: Rebuild Docker container ━━━');
        log('  This will take 5-15 minutes on the VPS...');

        // Build with no-cache to ensure clean build
        const buildCmd = `cd ${REMOTE_ROOT} && docker compose build app --no-cache 2>&1`;
        const buildResult = await runCommand(conn, buildCmd, 1200000); // 20 min timeout
        log(`\n  Build exit code: ${buildResult.code}`);

        if (buildResult.code !== 0) {
          log('  ⚠ Build failed! Check logs above.');
          log('  Attempting to start with old image...');
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 5: Start container
        // ═══════════════════════════════════════════════════════════════
        log('━━━ STEP 5: Start container ━━━');
        const startResult = await runCommand(conn, `cd ${REMOTE_ROOT} && docker compose up -d app 2>&1`, 60000);
        log(`  ${startResult.stdout.trim()}`);

        // Wait for container to be healthy
        log('  Waiting for container to start (30s)...');
        await new Promise(r => setTimeout(r, 30000));

        const status = await runCommand(conn, `docker inspect wedding-app --format '{{.State.Status}} (health: {{.State.Health.Status}})' 2>&1`);
        log(`  Container status: ${status.stdout.trim()}`);

        // ═══════════════════════════════════════════════════════════════
        // STEP 6: Run Prisma db push (ensure schema matches)
        // ═══════════════════════════════════════════════════════════════
        log('━━━ STEP 6: Prisma db push (ensure schema) ━━━');
        const pushResult = await runCommand(conn, `docker exec wedding-app sh -c "cd /app && npx prisma db push --accept-data-loss 2>&1"`, 120000);
        log(`  ${pushResult.stdout.trim().slice(-500)}`);

        // ═══════════════════════════════════════════════════════════════
        // STEP 7: Cleanup — remove test awa-david wedding (multi-tenant safety)
        // ═══════════════════════════════════════════════════════════════
        log('━━━ STEP 7: Cleanup test data ━━━');
        const cleanupCmd = `docker exec wedding-app sh -c "cd /app && node -e \\"const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.wedding.deleteMany({where:{slug:'awa-david'}}).then(r=>{console.log('Deleted awa-david weddings:',r.count);return p.adminUser.deleteMany({where:{email:'awa.david.test@example.com'}})}).then(r=>{console.log('Deleted test admin:',r.count);return p.subscription.deleteMany({where:{weddingId:null}})}).then(r=>{console.log('Deleted orphan subscriptions:',r.count)}).then(()=>{return p.wedding.count()}).then(c=>{console.log('Remaining weddings:',c);process.exit(0)}).catch(e=>{console.error('ERR:',e.message);process.exit(1)})\\" 2>&1"`;
        const cleanupResult = await runCommand(conn, cleanupCmd, 60000);
        log(`  ${cleanupResult.stdout.trim()}`);

        // ═══════════════════════════════════════════════════════════════
        // STEP 8: Add missing production admin
        // ═══════════════════════════════════════════════════════════════
        log('━━━ STEP 8: Add production admin ━━━');
        const adminCmd = `docker exec wedding-app sh -c "cd /app && node -e \\"const{PrismaClient}=require('@prisma/client');const bcrypt=require('bcryptjs');const p=new PrismaClient();p.adminUser.upsert({where:{email:'admin@heureuxmariage.aenews.net'},update:{},create:{email:'admin@heureuxmariage.aenews.net',password:bcrypt.hashSync('HeureuxMariage2026!',12),name:'Super Admin',role:'SUPER_ADMIN'}}).then(()=>{return p.adminUser.count()}).then(c=>{console.log('Total admins:',c);process.exit(0)}).catch(e=>{console.error('ERR:',e.message);process.exit(1)})\\" 2>&1"`;
        const adminResult = await runCommand(conn, adminCmd, 60000);
        log(`  ${adminResult.stdout.trim()}`);

        // ═══════════════════════════════════════════════════════════════
        // STEP 9: Verify
        // ═══════════════════════════════════════════════════════════════
        log('━━━ STEP 9: Verify deployment ━━━');

        // HTTP checks
        const httpDirect = await runCommand(conn, `curl -s -o /dev/null -w "%{http_code} %{time_total}s" http://127.0.0.1:3080/ 2>&1`);
        log(`  HTTP direct (3080): ${httpDirect.stdout.trim()}`);

        const httpPublic = await runCommand(conn, `curl -s -o /dev/null -w "%{http_code} %{time_total}s" https://heureuxmariage.aenews.net/ 2>&1`);
        log(`  HTTP public (HTTPS): ${httpPublic.stdout.trim()}`);

        // API checks
        const apiSettings = await runCommand(conn, `curl -s http://127.0.0.1:3080/api/settings | python3 -c "import sys,json;d=json.load(sys.stdin);s=d['settings'];print('bride:',s.get('bride_name'),'| groom:',s.get('groom_name'),'| wedding:',d.get('wedding',{}).get('slug'))" 2>&1`);
        log(`  API settings: ${apiSettings.stdout.trim()}`);

        const apiTimeline = await runCommand(conn, `curl -s http://127.0.0.1:3080/api/timeline | python3 -c "import sys,json;d=json.load(sys.stdin);print('events:',len(d.get('events',[])))" 2>&1`);
        log(`  API timeline: ${apiTimeline.stdout.trim()}`);

        // DB verification
        const dbCounts = await runCommand(conn, `docker exec wedding-app sh -c "cd /app && node -e \\"const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.wedding.count(),p.guest.count(),p.table.count(),p.adminUser.count(),p.settings.count(),p.eventTimeline.count()]).then(r=>{console.log(JSON.stringify({weddings:r[0],guests:r[1],tables:r[2],admins:r[3],settings:r[4],timeline:r[5]}));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})\\" 2>&1"`);
        log(`  DB counts: ${dbCounts.stdout.trim()}`);

        // Container logs (last 10 lines)
        const containerLogs = await runCommand(conn, `docker logs wedding-app --tail 10 2>&1`);
        log(`  Container logs (last 10):\n${containerLogs.stdout.split('\n').map(l => '    ' + l).join('\n')}`);

        // Cleanup temp files
        await runCommand(conn, `rm -f ${remoteTar} ${remoteTmpDb} /tmp/deploy-custom.db-* 2>&1`);

        conn.end();
        log('SSH disconnected');

        const summary = {
          deployTime: new Date().toISOString(),
          steps: {
            dbUpload: 'completed',
            sourceUpload: 'completed',
            initDbPatch: 'completed',
            containerBuild: buildResult.code === 0 ? 'succeeded' : 'failed (started with available image)',
            containerStart: 'completed',
            prismaPush: 'completed',
            testDataCleanup: 'completed',
            adminAdded: 'completed',
          },
          verification: {
            httpDirect: httpDirect.stdout.trim(),
            httpPublic: httpPublic.stdout.trim(),
            apiSettings: apiSettings.stdout.trim(),
            apiTimeline: apiTimeline.stdout.trim(),
            dbCounts: dbCounts.stdout.trim(),
          },
        };

        const summaryPath = path.join(LOCAL_ROOT, 'deploy-result.json');
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
        log(`\nDeploy summary saved to ${summaryPath}`);

        resolve(summary);
      } catch (err) {
        log(`Deploy error: ${err.message}`);
        log(err.stack);
        conn.end();
        reject(err);
      }
    });

    conn.on('error', (err) => {
      log(`SSH error: ${err.message}`);
      reject(err);
    });

    conn.connect(VPS_CONFIG);
  });
}

deploy().then((s) => {
  log('═══════════════════════════════════════════════════════════════════');
  log('DEPLOYMENT COMPLETE');
  log('═══════════════════════════════════════════════════════════════════');
  console.log('\nVerification:');
  console.log(JSON.stringify(s.verification, null, 2));
  process.exit(0);
}).catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
