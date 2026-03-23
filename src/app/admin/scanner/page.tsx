'use client';

import { redirect } from 'next/navigation';

/**
 * DEPRECATED: Old scanner page removed in favor of scanner-v2
 * Redirecting to new SOC (Separation of Concerns) architecture
 * 
 * The new scanner uses a 7-step wizard approach:
 * - Step 1: QR Scan
 * - Step 2: Action Selection (Attendance/Kit/Register/Team)
 * - Step 3: Event Selection
 * - Step 4: Team Mode (if applicable)
 * - Step 5: Bulk Form (if applicable)
 * - Step 6: Review & Register
 * - Step 7: Lock Confirmation (if applicable)
 */

export default function OldScannerPage() {
  redirect('/admin/scanner-v2');
}
