import nodemailer from 'nodemailer';
import { safeLogError } from '@/lib/safe-log';

export type InlineAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  cid: string; // Content-ID for inline reference: <img src="cid:xxx">
};

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const resendApiKey = process.env.RESEND_API_KEY;
const smtpHost = process.env.SMTP_HOST || '';
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = process.env.SMTP_SECURE === 'true';
const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';
const fromAddress = process.env.SMTP_FROM || '"Shackles Symposium" <noreply@shacklessymposium.com>';

// Lazy-create transporter only when first needed
let _transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    if (!smtpHost) throw new Error('SMTP_HOST is not configured');
    _transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass },
    });
  }
  return _transporter;
}

async function sendViaResend(to: string, subject: string, html: string, attachments?: InlineAttachment[]): Promise<{ success: boolean; error?: string }> {
  if (!resendApiKey) return { success: false, error: 'Resend API key not configured' };
  try {
    const payload: Record<string, unknown> = {
      from: process.env.RESEND_FROM_EMAIL || 'noreply@shackles.com',
      to,
      subject,
      html,
    };

    if (attachments?.length) {
      payload.attachments = attachments.map((a) => ({
        filename: a.filename,
        content: a.content.toString('base64'),
        content_type: a.contentType,
      }));
      // Resend doesn't support CID natively — convert cid refs to base64 data URIs as fallback
      let processedHtml = html;
      for (const a of attachments) {
        processedHtml = processedHtml.replace(
          new RegExp(`cid:${a.cid}`, 'g'),
          `data:${a.contentType};base64,${a.content.toString('base64')}`
        );
      }
      payload.html = processedHtml;
      delete payload.attachments; // Use data URI instead for Resend
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: JSON.stringify(err) };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function sendViaNodemailer(to: string, subject: string, html: string, attachments?: InlineAttachment[]): Promise<{ success: boolean; error?: string }> {
  try {
    const transport = getTransporter();
    const mailAttachments = attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
      cid: a.cid,
    }));
    await transport.sendMail({ from: fromAddress, to, subject, html, attachments: mailAttachments });
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function sendEmailHybrid(to: string, subject: string, html: string, attachments?: InlineAttachment[]): Promise<{ success: boolean; error?: string }> {
  // In production try Resend first
  if (resendApiKey && process.env.NODE_ENV !== 'development') {
    const result = await sendViaResend(to, subject, html, attachments);
    if (result.success) {
      console.log(`[EMAIL] Sent via Resend to ${to}`);
      return { success: true };
    }
    console.warn(`[EMAIL] Resend failed (${result.error}), falling back to Nodemailer`);
  }
  const result = await sendViaNodemailer(to, subject, html, attachments);
  if (result.success) {
    console.log(`[EMAIL] Sent via Nodemailer to ${to}`);
    return { success: true };
  }
  console.error(`[EMAIL] Both transports failed for ${to}: ${result.error}`);
  return { success: false, error: result.error };
}

// ─── Password Reset ───────────────────────────────────────────────────────────

export async function sendResetEmail(email: string, token: string): Promise<{ success: boolean; error?: string }> {
  const resetLink = `${appUrl}/reset-password?token=${token}`;

  if (process.env.NODE_ENV !== 'production') {
    console.log('--- Reset Link ---');
    console.log(`${email}: ${resetLink}`);
    console.log('-----------------');
  }

  const html = `
    <div style="font-family:sans-serif;padding:24px;max-width:480px">
      <h2 style="margin-bottom:8px">Password Reset</h2>
      <p>You requested a password reset for your Shackles Symposium account.</p>
      <a href="${resetLink}"
         style="display:inline-block;margin-top:16px;padding:10px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px">
        Reset Password
      </a>
      <p style="margin-top:20px;font-size:12px;color:#666">This link expires in 15 minutes.</p>
    </div>`;

  try {
    return await sendEmailHybrid(email, 'Reset Your Password — Shackles Symposium', html);
  } catch (err) {
    safeLogError('sendResetEmail error', err, { email });
    return { success: false, error: 'Failed to send email' };
  }
}

// ─── Team Invite ──────────────────────────────────────────────────────────────

export async function sendTeamInviteEmail(params: {
  toEmail: string;
  leaderName: string;
  eventName: string;
  teamName: string;
  teamCode: string;
  inviteToken: string;
  expiresAt: Date;
}): Promise<{ success: boolean; inviteLink: string; error?: string }> {
  // Clean join link — no event name in URL (avoids encoding issues)
  const inviteLink = `${appUrl}/events?inviteToken=${encodeURIComponent(params.inviteToken)}&teamCode=${encodeURIComponent(params.teamCode)}`;

  if (process.env.NODE_ENV !== 'production') {
    console.log('--- Team Invite Link ---');
    console.log(`${params.toEmail}: ${inviteLink}`);
    console.log('------------------------');
  }

  const html = `
    <div style="font-family:sans-serif;padding:24px;max-width:480px">
      <h2 style="margin-bottom:8px">You're invited to join a team!</h2>
      <p><strong>${params.leaderName}</strong> has invited you to join team
         <strong>${params.teamName}</strong> for <strong>${params.eventName}</strong>.</p>
      <p style="margin-top:12px">
        <span style="font-size:13px;color:#555">Team Code:</span><br>
        <strong style="font-size:20px;letter-spacing:2px;font-family:monospace">${params.teamCode}</strong>
      </p>
      <p style="margin-top:8px;font-size:13px;color:#555">
        Click the button below to open the event page. Log in and the invite will auto-apply.
      </p>
      <a href="${inviteLink}"
         style="display:inline-block;margin-top:16px;padding:10px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px">
        Join Team
      </a>
      <p style="margin-top:20px;font-size:12px;color:#666">
        Invite expires at ${params.expiresAt.toUTCString()}.
      </p>
    </div>`;

  try {
    const result = await sendEmailHybrid(params.toEmail, `Team Invite: ${params.eventName} — Shackles`, html);
    return { ...result, inviteLink };
  } catch (err) {
    safeLogError('sendTeamInviteEmail error', err, { email: params.toEmail });
    return { success: false, error: 'Failed to send invite email', inviteLink };
  }
}

export { sendEmailHybrid };