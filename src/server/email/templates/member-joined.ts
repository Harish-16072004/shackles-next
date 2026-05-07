/**
 * Email template: Member Joined Team (sent to the new member)
 * Item #9 — triggers after joinTeamByCode() succeeds.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://titaniumfest.com";

export type MemberJoinedEmailData = {
  memberName: string;
  teamName: string;
  eventName: string;
  eventDate?: string;
  venue?: string;
  leaderName: string;
  currentMemberCount: number;
  teamMaxSize: number;
  teamMinSize: number;
};

export function buildMemberJoinedEmail(data: MemberJoinedEmailData): string {
  const dashboardUrl = `${APP_URL}/dashboard`;
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You've Joined a Team</title></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:32px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#13131a;border-radius:12px;overflow:hidden;border:1px solid #2a2a3a;">

        <!-- Header -->
        <tr><td style="padding:28px 36px 20px;border-bottom:1px solid #2a2a3a;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">You've Joined a Team! 👋</p>
          <p style="margin:6px 0 0;font-size:14px;color:#8888aa;">Welcome aboard — here are your team details.</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 36px;">
          <p style="margin:0 0 20px;font-size:15px;color:#cccccc;">Hi ${data.memberName},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#cccccc;">
            You have successfully joined <strong style="color:#fff;">${data.teamName}</strong> for
            <strong style="color:#fff;">${data.eventName}</strong>.
          </p>

          <!-- Team info box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;border:1px solid #2a2a3a;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#8888aa;letter-spacing:0.5px;text-transform:uppercase;">Team Details</p>
              <table width="100%" cellpadding="4" cellspacing="0" style="font-size:14px;color:#cccccc;">
                <tr><td style="width:140px;color:#888;">Team Name</td><td style="color:#fff;font-weight:600;">${data.teamName}</td></tr>
                <tr><td style="color:#888;">Your Role</td><td style="color:#fff;">Team Member</td></tr>
                <tr><td style="color:#888;">Team Lead</td><td style="color:#fff;">${data.leaderName}</td></tr>
                <tr><td style="color:#888;">Event</td><td style="color:#fff;">${data.eventName}</td></tr>
                ${data.eventDate ? `<tr><td style="color:#888;">Date &amp; Time</td><td style="color:#fff;">${data.eventDate}</td></tr>` : ""}
                ${data.venue ? `<tr><td style="color:#888;">Venue</td><td style="color:#fff;">${data.venue}</td></tr>` : ""}
                <tr><td style="color:#888;">Members</td><td style="color:#fff;">${data.currentMemberCount} / ${data.teamMaxSize}</td></tr>
              </table>
            </td></tr>
          </table>

          <p style="margin:0 0 20px;font-size:13px;color:#888;">
            The team lead will finalize the registration once all members have joined
            (minimum ${data.teamMinSize} members required). You'll get a confirmation email once the team is locked.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${dashboardUrl}" style="display:inline-block;padding:12px 32px;background:#5c5cf5;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">View Dashboard</a>
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
