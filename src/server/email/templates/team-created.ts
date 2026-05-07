/**
 * Email template: Team Created (sent to the leader)
 * Item #8 — triggers after createTeam() succeeds.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://titaniumfest.com";

export type TeamCreatedEmailData = {
  leaderName: string;
  teamName: string;
  eventName: string;
  eventDate?: string;
  venue?: string;
  teamCode: string;
  joinCode: string;
  joinCodeExpiresAt?: string;
  teamMinSize: number;
  teamMaxSize: number;
};

export function buildTeamCreatedEmail(data: TeamCreatedEmailData): string {
  const joinLink = `${APP_URL}/events/join?code=${data.joinCode}`;
  const expiryNote = data.joinCodeExpiresAt
    ? `<p style="color:#a0a0a0;font-size:12px;margin:8px 0 0;">This code expires on ${data.joinCodeExpiresAt}.</p>`
    : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Team Created</title></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:32px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#13131a;border-radius:12px;overflow:hidden;border:1px solid #2a2a3a;">

        <!-- Header -->
        <tr><td style="padding:28px 36px 20px;border-bottom:1px solid #2a2a3a;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Team Created 🎉</p>
          <p style="margin:6px 0 0;font-size:14px;color:#8888aa;">You're all set — share the join code with your teammates.</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 36px;">
          <p style="margin:0 0 20px;font-size:15px;color:#cccccc;">Hi ${data.leaderName},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#cccccc;">
            Your team <strong style="color:#fff;">${data.teamName}</strong> has been created for
            <strong style="color:#fff;">${data.eventName}</strong>. You are the team leader.
          </p>

          <!-- Team info box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;border:1px solid #2a2a3a;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#8888aa;letter-spacing:0.5px;text-transform:uppercase;">Team Info</p>
              <table width="100%" cellpadding="4" cellspacing="0" style="font-size:14px;color:#cccccc;">
                <tr><td style="width:140px;color:#888;">Team Name</td><td style="color:#fff;font-weight:600;">${data.teamName}</td></tr>
                <tr><td style="color:#888;">Event</td><td style="color:#fff;">${data.eventName}</td></tr>
                ${data.eventDate ? `<tr><td style="color:#888;">Date &amp; Time</td><td style="color:#fff;">${data.eventDate}</td></tr>` : ""}
                ${data.venue ? `<tr><td style="color:#888;">Venue</td><td style="color:#fff;">${data.venue}</td></tr>` : ""}
                <tr><td style="color:#888;">Team Size</td><td style="color:#fff;">${data.teamMinSize}–${data.teamMaxSize} members</td></tr>
              </table>
            </td></tr>
          </table>

          <!-- Join code box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e1e10;border-radius:8px;border:1px solid #3a3a1a;margin-bottom:24px;">
            <tr><td style="padding:20px;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#aaa;text-transform:uppercase;letter-spacing:0.5px;">Join Code — share this with your team</p>
              <p style="margin:0;font-size:36px;font-weight:800;letter-spacing:8px;color:#f5e642;font-family:monospace;">${data.joinCode}</p>
              ${expiryNote}
            </td></tr>
          </table>

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${joinLink}" style="display:inline-block;padding:12px 32px;background:#5c5cf5;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Share Join Link</a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:#888;">
            Your team needs at least ${data.teamMinSize} members to register.
            Once everyone has joined, click <strong style="color:#ccc;">Finalize Team</strong> in your dashboard.
          </p>
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
