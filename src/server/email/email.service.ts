/**
 * Email Service — src/server/email/email.service.ts
 *
 * Thin adapter over Resend (primary) with a console fallback for local dev.
 * Swap the transport by setting EMAIL_PROVIDER=resend|console in .env
 *
 * Required env vars (Resend):
 *   RESEND_API_KEY   — from resend.com
 *   EMAIL_FROM       — e.g. "Titanium 2026 <no-reply@titaniumfest.com>"
 *   NEXT_PUBLIC_APP_URL — e.g. https://titaniumfest.com
 */

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  /** Raw HTML string — use the template helpers below to generate. */
  html: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { success: true; messageId?: string }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY is not set." };
  }

  const from = process.env.EMAIL_FROM ?? "Titanium 2026 <no-reply@titaniumfest.com>";

  const body = {
    from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: `Resend error ${res.status}: ${text}` };
  }

  const data = (await res.json()) as { id?: string };
  return { success: true, messageId: data.id };
}

function sendViaConsole(input: SendEmailInput): SendEmailResult {
  console.log("[EmailService] --- EMAIL (console fallback) ---");
  console.log("  To     :", input.to);
  console.log("  Subject:", input.subject);
  console.log("  HTML   :", input.html.slice(0, 300), "...");
  return { success: true, messageId: "console-" + Date.now() };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a single email. Fire-and-forget in server actions;
 * await in jobs/queues where you need the result.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = process.env.EMAIL_PROVIDER ?? "resend";

  try {
    if (provider === "console") {
      return sendViaConsole(input);
    }
    return await sendViaResend(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[EmailService] Unexpected error:", msg);
    return { success: false, error: msg };
  }
}

/**
 * Send the same email to multiple recipients independently.
 * Failures are collected; partial success is possible.
 */
export async function sendEmailBatch(
  recipients: string[],
  subject: string,
  buildHtml: (email: string) => string
): Promise<{ email: string; result: SendEmailResult }[]> {
  return Promise.all(
    recipients.map(async (email) => ({
      email,
      result: await sendEmail({ to: email, subject, html: buildHtml(email) }),
    }))
  );
}
