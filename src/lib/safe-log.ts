const SENSITIVE_ENV_KEYS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "DO_SPACES_KEY",
  "DO_SPACES_SECRET",
  "SMTP_PASS",
] as const;

export type LogMeta = Record<string, unknown>;

function sanitizeMeta(meta: LogMeta) {
  try {
    return JSON.parse(redactSensitiveValues(JSON.stringify(meta))) as LogMeta;
  } catch {
    return { note: "Unable to serialize log metadata safely" };
  }
}

export function createRequestId(prefix = "req") {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
}

export function resolveRequestId(candidate?: string | null) {
  const normalized = (candidate || "").trim();
  return normalized.length > 0 ? normalized : createRequestId();
}

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
    const sanitizedMeta = sanitizeMeta(meta);
    console.error(context, {
      error: normalized,
      meta: sanitizedMeta,
    });
    return;
  }
  console.error(context, normalized);
}

export function safeLogInfo(context: string, message: string, meta?: LogMeta) {
  if (!meta) {
    console.info(context, { message: redactSensitiveValues(message) });
    return;
  }

  console.info(context, {
    message: redactSensitiveValues(message),
    meta: sanitizeMeta(meta),
  });
}
