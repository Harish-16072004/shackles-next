import { describe, expect, it } from 'vitest';
import { normalizeIndianPhone, indianPhoneSchema } from '../../src/lib/validation/phone';

describe('Indian Phone Validation Utility', () => {
  describe('normalizeIndianPhone', () => {
    it('normalizes 10-digit number', () => {
      expect(normalizeIndianPhone('9876543210')).toBe('9876543210');
    });

    it('normalizes number with spaces and dashes', () => {
      expect(normalizeIndianPhone('98765-43210')).toBe('9876543210');
      expect(normalizeIndianPhone('98765 43210')).toBe('9876543210');
    });

    it('removes +91 prefix', () => {
      expect(normalizeIndianPhone('+919876543210')).toBe('9876543210');
      expect(normalizeIndianPhone('+91 98765 43210')).toBe('9876543210');
    });

    it('removes 91 prefix', () => {
      expect(normalizeIndianPhone('919876543210')).toBe('9876543210');
    });

    it('returns null for invalid numbers', () => {
      expect(normalizeIndianPhone('1234567890')).toBeNull(); // Starts with 1
      expect(normalizeIndianPhone('987654321')).toBeNull();  // 9 digits
      expect(normalizeIndianPhone('98765432100')).toBeNull(); // 11 digits
      expect(normalizeIndianPhone('abcdefghij')).toBeNull();  // Not numeric
    });
  });

  describe('indianPhoneSchema (Zod)', () => {
    it('validates and transforms a valid number', () => {
      const result = indianPhoneSchema.safeParse('+91 98765 43210');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('9876543210');
      }
    });

    it('fails for an invalid number', () => {
      const result = indianPhoneSchema.safeParse('12345');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Enter a valid 10-digit Indian mobile number (e.g., 9876543210)');
      }
    });
  });
});
