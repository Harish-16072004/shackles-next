import nodemailer from 'nodemailer';
import { getRequiredEnv } from '@/lib/env';
import { safeLogError } from '@/lib/safe-log';

// Resend API key (optional, for fallback)
const resendApiKey = process.env.RESEND_API_KEY;

// SMTP Configuration for Nodemailer fallback
// We use process.env instead of getRequiredEnv so we can use Ethereal in dev if missing
const smtpHost = process.env.SMTP_HOST || '';
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = process.env.SMTP_SECURE === 'true';
const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

let transporter: nodemailer.Transporter | null = null;

async function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
  return transporter;
}

/**
 * Send email via Resend (primary) or Nodemailer (fallback)
 * Returns success status and which service was used
 */
async function sendViaResend(email: string, subject: string, html: string) {
  if (!resendApiKey) {
    return { success: false, service: null, error: 'Resend API key not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@shackles.com',
        to: email,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, service: 'resend', error: JSON.stringify(error) };
    }

    return { success: true, service: 'resend' };
  } catch (err) {
    return { success: false, service: 'resend', error: String(err) };
  }
}

/**
 * Send email via Nodemailer
 */
async function sendViaNodemailer(email: string, subject: string, html: string) {
  try {
    const tp = await getTransporter();
    const info = await tp.sendMail({
      from: '"Shackles Symposium" <noreply@shacklessymposium.com>',
      to: email,
      subject,
      html,
    });
    
    return { success: true, service: 'nodemailer' };
  } catch (error) {
    return { success: false, service: 'nodemailer', error: String(error) };
  }
}

/**
 * Hybrid send: Try Resend first, fall back to Nodemailer
 */
async function sendEmailHybrid(email: string, subject: string, html: string) {
  // Try Resend first in production if API key exists
  if (resendApiKey && process.env.NODE_ENV !== 'development') {
    const result = await sendViaResend(email, subject, html);
    if (result.success) {
      console.log(`[EMAIL] Sent via ${result.service} to ${email}`);
      return { success: true, service: result.service };
    }
    console.warn(`[EMAIL] Resend failed: ${result.error}, falling back to Nodemailer`);
  }

  // Fall back to Nodemailer (always used in development via Ethereal)
  const result = await sendViaNodemailer(email, subject, html);
  if (result.success) {
    console.log(`[EMAIL] Sent via ${result.service} to ${email}`);
    return { success: true, service: result.service };
  }

  console.error(`[EMAIL] Both Resend and Nodemailer failed for ${email}. Error: ${result.error}`);
  return { success: false, error: result.error };
}

export const sendResetEmail = async (email: string, token: string) => {
  const resetLink = `${appUrl}/reset-password?token=${token}`;

  // For development, log the link
  if (process.env.NODE_ENV !== 'production') {
    console.log('----------------------------------------');
    console.log(`Reset Password Link for ${email}:`);
    console.log(resetLink);
    console.log('----------------------------------------');
  }

  const html = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Password Reset Request</h2>
      <p>You requested a password reset for your Shackles Symposium account.</p>
      <p>Click the button below to set a new password:</p>
      <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #000; color: #fff; text-decoration: none; border-radius: 5px;">Reset Password</a>
      <p style="margin-top: 20px; font-size: 12px; color: #666;">This link expires in 15 minutes.</p>
    </div>
  `;

  try {
    const result = await sendEmailHybrid(email, 'Reset Your Password', html);
    return result.success ? { success: true } : { success: false, error: result.error };
  } catch (error) {
    safeLogError("Email send error", error, { email });
    return { success: false, error: "Failed to send email" };
  }
};

export const sendTeamInviteEmail = async (params: {
  toEmail: string;
  leaderName: string;
  eventName: string;
  teamName: string;
  teamCode: string;
  inviteToken: string;
  expiresAt: Date;
}) => {
  const inviteLink = `${appUrl}/events?inviteToken=${encodeURIComponent(params.inviteToken)}&teamCode=${encodeURIComponent(params.teamCode)}&event=${encodeURIComponent(params.eventName)}`;

  if (process.env.NODE_ENV !== 'production') {
    console.log('----------------------------------------');
    console.log(`Team Invite Link for ${params.toEmail}:`);
    console.log(inviteLink);
    console.log('----------------------------------------');
  }

  const html = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>You're invited to join a team</h2>
      <p><strong>${params.leaderName}</strong> invited you to join team <strong>${params.teamName}</strong> for <strong>${params.eventName}</strong>.</p>
      <p>Team Code: <strong>${params.teamCode}</strong></p>
      <p>Click below, login, then join using this invite:</p>
      <a href="${inviteLink}" style="display: inline-block; padding: 10px 20px; background-color: #000; color: #fff; text-decoration: none; border-radius: 5px;">Open Join Link</a>
      <p style="margin-top: 14px; font-size: 12px; color: #666;">Invite expires at ${params.expiresAt.toUTCString()}.</p>
    </div>
  `;

  try {
    const result = await sendEmailHybrid(params.toEmail, `Team Invite: ${params.eventName}`, html);
    return { success: result.success, inviteLink, error: result.error };
  } catch (error) {
    safeLogError("Team invite email send error", error, { email: params.toEmail, teamCode: params.teamCode });
    return { success: false, error: "Failed to send invite email", inviteLink };
  }
};

/**
 * Export sendEmailHybrid for use in other email functions
 */
export { sendEmailHybrid };
