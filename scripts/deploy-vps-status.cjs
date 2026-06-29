/**
 * Quick VPS status check
 */
const { Client } = require('ssh2');
const VPS_CONFIG = { host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 30000 };

function run(conn, cmd) {
  return new Promise((resolve) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { resolve('ERR: ' + err.message); return; }
      let out = '';
      stream.on('close', () => resolve(out));
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => { out += d.toString(); });
    });
  });
}

async function main() {
  const conn = new Client();
  return new Promise((resolve) => {
    conn.on('ready', async () => {
      console.log('=== CONTAINER STATUS ===');
      console.log(await run(conn, 'docker ps -a --format "{{.Names}} | {{.Status}}" | grep wedding'));
      
      console.log('\n=== BUILD PROCESSES ===');
      console.log(await run(conn, 'ps aux | grep -E "docker|buildkit|bun|npm" | grep -v grep | head -10'));
      
      console.log('\n=== HTTP CHECK ===');
      console.log('Direct (3080):', await run(conn, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/ 2>&1'));
      console.log('Public (HTTPS):', await run(conn, 'curl -s -o /dev/null -w "%{http_code}" https://heureuxmariage.aenews.net/ 2>&1'));
      
      console.log('\n=== API CHECK ===');
      console.log('Settings:', await run(conn, 'curl -s http://127.0.0.1:3080/api/settings 2>&1 | python3 -c "import sys,json;d=json.load(sys.stdin);s=d.get(\'settings\',{});print(\'bride:\',s.get(\'bride_name\'),\'| groom:\',s.get(\'groom_name\'),\'| wedding:\',d.get(\'wedding\',{}).get(\'slug\'))" 2>&1'));
      console.log('Timeline:', await run(conn, 'curl -s http://127.0.0.1:3080/api/timeline 2>&1 | python3 -c "import sys,json;d=json.load(sys.stdin);print(\'events:\',len(d.get(\'events\',[])))" 2>&1'));
      
      console.log('\n=== DB COUNTS ===');
      console.log(await run(conn, 'docker exec wedding-app sh -c "cd /app && node -e \\"const{PrismaClient}=require(\'@prisma/client\');const p=new PrismaClient();Promise.all([p.wedding.count(),p.guest.count(),p.table.count(),p.adminUser.count(),p.settings.count(),p.eventTimeline.count()]).then(r=>{console.log(JSON.stringify({weddings:r[0],guests:r[1],tables:r[2],admins:r[3],settings:r[4],timeline:r[5]}));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})\\" 2>&1"'));
      
      console.log('\n=== CONTAINER LOGS (last 20) ===');
      console.log(await run(conn, 'docker logs wedding-app --tail 20 2>&1'));
      
      conn.end();
      resolve();
    });
    conn.on('error', (e) => { console.error(e); process.exit(1); });
    conn.connect(VPS_CONFIG);
  });
}
main().then(() => process.exit(0));
