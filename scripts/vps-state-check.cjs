/**
 * vps-state-check.cjs — Quick VPS state check after deploy attempt
 */
const { Client } = require('ssh2');

const VPS_CONFIG = { host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 30000 };

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
  log('=== VPS STATE CHECK ===');
  const conn = new Client();
  try {
    await new Promise((res,rej)=>{
      conn.on('ready',res);
      conn.on('error',rej);
      conn.connect(VPS_CONFIG);
    });
    log('SSH connected');

    log('\n--- 1. Memory & load ---');
    await run(conn, 'free -h');
    await run(conn, 'uptime');

    log('\n--- 2. Container state ---');
    await run(conn, 'docker ps -a --filter name=wedding --format "{{.Names}}\\t{{.Status}}\\t{{.Ports}}"');

    log('\n--- 3. Orphaned build processes ---');
    await run(conn, 'ps aux | grep -E "(buildkit|npm|next|prisma|docker compose)" | grep -v grep | head -10');

    log('\n--- 4. Docker images (new build?) ---');
    await run(conn, 'docker images | head -10');

    log('\n--- 5. Production HTTP status ---');
    await run(conn, 'curl -sI https://heureuxmariage.aenews.net/ 2>&1 | head -5');

    log('\n--- 6. Phase 8 endpoint: /api/theme ---');
    await run(conn, 'curl -s -H "X-Wedding-Slug: josue-hornella" https://heureuxmariage.aenews.net/api/theme 2>&1 | head -c 600');

    log('\n\n--- 7. Phase 8 endpoint: /api/custom-domain ---');
    await run(conn, 'curl -s -H "X-Wedding-Slug: josue-hornella" https://heureuxmariage.aenews.net/api/custom-domain 2>&1 | head -c 400');

    log('\n\n--- 8. Container logs (last 20 lines) ---');
    await run(conn, 'docker logs wedding-app --tail 20 2>&1');

    log('\n\n--- 9. Container file check: theme route exists? ---');
    await run(conn, 'docker exec wedding-app ls -la /app/src/app/api/theme/route.ts /app/src/app/api/custom-domain/route.ts /app/src/lib/themes/templates.ts 2>&1 || echo "FILES_NOT_IN_CONTAINER"');

    conn.end();
    log('\n=== STATE CHECK COMPLETE ===');
  } catch (e) {
    log('FAILED: ' + e.message);
    process.exit(1);
  }
}
main();
