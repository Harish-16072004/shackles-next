const DEFAULT_ACTIVE_YEAR = new Date().getUTCFullYear();

function toNumberOrNull(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 3000) {
    return null;
  }
  return parsed;
}

export function getActiveYear() {
  return toNumberOrNull(process.env.ACTIVE_YEAR) ?? DEFAULT_ACTIVE_YEAR;
}

export function getActiveYearShort() {
  return String(getActiveYear() % 100).padStart(2, "0");
}

export function getActiveThemeKey() {
  return process.env.ACTIVE_THEME_KEY?.trim() || "default";
}

export function getActivePublicDomain() {
  const raw = process.env.ACTIVE_PUBLIC_DOMAIN?.trim();
  if (raw) return raw;

  const fromAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!fromAppUrl) return "localhost";

  try {
    return new URL(fromAppUrl).host;
  } catch {
    return fromAppUrl;
  }
}