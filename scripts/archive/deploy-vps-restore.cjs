/**
 * P0 RESTORE: wedding-app container is gone, production is 502.
 * Restore it using docker compose up -d (uses existing image if build not needed).
 */
const { Client } = require('ssh2');

const VPS_CONFIG = {
  host: '95.111.226.63', port: 22, username: 'aenews',
  password: 'AeNews2025Secure!', readyTimeout: 30000,
};

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function run(conn, cmd, timeoutMs = 120000) {
  return new Promise((resolve) => {
    log(`$ ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) { log(`ERR: ${err.message}`); return resolve({ stdout: '', stderr: err.message, code: -1 }); }
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { try { stream.signal('TERM'); } catch {} }, timeoutMs);
      stream.on('close', (code) => {
        clearTimeout(timer);
        if (stdout.trim()) log(`  out: ${stdout.trim().slice(0, 1500)}`);
        if (stderr.trim()) log(`  err: ${stderr.trim().slice(0, 1500)}`);
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
  log('✓ SSH connected — RESTORING PRODUCTION');

  try {
    // 1. Check if the image still exists
    log('\n[1] Check if wedding-platform-app image still exists:');
    await run(conn, 'docker images | grep -E "wedding-platform|heureux"');

    // 2. Check volumes still exist
    log('\n[2] Check volumes:');
    await run(conn, 'docker volume ls | grep -E "wedding"');

    // 3. Restore via docker compose up -d (NO BUILD, uses existing image)
    log('\n[3] RESTORING: docker compose up -d (no build, uses existing image)...');
    const upResult = await run(conn, 'cd /opt/wedding-platform && docker compose up -d --no-build 2>&1', 120000);
    log(`compose up exit: ${upResult.code}`);

    // 4. Wait for boot
    log('\n[4] Waiting 12s for container to boot...');
    await new Promise(r => setTimeout(r, 12000));

    // 5. Check container state
    log('\n[5] Container state:');
    await run(conn, 'docker ps --filter "name=wedding" --format "{{.Names}}\\t{{.Status}}\\t{{.Ports}}"');

    // 6. Logs
    log('\n[6] Container logs (last 40):');
    await run(conn, 'cd /opt/wedding-platform && docker compose logs app --tail 40 2>&1');

    // 7. Production HTTP
    log('\n[7] Production HTTP status:');
    await run(conn, 'curl -sI https://heureuxmariage.aenews.net/ 2>&1 | head -5');

    // 8. Local port check
    log('\n[8] Local port 3080:');
    await run(conn, 'curl -sI http://127.0.0.1:3080/ 2>&1 | head -5');

    log('\n=== RESTORE ATTEMPT COMPLETE ===');

  } catch (err) {
    log(`✗ FAILED: ${err.message}`);
    process.exit(1);
  } finally {
    conn.end();
  }
}

main().catch(console.error);
