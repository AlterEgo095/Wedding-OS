// ══════════════════════════════════════════════════════════════════════════════
// PRODUCT COMPILER — Mission 5.7.1 Phase 6
// ══════════════════════════════════════════════════════════════════════════════
//
// Compiles a CanonicalDesignPackage + BindingContext into a personalized
// product output (PNG/PDF invitation). This is the MASTER_DRIVEN_RENDERER.
//
// The legacy InvitationCard.tsx (522 LOC hardcoded) remains available behind
// LEGACY_INVITATION_RENDERER. The new pipeline is behind
// MASTER_DRIVEN_INVITATION_RENDERER. No replacement until E2E certified.
//
// Pipeline:
//   CanonicalDesignPackage + BindingContext
//   -> resolveBindings (substitute {{event.*}} / {{guest.*}} placeholders)
//   -> renderHTML (produce a self-contained HTML document)
//   -> exportPNG (via puppeteer-like rendering, or client-side html2canvas)
//   -> exportPDF (via jsPDF)
// ══════════════════════════════════════════════════════════════════════════════

import type { CanonicalDesignPackage, DesignNode } from './types';
import {
  resolveBindings,
  validateBindings,
  type BindingContext,
  type ResolvedBinding,
} from './mapping-engine';

// ─── Compiled Product ─────────────────────────────────────────────────────────

export interface CompiledProduct {
  html: string;
  resolvedBindings: ResolvedBinding[];
  validation: {
    valid: boolean;
    totalBindings: number;
    resolvedBindings: number;
    missingRequired: Array<{ semanticRole: string; dataPath: string }>;
  };
  metadata: {
    productType: string;
    format: string;
    collectionId: string;
    weddingId: string;
    guestId?: string;
    sourceHash: string;
    compiledAt: string;
  };
}

// ─── Render a Design Node to HTML ────────────────────────────────────────────

function renderNode(node: DesignNode, resolvedMap: Map<string, string>): string {
  // Resolve the semanticRole to a value from the bindings
  let content = node.text || '';

  // If the node has a semanticRole, substitute the placeholder
  if (node.semanticRole) {
    const resolved = resolvedMap.get(node.semanticRole);
    if (resolved !== undefined) {
      content = resolved;
    }
  }

  // Also substitute {{event.*}} / {{guest.*}} / {{invitation.*}} placeholders
  for (const [role, value] of resolvedMap) {
    const placeholder = `{{${role}}}`;
    content = content.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }

  const styleStr = node.style
    ? Object.entries(node.style)
        .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`)
        .join('; ')
    : '';

  switch (node.type) {
    case 'TEXT':
      return `<div style="${styleStr}">${escapeHtml(content)}</div>`;
    case 'QR_CODE':
      // QR codes are rendered as placeholder images — the real QR URL is
      // resolved from the binding and injected as an <img> tag.
      const qrUrl = resolvedMap.get('invitation.qrCode') || '';
      return `<div style="${styleStr}; display: flex; align-items: center; justify-content: center;">
        ${qrUrl ? `<img src="${escapeHtml(qrUrl)}" alt="QR Code" style="width: 100%; height: 100%; object-fit: contain;" />` : '<span style="color: #999;">QR</span>'}
      </div>`;
    case 'SHAPE':
      return `<div style="${styleStr}"></div>`;
    case 'IMAGE':
      return `<div style="${styleStr}">${node.assetId ? `<img src="${escapeHtml(node.assetId)}" alt="${escapeHtml(node.name)}" />` : ''}</div>`;
    case 'GROUP':
    case 'FRAME':
    case 'CONTAINER':
      const childrenHtml = (node.children || []).map((c) => renderNode(c, resolvedMap)).join('');
      return `<div style="${styleStr}">${childrenHtml}</div>`;
    default:
      return `<div style="${styleStr}">${escapeHtml(content)}</div>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Render Full HTML Document ────────────────────────────────────────────────

function renderHTML(pkg: CanonicalDesignPackage, resolved: ResolvedBinding[]): string {
  const resolvedMap = new Map<string, string>();
  for (const r of resolved) {
    resolvedMap.set(r.semanticRole, r.value);
  }

  const page = pkg.document.pages[0];
  if (!page) return '<!DOCTYPE html><html><body>No pages</body></html>';

  const frame = page.frames[0];
  if (!frame) return '<!DOCTYPE html><html><body>No frames</body></html>';

  const tokens = pkg.document.tokens;
  const bgColor = tokens.colors.background || '#FAF8F5';
  const fontFamily = tokens.typography.body || 'Inter';

  const nodesHtml = frame.nodes.map((n) => renderNode(n, resolvedMap)).join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pkg.name)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontFamily}, system-ui, sans-serif;
      background: ${bgColor};
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .invitation {
      position: relative;
      width: ${frame.width}px;
      height: ${frame.height}px;
      overflow: hidden;
    }
    .invitation > div {
      position: absolute;
    }
  </style>
</head>
<body>
  <div class="invitation">
${nodesHtml}
  </div>
</body>
</html>`;
}

// ─── Compile Product (main function) ──────────────────────────────────────────

export function compileProduct(
  pkg: CanonicalDesignPackage,
  ctx: BindingContext,
  productType: string = 'DIGITAL_INVITATION',
  format: string = 'PNG',
): CompiledProduct {
  // 1. Resolve all bindings
  const resolved = resolveBindings(pkg.bindings, ctx);

  // 2. Validate
  const validation = validateBindings(resolved);

  // 3. Render HTML
  const html = renderHTML(pkg, resolved);

  return {
    html,
    resolvedBindings: resolved,
    validation: {
      valid: validation.valid,
      totalBindings: validation.totalBindings,
      resolvedBindings: validation.resolvedBindings,
      missingRequired: validation.missingRequired,
    },
    metadata: {
      productType,
      format,
      collectionId: '', // filled by caller
      weddingId: ctx.wedding.id,
      guestId: ctx.guest?.id,
      sourceHash: pkg.source.sourceHash,
      compiledAt: new Date().toISOString(),
    },
  };
}
