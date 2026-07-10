// ══════════════════════════════════════════════════════════════════════════════
// EXPORT ENGINE — Mission 5.7.2 Phase 7+8
// ══════════════════════════════════════════════════════════════════════════════
// Produces REAL PNG and PDF files from a CompiledProduct.
// Uses sharp (server-side, no browser) to convert SVG → PNG and SVG → PDF.
// Files are saved to /app/public/exports/ and ExportJob rows track them.
// ══════════════════════════════════════════════════════════════════════════════

import sharp from 'sharp';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import path from 'path';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import type { CanonicalDesignPackage } from './types';
import type { ResolvedBinding, BindingContext } from './mapping-engine';
import { renderSvg } from './svg-renderer';

const EXPORTS_DIR = path.join(process.cwd(), 'public', 'exports');

// ─── Ensure exports directory exists ──────────────────────────────────────────

async function ensureExportsDir(): Promise<void> {
  try {
    await fs.mkdir(EXPORTS_DIR, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

// ─── Fetch QR code as base64 data URI ─────────────────────────────────────────

async function fetchQrDataUri(qrUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(qrUrl);
    if (!res.ok) return undefined;
    const buffer = Buffer.from(await res.arrayBuffer());
    const base64 = buffer.toString('base64');
    return `data:image/png;base64,${base64}`;
  } catch (err) {
    logger.warn('Export: failed to fetch QR code', { qrUrl, err: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}

// ─── Export Result ────────────────────────────────────────────────────────────

export interface ExportResult {
  exportJobId: string;
  pngPath?: string;
  pdfPath?: string;
  pngUrl?: string;
  pdfUrl?: string;
  pngSize?: number;
  pdfSize?: number;
  error?: string;
}

// ─── Export Single Invitation ─────────────────────────────────────────────────

export async function exportInvitation(
  pkg: CanonicalDesignPackage,
  ctx: BindingContext,
  resolved: ResolvedBinding[],
  options: {
    weddingId: string;
    guestId: string;
    collectionId: string;
    formats: ('PNG' | 'PDF')[];
    userId: string;
  },
): Promise<ExportResult> {
  await ensureExportsDir();

  // 1. Create ExportJob
  const exportJob = await db.exportJob.create({
    data: {
      weddingId: options.weddingId,
      collectionId: options.collectionId,
      batchType: 'PNG_PDF_INVITATIONS',
      status: 'PROCESSING',
      totalItems: options.formats.length,
      completedItems: 0,
      startedAt: new Date(),
    },
  });

  try {
    // 2. Fetch QR code data URI (server-side fetch from the real QR API)
    const qrUrl = resolved.find((r) => r.semanticRole === 'invitation.qrCode')?.value;
    const qrDataUri = qrUrl ? await fetchQrDataUri(qrUrl) : undefined;

    // 3. Render SVG from the DesignNode tree (true master-driven rendering)
    const svg = renderSvg(pkg, resolved, qrDataUri);
    const svgBuffer = Buffer.from(svg, 'utf-8');

    // 4. Generate a unique filename
    const hash = createHash('sha256')
      .update(`${options.weddingId}:${options.guestId}:${pkg.source.sourceHash}`)
      .digest('hex')
      .slice(0, 16);
    const timestamp = Date.now();

    const result: ExportResult = { exportJobId: exportJob.id };
    let completed = 0;

    // 5. Produce PNG via sharp
    if (options.formats.includes('PNG')) {
      const pngFilename = `invitation-${hash}-${timestamp}.png`;
      const pngPath = path.join(EXPORTS_DIR, pngFilename);
      const pngUrl = `/exports/${pngFilename}`;

      await sharp(svgBuffer, { density: 300 })
        .png()
        .toFile(pngPath);

      const stats = await fs.stat(pngPath);
      result.pngPath = pngPath;
      result.pngUrl = pngUrl;
      result.pngSize = stats.size;
      completed++;
    }

    // 6. Produce PDF via sharp (SVG → PDF)
    if (options.formats.includes('PDF')) {
      const pdfFilename = `invitation-${hash}-${timestamp}.pdf`;
      const pdfPath = path.join(EXPORTS_DIR, pdfFilename);
      const pdfUrl = `/exports/${pdfFilename}`;

      // Mission 5.7.2: use jsPDF to create PDF with embedded PNG
      let pngBufferForPdf: Buffer;
      if (result.pngPath) {
        pngBufferForPdf = await fs.readFile(result.pngPath);
      } else {
        pngBufferForPdf = await sharp(svgBuffer, { density: 300 }).png().toBuffer();
      }
      const { default: jsPDF } = await import('jspdf');
      const frame = pkg.document.pages[0]?.frames[0];
      const pdfW = frame ? frame.width * 0.264583 : 148;
      const pdfH = frame ? frame.height * 0.264583 : 210;
      const doc = new jsPDF({ orientation: pdfW > pdfH ? 'landscape' : 'portrait', unit: 'mm', format: [pdfW, pdfH] });
      doc.addImage(pngBufferForPdf, 'PNG', 0, 0, pdfW, pdfH);
      const fsSync = await import('fs');
      fsSync.writeFileSync(pdfPath, Buffer.from(doc.output('arraybuffer')));

      const stats = await fs.stat(pdfPath);
      result.pdfPath = pdfPath;
      result.pdfUrl = pdfUrl;
      result.pdfSize = stats.size;
      completed++;
    }

    // 7. Update ExportJob
    await db.exportJob.update({
      where: { id: exportJob.id },
      data: {
        status: 'COMPLETED',
        completedItems: completed,
        outputUrls: JSON.stringify({
          png: result.pngUrl,
          pdf: result.pdfUrl,
          pngSize: result.pngSize,
          pdfSize: result.pdfSize,
        }),
        completedAt: new Date(),
      },
    });

    logger.info('Export: invitation exported successfully', {
      exportJobId: exportJob.id,
      weddingId: options.weddingId,
      guestId: options.guestId,
      pngSize: result.pngSize,
      pdfSize: result.pdfSize,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Export: failed', { exportJobId: exportJob.id, errMessage: message });

    await db.exportJob.update({
      where: { id: exportJob.id },
      data: {
        status: 'FAILED',
        lastError: message,
        completedAt: new Date(),
      },
    });

    return { exportJobId: exportJob.id, error: message };
  }
}

// ─── Batch Export ─────────────────────────────────────────────────────────────

export interface BatchExportResult {
  exportJobId: string;
  totalGuests: number;
  completed: number;
  failed: number;
  outputs: Array<{
    guestId: string;
    guestName: string;
    pngUrl?: string;
    pdfUrl?: string;
    error?: string;
  }>;
}

export async function batchExportInvitations(
  pkg: CanonicalDesignPackage,
  options: {
    weddingId: string;
    collectionId: string;
    guestIds: string[];
    formats: ('PNG' | 'PDF')[];
    userId: string;
  },
): Promise<BatchExportResult> {
  const { buildBindingContext } = await import('./mapping-engine');
  const { resolveBindings } = await import('./mapping-engine');
  const { compileProduct } = await import('./product-compiler');

  // Create a single ExportJob for the batch
  const exportJob = await db.exportJob.create({
    data: {
      weddingId: options.weddingId,
      collectionId: options.collectionId,
      batchType: 'BATCH_PNG_PDF_INVITATIONS',
      status: 'PROCESSING',
      totalItems: options.guestIds.length,
      completedItems: 0,
      startedAt: new Date(),
    },
  });

  const outputs: BatchExportResult['outputs'] = [];
  let completed = 0;
  let failed = 0;

  for (const guestId of options.guestIds) {
    try {
      const ctx = await buildBindingContext(options.weddingId, guestId);
      const resolved = resolveBindings(pkg.bindings, ctx);
      const product = compileProduct(pkg, ctx, 'DIGITAL_INVITATION', 'PNG');

      const singleResult = await exportInvitation(pkg, ctx, resolved, {
        weddingId: options.weddingId,
        guestId,
        collectionId: options.collectionId,
        formats: options.formats,
        userId: options.userId,
      });

      outputs.push({
        guestId,
        guestName: ctx.guest?.displayName || ctx.guest?.firstName || 'Unknown',
        pngUrl: singleResult.pngUrl,
        pdfUrl: singleResult.pdfUrl,
        error: singleResult.error,
      });

      if (singleResult.error) {
        failed++;
      } else {
        completed++;
      }

      // Update batch progress
      await db.exportJob.update({
        where: { id: exportJob.id },
        data: { completedItems: completed + failed },
      });
    } catch (error) {
      failed++;
      outputs.push({
        guestId,
        guestName: 'Unknown',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Finalize batch job
  await db.exportJob.update({
    where: { id: exportJob.id },
    data: {
      status: failed === 0 ? 'COMPLETED' : (completed > 0 ? 'COMPLETED' : 'FAILED'),
      completedItems: completed,
      completedAt: new Date(),
      outputUrls: JSON.stringify(outputs),
    },
  });

  logger.info('Batch export completed', {
    exportJobId: exportJob.id,
    total: options.guestIds.length,
    completed,
    failed,
  });

  return {
    exportJobId: exportJob.id,
    totalGuests: options.guestIds.length,
    completed,
    failed,
    outputs,
  };
}
