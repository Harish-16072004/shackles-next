import { z } from "zod";

/**
 * Comprehensive environment variable validation schema
 * Separates required vs optional, core vs feature-specific
 */

// Core required variables (always needed)
const coreRequiredSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "Missing DATABASE_URL")
    .describe("PostgreSQL connection string"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters")
    .describe("Secret for session encryption"),
  STORAGE_PROVIDER: z
    .enum(["local", "digitalocean"])
    .default("local")
    .describe("File storage backend"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .min(1, "Missing NEXT_PUBLIC_APP_URL")
    .describe("Frontend application URL"),
});

// Yearly control variables (production required)
const yearlySchema = z.object({
  ACTIVE_YEAR: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((year) => Number.isInteger(year) && year >= 2000 && year <= 3000, {
      message: "ACTIVE_YEAR must be between 2000 and 3000",
    })
    .describe("Active event year")
    .optional(),
  ACTIVE_THEME_KEY: z
    .string()
    .optional()
    .describe("Active theme identifier"),
  ACTIVE_PUBLIC_DOMAIN: z
    .string()
    .optional()
    .describe("Public domain for event images"),
});

// DigitalOcean Spaces (conditional on STORAGE_PROVIDER=digitalocean)
const digitalOceanSchema = z.object({
  DO_SPACES_REGION: z.string().min(1).optional(),
  DO_SPACES_BUCKET: z.string().min(1).optional(),
  DO_SPACES_ENDPOINT: z.string().min(1).optional(),
  DO_SPACES_KEY: z.string().min(1).optional(),
  DO_SPACES_SECRET: z.string().min(1).optional(),
  DO_SPACES_CDN_BASE_URL: z.string().url().optional(),
});

// SMTP configuration (email)
const smtpSchema = z.object({
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((port) => port > 0 && port <= 65535, {
      message: "SMTP_PORT must be a valid port number (1-65535)",
    })
    .optional(),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

// AI/ML features
const aiSchema = z.object({
});

// Feature flags
const featureFlagsSchema = z.object({
  ENABLE_SCANNER_BULK_TEAM_FLOW: z
    .enum(["0", "1", "true", "false", "yes", "no"])
    .optional(),
});

// Playwright testing overrides
const playwrightSchema = z.object({
  PLAYWRIGHT_DATABASE_URL: z.string().optional(),
  PLAYWRIGHT_SESSION_SECRET: z.string().optional(),
  PLAYWRIGHT_SMTP_HOST: z.string().optional(),
  PLAYWRIGHT_SMTP_PORT: z.string().optional(),
  PLAYWRIGHT_SMTP_USER: z.string().optional(),
  PLAYWRIGHT_SMTP_PASS: z.string().optional(),
});

// Combined schema
const fullEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
  ...coreRequiredSchema.shape,
  ...yearlySchema.shape,
  ...digitalOceanSchema.shape,
  ...smtpSchema.shape,
  ...aiSchema.shape,
  ...featureFlagsSchema.shape,
  ...playwrightSchema.shape,
});

export type ValidatedEnv = z.infer<typeof fullEnvSchema>;

let validationCache: ValidatedEnv | null = null;
let validationError: Error | null = null;

/**
 * Validate environment variables at startup
 * Throws if validation fails; call early in app initialization
 */
export function validateAndGetEnv(): ValidatedEnv {
  if (validationCache) return validationCache;
  if (validationError) throw validationError;

  try {
    // Get all env vars (including both process.env and optional overrides for Playwright)
    const envData = {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL,
      SESSION_SECRET: process.env.SESSION_SECRET,
      STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      ACTIVE_YEAR: process.env.ACTIVE_YEAR,
      ACTIVE_THEME_KEY: process.env.ACTIVE_THEME_KEY,
      ACTIVE_PUBLIC_DOMAIN: process.env.ACTIVE_PUBLIC_DOMAIN,
      DO_SPACES_REGION: process.env.DO_SPACES_REGION,
      DO_SPACES_BUCKET: process.env.DO_SPACES_BUCKET,
      DO_SPACES_ENDPOINT: process.env.DO_SPACES_ENDPOINT,
      DO_SPACES_KEY: process.env.DO_SPACES_KEY,
      DO_SPACES_SECRET: process.env.DO_SPACES_SECRET,
      DO_SPACES_CDN_BASE_URL: process.env.DO_SPACES_CDN_BASE_URL,
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_PORT: process.env.SMTP_PORT,
      SMTP_SECURE: process.env.SMTP_SECURE,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      ENABLE_SCANNER_BULK_TEAM_FLOW: process.env.ENABLE_SCANNER_BULK_TEAM_FLOW,
      PLAYWRIGHT_DATABASE_URL: process.env.PLAYWRIGHT_DATABASE_URL,
      PLAYWRIGHT_SESSION_SECRET: process.env.PLAYWRIGHT_SESSION_SECRET,
      PLAYWRIGHT_SMTP_HOST: process.env.PLAYWRIGHT_SMTP_HOST,
      PLAYWRIGHT_SMTP_PORT: process.env.PLAYWRIGHT_SMTP_PORT,
      PLAYWRIGHT_SMTP_USER: process.env.PLAYWRIGHT_SMTP_USER,
      PLAYWRIGHT_SMTP_PASS: process.env.PLAYWRIGHT_SMTP_PASS,
    };

    // Validate production requirements
    if (process.env.NODE_ENV === "production") {
      const productionRequired = z.object({
        ACTIVE_YEAR: z.string().min(1, "ACTIVE_YEAR required in production"),
        ACTIVE_THEME_KEY: z.string().min(1, "ACTIVE_THEME_KEY required in production"),
        ACTIVE_PUBLIC_DOMAIN: z.string().min(1, "ACTIVE_PUBLIC_DOMAIN required in production"),
      });
      productionRequired.parse(envData);
    }

    // Validate DigitalOcean requirements if enabled
    if (envData.STORAGE_PROVIDER === "digitalocean") {
      const doRequired = z.object({
        DO_SPACES_REGION: z.string().min(1, "DO_SPACES_REGION required for digitalocean"),
        DO_SPACES_BUCKET: z.string().min(1, "DO_SPACES_BUCKET required for digitalocean"),
        DO_SPACES_ENDPOINT: z.string().min(1, "DO_SPACES_ENDPOINT required for digitalocean"),
        DO_SPACES_KEY: z.string().min(1, "DO_SPACES_KEY required for digitalocean"),
        DO_SPACES_SECRET: z.string().min(1, "DO_SPACES_SECRET required for digitalocean"),
      });
      doRequired.parse(envData);
    }

    const validated = fullEnvSchema.parse(envData);
    validationCache = validated;


    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formatted = (error.issues || [])
        .map((err: z.ZodIssue) => {
          const path = err.path.join(".");
          return `${path}: ${err.message}`;
        })
        .join("\n  ");

      const message = `Environment validation failed:\n  ${formatted}`;
      validationError = new Error(message);
    } else {
      validationError = error instanceof Error ? error : new Error(String(error));
    }

    throw validationError;
  }
}

/**
 * Get a single validated environment variable value
 * Must call validateAndGetEnv() first
 */
export function getValidatedEnv<K extends keyof ValidatedEnv>(
  key: K
): ValidatedEnv[K] | undefined {
  const env = validationCache;
  if (!env) {
    throw new Error("Environment not yet validated. Call validateAndGetEnv() first.");
  }
  return env[key];
}

/**
 * Check if a feature is enabled (for feature flags)
 */
export function isFeatureEnabled(flag: "ENABLE_SCANNER_BULK_TEAM_FLOW"): boolean {
  const env = validationCache;
  if (!env) {
    throw new Error("Environment not yet validated. Call validateAndGetEnv() first.");
  }

  const value = env[flag]?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
