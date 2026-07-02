/**
 * Diagnose DB state + fix issues
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

      // 1. Check DB file size on VPS volume
      log('--- DB file check ---');
      const volPath = '/var/lib/docker/volumes/wedding-platform_wedding-db/_data';
      const dbStat = await run(conn, `ls -la ${volPath}/custom.db 2>&1`);
      log(`Volume DB: ${dbStat.out.trim()}`);

      const dbInContainer = await run(conn, 'docker exec wedding-app ls -la /app/db/custom.db 2>&1');
      log(`Container DB: ${dbInContainer.out.trim()}`);

      // 2. Check if init-db.js was patched
      log('--- init-db.js patch check ---');
      const patchCheck = await run(conn, `grep -c "Phase 3 deploy guard" ${REMOTE_ROOT}/init-db.js 2>&1`);
      log(`Patch in source: ${patchCheck.out.trim()}`);

      const patchInContainer = await run(conn, 'docker exec wedding-app grep -c "Phase 3 deploy guard" /app/init-db.js 2>&1');
      log(`Patch in container: ${patchInContainer.out.trim()}`);

      // 3. Check prisma availability
      log('--- Prisma CLI check ---');
      const prismaBin = await run(conn, 'docker exec wedding-app sh -c "ls /app/node_modules/.bin/prisma 2>&1 || echo NOT_FOUND"');
      log(`prisma bin: ${prismaBin.out.trim()}`);

      const npxPrisma = await run(conn, 'docker exec wedding-app sh -c "cd /app && ./node_modules/.bin/prisma --version 2>&1 || npx --yes prisma --version 2>&1" 2>&1', 60000);
      log(`prisma version: ${npxPrisma.out.trim().slice(0, 200)}`);

      // 4. Check the schema in the container
      log('--- Schema check ---');
      const schemaHead = await run(conn, 'docker exec wedding-app head -20 /app/prisma/schema.prisma 2>&1');
      log(`Schema head:\n${schemaHead.out}`);

      const schemaModels = await run(conn, 'docker exec wedding-app grep "^model" /app/prisma/schema.prisma 2>&1');
      log(`Models:\n${schemaModels.out}`);

      // 5. Check actual DB tables + row counts using node + prisma client
      log('--- DB inspection via Prisma Client ---');
      const dbInspect = await run(conn, `docker exec wedding-app sh -c 'cd /app && node -e "const{PrismaClient}=require(\\"@prisma/client\\");const p=new PrismaClient();p.\\$queryRawUnsafe(\\"SELECT name FROM sqlite_master WHERE type=\\\\\\"table\\\\\\" ORDER BY name\\").then(r=>{console.log(\\"Tables:\\",JSON.stringify(r.map(x=>x.name)))}).then(()=>p.wedding.findMany({select:{id:true,slug:true,coupleLabel:true}})).then(r=>{console.log(\\"Weddings:\\",JSON.stringify(r))}).then(()=>p.guest.count()).then(c=>{console.log(\\"Guests:\\",c)}).then(()=>p.settings.count()).then(c=>{console.log(\\"Settings:\\",c)}).then(()=>{process.exit(0)}).catch(e=>{console.error(\\"ERR:\\",e.message);process.exit(1)})"' 2>&1`, 60000);
      log(`DB inspection:\n${dbInspect.out}`);

      // 6. Check if the uploaded DB has data (copy it out and check)
      log('--- Direct SQLite check ---');
      const sqliteCheck = await run(conn, `docker exec wedding-app sh -c 'cd /app && node -e "const Database=require(\\"better-sqlite3\\");const db=new Database(\\"/app/db/custom.db\\");console.log(\\"Guests:\\",db.prepare(\\\"SELECT COUNT(*) as c FROM Guest\\").get().c);console.log(\\"Settings:\\",db.prepare(\\\"SELECT COUNT(*) as c FROM Settings\\").get().c);console.log(\\"Tables:\\",db.prepare(\\\"SELECT COUNT(*) as c FROM Table\\").get().c);db.close()"' 2>&1`, 30000);
      log(`SQLite check: ${sqliteCheck.out.trim()}`);

      conn.end();
      resolve();
    });
    conn.on('error', reject);
    conn.connect(VPS_CONFIG);
  });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
