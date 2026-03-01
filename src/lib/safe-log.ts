const SENSITIVE_ENV_KEYS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "DO_SPACES_KEY",
  "DO_SPACES_SECRET",
  "SMTP_PASS",
] as const;

function redactSensitiveValues(input: string) {
  let output = input;

  for (const key of SENSITIVE_ENV_KEYS) {
    const value = process.env[key];
    if (!value || value.length < 4) continue;
    output = output.split(value).join(`[REDACTED:${key}]`);
  }

  return output;
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSensitiveValues(error.message || ""),
      stack: redactSensitiveValues(error.stack || ""),
    };
  }

  return {
    name: "NonErrorThrown",
    message: redactSensitiveValues(String(error)),
    stack: "",
  };
}

export function safeLogError(context: string, error: unknown, meta?: Record<string, unknown>) {
  const normalized = normalizeError(error);
  if (meta) {
    const sanitizedMeta = redactSensitiveValues(JSON.stringify(meta));
    console.error(context, {
      error: normalized,
      meta: sanitizedMeta,
    });
    return;
  }
  console.error(context, normalized);
}
