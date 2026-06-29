/**
 * Complete deployment: start new container, push schema, cleanup, verify
 */
const { Client } = require('ssh2');
const VPS_CONFIG = { host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 30000 };
const REMOTE_ROOT = '/opt/wedding-platform';

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function run(conn, cmd, t=120000) {
  return new Promise(r => {
    conn.exec(cmd, (e,s) => {
      if(e){r({out:'ERR: '+e.message,code:-1});return;}
      let o=''; const tmr=setTimeout(()=>{try{s.signal('TERM')}catch{};r({out:o+'\n(TIMEOUT)',code:-1})},t);
      s.on('close',c=>{clearTimeout(tmr);r({out:o,code:c})});
      s.on('data',d=>o+=d.toString());
      s.stderr.on('data',d=>o+=d.toString());
    });
  });
}

async function main() {
  const conn = new Client();
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      log('SSH connected');

      // Stop old + start new
      log('--- Restarting with new image ---');
      await run(conn, `cd ${REMOTE_ROOT} && docker compose stop app 2>&1`, 60000);
      const up = await run(conn, `cd ${REMOTE_ROOT} && docker compose up -d app 2>&1`, 60000);
      log('Start: ' + up.out.trim());

      log('Waiting 25s...');
      await new Promise(r => setTimeout(r, 25000));
      const st = await run(conn, 'docker ps --format "{{.Names}} | {{.Status}}" | grep wedding');
      log('Status: ' + st.out.trim());

      // Prisma db push
      log('--- Prisma db push ---');
      const push = await run(conn, 'docker exec wedding-app sh -c "cd /app && npx prisma db push --accept-data-loss 2>&1"', 120000);
      log('Push (last 400): ' + push.out.slice(-400));

      // Cleanup
      log('--- Cleanup awa-david ---');
      const cleanup = await run(conn, `docker exec wedding-app sh -c 'cd /app && node -e "const{PrismaClient}=require(\\"@prisma/client\\");const p=new PrismaClient();p.wedding.deleteMany({where:{slug:\\"awa-david\\"}}).then(r=>{console.log(\\"Deleted awa-david:\\",r.count);return p.adminUser.deleteMany({where:{email:\\"awa.david.test@example.com\\"}})}).then(r=>{console.log(\\"Deleted test admin:\\",r.count)}).then(()=>p.wedding.count()).then(c=>{console.log(\\"Remaining weddings:\\",c);process.exit(0)}).catch(e=>{console.error(\\"ERR:\\",e.message);process.exit(1)})"' 2>&1`, 60000);
      log('Cleanup: ' + cleanup.out.trim());

      // Add admin
      log('--- Add production admin ---');
      const admin = await run(conn, `docker exec wedding-app sh -c 'cd /app && node -e "const{PrismaClient}=require(\\"@prisma/client\\");const bcrypt=require(\\"bcryptjs\\");const p=new PrismaClient();p.adminUser.upsert({where:{email:\\"admin@heureuxmariage.aenews.net\\"},update:{},create:{email:\\"admin@heureuxmariage.aenews.net\\",password:bcrypt.hashSync(\\"HeureuxMariage2026!\\",12),name:\\"Super Admin\\",role:\\"SUPER_ADMIN\\"}}).then(()=>p.adminUser.count()).then(c=>{console.log(\\"Total admins:\\",c);process.exit(0)}).catch(e=>{console.error(\\"ERR:\\",e.message);process.exit(1)})"' 2>&1`, 60000);
      log('Admin: ' + admin.out.trim());

      // Verify
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
      const settings = await run(conn, 'curl -s http://127.0.0.1:3080/api/settings 2>&1');
      const settingsShort = settings.out.slice(0, 300);
      log(`  API settings: ${settingsShort}`);
      results.apiSettings = settingsShort;

      const timeline = await run(conn, `curl -s http://127.0.0.1:3080/api/timeline 2>&1 | python3 -c "import sys,json;d=json.load(sys.stdin);print('events:',len(d.get('events',[])))" 2>&1`);
      log(`  API timeline: ${timeline.out.trim()}`);
      results.apiTimeline = timeline.out.trim();

      // DB counts
      const dbCounts = await run(conn, `docker exec wedding-app sh -c 'cd /app && node -e "const{PrismaClient}=require(\\"@prisma/client\\");const p=new PrismaClient();Promise.all([p.wedding.count(),p.guest.count(),p.table.count(),p.adminUser.count(),p.settings.count(),p.eventTimeline.count()]).then(r=>{console.log(JSON.stringify({weddings:r[0],guests:r[1],tables:r[2],admins:r[3],settings:r[4],timeline:r[5]}));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"' 2>&1`);
      log(`  DB counts: ${dbCounts.out.trim()}`);
      results.dbCounts = dbCounts.out.trim();

      // Container logs
      const logs = await run(conn, 'docker logs wedding-app --tail 20 2>&1');
      const logLines = logs.out.split('\n').map(l => '    ' + l).join('\n');
      log(`Container logs:\n${logLines}`);

      conn.end();

      const fs = require('fs');
      fs.writeFileSync('/home/z/my-project/deploy-result.json', JSON.stringify(results, null, 2));
      log('✓ Results saved to deploy-result.json');
      resolve(results);
    });
    conn.on('error', reject);
    conn.connect(VPS_CONFIG);
  });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
