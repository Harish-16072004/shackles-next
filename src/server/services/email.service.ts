/**
 * email.service.ts
 * High-level email templates using Resend (primary transport).
 * Templates: payment verification, team created, team locked, individual registration.
 * All user-controlled strings are HTML-escaped before injection.
 */

import { sendEmailHybrid } from '@/lib/email';
import { safeLogError } from '@/lib/safe-log';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const supportEmail = process.env.SUPPORT_EMAIL || 'support@shackles.com';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Payment Verification ─────────────────────────────────────────────────────

export async function sendPaymentVerificationEmail(input: {
  userEmail: string;
  userName: string;
  packageType: string;
  qrCodeUrl?: string;
  eventYear: number;
}): Promise<{ success: boolean; error?: string }> {
  const userName = escapeHtml(input.userName);
  const packageLabel = escapeHtml(
    ({ EVENT_ONLY: 'Event Only', WORKSHOP_ONLY: 'Workshop Only', COMBO: 'Combo (Events & Workshops)' } as Record<string, string>)[input.packageType] ?? input.packageType
  );

  const qrSection = input.qrCodeUrl
    ? `<p style="margin-top:16px;font-size:13px;color:#555">Your personal QR code:</p>
       <img src="${escapeHtml(input.qrCodeUrl)}" alt="Your QR Code"
            style="display:block;margin-top:8px;width:160px;height:160px" />`
    : '';

  const html = `
    <div style="font-family:sans-serif;padding:24px;max-width:480px">
      <h2 style="margin-bottom:8px">Payment Verified ✓</h2>
      <p>Hi <strong>${userName}</strong>, your payment for Shackles Symposium ${input.eventYear} has been verified.</p>
      <p style="margin-top:8px">Package: <strong>${packageLabel}</strong></p>
      ${qrSection}
      <p style="margin-top:20px;font-size:13px;color:#555">
        Use your QR code at all stations for kit, attendance, and resource access.
      </p>
      <p style="margin-top:20px;font-size:12px;color:#888">
        Questions? <a href="mailto:${supportEmail}" style="color:#000">${supportEmail}</a>
      </p>
    </div>`;

  try {
    return await sendEmailHybrid(input.userEmail, `Payment Verified — Shackles Symposium ${input.eventYear}`, html);
  } catch (err) {
    safeLogError('sendPaymentVerificationEmail error', err, { email: input.userEmail });
    return { success: false, error: 'Failed to send payment verification email' };
  }
}

// ─── Team Created (leader email) ──────────────────────────────────────────────

export async function sendTeamCreatedEmail(input: {
  leaderEmail: string;
  leaderName: string;
  teamName: string;
  eventName: string;
  teamCode: string;
  joinCode: string;
  joinUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const leaderName = escapeHtml(input.leaderName);
  const teamName = escapeHtml(input.teamName);
  const eventName = escapeHtml(input.eventName);
  const teamCode = escapeHtml(input.teamCode);
  const joinUrl = escapeHtml(input.joinUrl);

  const html = `
    <div style="font-family:sans-serif;padding:24px;max-width:480px">
      <h2 style="margin-bottom:8px">Team Created 🎉</h2>
      <p>Hi <strong>${leaderName}</strong>, your team <strong>${teamName}</strong>
         for <strong>${eventName}</strong> has been created!</p>

      <div style="margin-top:20px;padding:16px;background:#f5f5f5;border-radius:8px">
        <p style="margin:0 0 6px;font-size:13px;color:#555">Team Code</p>
        <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:4px;font-family:monospace">${teamCode}</p>
      </div>

      <p style="margin-top:16px;font-size:13px;color:#555">
        Share this code with your teammates, or send them the join link below:
      </p>
      <a href="${joinUrl}"
         style="display:inline-block;margin-top:12px;padding:10px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px">
        Join Link
      </a>

      <p style="margin-top:20px;font-size:13px;color:#555">
        Once all members have joined, lock your team from the event page to finalise registration.
      </p>
      <p style="margin-top:20px;font-size:12px;color:#888">
        Questions? <a href="mailto:${supportEmail}" style="color:#000">${supportEmail}</a>
      </p>
    </div>`;

  try {
    return await sendEmailHybrid(input.leaderEmail, `Team Created: ${input.teamName} — ${input.eventName}`, html);
  } catch (err) {
    safeLogError('sendTeamCreatedEmail error', err, { email: input.leaderEmail });
    return { success: false, error: 'Failed to send team created email' };
  }
}

// ─── Team Locked (all members) ────────────────────────────────────────────────

export async function sendTeamLockedEmail(input: {
  memberEmail: string;
  memberName: string;
  teamName: string;
  eventName: string;
  teamCode: string;
}): Promise<{ success: boolean; error?: string }> {
  const memberName = escapeHtml(input.memberName);
  const teamName = escapeHtml(input.teamName);
  const eventName = escapeHtml(input.eventName);
  const teamCode = escapeHtml(input.teamCode);

  const html = `
    <div style="font-family:sans-serif;padding:24px;max-width:480px">
      <h2 style="margin-bottom:8px">Team Registration Confirmed ✓</h2>
      <p>Hi <strong>${memberName}</strong>, your team <strong>${teamName}</strong>
         is now locked in for <strong>${eventName}</strong>.</p>
      <p style="margin-top:12px;font-size:13px;color:#555">
        Team Code: <strong style="font-family:monospace;font-size:16px">${teamCode}</strong>
      </p>
      <p style="margin-top:20px;font-size:13px;color:#555">See you at the event!</p>
      <p style="margin-top:20px;font-size:12px;color:#888">
        Questions? <a href="mailto:${supportEmail}" style="color:#000">${supportEmail}</a>
      </p>
    </div>`;

  try {
    return await sendEmailHybrid(input.memberEmail, `Registration Confirmed: ${input.eventName} — Shackles`, html);
  } catch (err) {
    safeLogError('sendTeamLockedEmail error', err, { email: input.memberEmail });
    return { success: false, error: 'Failed to send team locked email' };
  }
}

// ─── Individual Event Registration ───────────────────────────────────────────

export async function sendEventRegistrationEmail(input: {
  userEmail: string;
  userName: string;
  eventName: string;
}): Promise<{ success: boolean; error?: string }> {
  const userName = escapeHtml(input.userName);
  const eventName = escapeHtml(input.eventName);

  const html = `
    <div style="font-family:sans-serif;padding:24px;max-width:480px">
      <h2 style="margin-bottom:8px">You're registered! 🎉</h2>
      <p>Hi <strong>${userName}</strong>, you're all set for <strong>${eventName}</strong>.</p>
      <p style="margin-top:16px;font-size:13px;color:#555">
        Thanks for registering. See you at the event!
      </p>
      <p style="margin-top:20px;font-size:12px;color:#888">
        Questions? <a href="mailto:${supportEmail}" style="color:#000">${supportEmail}</a>
      </p>
    </div>`;

  try {
    return await sendEmailHybrid(input.userEmail, `Registered: ${input.eventName} — Shackles Symposium`, html);
  } catch (err) {
    safeLogError('sendEventRegistrationEmail error', err, { email: input.userEmail });
    return { success: false, error: 'Failed to send registration email' };
  }
}