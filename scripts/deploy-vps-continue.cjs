/**
 * VPS State Diagnostic + Compose-based restart
 * Task ID: 3-DEPLOY-CONT
 * 
 * Checks what state the VPS is in after the timed-out deploy,
 * then uses docker-compose (the correct method) to rebuild + restart.
 */

const { Client } = require('ssh2');

const VPS_CONFIG = {
  host: '95.111.226.63',
  port: 22,
  username: 'aenews',
  password: 'AeNews2025Secure!',
  readyTimeout: 30000,
};

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function run(conn, cmd, timeoutMs = 60000) {
  return new Promise((resolve) => {
    log(`$ ${cmd}`);
    conn.exec(cmd, (err, stream) => {
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

async function main() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    conn.connect(VPS_CONFIG);
  });
  log('✓ SSH connected');

  try {
    // === DIAGNOSTIC ===
    log('\n=== DIAGNOSTIC ===');
    
    log('\n[1] Running containers:');
    await run(conn, 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"');
    
    log('\n[2] All wedding-related containers (including stopped):');
    await run(conn, 'docker ps -a --filter "name=wedding" --format "table {{.Names}}\\t{{.Status}}\\t{{.Image}}"');
    
    log('\n[3] Existing images:');
    await run(conn, 'docker images | grep -E "heureux|wedding|REPOSITORY" | head -20');
    
    log('\n[4] Is a build still running?');
    await run(conn, 'ps aux | grep -E "docker build|buildkit" | grep -v grep | head -10');
    
    log('\n[5] Docker compose file present?');
    await run(conn, 'ls -la /opt/wedding-platform/docker-compose.yml /opt/wedding-platform/Dockerfile 2>&1');
    
    log('\n[6] Verify DB fix actually ran (check for CHRIST MPEPE in DB):');
    const dbCheck = `docker exec wedding-app sh -c 'node -e "
      const Database = require(\\"better-sqlite3\\");
      const db = new Database(\\"/app/db/custom.db\\");
      const mboyo = db.prepare(\\"SELECT COUNT(*) as c FROM Guest WHERE lastName LIKE \\\\\\"%MBOYO%\\\\\\" OR displayName LIKE \\\\\\"%MBOYO%\\\\\\"\").get();
      const christ = db.prepare(\\"SELECT id, firstName, lastName, displayName, invitationType FROM Guest WHERE lastName LIKE \\\\\\"%CHRIST MPEPE%\\\\\\" OR displayName LIKE \\\\\\"%CHRIST MPEPE%\\\\\\"\").all();
      const times = db.prepare(\\"SELECT key, value FROM Settings WHERE key IN (\\\\\\"venue_time\\\\\\", \\\\\\"wedding_time\\\\\\")\\").all();
      console.log(\\"MBOYO count:\\", mboyo.c);
      console.log(\\"CHRIST MPEPE guests:\\", JSON.stringify(christ, null, 2));
      console.log(\\"Time settings:\\", JSON.stringify(times, null, 2));
      db.close();
    "' 2>&1`;
    await run(conn, dbCheck);

    log('\n[7] Current production response:');
    await run(conn, 'curl -sI https://heureuxmariage.aenews.net/ 2>&1 | head -5');

    // === DECISION ===
    log('\n=== DECISION ===');
    log('Strategy: Use docker-compose to rebuild + restart (respects the 2-service setup)');
    
    // === REBUILD + RESTART VIA COMPOSE ===
    log('\n[8] Rebuilding + restarting via docker-compose (app service only)...');
    // Use --no-deps to skip nginx (it doesn't need rebuild), build app, then up -d app
    // This is the proper way for this VPS
    const composeBuild = 'cd /opt/wedding-platform && docker compose build app 2>&1 | tail -30';
    const buildRes = await run(conn, composeBuild, 480000); // 8 min timeout for build
    log(`Build exit code: ${buildRes.code}`);
    
    if (buildRes.code !== 0) {
      log('✗ Build failed. Aborting restart.');
      log(`stderr: ${buildRes.stderr.slice(-500)}`);
      return;
    }

    log('\n[9] Restarting app container with new image...');
    const restartRes = await run(conn, 'cd /opt/wedding-platform && docker compose up -d --no-deps app 2>&1', 60000);
    log(`Restart exit code: ${restartRes.code}`);
    
    log('\n[10] Waiting 10s for app to boot...');
    await new Promise(r => setTimeout(r, 10000));
    
    log('\n[11] New container status:');
    await run(conn, 'docker ps --filter "name=wedding" --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"');
    
    log('\n[12] App logs (last 30 lines):');
    await run(conn, 'cd /opt/wedding-platform && docker compose logs app --tail 30 2>&1');

    // === FINAL VERIFICATION ===
    log('\n=== FINAL VERIFICATION ===');
    
    log('\n[V1] Production HTTP status:');
    await run(conn, 'curl -sI https://heureuxmariage.aenews.net/ 2>&1 | head -5');
    
    log('\n[V2] Settings API (check venue_time + wedding_time):');
    await run(conn, 'curl -s https://heureuxmariage.aenews.net/api/settings 2>&1 | head -300');
    
    log('\n[V3] Guest search — MBOYO (should be 0 results):');
    await run(conn, 'curl -s "https://heureuxmariage.aenews.net/api/guests/search?q=MBOYO" 2>&1 | head -50');
    
    log('\n[V4] Guest search — CHRIST (should show Couple CHRIST MPEPE):');
    await run(conn, 'curl -s "https://heureuxmariage.aenews.net/api/guests/search?q=CHRIST" 2>&1 | head -100');
    
    log('\n[V5] DB final state (post-restart):');
    await run(conn, dbCheck);

    log('\n=== DEPLOY COMPLETE ===');
    
  } catch (err) {
    log(`✗ FAILED: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    conn.end();
  }
}

main().catch(console.error);
