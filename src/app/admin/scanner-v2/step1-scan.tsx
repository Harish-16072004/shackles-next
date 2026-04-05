'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Loader2, XCircle, CheckCircle } from 'lucide-react';
import { scanParticipantByShacklesId, scanParticipantQR } from '@/server/actions/event-logistics';
import { useScannerContext, ParticipantRecord } from './ScannerContext';

const QRCODE_SCANNER_ELEMENT_ID = 'html5qr-scanner';

function toParticipantRecord(value: unknown): ParticipantRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string') return null;

  const eventsRaw = Array.isArray(record.events) ? record.events : [];
  const events = eventsRaw
    .map((eventValue) => {
      if (!eventValue || typeof eventValue !== 'object') return null;
      const eventRecord = eventValue as Record<string, unknown>;
      if (typeof eventRecord.eventName !== 'string') return null;
      return {
        eventName: eventRecord.eventName,
        attended: Boolean(eventRecord.attended),
        teamName: typeof eventRecord.teamName === 'string' ? eventRecord.teamName : (null as string | null),
        memberRole: typeof eventRecord.memberRole === 'string' ? eventRecord.memberRole : (null as string | null),
      };
    })
    .filter((e): e is NonNullable<typeof eventsRaw[0]> => e !== null);

  return {
    id: record.id,
    firstName: typeof record.firstName === 'string' ? record.firstName : 'Unknown',
    shacklesId: typeof record.shacklesId === 'string' ? record.shacklesId : null,
    events,
  };
}

export function Step1Scan() {
  const searchParams = useSearchParams();
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prefillAttemptedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { participant, setScannedData } = useScannerContext();
  const prefillShacklesId = (searchParams.get('sid') || '').trim();

  useEffect(() => {
    if (prefillAttemptedRef.current) return;
    if (!prefillShacklesId) return;
    if (participant || success) return;

    prefillAttemptedRef.current = true;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const result = await scanParticipantByShacklesId(prefillShacklesId);
        if (!result.success) {
          setError(result.error || 'Unable to prefill participant from Shackles ID.');
          return;
        }

        const participantData = toParticipantRecord(result.data || {});
        if (!participantData) {
          setError('Invalid participant data');
          return;
        }

        setScannedData(participantData, participantData.shacklesId || prefillShacklesId);
        setSuccess(true);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [participant, prefillShacklesId, setScannedData, success]);

  useEffect(() => {
    if (!containerRef.current || success) return;

    try {
      scannerRef.current = new Html5QrcodeScanner(
        QRCODE_SCANNER_ELEMENT_ID,
        {
          fps: 10,
          qrbox: { width: 300, height: 300 },
          rememberLastUsedCamera: true,
          videoConstraints: {
            facingMode: 'environment',
          },
        },
        false
      );

      const handleScanSuccess = async (decodedText: string) => {
        setLoading(true);
        setError('');

        try {
          // Call server action to find participant by QR token
          const result = await scanParticipantQR(decodedText);

          if (!result.success) {
            setError(result.error || 'Participant not found');
            setLoading(false);
            return;
          }

          const participantData = toParticipantRecord(result.data || {});
          if (!participantData) {
            setError('Invalid participant data');
            setLoading(false);
            return;
          }

          // Store in context and mark success
          setScannedData(participantData, participantData.shacklesId || '');
          setSuccess(true);

          // Pause scanner on success
          scannerRef.current?.pause(true);
        } catch (err) {
          setError(String(err));
          setLoading(false);
        }
      };

      const handleScanError = (errorMessage: string) => {
        // Silently fail on scan errors (normal for QR scanning)
        // Only log critical failures
        if (errorMessage && !errorMessage.includes('NotFoundError')) {
          console.debug('[Step1] QR scan attempt:', errorMessage);
        }
      };

      scannerRef.current.render(handleScanSuccess, handleScanError);
    } catch (err) {
      setError(`Failed to initialize scanner: ${String(err)}`);
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {
          // Ignore cleanup errors
        });
      }
    };
  }, [success, setScannedData]);

  if (success && participant) {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle className="w-6 h-6 text-green-600" />
          <h2 className="text-lg font-semibold text-green-800">Scan Successful</h2>
        </div>
        <div className="space-y-2 text-sm text-green-700">
          <p>
            <strong>{participant.firstName}</strong>
          </p>
          {participant.shacklesId && (
            <p className="font-mono text-xs bg-green-100 px-2 py-1 rounded">
              {participant.shacklesId}
            </p>
          )}
        </div>
        <button
          onClick={() => {
            setSuccess(false);
            setError('');
            scannerRef.current?.resume();
          }}
          className="mt-4 w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
        >
          Scan Another
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h2 className="text-lg font-semibold text-blue-900 mb-2">Step 1: Scan QR Code</h2>
        <p className="text-sm text-blue-700">
          Point the camera at the participant's QR code to begin.
        </p>
      </div>

      <div
        ref={containerRef}
        id={QRCODE_SCANNER_ELEMENT_ID}
        className="w-full bg-black rounded-lg overflow-hidden"
        style={{ aspectRatio: '1' }}
      />

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Scan Error</p>
            <p className="text-xs text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-yellow-600 animate-spin" />
          <p className="text-sm text-yellow-700">Looking up participant...</p>
        </div>
      )}


    </div>
  );
}
