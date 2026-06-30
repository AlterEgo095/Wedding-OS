/**
 * VPS AUDIT SCRIPT — Phase 3 Deployment Mission
 * Task ID: DEPLOY-AUDIT
 *
 * Comprehensive audit of the production VPS before any deployment.
 * Gathers: Git state, Docker, PM2, Node, Next.js, Prisma, DB, uploads,
 * .env, Nginx, SSL, permissions, volumes, storage, logs.
 *
 * Outputs a structured JSON report saved to /home/z/my-project/deploy-audit-report.json
 * AND prints a human-readable summary.
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

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function runCommand(conn, cmd, opts = {}) {
  return new Promise((resolve) => {
    conn.exec(cmd, opts, (err, stream) => {
      if (err) {
        resolve({ stdout: '', stderr: String(err), code: -1 });
        return;
      }
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => {
        resolve({ stdout, stderr, code: code ?? 0 });
      });
      stream.on('data', (data) => { stdout += data.toString(); });
      stream.stderr.on('data', (data) => { stderr += data.toString(); });
    });
  });
}

async function audit() {
  const report = {
    timestamp: new Date().toISOString(),
    vps: { host: VPS_CONFIG.host, root: REMOTE_ROOT },
    sections: {},
  };

  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', async () => {
      log('SSH connected ✓');

      try {
        // ─── 1. SYSTEM INFO ──────────────────────────────────────────────
        log('Auditing: System info');
        const sysInfo = await runCommand(conn, 'uname -a && echo "---" && cat /etc/os-release | head -5 && echo "---" && uptime && echo "---" && free -h && echo "---" && df -h / && echo "---" && nproc');
        report.sections.system = {
          raw: sysInfo.stdout,
          uptime: (sysInfo.stdout.match(/up\s+([^,]+),/) || [])[1]?.trim(),
          memory: (sysInfo.stdout.match(/Mem\s*:\s*([^\n]+)/) || [])[1]?.trim(),
          disk: (sysInfo.stdout.match(/\/\s+([^\n]+)/) || [])[1]?.trim(),
          cpus: (sysInfo.stdout.split('---').pop() || '').trim(),
        };

        // ─── 2. GIT STATE ────────────────────────────────────────────────
        log('Auditing: Git state');
        const gitBranch = await runCommand(conn, `cd ${REMOTE_ROOT} && git rev-parse --abbrev-ref HEAD 2>&1`);
        const gitCommit = await runCommand(conn, `cd ${REMOTE_ROOT} && git log -1 --format="%H %ci %s" 2>&1`);
        const gitStatus = await runCommand(conn, `cd ${REMOTE_ROOT} && git status --short 2>&1 | head -50`);
        const gitRemotes = await runCommand(conn, `cd ${REMOTE_ROOT} && git remote -v 2>&1`);
        const gitStash = await runCommand(conn, `cd ${REMOTE_ROOT} && git stash list 2>&1`);
        const gitTags = await runCommand(conn, `cd ${REMOTE_ROOT} && git tag --sort=-creatordate 2>&1 | head -10`);
        report.sections.git = {
          branch: gitBranch.stdout.trim(),
          lastCommit: gitCommit.stdout.trim(),
          status: gitStatus.stdout.trim() || '(clean)',
          remotes: gitRemotes.stdout.trim() || '(none)',
          stashes: gitStash.stdout.trim() || '(none)',
          tags: gitTags.stdout.trim() || '(none)',
        };

        // ─── 3. DOCKER STATE ─────────────────────────────────────────────
        log('Auditing: Docker');
        const dockerVersion = await runCommand(conn, 'docker --version 2>&1');
        const dockerComposeVersion = await runCommand(conn, 'docker compose version 2>&1 || docker-compose --version 2>&1');
        const dockerPs = await runCommand(conn, `cd ${REMOTE_ROOT} && docker compose ps 2>&1 || docker-compose ps 2>&1`);
        const dockerImages = await runCommand(conn, `docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}" 2>&1 | head -20`);
        const dockerVolumes = await runCommand(conn, `docker volume ls 2>&1`);
        const dockerNetworks = await runCommand(conn, `docker network ls 2>&1`);
        const dockerDiskUsage = await runCommand(conn, `docker system df 2>&1`);
        report.sections.docker = {
          version: dockerVersion.stdout.trim(),
          composeVersion: dockerComposeVersion.stdout.trim(),
          containers: dockerPs.stdout.trim(),
          images: dockerImages.stdout.trim(),
          volumes: dockerVolumes.stdout.trim(),
          networks: dockerNetworks.stdout.trim(),
          diskUsage: dockerDiskUsage.stdout.trim(),
        };

        // ─── 4. CONTAINER HEALTH (wedding-app) ──────────────────────────
        log('Auditing: Container health');
        const containerStatus = await runCommand(conn, `docker inspect wedding-app --format '{{.State.Status}} | started: {{.State.StartedAt}} | restarts: {{.RestartCount}} | health: {{.State.Health.Status}}' 2>&1`);
        const containerHealth = await runCommand(conn, `docker inspect wedding-app --format '{{range .State.Health.Log}}{{.ExitCode}}:{{.Output}}{{end}}' 2>&1 | tail -c 500`);
        const containerPorts = await runCommand(conn, `docker port wedding-app 2>&1`);
        report.sections.container = {
          status: containerStatus.stdout.trim(),
          healthLog: containerHealth.stdout.trim().slice(-300),
          ports: containerPorts.stdout.trim(),
        };

        // ─── 5. PM2 ──────────────────────────────────────────────────────
        log('Auditing: PM2');
        const pm2List = await runCommand(conn, 'pm2 list 2>&1 || echo "PM2 not installed/running"');
        const pm2Path = await runCommand(conn, 'which pm2 2>&1 || echo "not found"');
        report.sections.pm2 = {
          list: pm2List.stdout.trim(),
          path: pm2Path.stdout.trim(),
        };

        // ─── 6. NODE / NPM / BUN ─────────────────────────────────────────
        log('Auditing: Node/Bun versions');
        const nodeVersion = await runCommand(conn, 'node --version 2>&1');
        const npmVersion = await runCommand(conn, 'npm --version 2>&1');
        const bunVersion = await runCommand(conn, 'bun --version 2>&1 || echo "bun not installed"');
        report.sections.node = {
          node: nodeVersion.stdout.trim(),
          npm: npmVersion.stdout.trim(),
          bun: bunVersion.stdout.trim(),
        };

        // ─── 7. PROJECT FILES ────────────────────────────────────────────
        log('Auditing: Project files');
        const packageJson = await runCommand(conn, `cat ${REMOTE_ROOT}/package.json 2>&1 | head -80`);
        const nextConfig = await runCommand(conn, `cat ${REMOTE_ROOT}/next.config.ts 2>&1 | head -30`);
        const envFile = await runCommand(conn, `cat ${REMOTE_ROOT}/.env 2>&1`);
        const envExists = await runCommand(conn, `ls -la ${REMOTE_ROOT}/.env* 2>&1`);
        const projectListing = await runCommand(conn, `ls -la ${REMOTE_ROOT}/ 2>&1`);
        const srcListing = await runCommand(conn, `ls -la ${REMOTE_ROOT}/src/ 2>&1`);
        const prismaListing = await runCommand(conn, `ls -la ${REMOTE_ROOT}/prisma/ 2>&1`);
        report.sections.project = {
          packageJson: packageJson.stdout,
          nextConfig: nextConfig.stdout,
          envFile: envFile.stdout,
          envFiles: envExists.stdout.trim(),
          rootListing: projectListing.stdout,
          srcListing: srcListing.stdout,
          prismaListing: prismaListing.stdout,
        };

        // ─── 8. PRISMA + DB ──────────────────────────────────────────────
        log('Auditing: Prisma + Database');
        const schemaExists = await runCommand(conn, `ls -la ${REMOTE_ROOT}/prisma/schema.prisma 2>&1`);
        const schemaHead = await runCommand(conn, `head -50 ${REMOTE_ROOT}/prisma/schema.prisma 2>&1`);
        const dbFiles = await runCommand(conn, `find ${REMOTE_ROOT}/db -name "*.db" -o -name "*.sqlite" 2>/dev/null | xargs ls -la 2>&1`);
        const dbInVolume = await runCommand(conn, `docker exec wedding-app sh -c "ls -la /app/db/ 2>&1"`);
        const dbSize = await runCommand(conn, `docker exec wedding-app sh -c "ls -lah /app/db/*.db 2>&1 || ls -lah /app/db/ 2>&1"`);
        const prismaClient = await runCommand(conn, `ls -la ${REMOTE_ROOT}/node_modules/.prisma/client/ 2>&1 | head -10`);
        const migrations = await runCommand(conn, `ls -la ${REMOTE_ROOT}/prisma/migrations/ 2>&1 || echo "No migrations folder"`);
        report.sections.prisma = {
          schemaExists: schemaExists.stdout.trim(),
          schemaHead: schemaHead.stdout,
          dbFiles: dbFiles.stdout.trim(),
          dbInVolume: dbInVolume.stdout.trim(),
          dbSize: dbSize.stdout.trim(),
          prismaClient: prismaClient.stdout.trim(),
          migrations: migrations.stdout.trim(),
        };

        // ─── 9. UPLOADS ──────────────────────────────────────────────────
        log('Auditing: Uploads');
        const uploadsLocal = await runCommand(conn, `ls -la ${REMOTE_ROOT}/public/uploads/ 2>&1 | head -30`);
        const uploadsInVolume = await runCommand(conn, `docker exec wedding-app sh -c "ls -la /app/public/uploads/ 2>&1 | head -30"`);
        const uploadsCount = await runCommand(conn, `docker exec wedding-app sh -c "find /app/public/uploads -type f 2>/dev/null | wc -l"`);
        const uploadsSize = await runCommand(conn, `docker exec wedding-app sh -c "du -sh /app/public/uploads/ 2>/dev/null || echo unknown"`);
        report.sections.uploads = {
          localFs: uploadsLocal.stdout.trim(),
          inVolume: uploadsInVolume.stdout.trim(),
          fileCount: uploadsCount.stdout.trim(),
          totalSize: uploadsSize.stdout.trim(),
        };

        // ─── 10. NGINX ───────────────────────────────────────────────────
        log('Auditing: Nginx');
        const nginxStatus = await runCommand(conn, 'systemctl is-active nginx 2>&1 || service nginx status 2>&1 | head -5');
        const nginxSites = await runCommand(conn, `ls -la /etc/nginx/sites-enabled/ 2>&1`);
        const nginxConf = await runCommand(conn, `cat /etc/nginx/sites-enabled/* 2>&1 | head -80`);
        const nginxTest = await runCommand(conn, 'nginx -t 2>&1');
        report.sections.nginx = {
          status: nginxStatus.stdout.trim(),
          sites: nginxSites.stdout.trim(),
          config: nginxConf.stdout,
          configTest: nginxTest.stdout.trim(),
        };

        // ─── 11. SSL CERTIFICATES ────────────────────────────────────────
        log('Auditing: SSL');
        const certList = await runCommand(conn, `find /etc/letsencrypt/live -maxdepth 2 -type l 2>/dev/null | head -20 || echo "no letsencrypt"`);
        const certExpiry = await runCommand(conn, `find /etc/letsencrypt/live -maxdepth 2 -type l 2>/dev/null -exec sh -c 'for d; do echo "$d:"; openssl x509 -enddate -noout -in "$d/cert.pem" 2>/dev/null; done' _ {} +`);
        const certbotVersion = await runCommand(conn, 'certbot --version 2>&1 || echo "no certbot"');
        report.sections.ssl = {
          certs: certList.stdout.trim(),
          expiry: certExpiry.stdout.trim(),
          certbot: certbotVersion.stdout.trim(),
        };

        // ─── 12. PERMISSIONS ─────────────────────────────────────────────
        log('Auditing: Permissions');
        const ownership = await runCommand(conn, `ls -la ${REMOTE_ROOT}/ | head -20`);
        const idCheck = await runCommand(conn, 'id');
        const sudoCheck = await runCommand(conn, 'sudo -n true 2>&1 && echo "sudo OK" || echo "no passwordless sudo"');
        report.sections.permissions = {
          projectOwnership: ownership.stdout,
          currentUser: idCheck.stdout.trim(),
          sudo: sudoCheck.stdout.trim(),
        };

        // ─── 13. DOCKER VOLUMES ──────────────────────────────────────────
        log('Auditing: Docker volumes');
        const volumesDetail = await runCommand(conn, `docker volume inspect wedding-platform_wedding-db wedding-platform_wedding-uploads wedding-platform_wedding-logs 2>&1`);
        const volumesSize = await runCommand(conn, `du -sh /var/lib/docker/volumes/wedding-platform_* 2>&1`);
        report.sections.volumes = {
          detail: volumesDetail.stdout,
          sizes: volumesSize.stdout.trim(),
        };

        // ─── 14. LOGS ────────────────────────────────────────────────────
        log('Auditing: Logs');
        const appLogs = await runCommand(conn, `docker logs wedding-app --tail 30 2>&1`);
        const nginxAccessTail = await runCommand(conn, `tail -10 /var/log/nginx/access.log 2>&1 || echo "no nginx access log"`);
        const nginxErrorTail = await runCommand(conn, `tail -10 /var/log/nginx/error.log 2>&1 || echo "no nginx error log"`);
        report.sections.logs = {
          appTail: appLogs.stdout,
          nginxAccess: nginxAccessTail.stdout.trim(),
          nginxError: nginxErrorTail.stdout.trim(),
        };

        // ─── 15. HEALTH CHECK (HTTP) ────────────────────────────────────
        log('Auditing: HTTP health');
        const httpLocal = await runCommand(conn, `curl -s -o /dev/null -w "%{http_code} %{time_total}s" http://127.0.0.1:3080/ 2>&1`);
        const httpNginx = await runCommand(conn, `curl -s -o /dev/null -w "%{http_code} %{time_total}s" -H "Host: heureuxmariage.aenews.net" http://127.0.0.1:80/ 2>&1`);
        const httpPublic = await runCommand(conn, `curl -s -o /dev/null -w "%{http_code} %{time_total}s" https://heureuxmariage.aenews.net/ 2>&1 || echo "curl failed"`);
        report.sections.http = {
          directApp: httpLocal.stdout.trim(),
          viaNginx: httpNginx.stdout.trim(),
          publicDomain: httpPublic.stdout.trim(),
        };

        // ─── 16. KEY FILE TIMESTAMPS (compare with local) ───────────────
        log('Auditing: Key file timestamps');
        const keyFiles = [
          'prisma/schema.prisma',
          'src/lib/types.ts',
          'src/lib/auth.ts',
          'src/lib/tenant-context.ts',
          'src/lib/wedding-status.ts',
          'src/lib/plan-limits.ts',
          'src/app/api/platform/weddings/route.ts',
          'src/app/api/platform/weddings/[id]/route.ts',
          'src/app/api/onboarding/publish/route.ts',
          'src/app/api/admin/users/route.ts',
          'src/components/admin/ThemeCustomizer.tsx',
          'src/components/admin/UserManager.tsx',
          'src/components/admin/TimelineManager.tsx',
          'src/app/page.tsx',
          'src/app/layout.tsx',
          'package.json',
          'docker-compose.yml',
          'Dockerfile',
        ];
        const fileTimestamps = [];
        for (const f of keyFiles) {
          const r = await runCommand(conn, `stat -c "%y %s %n" ${REMOTE_ROOT}/${f} 2>&1 || echo "MISSING: ${f}"`);
          fileTimestamps.push({ file: f, info: r.stdout.trim() });
        }
        report.sections.keyFiles = fileTimestamps;

        // ─── 17. CLOUDFLARE / DNS (informational) ───────────────────────
        log('Auditing: DNS');
        const digResult = await runCommand(conn, `dig +short heureuxmariage.aenews.net 2>&1 || nslookup heureuxmariage.aenews.net 2>&1 | tail -5`);
        report.sections.dns = {
          lookup: digResult.stdout.trim(),
        };

        conn.end();
        log('SSH disconnected');

        // Save report
        const reportPath = '/home/z/my-project/deploy-audit-report.json';
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        log(`Report saved to ${reportPath}`);

        resolve(report);
      } catch (err) {
        log(`Audit error: ${err.message}`);
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

audit().then((report) => {
  log('═══════════════════════════════════════════════════════════════════');
  log('VPS AUDIT COMPLETE — SUMMARY');
  log('═══════════════════════════════════════════════════════════════════');
  console.log('\nGIT:');
  console.log('  Branch:', report.sections.git.branch);
  console.log('  Last commit:', report.sections.git.lastCommit);
  console.log('  Status:', report.sections.git.status.slice(0, 200));
  console.log('  Tags:', report.sections.git.tags);
  console.log('\nDOCKER:');
  console.log('  Version:', report.sections.docker.version);
  console.log('  Containers:', report.sections.docker.containers);
  console.log('  Disk usage:', report.sections.docker.diskUsage.split('\n').slice(0, 5).join(' | '));
  console.log('\nCONTAINER:');
  console.log('  Status:', report.sections.container.status);
  console.log('  Ports:', report.sections.container.ports);
  console.log('\nHTTP:');
  console.log('  Direct (3080):', report.sections.http.directApp);
  console.log('  Via Nginx:', report.sections.http.viaNginx);
  console.log('  Public domain:', report.sections.http.publicDomain);
  console.log('\nDB:');
  console.log('  Schema:', report.sections.prisma.schemaExists);
  console.log('  Size:', report.sections.prisma.dbSize);
  console.log('  Migrations:', report.sections.prisma.migrations);
  console.log('\nUPLOADS:');
  console.log('  Count:', report.sections.uploads.fileCount);
  console.log('  Size:', report.sections.uploads.totalSize);
  console.log('\nSSL:');
  console.log('  Certs:', report.sections.ssl.certs);
  console.log('  Expiry:', report.sections.ssl.expiry);
  console.log('\nKEY FILES (vs local):');
  for (const f of report.sections.keyFiles) {
    console.log(`  ${f.file}: ${f.info}`);
  }
  process.exit(0);
}).catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
