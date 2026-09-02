// ══════════════════════════════════════════════════════════════════════════════
// src/lib/email.ts — P2-UX (Sprint Premium) : transport email SSOT
// ══════════════════════════════════════════════════════════════════════════════
//
// ONE transport for ALL transactional emails of the platform. Extracted from
// password-reset.ts (P1-5) so new consumers (RSVP confirmation, P2-UX) reuse
// the same chain instead of forking a second implementation:
//
//   1. Resend HTTP API   — when RESEND_API_KEY is set (no npm dependency).
//   2. Real SMTP         — when SMTP_HOST/USER/PASSWORD are set AND nodemailer
//                          is installed (lazy require, NOT a dependency).
//   3. Logger stub       — default. Emits a structured, parseable envelope so
//                          the platform operator can forward by hand.
//
// Contract (identical to the P1-5 behaviour, verified in production):
//   - NEVER throws. Returns true when any transport accepted the message
//     (including the log stub — see password-reset rationale), false only if
//     the input is unusable (no recipient).
//   - Callers must NEVER put secrets in `text` unless they accept the
//     operator-log channel (password-reset deliberately does; RSVP does not).
//
// `kind` tags the structured log lines so operators can filter per flow
// (docker logs | grep '"kind":"rsvp-confirmation"').

import { logger } from '@/lib/logger';

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  /** Flow tag for log filtering (e.g. 'password-reset', 'rsvp-confirmation'). */
  kind: string;
  /** Optional extra structured log fields for the operator stub (never sent to providers). */
  logOnly?: Record<string, unknown>;
}

interface NodemailerTransport {
  sendMail(opts: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
}
interface NodemailerModule {
  createTransport(opts: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  }): NodemailerTransport;
}

function buildFrom(): string {
  const fromName = process.env.SMTP_FROM_NAME || 'Heureux Mariage';
  const fromAddr = process.env.SMTP_FROM || 'noreply@heureux-mariage.local';
  return `"${fromName}" <${fromAddr}>`;
}

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  const { to, subject, text, kind } = opts;
  if (!to || !to.includes('@')) {
    logger.warn('sendEmail rejected: unusable recipient', { kind });
    return false;
  }
  const from = buildFrom();

  // ─── 1. Resend HTTP transport (P1-5, sprint P1 — reused verbatim) ────────
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || from,
          to,
          subject,
          text,
        }),
      });
      if (res.ok) {
        logger.info('Email sent via Resend', { kind, to });
        return true;
      }
      logger.error('Resend API rejected the email', { kind, status: res.status });
    } catch (err) {
      logger.error('Resend send failed — trying SMTP fallback', {
        kind,
        errMessage: err instanceof Error ? err.message : String(err),
        errName: err instanceof Error ? err.name : 'Unknown',
      });
    }
  }

  // ─── 2. Real SMTP transport (lazy require — nodemailer NOT a dependency) ─
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const nodemailer = require('nodemailer') as NodemailerModule;
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      });
      await transport.sendMail({ from, to, subject, text });
      logger.info('Email sent via SMTP', { kind, to, from });
      return true;
    } catch (err) {
      logger.error('SMTP send failed — falling back to log stub', {
        kind,
        to,
        errMessage: err instanceof Error ? err.message : String(err),
        errName: err instanceof Error ? err.name : 'Unknown',
      });
    }
  }

  // ─── 3. Logger stub (default path, production-ready operator channel) ────
  logger.info('Email (log stub — no provider configured)', {
    kind,
    emailEnvelope: { from, to, subject },
    ...(opts.logOnly ?? {}),
    bodyPreview: text.slice(0, 120) + '…',
  });
  return true;
}
