import { validateAndGetEnv, isFeatureEnabled as isFeatureFlagEnabled, getValidatedEnv } from "./env-validation";

/**
 * Validate environment on first call
 * Throws if validation fails - this is the intended behavior for safe startup
 */
let envValidated = false;

function ensureValidated() {
  if (!envValidated) {
    validateAndGetEnv();
    envValidated = true;
  }
}

/**
 * Get a required environment variable value
 * Validates all env vars on first call
 */
export function getRequiredEnv(name: string): string {
  ensureValidated();
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Validate all environment variables (Zod-based)
 * Throws with detailed error message if validation fails
 * Safe to call multiple times (caches result)
 */
export function validateServerEnv() {
  ensureValidated();
}

/**
 * Check if scanner bulk team flow feature is enabled
 */
export function isScannerBulkTeamFlowEnabled(): boolean {
  ensureValidated();
  return isFeatureFlagEnabled("ENABLE_SCANNER_BULK_TEAM_FLOW");
}
