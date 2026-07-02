/**
 * Inspect VPS DB — no SFTP download, just remote queries
 */
const { Client } = require('ssh2');

const VPS_CONFIG = {
  host: '95.111.226.63', port: 22, username: 'aenews',
  password: 'AeNews2025Secure!', readyTimeout: 60000,
};

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function runCommand(conn, cmd) {
  return new Promise((resolve) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { resolve({ stdout: '', stderr: String(err), code: -1 }); return; }
      let stdout = '', stderr = '';
      stream.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
    });
  });
}

async function main() {
  const conn = new Client();
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      log('SSH connected');
      
      const q = (js) => runCommand(conn, `docker exec wedding-app sh -c 'cd /app && node -e "${js}"' 2>&1`);
      
      // Tables
      const tables = await q(`const{PrismaClient}=require(\\"@prisma/client\\");const p=new PrismaClient();p.\\$queryRawUnsafe(\\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\\").then(r=>{console.log(JSON.stringify(r.map(x=>x.name)));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})`);
      log(`Tables: ${tables.stdout.trim()}`);
      
      // Counts
      const counts = await q(`const{PrismaClient}=require(\\"@prisma/client\\");const p=new PrismaClient();Promise.all([p.wedding.count(),p.guest.count(),p.table.count(),p.adminUser.count(),p.settings.count(),p.eventTimeline.count(),p.coupleStory.count(),p.media.count(),p.theme.count(),p.musicTrack.count(),p.subscription.count(),p.invoice.count()]).then(r=>{console.log(JSON.stringify({wedding:r[0],guest:r[1],table:r[2],admin:r[3],settings:r[4],timeline:r[5],story:r[6],media:r[7],theme:r[8],music:r[9],sub:r[10],invoice:r[11]}));process.exit(0)}).catch(e=>{console.error(\\"ERR:\\",e.message);process.exit(1)})`);
      log(`Counts: ${counts.stdout.trim()}`);
      
      // Weddings
      const weddings = await q(`const{PrismaClient}=require(\\"@prisma/client\\");const p=new PrismaClient();p.wedding.findMany({select:{id:true,slug:true,brideName:true,groomName:true,coupleLabel:true,status:true,plan:true,isDefault:true,timezone:true,createdAt:true}}).then(r=>{console.log(JSON.stringify(r,null,2));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})`);
      log(`Weddings:\n${weddings.stdout.trim()}`);
      
      // Admins
      const admins = await q(`const{PrismaClient}=require(\\"@prisma/client\\");const p=new PrismaClient();p.adminUser.findMany({select:{id:true,email:true,name:true,role:true,weddingId:true,createdAt:true}}).then(r=>{console.log(JSON.stringify(r,null,2));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})`);
      log(`Admins:\n${admins.stdout.trim()}`);
      
      // Check entrypoint script
      log('Checking docker-entrypoint.sh...');
      const entrypoint = await runCommand(conn, `cat /opt/wedding-platform/docker-entrypoint.sh`);
      log(`Entrypoint:\n${entrypoint.stdout}`);
      
      conn.end();
      resolve();
    });
    conn.on('error', reject);
    conn.connect(VPS_CONFIG);
  });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
