import { z } from 'zod';

/**
 * Regex for Indian Mobile Numbers:
 * - Starts with optional +91 or 91
 * - Then a digit from 6-9
 * - Then 9 more digits
 */
export const INDIAN_MOBILE_REGEX = /^(?:\+91|91)?([6-9]\d{9})$/;

/**
 * Normalizes an Indian phone number to 10 digits.
 * Removes spaces, dashes, and the +91/91 prefix.
 * Returns null if invalid.
 */
export function normalizeIndianPhone(value: string): string | null {
  const trimmed = value.replace(/[\s-]/g, '');
  const match = trimmed.match(INDIAN_MOBILE_REGEX);
  return match ? match[1] : null;
}

/**
 * Zod schema for a strict Indian mobile number.
 * It transforms the input to a normalized 10-digit format.
 */
export const indianPhoneSchema = z
  .string()
  .trim()
  .min(1, 'Mobile number is required')
  .transform((val) => normalizeIndianPhone(val))
  .refine((val): val is string => val !== null, {
    message: 'Enter a valid 10-digit Indian mobile number (e.g., 9876543210)',
  });
