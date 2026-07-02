/**
 * VPS DEPLOYMENT — Resume from STEP 2 (container is stopped, DB is uploaded)
 * Builds image, starts container, verifies.
 */
const { Client } = require('ssh2');
const fs = require('fs');
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
    conn.exec(cmd, (err, stream) => {
      if (err) { resolve({ stdout: '', stderr: String(err), code: -1 }); return; }
      let stdout = '', stderr = '';
      const timer = setTimeout(() => {
        try { stream.signal('TERM'); } catch {}
        resolve({ stdout, stderr: stderr + '\n(TIMEOUT)', code: -1 });
      }, timeoutMs);
      stream.on('close', (code) => { clearTimeout(timer); resolve({ stdout, stderr, code: code ?? 0 }); });
      stream.on('data', (d) => { stdout += d.toString(); if (timeoutMs > 120000) process.stdout.write(d); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); if (timeoutMs > 120000) process.stderr.write(d); });
    });
  });
}

function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err) => err ? reject(err) : resolve());
  });
}

const DEPLOY_PATHS = [
  'src/', 'prisma/schema.prisma', 'prisma/seed.ts', 'public/',
  'package.json', 'bun.lock', 'next.config.ts', 'tsconfig.json',
  'tailwind.config.ts', 'postcss.config.mjs', 'components.json',
  'eslint.config.mjs', 'init-db.js', 'docker-entrypoint.sh',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.prod.yml',
];

async function main() {
  const conn = new Client();
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      log('SSH connected ✓');
      const sftp = await new Promise((res, rej) => conn.sftp((err, s) => err ? rej(err) : res(s)));

      try {
        // STEP 2: Create + upload tar
        log('━━━ STEP 2: Create + upload source tar ━━━');
        const tarPath = '/tmp/deploy-source.tar.gz';
        log('  Creating tar...');
        execSync(`tar czf ${tarPath} --exclude='node_modules' --exclude='.next' --exclude='.git' --exclude='*.log' --exclude='db/*.db*' ${DEPLOY_PATHS.join(' ')}`, { cwd: LOCAL_ROOT, stdio: 'pipe' });
        const tarSize = fs.statSync(tarPath).size;
        log(`  ✓ Tar created (${(tarSize / 1024 / 1024).toFixed(1)} MB)`);

        log('  Uploading tar...');
        await uploadFile(sftp, tarPath, '/tmp/deploy-source.tar.gz');
        log('  ✓ Uploaded');

        log('  Extracting on VPS...');
        await runCommand(conn, `cd ${REMOTE_ROOT} && tar xzf /tmp/deploy-source.tar.gz 2>&1`, 60000);
        log('  ✓ Extracted');

        // STEP 3: Patch init-db.js
        log('━━━ STEP 3: Patch init-db.js ━━━');
        const patchCmd = `cd ${REMOTE_ROOT} && node -e "
const fs = require('fs');
let content = fs.readFileSync('init-db.js', 'utf8');
const guard = \`
  // Phase 3 deploy guard: skip seeding if Wedding table already has data
  try {
    const weddingCount = await prisma.wedding.count();
    if (weddingCount > 0) {
      console.log('⏭️  Wedding table already has ' + weddingCount + ' rows — skipping seed');
      console.log('✅ Database ready (skipped initialization)!');
      return;
    }
  } catch (e) {
    console.log('  Wedding table not found — continuing with initialization...');
  }
\`;
if (!content.includes('Phase 3 deploy guard')) {
  content = content.replace(
    'async function main() {\\n  console.log(\\'🔧 Initializing database...\\');',
    'async function main() {\\n  console.log(\\'🔧 Initializing database...\\');' + guard
  );
  fs.writeFileSync('init-db.js', content);
  console.log('✓ Patched init-db.js');
} else {
  console.log('⏭️  Already patched');
}
" 2>&1`;
        const patchResult = await runCommand(conn, patchCmd);
        log(`  ${patchResult.stdout.trim()}`);

        // STEP 4: Build
        log('━━━ STEP 4: Build Docker image (may take 5-15 min) ━━━');
        const buildResult = await runCommand(conn, `cd ${REMOTE_ROOT} && docker compose build app --no-cache 2>&1`, 1200000);
        log(`\n  Build exit code: ${buildResult.code}`);

        // STEP 5: Start
        log('━━━ STEP 5: Start container ━━━');
        const startResult = await runCommand(conn, `cd ${REMOTE_ROOT} && docker compose up -d app 2>&1`, 60000);
        log(`  ${startResult.stdout.trim()}`);

        log('  Waiting 30s for startup...');
        await new Promise(r => setTimeout(r, 30000));

        const status = await runCommand(conn, `docker inspect wedding-app --format '{{.State.Status}} (health: {{.State.Health.Status}})' 2>&1`);
        log(`  Status: ${status.stdout.trim()}`);

        // STEP 6: Prisma db push
        log('━━━ STEP 6: Prisma db push ━━━');
        const pushResult = await runCommand(conn, `docker exec wedding-app sh -c "cd /app && npx prisma db push --accept-data-loss 2>&1"`, 120000);
        log(`  ${pushResult.stdout.trim().slice(-300)}`);

        // STEP 7: Cleanup test data
        log('━━━ STEP 7: Cleanup awa-david test wedding ━━━');
        const cleanupCmd = `docker exec wedding-app sh -c "cd /app && node -e \\"const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.wedding.deleteMany({where:{slug:'awa-david'}}).then(r=>{console.log('Deleted awa-david:',r.count);return p.adminUser.deleteMany({where:{email:'awa.david.test@example.com'}})}).then(r=>{console.log('Deleted test admin:',r.count)}).then(()=>p.wedding.count()).then(c=>{console.log('Remaining weddings:',c);process.exit(0)}).catch(e=>{console.error('ERR:',e.message);process.exit(1)})\\" 2>&1"`;
        const cleanupResult = await runCommand(conn, cleanupCmd, 60000);
        log(`  ${cleanupResult.stdout.trim()}`);

        // STEP 8: Add production admin
        log('━━━ STEP 8: Add production admin ━━━');
        const adminCmd = `docker exec wedding-app sh -c "cd /app && node -e \\"const{PrismaClient}=require('@prisma/client');const bcrypt=require('bcryptjs');const p=new PrismaClient();p.adminUser.upsert({where:{email:'admin@heureuxmariage.aenews.net'},update:{},create:{email:'admin@heureuxmariage.aenews.net',password:bcrypt.hashSync('HeureuxMariage2026!',12),name:'Super Admin',role:'SUPER_ADMIN'}}).then(()=>p.adminUser.count()).then(c=>{console.log('Total admins:',c);process.exit(0)}).catch(e=>{console.error('ERR:',e.message);process.exit(1)})\\" 2>&1"`;
        const adminResult = await runCommand(conn, adminCmd, 60000);
        log(`  ${adminResult.stdout.trim()}`);

        // STEP 9: Verify
        log('━━━ STEP 9: Verify ━━━');
        const checks = [
          ['HTTP direct', `curl -s -o /dev/null -w "%{http_code} %{time_total}s" http://127.0.0.1:3080/`],
          ['HTTP public', `curl -s -o /dev/null -w "%{http_code} %{time_total}s" https://heureuxmariage.aenews.net/`],
          ['API settings', `curl -s http://127.0.0.1:3080/api/settings | python3 -c "import sys,json;d=json.load(sys.stdin);s=d['settings'];print('bride:',s.get('bride_name'),'| groom:',s.get('groom_name'),'| wedding:',d.get('wedding',{}).get('slug'))"`],
          ['API timeline', `curl -s http://127.0.0.1:3080/api/timeline | python3 -c "import sys,json;d=json.load(sys.stdin);print('events:',len(d.get('events',[])))"`],
          ['API dashboard', `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/api/admin/dashboard`],
          ['Platform admin', `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/platform/admin`],
          ['Onboarding', `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/onboarding`],
        ];
        const results = {};
        for (const [name, cmd] of checks) {
          const r = await runCommand(conn, cmd);
          results[name] = r.stdout.trim();
          log(`  ${name}: ${r.stdout.trim()}`);
        }

        // DB counts
        const dbCounts = await runCommand(conn, `docker exec wedding-app sh -c "cd /app && node -e \\"const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.wedding.count(),p.guest.count(),p.table.count(),p.adminUser.count(),p.settings.count(),p.eventTimeline.count()]).then(r=>{console.log(JSON.stringify({weddings:r[0],guests:r[1],tables:r[2],admins:r[3],settings:r[4],timeline:r[5]}));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})\\" 2>&1"`);
        log(`  DB counts: ${dbCounts.stdout.trim()}`);
        results.dbCounts = dbCounts.stdout.trim();

        // Container logs
        const logs = await runCommand(conn, `docker logs wedding-app --tail 15 2>&1`);
        log(`  Container logs:\n${logs.stdout.split('\n').map(l => '    ' + l).join('\n')}`);

        await runCommand(conn, `rm -f /tmp/deploy-source.tar.gz 2>&1`);
        conn.end();

        fs.writeFileSync('/home/z/my-project/deploy-result.json', JSON.stringify(results, null, 2));
        log('\n✓ Deploy complete. Results saved to deploy-result.json');
        resolve(results);
      } catch (err) {
        log(`ERROR: ${err.message}`);
        conn.end();
        reject(err);
      }
    });
    conn.on('error', reject);
    conn.connect(VPS_CONFIG);
  });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
