const VALID_STORAGE_PROVIDERS = ["local", "digitalocean"] as const;

let validated = false;

function isMissing(value: string | undefined) {
  return value == null || value.trim() === "";
}

export function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (isMissing(value)) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value as string;
}

export function validateServerEnv() {
  if (validated) return;

  const missing: string[] = [];
  const required = ["DATABASE_URL", "SESSION_SECRET", "STORAGE_PROVIDER", "NEXT_PUBLIC_APP_URL"];
  const yearlyRequired = ["ACTIVE_YEAR", "ACTIVE_THEME_KEY", "ACTIVE_PUBLIC_DOMAIN"];

  for (const key of required) {
    if (isMissing(process.env[key])) {
      missing.push(key);
    }
  }

  if (process.env.NODE_ENV === "production") {
    for (const key of yearlyRequired) {
      if (isMissing(process.env[key])) {
        missing.push(key);
      }
    }
  }

  const storageProvider = process.env.STORAGE_PROVIDER?.trim();
  if (storageProvider && !VALID_STORAGE_PROVIDERS.includes(storageProvider as (typeof VALID_STORAGE_PROVIDERS)[number])) {
    throw new Error(`Invalid STORAGE_PROVIDER: ${storageProvider}. Use one of: ${VALID_STORAGE_PROVIDERS.join(", ")}`);
  }

  if (storageProvider === "digitalocean") {
    for (const key of ["DO_SPACES_REGION", "DO_SPACES_BUCKET", "DO_SPACES_ENDPOINT", "DO_SPACES_KEY", "DO_SPACES_SECRET"]) {
      if (isMissing(process.env[key])) {
        missing.push(key);
      }
    }
  }

  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS"]) {
    if (isMissing(process.env[key])) {
      missing.push(key);
    }
  }

  const sessionSecret = process.env.SESSION_SECRET || "";
  if (sessionSecret && sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET is too short. Use at least 32 characters.");
  }

  const activeYear = process.env.ACTIVE_YEAR?.trim();
  if (activeYear) {
    const year = Number(activeYear);
    if (!Number.isInteger(year) || year < 2000 || year > 3000) {
      throw new Error("ACTIVE_YEAR must be a 4-digit year between 2000 and 3000.");
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${Array.from(new Set(missing)).join(", ")}`);
  }

  validated = true;
}
