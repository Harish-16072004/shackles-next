/**
 * Email template: Event Entry Pass / Gate Pass
 * Item #11 — sent individually per participant before the event.
 * QR code is passed as a base64 data URL or a hosted image URL.
 */

export type EntryPassEmailData = {
  participantName: string;
  eventName: string;
  eventDate?: string;
  venue?: string;
  teamName?: string;
  /** URL to the QR image (hosted or base64 data URL) */
  qrImageUrl: string;
  /** Unique QR payload token embedded in the code */
  qrToken: string;
  whatsappGroupUrl?: string;
};

export function buildEntryPassEmail(data: EntryPassEmailData): string {
  const whatsappBlock = data.whatsappGroupUrl
    ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f3d2e;border-radius:8px;border:1px solid #1a5c42;margin-bottom:24px;">
      <tr><td style="padding:20px;text-align:center;">
        <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#25d366;">📱 Join Our WhatsApp Group</p>
        <p style="margin:0 0 14px;font-size:13px;color:#a0c8b8;">Stay updated with event instructions, announcements, and connect with other participants!</p>
        <a href="${data.whatsappGroupUrl}" style="display:inline-block;padding:10px 28px;background:#25d366;color:#fff;border-radius:24px;font-size:14px;font-weight:600;text-decoration:none;">Join Group Now</a>
        <p style="margin:10px 0 0;font-size:12px;color:#6a9c8a;">Get real-time updates, clarify doubts, and network with fellow participants</p>
      </td></tr>
    </table>` : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Event Entry Pass</title></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:32px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#13131a;border-radius:12px;overflow:hidden;border:1px solid #2a2a3a;">

        <!-- IMPORTANT banner -->
        <tr><td style="padding:14px 24px;background:#1a1400;border-bottom:1px solid #3a3000;">
          <p style="margin:0;font-size:13px;color:#f5c842;">
            <strong>IMPORTANT : Entry Pass Required</strong><br>
            <span style="color:#c8a830;">Please note that you will need an <strong>Entry Pass</strong> to enter the venue.</span>
          </p>
        </td></tr>

        <!-- Header -->
        <tr><td style="padding:28px 36px 20px;border-bottom:1px solid #2a2a3a;text-align:center;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Your Personal Check-in QR Code</p>
          <p style="margin:8px 0 0;font-size:14px;color:#8888aa;">Present this QR code at the entrance for attendance:</p>
        </td></tr>

        <!-- QR Code -->
        <tr><td style="padding:28px 36px;text-align:center;">
          <div style="display:inline-block;background:#fff;padding:16px;border-radius:12px;">
            <img src="${data.qrImageUrl}" alt="Check-in QR Code" width="180" height="180" style="display:block;">
          </div>
          <p style="margin:16px 0 0;font-size:12px;color:#555;">Token: ${data.qrToken}</p>
        </td></tr>

        <!-- Important note -->
        <tr><td style="padding:0 36px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;border:1px solid #3a3a6a;">
            <tr><td style="padding:14px 18px;text-align:center;font-size:13px;color:#aaa;">
              <strong style="color:#ccc;">Important:</strong> This QR code is unique to you. Each team member has their own QR code.
              Do not share this QR code with others.
            </td></tr>
          </table>
        </td></tr>

        ${whatsappBlock}

        <!-- Event info -->
        ${data.eventDate || data.venue || data.teamName ? `
        <tr><td style="padding:0 36px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;border:1px solid #2a2a3a;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#8888aa;text-transform:uppercase;letter-spacing:0.5px;">Event Entry Pass</p>
              <table width="100%" cellpadding="4" cellspacing="0" style="font-size:14px;color:#cccccc;">
                <tr><td style="width:140px;color:#888;">Event</td><td style="color:#fff;">${data.eventName}</td></tr>
                ${data.eventDate ? `<tr><td style="color:#888;">Date &amp; Time</td><td style="color:#fff;">${data.eventDate}</td></tr>` : ""}
                ${data.venue ? `<tr><td style="color:#888;">Venue</td><td style="color:#fff;">${data.venue}</td></tr>` : ""}
                ${data.teamName ? `<tr><td style="color:#888;">Team</td><td style="color:#fff;">${data.teamName}</td></tr>` : ""}
              </table>
            </td></tr>
          </table>
        </td></tr>` : ""}

        <!-- Instructions -->
        <tr><td style="padding:0 36px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:8px;border:1px solid #2a2a2a;">
            <tr><td style="padding:14px 18px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#8888aa;text-transform:uppercase;letter-spacing:0.5px;">Instructions</p>
              <ul style="margin:0;padding-left:18px;font-size:13px;color:#aaa;line-height:1.9;">
                <li>Bring your college ID card along with this pass.</li>
                <li>Arrive at the venue 15 minutes early.</li>
                <li>Show the QR code at the registration desk.</li>
              </ul>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 36px;border-top:1px solid #2a2a3a;text-align:center;">
          <p style="margin:0;font-size:12px;color:#555;">— Team Titanium &nbsp;·&nbsp; Rajalakshmi Engineering College</p>
          <p style="margin:4px 0 0;font-size:11px;color:#444;">This is an automated email. Please do not reply.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
