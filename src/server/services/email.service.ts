/**
 * Email Service using Resend
 * Abstracts email sending with pre-built templates for:
 * - Payment verification
 * - Team creation
 * - Team locking
 * - Individual event registration
 */

/**
 * Escape user-controlled strings before injecting into HTML email templates.
 * Prevents XSS in email clients that render HTML.
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send email using Resend
 * Requires RESEND_API_KEY environment variable
 */
export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not configured");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "noreply@shackles.com",
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      console.error("Resend API error:", JSON.stringify(errorBody));
      return { success: false, error: "Email delivery failed. Please try again later." };
    }

    return { success: true };
  } catch (err) {
    console.error("Email sending failed:", err);
    return { success: false, error: "Email delivery failed. Please try again later." };
  }
}

/**
 * Send payment verification email
 */
export async function sendPaymentVerificationEmail(input: {
  userEmail: string;
  userName: string;
  packageType: string;
  qrCodeUrl?: string;
  eventYear: number;
}): Promise<{ success: boolean; error?: string }> {
  const userName = escapeHtml(input.userName);
  const packageLabel = escapeHtml({
    EVENT_ONLY: "Event Only",
    WORKSHOP_ONLY: "Workshop Only",
    COMBO: "Combo (Events & Workshops)",
  }[input.packageType] || input.packageType);
  const qrCodeUrl = input.qrCodeUrl ? escapeHtml(input.qrCodeUrl) : undefined;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Shackles Pass Confirmed</h2>
      <p>Hi ${userName},</p>
      <p>Your payment has been verified and your symposium pass is ready!</p>
      
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <strong>Pass Details:</strong>
        <ul>
          <li>Package Type: <strong>${packageLabel}</strong></li>
          <li>Year: <strong>${input.eventYear}</strong></li>
        </ul>
      </div>

      ${
        qrCodeUrl
          ? `
        <div style="text-align: center; margin: 20px 0;">
          <p><strong>Your Personal QR Code:</strong></p>
          <img src="${qrCodeUrl}" alt="QR Code" style="width: 200px; height: 200px;" />
          <p style="font-size: 12px; color: #666;">Use this QR at all stations for kit, attendance, and resource access.</p>
        </div>
      `
          : ""
      }

      <h3>Next Steps:</h3>
      <ol>
        <li>Register for events from the event details page</li>
        <li>Create or join a team if event requires teams</li>
        <li>Bring your ID and this pass QR code to the event</li>
      </ol>

      <p style="font-size: 12px; color: #666; margin-top: 30px;">
        If you have any questions, contact us at support@shackles.com
      </p>
    </div>
  `;

  return sendEmail({
    to: input.userEmail,
    subject: "Shackles Pass Confirmed - " + input.eventYear,
    html,
  });
}

/**
 * Send team creation email to team leader
 */
export async function sendTeamCreatedEmail(input: {
  leaderEmail: string;
  leaderName: string;
  teamName: string;
  eventName: string;
  joinCode: string;
  joinUrl: string;
  teamMinSize?: number;
  teamMaxSize?: number;
}): Promise<{ success: boolean; error?: string }> {
  const leaderName = escapeHtml(input.leaderName);
  const teamName = escapeHtml(input.teamName);
  const eventName = escapeHtml(input.eventName);
  const joinCode = escapeHtml(input.joinCode);
  const joinUrl = escapeHtml(input.joinUrl);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Team Created Successfully</h2>
      <p>Hi ${leaderName},</p>
      <p>Your team for <strong>${eventName}</strong> has been created!</p>
      
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <strong>Team Details:</strong>
        <ul>
          <li>Team Name: <strong>${teamName}</strong></li>
          <li>Event: <strong>${eventName}</strong></li>
          ${input.teamMinSize ? `<li>Min Size: <strong>${input.teamMinSize}</strong></li>` : ""}
          ${input.teamMaxSize ? `<li>Max Size: <strong>${input.teamMaxSize}</strong></li>` : ""}
          <li>Join Code: <strong style="font-size: 18px; color: #0066cc;">${joinCode}</strong></li>
        </ul>
      </div>

      <h3>Share with your team members:</h3>
      <p>Team members can join using this link:</p>
      <p><a href="${joinUrl}" style="color: #0066cc; text-decoration: none;">Join Team Link</a></p>
      <p>Or use join code: <strong>${joinCode}</strong></p>

      <p style="font-size: 12px; color: #666; margin-top: 30px;">
        Once all members have joined and you're ready, you can lock the team from the event page.
      </p>
    </div>
  `;

  return sendEmail({
    to: input.leaderEmail,
    subject: `Team Created: ${teamName} - ${eventName}`,
    html,
  });
}

/**
 * Send team locked confirmation email to all members
 */
export async function sendTeamLockedEmail(input: {
  memberEmail: string;
  memberName: string;
  teamName: string;
  eventName: string;
  eventDate?: string;
  eventTime?: string;
  eventVenue?: string;
  teamSize: number;
  memberRole: "LEADER" | "MEMBER";
}): Promise<{ success: boolean; error?: string }> {
  const memberName = escapeHtml(input.memberName);
  const teamName = escapeHtml(input.teamName);
  const eventName = escapeHtml(input.eventName);
  const memberRole = escapeHtml(input.memberRole);
  const eventDate = input.eventDate ? escapeHtml(input.eventDate) : undefined;
  const eventTime = input.eventTime ? escapeHtml(input.eventTime) : undefined;
  const eventVenue = input.eventVenue ? escapeHtml(input.eventVenue) : undefined;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Team Registration Confirmed</h2>
      <p>Hi ${memberName},</p>
      <p>Your team registration has been confirmed and locked!</p>
      
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <strong>Registration Details:</strong>
        <ul>
          <li>Team Name: <strong>${teamName}</strong></li>
          <li>Event: <strong>${eventName}</strong></li>
          <li>Your Role: <strong>${memberRole}</strong></li>
          <li>Team Size: <strong>${input.teamSize} members</strong></li>
          ${eventDate ? `<li>Event Date: <strong>${eventDate}</strong></li>` : ""}
          ${eventTime ? `<li>Event Time: <strong>${eventTime}</strong></li>` : ""}
          ${eventVenue ? `<li>Venue: <strong>${eventVenue}</strong></li>` : ""}
        </ul>
      </div>

      <h3>Important Reminders:</h3>
      <ul>
        <li>Bring your personal ID on the day of the event</li>
        <li>Scan your personal QR code for attendance and kit distribution</li>
        <li>Arrive on time as per event schedule</li>
      </ul>

      <p style="font-size: 12px; color: #666; margin-top: 30px;">
        See you at the event! For questions, contact us at support@shackles.com
      </p>
    </div>
  `;

  return sendEmail({
    to: input.memberEmail,
    subject: `Team Confirmed: ${teamName}`,
    html,
  });
}

/**
 * Send individual event registration confirmation
 */
export async function sendEventRegistrationEmail(input: {
  userEmail: string;
  userName: string;
  eventName: string;
  eventDate?: string;
  eventTime?: string;
  eventVenue?: string;
}): Promise<{ success: boolean; error?: string }> {
  const userName = escapeHtml(input.userName);
  const eventName = escapeHtml(input.eventName);
  const eventDate = input.eventDate ? escapeHtml(input.eventDate) : undefined;
  const eventTime = input.eventTime ? escapeHtml(input.eventTime) : undefined;
  const eventVenue = input.eventVenue ? escapeHtml(input.eventVenue) : undefined;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Event Registration Confirmed</h2>
      <p>Hi ${userName},</p>
      <p>You're all set for <strong>${eventName}</strong>!</p>
      
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <strong>Event Details:</strong>
        <ul>
          <li>Event: <strong>${eventName}</strong></li>
          ${eventDate ? `<li>Date: <strong>${eventDate}</strong></li>` : ""}
          ${eventTime ? `<li>Time: <strong>${eventTime}</strong></li>` : ""}
          ${eventVenue ? `<li>Venue: <strong>${eventVenue}</strong></li>` : ""}
        </ul>
      </div>

      <h3>Day-of Checklist:</h3>
      <ul>
        <li>Bring your personal ID</li>
        <li>Scan your personal QR code for attendance</li>
        <li>Arrive on time</li>
      </ul>

      <p style="font-size: 12px; color: #666; margin-top: 30px;">
        Thanks for registering! See you at the event!
      </p>
    </div>
  `;

  return sendEmail({
    to: input.userEmail,
    subject: `Registered for: ${eventName}`,
    html,
  });
}
