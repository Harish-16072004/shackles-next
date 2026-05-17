/**
 * email.service.ts
 * High-level email templates using Resend (primary transport).
 * Templates: payment verification, team created, team locked, individual registration.
 * All user-controlled strings are HTML-escaped before injection.
 */

import { sendEmailHybrid, type InlineAttachment } from '@/lib/email';
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
  shacklesId: string;
  packageType: string;
  eventYear: number;
  qrImageBuffer?: Buffer;
}): Promise<{ success: boolean; error?: string }> {
  const userName = escapeHtml(input.userName);
  const shacklesId = escapeHtml(input.shacklesId);
  const packageLabel = escapeHtml(
    ({ EVENT_ONLY: 'Event Only', WORKSHOP_ONLY: 'Workshop Only', COMBO: 'Combo (Events & Workshops)' } as Record<string, string>)[input.packageType] ?? input.packageType
  );
  const dashboardUrl = `${appUrl}/userDashboard`;

  const qrSection = input.qrImageBuffer
    ? `<div style="margin-top:20px;text-align:center">
         <p style="margin:0 0 8px;font-size:13px;color:#555">Your Event QR Code</p>
         <img src="cid:qrcode" alt="Your QR Code"
              style="display:block;margin:0 auto;width:200px;height:200px;border:1px solid #e0e0e0;border-radius:8px" />
         <p style="margin-top:8px;font-size:11px;color:#999">Show this QR at all stations</p>
       </div>`
    : `<p style="margin-top:16px;font-size:13px;color:#555">
         Your QR code is ready on your dashboard. You'll need it at all stations for kit collection, attendance, and event access.
       </p>`;

  const html = `
    <div style="font-family:sans-serif;padding:24px;max-width:480px;margin:0 auto">
      <h2 style="margin-bottom:8px">Payment Verified ✓</h2>
      <p>Hi <strong>${userName}</strong>, your payment for Shackles Symposium ${input.eventYear} has been verified.</p>

      <div style="margin-top:20px;padding:16px;background:#f5f5f5;border-radius:8px;text-align:center">
        <p style="margin:0 0 6px;font-size:13px;color:#555">Your Shackles ID</p>
        <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:2px;font-family:monospace">${shacklesId}</p>
      </div>

      <p style="margin-top:16px">Package: <strong>${packageLabel}</strong></p>

      ${qrSection}

      <a href="${dashboardUrl}"
         style="display:inline-block;margin-top:16px;padding:10px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px">
        View Dashboard
      </a>

      <p style="margin-top:20px;font-size:12px;color:#888">
        Questions? <a href="mailto:${supportEmail}" style="color:#000">${supportEmail}</a>
      </p>
    </div>`;

  const attachments: InlineAttachment[] = [];
  if (input.qrImageBuffer) {
    attachments.push({
      filename: 'qr-code.png',
      content: input.qrImageBuffer,
      contentType: 'image/png',
      cid: 'qrcode',
    });
  }

  try {
    return await sendEmailHybrid(
      input.userEmail,
      `Payment Verified — Shackles Symposium ${input.eventYear}`,
      html,
      attachments.length > 0 ? attachments : undefined
    );
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
  submissionUrl?: string | null;
  submissionDeadline?: Date | null;
}): Promise<{ success: boolean; error?: string }> {
  const memberName = escapeHtml(input.memberName);
  const teamName = escapeHtml(input.teamName);
  const eventName = escapeHtml(input.eventName);
  const teamCode = escapeHtml(input.teamCode);

  let submissionBlock = '';
  if (input.submissionUrl) {
    const deadlineText = input.submissionDeadline
      ? `by <strong>${input.submissionDeadline.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</strong>`
      : 'as soon as possible';

    submissionBlock = `
      <div style="margin-top:24px;padding:20px;border:1px solid #e0e0e0;border-radius:8px;background:#fefefe">
        <h3 style="margin:0 0 12px;font-size:16px;color:#d32f2f">Next Steps: Submit Your Document</h3>
        <p style="margin:0 0 16px;font-size:14px;color:#333">
          This event requires a document submission. Please ensure you upload your abstract/presentation ${deadlineText}.
        </p>
        <a href="${escapeHtml(input.submissionUrl)}"
           style="display:inline-block;padding:10px 20px;background:#000;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">
          Upload Submission
        </a>
      </div>
    `;
  }

  const html = `
    <div style="font-family:sans-serif;padding:24px;max-width:480px">
      <h2 style="margin-bottom:8px">Team Registration Confirmed ✓</h2>
      <p>Hi <strong>${memberName}</strong>, your team <strong>${teamName}</strong>
         is now locked in for <strong>${eventName}</strong>.</p>
      <p style="margin-top:12px;font-size:13px;color:#555">
        Team Code: <strong style="font-family:monospace;font-size:16px">${teamCode}</strong>
      </p>

      ${submissionBlock}

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