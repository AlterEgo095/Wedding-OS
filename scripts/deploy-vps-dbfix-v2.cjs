/**
 * DB Direct Fix — run inside the now-running wedding-app container.
 * No image rebuild needed for DB changes.
 * 
 * Uses a clean JS file uploaded to avoid shell escaping issues.
 */
const { Client } = require('ssh2');
const fs = require('fs');

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
        if (stdout.trim()) log(`  out: ${stdout.trim()}`);
        if (stderr.trim()) log(`  err: ${stderr.trim().slice(0, 800)}`);
        log(`  exit: ${code}`);
        resolve({ stdout, stderr, code });
      });
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
    });
  });
}

const DB_FIX_SCRIPT = `const Database = require('better-sqlite3');
const db = new Database('/app/db/custom.db');
console.log('=== DB FIX START ===');

// 1. Inspect MBOYO guests
const before = db.prepare("SELECT id, firstName, lastName, displayName, invitationType FROM Guest WHERE lastName LIKE '%MBOYO%' OR displayName LIKE '%MBOYO%'").all();
console.log('BEFORE - MBOYO guests:', JSON.stringify(before, null, 2));

// 2. Update MBOYO -> CHRIST MPEPE
if (before.length > 0) {
  const update = db.prepare("UPDATE Guest SET lastName = ?, displayName = ? WHERE id = ?");
  for (const g of before) {
    const newLastName = 'CHRIST MPEPE';
    let newDisplayName;
    if (g.invitationType === 'couple') {
      newDisplayName = 'Couple CHRIST MPEPE';
    } else {
      newDisplayName = (g.firstName || '') + ' CHRIST MPEPE';
    }
    update.run(newLastName, newDisplayName, g.id);
    console.log('Updated guest ' + g.id + ': lastName=' + newLastName + ', displayName=' + newDisplayName);
  }
  console.log('Updated ' + before.length + ' guest(s)');
} else {
  console.log('No MBOYO guests found - already fixed or never existed');
}

// 3. Check + fix venue_time + wedding_time
const settings = db.prepare("SELECT key, value FROM Settings WHERE key IN ('venue_time', 'wedding_time')").all();
console.log('Current time settings:', JSON.stringify(settings, null, 2));

const fixTime = db.prepare("UPDATE Settings SET value = ?, updatedAt = datetime('now') WHERE key = ?");

const venueTime = settings.find(s => s.key === 'venue_time');
if (!venueTime) {
  const exists = db.prepare("SELECT COUNT(*) as c FROM Settings WHERE key = 'venue_time'").get();
  if (exists.c === 0) {
    db.prepare("INSERT INTO Settings (id, key, value, createdAt, updatedAt) VALUES (lower(hex(randomblob(8))), 'venue_time', '21H30', datetime('now'), datetime('now'))").run();
    console.log('Inserted venue_time = 21H30');
  } else {
    fixTime.run('21H30', 'venue_time');
    console.log('Fixed venue_time -> 21H30');
  }
} else if (venueTime.value !== '21H30') {
  fixTime.run('21H30', 'venue_time');
  console.log('Fixed venue_time: ' + venueTime.value + ' -> 21H30');
} else {
  console.log('venue_time already correct (21H30)');
}

const weddingTime = settings.find(s => s.key === 'wedding_time');
if (!weddingTime) {
  const exists = db.prepare("SELECT COUNT(*) as c FROM Settings WHERE key = 'wedding_time'").get();
  if (exists.c === 0) {
    db.prepare("INSERT INTO Settings (id, key, value, createdAt, updatedAt) VALUES (lower(hex(randomblob(8))), 'wedding_time', '21:30', datetime('now'), datetime('now'))").run();
    console.log('Inserted wedding_time = 21:30');
  } else {
    fixTime.run('21:30', 'wedding_time');
    console.log('Fixed wedding_time -> 21:30');
  }
} else if (weddingTime.value !== '21:30') {
  fixTime.run('21:30', 'wedding_time');
  console.log('Fixed wedding_time: ' + weddingTime.value + ' -> 21:30');
} else {
  console.log('wedding_time already correct (21:30)');
}

// 4. Verify
const after = db.prepare("SELECT id, firstName, lastName, displayName, invitationType FROM Guest WHERE lastName LIKE '%MBOYO%' OR displayName LIKE '%MBOYO%'").all();
console.log('AFTER - MBOYO guests (should be empty):', JSON.stringify(after, null, 2));

const christGuests = db.prepare("SELECT id, firstName, lastName, displayName, invitationType FROM Guest WHERE lastName LIKE '%CHRIST MPEPE%' OR displayName LIKE '%CHRIST MPEPE%'").all();
console.log('AFTER - CHRIST MPEPE guests:', JSON.stringify(christGuests, null, 2));

const finalTimes = db.prepare("SELECT key, value FROM Settings WHERE key IN ('venue_time', 'wedding_time')").all();
console.log('FINAL time settings:', JSON.stringify(finalTimes, null, 2));

console.log('=== DB FIX END ===');
db.close();
`;

async function main() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    conn.connect(VPS_CONFIG);
  });
  log('✓ SSH connected');

  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => err ? reject(err) : resolve(sftp));
  });

  try {
    // 1. Verify container is up
    log('\n[1] Verify wedding-app is running:');
    await run(conn, 'docker ps --filter "name=wedding-app" --format "{{.Names}}\\t{{.Status}}"');

    // 2. Upload the DB fix script
    log('\n[2] Upload DB fix script:');
    fs.writeFileSync('/tmp/db-fix-v2.js', DB_FIX_SCRIPT);
    await new Promise((resolve, reject) => {
      sftp.fastPut('/tmp/db-fix-v2.js', '/tmp/db-fix-v2.js', (err) => err ? reject(err) : resolve());
    });
    log('  ✓ Uploaded to /tmp/db-fix-v2.js on VPS');

    // 3. Copy into container + run
    log('\n[3] Copy into container + execute:');
    await run(conn, 'docker cp /tmp/db-fix-v2.js wedding-app:/app/db-fix-v2.js');
    const fixResult = await run(conn, 'docker exec wedding-app node /app/db-fix-v2.js 2>&1');
    log(`Fix exit: ${fixResult.code}`);

    // 4. Cleanup
    log('\n[4] Cleanup:');
    await run(conn, 'docker exec wedding-app rm /app/db-fix-v2.js 2>&1');
    await run(conn, 'rm /tmp/db-fix-v2.js 2>&1');

    // 5. Verify via public API
    log('\n[5] Verify via public API:');
    log('\n[V1] Settings — venue_time + wedding_time:');
    await run(conn, 'curl -s https://heureuxmariage.aenews.net/api/settings 2>&1 | grep -oE "\\\\"venue_time\\\\":\\\\"[^\\\\"]+\\\\"" 2>&1 || curl -s https://heureuxmariage.aenews.net/api/settings 2>&1 | head -200');
    await run(conn, 'curl -s https://heureuxmariage.aenews.net/api/settings 2>&1 | grep -oE "\\\\"wedding_time\\\\":\\\\"[^\\\\"]+\\\\"" 2>&1');

    log('\n[V2] Search MBOYO (expect 0 results):');
    await run(conn, 'curl -s "https://heureuxmariage.aenews.net/api/guests/search?q=MBOYO" 2>&1');

    log('\n[V3] Search CHRIST (expect Couple CHRIST MPEPE):');
    await run(conn, 'curl -s "https://heureuxmariage.aenews.net/api/guests/search?q=CHRIST" 2>&1 | head -300');

    log('\n=== DB FIX DEPLOY COMPLETE ===');

  } catch (err) {
    log(`✗ FAILED: ${err.message}`);
    process.exit(1);
  } finally {
    sftp.end();
    conn.end();
  }
}

main().catch(console.error);
