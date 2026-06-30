/**
 * VPS BACKUP + DB INSPECTION SCRIPT — Phase 3 Deployment Mission
 * Task ID: DEPLOY-BACKUP-INSPECT
 *
 * ÉTAPE 2 — Complete backup of all production state to a dated folder.
 * Also inspects the VPS DB schema to determine migration strategy.
 *
 * Backups created ON the VPS at /opt/wedding-backups/YYYY-MM-DD-HHMMSS/
 * DB also downloaded locally for safekeeping.
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const VPS_CONFIG = {
  host: '95.111.226.63',
  port: 22,
  username: 'aenews',
  password: 'AeNews2025Secure!',
  readyTimeout: 60000,
};

const REMOTE_ROOT = '/opt/wedding-platform';
const BACKUP_DIR = `/opt/wedding-backups/${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
const LOCAL_BACKUP_DIR = '/home/z/my-project/vps-backups';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function runCommand(conn, cmd, opts = {}) {
  return new Promise((resolve) => {
    conn.exec(cmd, opts, (err, stream) => {
      if (err) { resolve({ stdout: '', stderr: String(err), code: -1 }); return; }
      let stdout = '', stderr = '';
      stream.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
    });
  });
}

function downloadFile(sftp, remotePath, localPath) {
  return new Promise((resolve, reject) => {
    sftp.fastGet(remotePath, localPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function backupAndInspect() {
  fs.mkdirSync(LOCAL_BACKUP_DIR, { recursive: true });

  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', async () => {
      log('SSH connected ✓');
      const sftp = await new Promise((res, rej) => conn.sftp(res, rej));

      try {
        // ─── 1. CREATE BACKUP DIRECTORY ON VPS ─────────────────────────
        log(`Creating VPS backup directory: ${BACKUP_DIR}`);
        await runCommand(conn, `mkdir -p ${BACKUP_DIR}/{db,uploads,public,config,nginx,ssl,env,prisma,logs}`);

        // ─── 2. BACKUP DATABASE (from inside container) ────────────────
        log('Backing up database...');
        const dbCopyResult = await runCommand(conn, `docker cp wedding-app:/app/db/custom.db ${BACKUP_DIR}/db/custom.db.$(date +%Y%m%d-%H%M%S).bak 2>&1`);
        log(`  DB copy: ${dbCopyResult.stdout.trim() || dbCopyResult.stderr.trim()}`);

        // Also copy any -wal and -shm files (SQLite WAL mode)
        await runCommand(conn, `docker exec wedding-app sh -c "ls -la /app/db/" 2>&1`);
        await runCommand(conn, `docker cp wedding-app:/app/db/. ${BACKUP_DIR}/db/ 2>&1 || echo "db dir copy attempted"`);

        // Download DB locally too
        const localDbPath = path.join(LOCAL_BACKUP_DIR, `vps-custom.db.${Date.now()}.bak`);
        try {
          await downloadFile(sftp, `${BACKUP_DIR}/db/custom.db.${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.bak`, localDbPath);
          // Fallback: try direct docker cp result path
        } catch (e) {
          log(`  Direct download failed, trying alternate path: ${e.message}`);
        }

        // Try downloading directly from container via docker cp to /tmp then sftp
        await runCommand(conn, `docker cp wedding-app:/app/db/custom.db /tmp/vps-db-backup.db 2>&1`);
        const localDbPath2 = path.join(LOCAL_BACKUP_DIR, `vps-custom-${Date.now()}.db`);
        try {
          await downloadFile(sftp, '/tmp/vps-db-backup.db', localDbPath2);
          log(`  ✓ DB downloaded locally: ${localDbPath2} (${fs.statSync(localDbPath2).size} bytes)`);
        } catch (e) {
          log(`  ⚠ Could not download DB locally: ${e.message}`);
        }

        // ─── 3. BACKUP UPLOADS ─────────────────────────────────────────
        log('Backing up uploads...');
        const uploadsBak = await runCommand(conn, `docker cp wedding-app:/app/public/uploads ${BACKUP_DIR}/uploads/ 2>&1 || echo "uploads copy attempted"`);
        log(`  Uploads: ${uploadsBak.stdout.trim() || uploadsBak.stderr.trim()}`);

        // ─── 4. BACKUP PUBLIC FOLDER ───────────────────────────────────
        log('Backing up public folder...');
        await runCommand(conn, `cp -r ${REMOTE_ROOT}/public ${BACKUP_DIR}/public/ 2>&1 || echo "public copy attempted"`);

        // ─── 5. BACKUP .env ────────────────────────────────────────────
        log('Backing up .env...');
        await runCommand(conn, `cp ${REMOTE_ROOT}/.env ${BACKUP_DIR}/env/.env.bak 2>&1 || echo "no .env"`);
        await runCommand(conn, `cp ${REMOTE_ROOT}/.env.production ${BACKUP_DIR}/env/.env.production.bak 2>&1 || echo "no .env.production"`);
        await runCommand(conn, `cp ${REMOTE_ROOT}/.env.example ${BACKUP_DIR}/env/.env.example.bak 2>&1 || echo "no .env.example"`);

        // ─── 6. BACKUP DOCKER COMPOSE + DOCKERFILE ─────────────────────
        log('Backing up Docker config...');
        await runCommand(conn, `cp ${REMOTE_ROOT}/docker-compose.yml ${BACKUP_DIR}/config/ 2>&1`);
        await runCommand(conn, `cp ${REMOTE_ROOT}/docker-compose.prod.yml ${BACKUP_DIR}/config/ 2>&1 || echo "no prod compose"`);
        await runCommand(conn, `cp ${REMOTE_ROOT}/Dockerfile ${BACKUP_DIR}/config/ 2>&1`);
        await runCommand(conn, `cp ${REMOTE_ROOT}/docker-entrypoint.sh ${BACKUP_DIR}/config/ 2>&1 || echo "no entrypoint"`);

        // ─── 7. BACKUP PRISMA SCHEMA ───────────────────────────────────
        log('Backing up Prisma schema...');
        await runCommand(conn, `cp ${REMOTE_ROOT}/prisma/schema.prisma ${BACKUP_DIR}/prisma/schema.prisma.bak 2>&1`);
        await runCommand(conn, `cp -r ${REMOTE_ROOT}/prisma/migrations ${BACKUP_DIR}/prisma/ 2>&1 || echo "no migrations folder"`);

        // ─── 8. BACKUP NGINX CONFIG ────────────────────────────────────
        log('Backing up Nginx config...');
        await runCommand(conn, `cp -r /etc/nginx/sites-enabled ${BACKUP_DIR}/nginx/ 2>&1 || echo "no sites-enabled"`);
        await runCommand(conn, `cp -r /etc/nginx/sites-available ${BACKUP_DIR}/nginx/ 2>&1 || echo "no sites-available"`);
        await runCommand(conn, `cp /etc/nginx/nginx.conf ${BACKUP_DIR}/nginx/ 2>&1 || echo "no nginx.conf"`);

        // ─── 9. BACKUP SSL CERTIFICATES (letsencrypt) ──────────────────
        log('Backing up SSL certs (metadata only — private keys stay on VPS)...');
        await runCommand(conn, `ls -la /etc/letsencrypt/live/ > ${BACKUP_DIR}/ssl/certs-list.txt 2>&1`);
        await runCommand(conn, `certbot certificates 2>&1 > ${BACKUP_DIR}/ssl/certbot-report.txt || echo "certbot not available"`);

        // ─── 10. BACKUP PACKAGE.JSON + LOCK ────────────────────────────
        log('Backing up package.json + lock...');
        await runCommand(conn, `cp ${REMOTE_ROOT}/package.json ${BACKUP_DIR}/config/ 2>&1`);
        await runCommand(conn, `cp ${REMOTE_ROOT}/bun.lock ${BACKUP_DIR}/config/ 2>&1 || echo "no bun.lock"`);
        await runCommand(conn, `cp ${REMOTE_ROOT}/package-lock.json ${BACKUP_DIR}/config/ 2>&1 || echo "no package-lock.json"`);

        // ─── 11. BACKUP CURRENT CONTAINER LOGS ────────────────────────
        log('Backing up container logs...');
        await runCommand(conn, `docker logs wedding-app > ${BACKUP_DIR}/logs/app-stdout.log 2>&1 || echo "log capture attempted"`);

        // ─── 12. INSPECT VPS DB SCHEMA ─────────────────────────────────
        log('Inspecting VPS DB schema...');
        const tables = await runCommand(conn, `docker exec wedding-app sh -c "sqlite3 /app/db/custom.db '.tables'" 2>&1 || echo "sqlite3 not in container"`);
        log(`  Tables: ${tables.stdout.trim()}`);

        // If sqlite3 not in container, try via node + better-sqlite3 (likely in node_modules)
        let schemaInfo = tables;
        if (tables.stdout.includes('not in container') || tables.stdout.includes('No such file')) {
          log('  Trying Prisma client introspection...');
          const prismaInspect = await runCommand(conn, `docker exec wedding-app sh -c "cd /app && node -e \\"const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\\$queryRaw\\\\\\\`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\\\\\\\`.then(r=>{console.log(JSON.stringify(r));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})\\" 2>&1"`);
          log(`  Prisma introspection: ${prismaInspect.stdout.trim()}`);
          schemaInfo = prismaInspect;
        }

        // Get row counts for key tables
        const weddingCount = await runCommand(conn, `docker exec wedding-app sh -c "cd /app && node -e \\"const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.wedding.count(),p.guest.count(),p.table.count(),p.adminUser.count(),p.settings.count(),p.eventTimeline.count()]).then(([w,g,t,a,s,e])=>{console.log(JSON.stringify({weddings:w,guests:g,tables:t,admins:a,settings:s,timeline:e}));process.exit(0)}).catch(e=>{console.error('ERR:',e.message);process.exit(1)})\\" 2>&1"`);
        log(`  Row counts: ${weddingCount.stdout.trim()}`);

        // Check if weddingId column exists on Guest
        const guestSchema = await runCommand(conn, `docker exec wedding-app sh -c "cd /app && node -e \\"const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\\$queryRaw\\\\\\\`PRAGMA table_info(Guest)\\\\\\\`.then(r=>{console.log(JSON.stringify(r.map(c=>c.name)));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})\\" 2>&1"`);
        log(`  Guest columns: ${guestSchema.stdout.trim()}`);

        // ─── 13. VERIFY BACKUP ─────────────────────────────────────────
        log('Verifying backup...');
        const backupListing = await runCommand(conn, `find ${BACKUP_DIR} -type f | head -30 && echo "---" && du -sh ${BACKUP_DIR}`);
        log(`Backup contents:\n${backupListing.stdout}`);

        // ─── 14. CHECK DISK SPACE ──────────────────────────────────────
        const diskSpace = await runCommand(conn, `df -h / | tail -1`);
        log(`Disk space: ${diskSpace.stdout.trim()}`);

        conn.end();
        log('SSH disconnected');

        const summary = {
          backupDir: BACKUP_DIR,
          localBackupDir: LOCAL_BACKUP_DIR,
          localDbPath: localDbPath2,
          dbSchema: {
            tables: schemaInfo.stdout.trim(),
            rowCounts: weddingCount.stdout.trim(),
            guestColumns: guestSchema.stdout.trim(),
          },
          diskSpace: diskSpace.stdout.trim(),
          backupContents: backupListing.stdout,
        };

        const summaryPath = path.join(LOCAL_BACKUP_DIR, `backup-summary-${Date.now()}.json`);
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
        log(`Backup summary saved to ${summaryPath}`);

        resolve(summary);
      } catch (err) {
        log(`Backup error: ${err.message}`);
        conn.end();
        reject(err);
      }
    });

    conn.on('error', (err) => {
      log(`SSH connection error: ${err.message}`);
      reject(err);
    });

    conn.connect(VPS_CONFIG);
  });
}

backupAndInspect().then((s) => {
  log('═══════════════════════════════════════════════════════════════════');
  log('BACKUP + INSPECTION COMPLETE');
  log('═══════════════════════════════════════════════════════════════════');
  console.log('\nBackup directory (VPS):', s.backupDir);
  console.log('Backup directory (local):', s.localBackupDir);
  console.log('Local DB copy:', s.localDbPath);
  console.log('\nDB SCHEMA:');
  console.log('  Tables:', s.dbSchema.tables);
  console.log('  Row counts:', s.dbSchema.rowCounts);
  console.log('  Guest columns:', s.dbSchema.guestColumns);
  console.log('\nDisk space:', s.diskSpace);
  process.exit(0);
}).catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
