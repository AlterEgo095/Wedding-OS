/**
 * EMERGENCY: Check VPS state and restore service
 */
const { Client } = require('ssh2');

const VPS_CONFIG = {
  host: '95.111.226.63', port: 22, username: 'aenews',
  password: 'AeNews2025Secure!', readyTimeout: 30000,
};

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function run(conn, cmd, timeoutMs = 60000) {
  return new Promise((resolve) => {
    log(`$ ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) { log(`ERR: ${err.message}`); return resolve({ stdout: '', stderr: err.message, code: -1 }); }
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { try { stream.signal('TERM'); } catch {} }, timeoutMs);
      stream.on('close', (code) => {
        clearTimeout(timer);
        if (stdout.trim()) log(`  out: ${stdout.trim().slice(0, 800)}`);
        if (stderr.trim()) log(`  err: ${stderr.trim().slice(0, 800)}`);
        log(`  exit: ${code}`);
        resolve({ stdout, stderr, code });
      });
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
    });
  });
}

async function main() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    conn.connect(VPS_CONFIG);
  });
  log('✓ SSH connected');

  try {
    log('\n=== EMERGENCY STATE CHECK ===');

    // 1. All containers
    log('\n[1] All wedding containers:');
    await run(conn, 'docker ps -a --filter "name=wedding" --format "{{.Names}}\\t{{.Status}}\\t{{.Image}}"');

    // 2. Is wedding-app actually running?
    log('\n[2] wedding-app container state:');
    await run(conn, 'docker inspect wedding-app --format "{{.State.Status}}\\t{{.State.Health.Status}}\\t{{.Name}}" 2>&1');

    // 3. Wedding-app logs (last 30)
    log('\n[3] wedding-app logs:');
    await run(conn, 'docker logs wedding-app --tail 30 2>&1');

    // 4. Production HTTP
    log('\n[4] Production HTTP status:');
    await run(conn, 'curl -sI https://heureuxmariage.aenews.net/ 2>&1 | head -5');

    // 5. Local port 3080
    log('\n[5] Local port 3080:');
    await run(conn, 'curl -sI http://127.0.0.1:3080/ 2>&1 | head -5');

    // 6. Docker compose state
    log('\n[6] Docker compose ps:');
    await run(conn, 'cd /opt/wedding-platform && docker compose ps 2>&1');

    // 7. If wedding-app is down, restart it
    log('\n[7] Ensuring wedding-app is up...');
    await run(conn, 'docker start wedding-app 2>&1 || echo "(start failed or already up)"');
    await run(conn, 'sleep 3');
    await run(conn, 'docker ps --filter "name=wedding-app" --format "{{.Names}}\\t{{.Status}}"');

    // 8. Check DB fix script is still there
    log('\n[8] Check if db-fix.js exists in container:');
    await run(conn, 'docker exec wedding-app ls -la /app/db-fix.js 2>&1 || echo "(not in container)"');
    await run(conn, 'ls -la /opt/wedding-platform/db-fix.js 2>&1 || echo "(not on host)"');

    // 9. Verify the DB directly with a SIMPLE one-liner
    log('\n[9] Simple DB check (one-liner, no escaping issues):');
    await run(conn, 'docker exec wedding-app node -e "const D=require(\'better-sqlite3\');const d=new D(\'/app/db/custom.db\');console.log(\'MBOYO:\',d.prepare(\'SELECT COUNT(*) c FROM Guest WHERE lastName LIKE \\\'%MBOYO%\\\'\').get().c);console.log(\'CHRIST:\',d.prepare(\'SELECT COUNT(*) c FROM Guest WHERE lastName LIKE \\\'%CHRIST MPEPE%\\\'\').get().c);console.log(\'venue_time:\',d.prepare(\'SELECT value FROM Settings WHERE key=?\').get(\'venue_time\'));d.close();" 2>&1');

    log('\n=== STATE CHECK COMPLETE ===');

  } catch (err) {
    log(`✗ FAILED: ${err.message}`);
    process.exit(1);
  } finally {
    conn.end();
  }
}

main().catch(console.error);
