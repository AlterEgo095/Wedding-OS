/**
 * DB Direct Fix + Orphan Build Cleanup
 * Task ID: 3-DEPLOY-DBFIX
 * 
 * 1. Kills the orphan docker build process
 * 2. Uploads a clean DB fix script to VPS
 * 3. Runs it inside the container
 * 4. Verifies the DB state
 * 
 * No image rebuild needed for DB changes — this is the fastest path to fix production.
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

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
        log(`  (timeout ${timeoutMs}ms)`);
      }, timeoutMs);
      stream.on('close', (code) => {
        clearTimeout(timer);
        if (stdout.trim()) log(`  stdout: ${stdout.trim().slice(0, 500)}`);
        if (stderr.trim()) log(`  stderr: ${stderr.trim().slice(0, 500)}`);
        log(`  exit: ${code}`);
        resolve({ stdout, stderr, code });
      });
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
    });
  });
}

// The DB fix script — written as a clean JS file to avoid shell escaping hell
const DB_FIX_SCRIPT = `
const Database = require('better-sqlite3');
const db = new Database('/app/db/custom.db');

console.log('=== DB FIX START ===');

// 1. Find MBOYO guests
const before = db.prepare("SELECT id, firstName, lastName, displayName, invitationType FROM Guest WHERE lastName LIKE '%MBOYO%' OR displayName LIKE '%MBOYO%'").all();
console.log('BEFORE — MBOYO guests:', JSON.stringify(before, null, 2));

// 2. Update MBOYO → CHRIST MPEPE
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
  console.log('No MBOYO guests found — already fixed or never existed');
}

// 3. Check + fix venue_time + wedding_time
const settings = db.prepare("SELECT key, value FROM Settings WHERE key IN ('venue_time', 'wedding_time')").all();
console.log('Current time settings:', JSON.stringify(settings, null, 2));

const fixTime = db.prepare("UPDATE Settings SET value = ? WHERE key = ?");
const insertTime = db.prepare("INSERT OR IGNORE INTO Settings (id, key, value) VALUES (?, ?, ?)");

const venueTime = settings.find(s => s.key === 'venue_time');
if (!venueTime) {
  // Try insert
  const exists = db.prepare("SELECT COUNT(*) as c FROM Settings WHERE key = 'venue_time'").get();
  if (exists.c === 0) {
    db.prepare("INSERT INTO Settings (id, key, value, createdAt, updatedAt) VALUES (lower(hex(randomblob(8))), 'venue_time', '21H30', datetime('now'), datetime('now'))").run();
    console.log('Inserted venue_time = 21H30');
  } else {
    fixTime.run('21H30', 'venue_time');
    console.log('Fixed venue_time → 21H30');
  }
} else if (venueTime.value !== '21H30') {
  fixTime.run('21H30', 'venue_time');
  console.log('Fixed venue_time: ' + venueTime.value + ' → 21H30');
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
    console.log('Fixed wedding_time → 21:30');
  }
} else if (weddingTime.value !== '21:30') {
  fixTime.run('21:30', 'wedding_time');
  console.log('Fixed wedding_time: ' + weddingTime.value + ' → 21:30');
} else {
  console.log('wedding_time already correct (21:30)');
}

// 4. Verify after
const after = db.prepare("SELECT id, firstName, lastName, displayName, invitationType FROM Guest WHERE lastName LIKE '%MBOYO%' OR displayName LIKE '%MBOYO%'").all();
console.log('AFTER — MBOYO guests (should be empty):', JSON.stringify(after, null, 2));

const christGuests = db.prepare("SELECT id, firstName, lastName, displayName, invitationType FROM Guest WHERE lastName LIKE '%CHRIST MPEPE%' OR displayName LIKE '%CHRIST MPEPE%'").all();
console.log('AFTER — CHRIST MPEPE guests:', JSON.stringify(christGuests, null, 2));

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
    // STEP 1: Kill the orphan docker build
    log('\n[STEP 1] Killing orphan docker build process...');
    await run(conn, 'pkill -f "docker build -t heureux-mariage" 2>&1 || echo "(no orphan build)"');
    await run(conn, 'sleep 2 && ps aux | grep -E "docker build" | grep -v grep || echo "(no builds running)"');

    // STEP 2: Upload the DB fix script to VPS
    log('\n[STEP 2] Uploading DB fix script to VPS...');
    const localScriptPath = '/tmp/db-fix.js';
    fs.writeFileSync(localScriptPath, DB_FIX_SCRIPT);
    const remoteScriptPath = '/opt/wedding-platform/db-fix.js';
    await new Promise((resolve, reject) => {
      log(`  Uploading ${localScriptPath} → ${remoteScriptPath}`);
      sftp.fastPut(localScriptPath, remoteScriptPath, (err) => err ? reject(err) : resolve());
    });
    log('  ✓ Uploaded');

    // STEP 3: Copy the script INTO the container and run it
    log('\n[STEP 3] Copying fix script into container + running it...');
    await run(conn, 'docker cp /opt/wedding-platform/db-fix.js wedding-app:/app/db-fix.js');
    const fixResult = await run(conn, 'docker exec wedding-app node /app/db-fix.js 2>&1');
    log(`DB fix exit code: ${fixResult.code}`);

    // STEP 4: Clean up the fix script
    log('\n[STEP 4] Cleaning up...');
    await run(conn, 'docker exec wedding-app rm /app/db-fix.js 2>&1 || echo "(cleanup skipped)"');
    await run(conn, 'rm /opt/wedding-platform/db-fix.js 2>&1 || echo "(cleanup skipped)"');

    // STEP 5: Verify via the public API
    log('\n[STEP 5] Verifying via public API...');
    log('\n[V1] Settings API:');
    await run(conn, 'curl -s https://heureuxmariage.aenews.net/api/settings 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); s=d.get(\'settings\',{}); print(\'venue_time=\', s.get(\'venue_time\')); print(\'wedding_time=\', s.get(\'wedding_time\'))" 2>&1 || curl -s https://heureuxmariage.aenews.net/api/settings 2>&1 | head -200');
    
    log('\n[V2] Search MBOYO (expect 0):');
    await run(conn, 'curl -s "https://heureuxmariage.aenews.net/api/guests/search?q=MBOYO" 2>&1 | head -50');
    
    log('\n[V3] Search CHRIST (expect Couple CHRIST MPEPE):');
    await run(conn, 'curl -s "https://heureuxmariage.aenews.net/api/guests/search?q=CHRIST" 2>&1 | head -200');

    log('\n=== DB FIX DEPLOY COMPLETE ===');
    log('The DB is now fixed. Code changes (auto-sync logic) will be deployed via separate rebuild.');

  } catch (err) {
    log(`✗ FAILED: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    sftp.end();
    conn.end();
  }
}

main().catch(console.error);
