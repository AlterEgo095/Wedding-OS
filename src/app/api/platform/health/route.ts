export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { withSecurityHeaders } from '@/lib/rate-limit';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

/**
 * Platform System Health — read-only snapshot.
 *
 * GET /api/platform/health
 *
 * Returns a `SystemHealth` JSON object aggregating:
 *   - Node.js runtime info (version, platform, arch, uptime)
 *   - CPU load average + approximate usage %
 *   - Process memory (rss/heap/external/arrayBuffers) + system memory
 *     (total/free/used%)
 *   - Storage: recursive walk of `public/uploads/` (file count + bytes) +
 *     stat of the SQLite DB file at `db/custom.db`
 *   - Database: provider + row counts for weddings/users/guests/auditLogs +
 *     last audit log timestamp
 *   - Services: devServer (NODE_ENV !== 'production') + docker
 *     (/.dockerenv existence)
 *   - Alerts: threshold-based info/warn/critical messages
 *
 * This endpoint is STRICTLY READ-ONLY. It does NOT modify any backend state,
 * write to the DB, or create any audit log entry — it is safe to poll from
 * the Observability section every 30s.
 *
 * Auth: PLATFORM_ADMIN only (requirePlatformAdmin).
 */

const PROJECT_ROOT = process.cwd();
const UPLOADS_DIR = path.join(PROJECT_ROOT, 'public', 'uploads');
const DB_FILE = path.join(PROJECT_ROOT, 'db', 'custom.db');

const MB = 1024 * 1024;

/**
 * Recursively walk a directory and return { files, bytes }.
 * Returns { files: 0, bytes: 0 } if the directory does not exist.
 *
 * Synchronous on purpose: this is a one-shot scan of a typically-small
 * uploads directory (~hundreds of files). A streaming/async walk would
 * add complexity without measurable benefit at this scale.
 */
function walkDir(dir: string): { files: number; bytes: number } {
  if (!fs.existsSync(dir)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      // Permission error or vanished entry — skip silently.
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        // Skip symlinks to avoid infinite loops.
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          files += 1;
          bytes += stat.size;
        } catch {
          // Stat failed (vanished race) — skip.
        }
      }
    }
  }
  return { files, bytes };
}

function statFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    // ─── Runtime ───────────────────────────────────────────────────────────
    const mem = process.memoryUsage();
    const systemTotal = os.totalmem();
    const systemFree = os.freemem();
    const systemUsed = systemTotal - systemFree;
    const systemUsedPercent =
      systemTotal > 0 ? (systemUsed / systemTotal) * 100 : 0;

    const cores = os.cpus().length;
    const loadAverage = os.loadavg(); // [1m, 5m, 15m]
    // Approximate CPU %: 1-min load average divided by core count, capped.
    const usagePercent =
      cores > 0 ? Math.min(100, (loadAverage[0] / cores) * 100) : 0;

    const heapRatio =
      mem.heapTotal > 0 ? mem.heapUsed / mem.heapTotal : 0;

    // ─── Storage ───────────────────────────────────────────────────────────
    const uploads = walkDir(UPLOADS_DIR);
    const dbBytes = statFileSize(DB_FILE);

    // ─── Database stats (parallel, read-only) ──────────────────────────────
    const [weddings, users, guests, auditLogs, lastAudit] = await Promise.all([
      db.wedding.count(),
      db.adminUser.count(),
      db.guest.count(),
      db.auditLog.count(),
      db.auditLog.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    // ─── Alerts ────────────────────────────────────────────────────────────
    const alerts: Array<{
      level: 'info' | 'warn' | 'critical';
      code: string;
      message: string;
    }> = [];

    if (systemUsedPercent > 90) {
      alerts.push({
        level: 'critical',
        code: 'SYSTEM_MEMORY_CRITICAL',
        message: `Mémoire système saturée — ${systemUsedPercent.toFixed(1)}% utilisée`,
      });
    } else if (systemUsedPercent > 75) {
      alerts.push({
        level: 'warn',
        code: 'SYSTEM_MEMORY_HIGH',
        message: `Mémoire système élevée — ${systemUsedPercent.toFixed(1)}% utilisée`,
      });
    }

    if (heapRatio > 0.95) {
      alerts.push({
        level: 'critical',
        code: 'HEAP_PRESSURE',
        message: `Tas V8 saturé — ${(heapRatio * 100).toFixed(1)}% de la capacité allouée`,
      });
    }

    if (dbBytes > 500 * 1024 * 1024) {
      alerts.push({
        level: 'warn',
        code: 'DB_SIZE_LARGE',
        message: `Base de données volumineuse — ${(dbBytes / MB).toFixed(1)} MB`,
      });
    }

    if (uploads.files > 10000) {
      alerts.push({
        level: 'warn',
        code: 'UPLOADS_FILE_COUNT_HIGH',
        message: `Nombre élevé de fichiers média — ${uploads.files} fichiers`,
      });
    }

    // Always present info banner — confirms the observability loop is alive.
    alerts.push({
      level: 'info',
      code: 'SYSTEM_OK',
      message: 'Command Center opérationnel',
    });

    const health = {
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      cpu: {
        loadAverage,
        cores,
        usagePercent: Math.round(usagePercent * 10) / 10,
      },
      memory: {
        rssMb: Math.round((mem.rss / MB) * 100) / 100,
        heapUsedMb: Math.round((mem.heapUsed / MB) * 100) / 100,
        heapTotalMb: Math.round((mem.heapTotal / MB) * 100) / 100,
        externalMb: Math.round((mem.external / MB) * 100) / 100,
        arrayBuffersMb: Math.round((mem.arrayBuffers / MB) * 100) / 100,
        systemTotalMb: Math.round((systemTotal / MB) * 100) / 100,
        systemFreeMb: Math.round((systemFree / MB) * 100) / 100,
        systemUsedPercent: Math.round(systemUsedPercent * 10) / 10,
      },
      storage: {
        uploadsPath: UPLOADS_DIR,
        uploadsBytes: uploads.bytes,
        uploadsFiles: uploads.files,
        dbPath: DB_FILE,
        dbBytes,
      },
      database: {
        provider: 'sqlite',
        weddings,
        users,
        guests,
        auditLogs,
        lastAuditAt: lastAudit?.createdAt.toISOString() ?? null,
      },
      services: {
        devServer: process.env.NODE_ENV !== 'production',
        docker: fs.existsSync('/.dockerenv'),
      },
      alerts,
    };

    return withSecurityHeaders(NextResponse.json(health));
  } catch (error) {
    logger.error('Platform health error', { err: error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
