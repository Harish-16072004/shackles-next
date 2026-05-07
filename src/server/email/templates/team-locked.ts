/**
 * Email template: Team Registration Confirmed / Locked
 * Item #10 — sent to EVERY team member after lockTeam() succeeds.
 */

export type TeamLockedEmailData = {
  memberName: string;
  memberRole: "LEADER" | "MEMBER";
  teamName: string;
  teamSize: number;
  eventName: string;
  eventDate?: string;
  venue?: string;
  eventType?: string;
  teamFee?: string;
  /** WhatsApp invite link for the event group */
  whatsappGroupUrl?: string;
};

export function buildTeamLockedEmail(data: TeamLockedEmailData): string {
  const roleLabel = data.memberRole === "LEADER" ? "Team Leader" : "Team Member";

  const whatsappBlock = data.whatsappGroupUrl
    ? `
    <!-- WhatsApp -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f3d2e;border-radius:8px;border:1px solid #1a5c42;margin-bottom:24px;">
      <tr><td style="padding:20px;text-align:center;">
        <p style="margin:0 0 6px;font-size:18px;">📱</p>
        <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#25d366;">Join Our WhatsApp Group</p>
        <p style="margin:0 0 14px;font-size:13px;color:#a0c8b8;">Stay updated with event instructions and announcements.</p>
        <a href="${data.whatsappGroupUrl}" style="display:inline-block;padding:10px 28px;background:#25d366;color:#fff;border-radius:24px;font-size:14px;font-weight:600;text-decoration:none;">Join Group Now</a>
      </td></tr>
    </table>` : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Team Registration Confirmed</title></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:32px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#13131a;border-radius:12px;overflow:hidden;border:1px solid #2a2a3a;">

        <!-- Header -->
        <tr><td style="padding:28px 36px 20px;border-bottom:1px solid #2a2a3a;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Team Registration Confirmed! ✅</p>
          <p style="margin:6px 0 0;font-size:14px;color:#8888aa;">Your team is locked and registration is complete.</p>
        </td></tr>

        <!-- Status badges -->
        <tr><td style="padding:20px 36px 0;">
          <span style="display:inline-block;padding:4px 14px;border-radius:20px;border:1px solid #555;font-size:12px;font-weight:600;color:#ccc;margin-right:8px;">REGISTERED</span>
          <span style="display:inline-block;padding:4px 14px;border-radius:20px;background:#3a2a6a;font-size:12px;font-weight:600;color:#a890f0;">Team Event</span>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:20px 36px 28px;">
          <p style="margin:0 0 20px;font-size:15px;color:#cccccc;">Dear ${data.memberName},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#cccccc;">
            You have been registered as a <strong style="color:#fff;">${roleLabel}</strong> for
            <strong style="color:#fff;">${data.eventName}</strong>.
          </p>

          <!-- Team info -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;border:1px solid #2a2a3a;margin-bottom:16px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#8888aa;letter-spacing:0.5px;text-transform:uppercase;">Team Information</p>
              <table width="100%" cellpadding="4" cellspacing="0" style="font-size:14px;color:#cccccc;">
                <tr><td style="width:140px;color:#888;">Team Name</td><td style="color:#fff;font-weight:600;">${data.teamName}</td></tr>
                <tr><td style="color:#888;">Your Role</td><td style="color:#fff;">${roleLabel}</td></tr>
                <tr><td style="color:#888;">Team Size</td><td style="color:#fff;">${data.teamSize} members</td></tr>
              </table>
            </td></tr>
          </table>

          <!-- Event info -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;border:1px solid #2a2a3a;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#8888aa;letter-spacing:0.5px;text-transform:uppercase;">Event Details</p>
              <table width="100%" cellpadding="4" cellspacing="0" style="font-size:14px;color:#cccccc;">
                <tr><td style="width:140px;color:#888;">Event Name</td><td style="color:#fff;">${data.eventName}</td></tr>
                ${data.eventDate ? `<tr><td style="color:#888;">Date &amp; Time</td><td style="color:#fff;">${data.eventDate}</td></tr>` : ""}
                ${data.venue ? `<tr><td style="color:#888;">Venue</td><td style="color:#fff;">${data.venue}</td></tr>` : ""}
                ${data.eventType ? `<tr><td style="color:#888;">Event Type</td><td style="color:#fff;">${data.eventType}</td></tr>` : ""}
                ${data.teamFee ? `<tr><td style="color:#888;">Team Fee</td><td style="color:#fff;">${data.teamFee}</td></tr>` : ""}
              </table>
            </td></tr>
          </table>

          ${whatsappBlock}

          <!-- Instructions -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:8px;border:1px solid #2a2a2a;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#8888aa;text-transform:uppercase;letter-spacing:0.5px;">Important Instructions</p>
              <ul style="margin:0;padding-left:20px;font-size:13px;color:#aaa;line-height:1.9;">
                <li>Each team member must present their <strong style="color:#ccc;">own QR code</strong> for attendance.</li>
                <li>Arrive at the venue at least 30 minutes before the event starts.</li>
                <li>Show your QR code to the check-in staff for attendance marking.</li>
                <li>Bring a valid ID proof along with this QR code.</li>
                <li>Coordinate with your team lead for any event-related queries.</li>
                <li>Ensure team payment is completed before the event date.</li>
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
