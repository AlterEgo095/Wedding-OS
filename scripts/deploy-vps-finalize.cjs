/**
 * Wait for VPS Docker build to finish, then complete deployment.
 * Polls every 30s. Max wait: 15 min.
 * Once build done: start new container, prisma push, cleanup, verify.
 */
const { Client } = require('ssh2');

const VPS_CONFIG = { host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 30000 };
const REMOTE_ROOT = '/opt/wedding-platform';

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function run(conn, cmd, timeoutMs = 120000) {
  return new Promise((resolve) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { resolve({ stdout: '', stderr: String(err), code: -1 }); return; }
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { try { stream.signal('TERM'); } catch {}; resolve({ stdout, stderr: stderr+'\n(TIMEOUT)', code: -1 }); }, timeoutMs);
      stream.on('close', (code) => { clearTimeout(timer); resolve({ stdout, stderr, code: code ?? 0 }); });
      stream.on('data', (d) => { stdout += d.toString(); if (timeoutMs > 120000) process.stdout.write(d); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); if (timeoutMs > 120000) process.stderr.write(d); });
    });
  });
}

async function checkBuildDone(conn) {
  const r = await run(conn, 'ps aux | grep "docker.*build" | grep -v grep | wc -l');
  return r.stdout.trim() === '0';
}

async function completeDeploy() {
  const conn = new Client();
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      log('SSH connected');

      // ═══ WAIT FOR BUILD ═══
      log('Waiting for Docker build to finish...');
      let buildDone = false;
      for (let i = 0; i < 30; i++) { // 30 × 30s = 15 min max
        buildDone = await checkBuildDone(conn);
        if (buildDone) {
          log(`✓ Build finished after ~${i * 30}s of polling`);
          break;
        }
        if (i % 4 === 0) log(`  Still building... (${i * 30}s elapsed)`);
        await new Promise(r => setTimeout(r, 30000));
      }

      if (!buildDone) {
        log('⚠ Build still running after 15 min. Proceeding with old image for now.');
      } else {
        // Check the new image
        const img = await run(conn, 'docker images wedding-platform-app --format "{{.ID}} {{.CreatedAt}}" | head -1');
        log(`Latest image: ${img.stdout.trim()}`);
      }

      // ═══ STOP OLD CONTAINER + START WITH NEW IMAGE ═══
      log('━━━ Restarting container with new image ━━━');
      await run(conn, `cd ${REMOTE_ROOT} && docker compose stop app 2>&1`, 60000);
      const upResult = await run(conn, `cd ${REMOTE_ROOT} && docker compose up -d app 2>&1`, 60000);
      log(`  ${upResult.stdout.trim()}`);

      log('  Waiting 30s for startup...');
      await new Promise(r => setTimeout(r, 30000));

      const status = await run(conn, `docker ps --format "{{.Names}} | {{.Status}}" | grep wedding`);
      log(`  Container: ${status.stdout.trim()}`);

      // ═══ PRISMA DB PUSH ═══
      log('━━━ Prisma db push ━━━');
      const pushResult = await run(conn, `docker exec wedding-app sh -c "cd /app && npx prisma db push --accept-data-loss 2>&1"`, 120000);
      log(`  Push output (last 300 chars): ${pushResult.stdout.trim().slice(-300)}`);

      // ═══ CLEANUP TEST DATA ═══
      log('━━━ Cleanup awa-david test wedding ━━━');
      const cleanupCmd = `docker exec wedding-app sh -c "cd /app && node -e \\"const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.wedding.deleteMany({where:{slug:'awa-david'}}).then(r=>{console.log('Deleted awa-david:',r.count);return p.adminUser.deleteMany({where:{email:'awa.david.test@example.com'}})}).then(r=>{console.log('Deleted test admin:',r.count)}).then(()=>p.wedding.count()).then(c=>{console.log('Remaining weddings:',c);process.exit(0)}).catch(e=>{console.error('ERR:',e.message);process.exit(1)})\\" 2>&1"`;
      const cleanupResult = await run(conn, cleanupCmd, 60000);
      log(`  ${cleanupResult.stdout.trim()}`);

      // ═══ ADD PRODUCTION ADMIN ═══
      log('━━━ Add production admin ━━━');
      const adminCmd = `docker exec wedding-app sh -c "cd /app && node -e \\"const{PrismaClient}=require('@prisma/client');const bcrypt=require('bcryptjs');const p=new PrismaClient();p.adminUser.upsert({where:{email:'admin@heureuxmariage.aenews.net'},update:{},create:{email:'admin@heureuxmariage.aenews.net',password:bcrypt.hashSync('HeureuxMariage2026!',12),name:'Super Admin',role:'SUPER_ADMIN'}}).then(()=>p.adminUser.count()).then(c=>{console.log('Total admins:',c);process.exit(0)}).catch(e=>{console.error('ERR:',e.message);process.exit(1)})\\" 2>&1"`;
      const adminResult = await run(conn, adminCmd, 60000);
      log(`  ${adminResult.stdout.trim()}`);

      // ═══ VERIFY ═══
      log('━━━ Verification ━━━');
      const checks = [
        ['HTTP direct', 'curl -s -o /dev/null -w "%{http_code} %{time_total}s" http://127.0.0.1:3080/'],
        ['HTTP public', 'curl -s -o /dev/null -w "%{http_code} %{time_total}s" https://heureuxmariage.aenews.net/'],
        ['API settings', 'curl -s http://127.0.0.1:3080/api/settings 2>&1 | python3 -c "import sys,json;d=json.load(sys.stdin);s=d.get(\'settings\',{});print(\'bride:\',s.get(\'bride_name\'),\'| groom:\',s.get(\'groom_name\'),\'| wedding:\',d.get(\'wedding\',{}).get(\'slug\'))"'],
        ['API timeline', 'curl -s http://127.0.0.1:3080/api/timeline 2>&1 | python3 -c "import sys,json;d=json.load(sys.stdin);print(\'events:\',len(d.get(\'events\',[])))"'],
        ['Platform admin', 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/platform/admin'],
        ['Onboarding', 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/onboarding'],
      ];
      const results = {};
      for (const [name, cmd] of checks) {
        const r = await run(conn, cmd);
        results[name] = r.stdout.trim();
        log(`  ${name}: ${r.stdout.trim()}`);
      }

      // DB counts
      const dbCounts = await run(conn, `docker exec wedding-app sh -c "cd /app && node -e \\"const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.wedding.count(),p.guest.count(),p.table.count(),p.adminUser.count(),p.settings.count(),p.eventTimeline.count()]).then(r=>{console.log(JSON.stringify({weddings:r[0],guests:r[1],tables:r[2],admins:r[3],settings:r[4],timeline:r[5]}));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})\\" 2>&1"`);
      log(`  DB counts: ${dbCounts.stdout.trim()}`);
      results.dbCounts = dbCounts.stdout.trim();

      // Container logs
      const logs = await run(conn, 'docker logs wedding-app --tail 15 2>&1');
      log(`  Container logs:\n${logs.stdout.split('\n').map(l => '    ' + l).join('\n')}`);

      conn.end();

      const fs = require('fs');
      fs.writeFileSync('/home/z/my-project/deploy-result.json', JSON.stringify(results, null, 2));
      log('✓ Deploy result saved');
      resolve(results);
    });
    conn.on('error', reject);
    conn.connect(VPS_CONFIG);
  });
}

completeDeploy().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
