import nodemailer from 'nodemailer';
import { getRequiredEnv } from '@/lib/env';
import { safeLogError } from '@/lib/safe-log';

const smtpHost = getRequiredEnv('SMTP_HOST');
const smtpPort = Number(getRequiredEnv('SMTP_PORT'));
const smtpSecure = getRequiredEnv('SMTP_SECURE') === 'true';
const smtpUser = getRequiredEnv('SMTP_USER');
const smtpPass = getRequiredEnv('SMTP_PASS');
const appUrl = getRequiredEnv('NEXT_PUBLIC_APP_URL');

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

export const sendResetEmail = async (email: string, token: string) => {
  const resetLink = `${appUrl}/reset-password?token=${token}`;

  // For development, log the link
  if (process.env.NODE_ENV !== 'production') {
    console.log('----------------------------------------');
    console.log(`Reset Password Link for ${email}:`);
    console.log(resetLink);
    console.log('----------------------------------------');
  }

  try {
    /* 
       NOTE: Real email sending requires valid SMTP credentials. 
       If they are missing, this might fail in production but development logging (above) will work.
    */
    await transporter.sendMail({
      from: '"Shackles Symposium" <noreply@shacklessymposium.com>',
      to: email,
      subject: 'Reset Your Password',
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Password Reset Request</h2>
          <p>You requested a password reset for your Shackles Symposium account.</p>
          <p>Click the button below to set a new password:</p>
          <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #000; color: #fff; text-decoration: none; border-radius: 5px;">Reset Password</a>
          <p style="margin-top: 20px; font-size: 12px; color: #666;">This link expires in 15 minutes.</p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    safeLogError("Email send error", error, { email });
    return { success: false, error: "Failed to send email" };
  }
};
