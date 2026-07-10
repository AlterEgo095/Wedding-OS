// ══════════════════════════════════════════════════════════════════════════════
// SVG RENDERER — Mission 5.7.2 Phase 4
// ══════════════════════════════════════════════════════════════════════════════
// Renders a CanonicalDesignPackage + resolved bindings to a self-contained SVG.
// The SVG is the intermediate representation used by the Export Engine to
// produce real PNG and PDF files via sharp.
//
// This renderer walks the DesignNode tree — it does NOT use hardcoded HTML.
// The same renderer will work unchanged when PenpotAdapter replaces the
// GoldenFixtureAdapter.
// ══════════════════════════════════════════════════════════════════════════════

import type { CanonicalDesignPackage, DesignNode, DesignFrame } from './types';
import type { ResolvedBinding } from './mapping-engine';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function styleToSvgAttrs(style: Record<string, string> | undefined): string {
  if (!style) return '';
  const attrs: string[] = [];
  if (style.fill) attrs.push(`fill="${escapeXml(style.fill)}"`);
  if (style.color) attrs.push(`fill="${escapeXml(style.color)}"`);
  if (style.backgroundColor) attrs.push(`fill="${escapeXml(style.backgroundColor)}"`);
  if (style.borderRadius) attrs.push(`rx="${escapeXml(style.borderRadius)}"`);
  if (style.fontFamily) attrs.push(`font-family="${escapeXml(style.fontFamily)}"`);
  if (style.fontSize) attrs.push(`font-size="${escapeXml(style.fontSize)}"`);
  if (style.fontWeight) attrs.push(`font-weight="${escapeXml(style.fontWeight)}"`);
  if (style.textAlign === 'center') attrs.push('text-anchor="middle"');
  if (style.letterSpacing) attrs.push(`letter-spacing="${escapeXml(style.letterSpacing)}"`);
  if (style.textTransform === 'uppercase') attrs.push('text-transform="uppercase"');
  return attrs.join(' ');
}

function renderNodeToSvg(
  node: DesignNode,
  resolvedMap: Map<string, string>,
  qrDataUri?: string,
): string {
  const geo = node.geometry;
  if (!geo) return '';

  // Resolve content
  let content = node.text || '';
  if (node.semanticRole) {
    const resolved = resolvedMap.get(node.semanticRole);
    if (resolved !== undefined) content = resolved;
  }
  // Also substitute {{...}} placeholders
  for (const [role, value] of resolvedMap) {
    content = content.replace(new RegExp(`{{${role}}}`, 'g'), value);
  }

  const attrs = styleToSvgAttrs(node.style);
  const x = geo.x;
  const y = geo.y;
  const w = geo.width;
  const h = geo.height;

  switch (node.type) {
    case 'TEXT':
      // For text, use text-anchor=middle + center x if textAlign=center
      const isCenter = node.style?.textAlign === 'center';
      const textX = isCenter ? x + w / 2 : x;
      const textY = y + h / 2; // approximate vertical center
      const fontSize = node.style?.fontSize || '16px';
      const fontFamily = node.style?.fontFamily || 'Inter';
      const fill = node.style?.color || node.style?.fill || '#000';
      const fontWeight = node.style?.fontWeight || '400';
      return `  <text x="${textX}" y="${textY}" ${isCenter ? 'text-anchor="middle"' : ''} font-family="${escapeXml(fontFamily)}" font-size="${escapeXml(fontSize)}" font-weight="${escapeXml(fontWeight)}" fill="${escapeXml(fill)}" dominant-baseline="middle">${escapeXml(content)}</text>`;

    case 'SHAPE':
      return `  <rect x="${x}" y="${y}" width="${w}" height="${h}" ${attrs} />`;

    case 'QR_CODE':
      // Use the fetched QR data URI if available, otherwise placeholder
      if (qrDataUri) {
        return `  <image x="${x}" y="${y}" width="${w}" height="${h}" href="${qrDataUri}" preserveAspectRatio="xMidYMid meet" />`;
      }
      return `  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#000" />`;

    case 'IMAGE':
      return `  <rect x="${x}" y="${y}" width="${w}" height="${h}" ${attrs} />`;

    case 'GROUP':
    case 'FRAME':
    case 'CONTAINER':
      const children = (node.children || []).map((c) => renderNodeToSvg(c, resolvedMap, qrDataUri)).join('\n');
      return `  <g>\n${children}\n  </g>`;

    default:
      return '';
  }
}

export function renderSvg(
  pkg: CanonicalDesignPackage,
  resolved: ResolvedBinding[],
  qrDataUri?: string,
): string {
  const resolvedMap = new Map<string, string>();
  for (const r of resolved) {
    resolvedMap.set(r.semanticRole, r.value);
  }

  const page = pkg.document.pages[0];
  if (!page) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  const frame = page.frames[0];
  if (!frame) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  const tokens = pkg.document.tokens;
  const bgColor = tokens.colors.background || '#FAF8F5';

  const nodesSvg = frame.nodes.map((n) => renderNodeToSvg(n, resolvedMap, qrDataUri)).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">
  <rect x="0" y="0" width="${frame.width}" height="${frame.height}" fill="${escapeXml(bgColor)}" />
${nodesSvg}
</svg>`;
}
