'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { scanParticipantQR, markEventAttendance, updateKitStatus, quickRegisterForEvent, getAvailableEvents } from '@/server/actions/event-logistics';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Loader2, CheckCircle, XCircle, Package, Calendar, AlertTriangle } from 'lucide-react';

type ParticipantRecord = {
    id: string;
    firstName: string;
    shacklesId: string | null;
    registrationType: string;
    kitStatus: string;
    qrTokenHash: string | null;
    updatedAt?: string;
    events: { eventName: string; attended: boolean }[];
};

type EventOption = { name: string; type: string | null };

function isEventOption(value: unknown): value is EventOption {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return typeof record.name === 'string' && (typeof record.type === 'string' || record.type === null);
}

const ROSTER_CACHE_KEY = 'shackles_roster_v1';

type PendingAction = {
    id: string;
    participantId: string;
    type: 'KIT' | 'ATTENDANCE';
    payload?: {
        eventName?: string;
    };
    createdAt: number;
};

const ACTION_CACHE_KEY = 'shackles_scanner_actions_v1';
const generateActionId = () => (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
);

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
            };
        })
        .filter((event): event is { eventName: string; attended: boolean } => Boolean(event));

    return {
        id: record.id,
        firstName: typeof record.firstName === 'string' ? record.firstName : '',
        shacklesId: typeof record.shacklesId === 'string' ? record.shacklesId : null,
        registrationType: typeof record.registrationType === 'string' ? record.registrationType : '',
        kitStatus: typeof record.kitStatus === 'string' ? record.kitStatus : 'PENDING',
        qrTokenHash: typeof record.qrTokenHash === 'string' ? record.qrTokenHash : null,
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
        events,
    };
}

export default function ScannerPage() {
  const [scanResult, setScanResult] = useState<string | null>(null);
    const [participant, setParticipant] = useState<ParticipantRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [roster, setRoster] = useState<ParticipantRecord[]>([]);
    const [rosterMeta, setRosterMeta] = useState<{ syncedAt: string | null; size: number }>({ syncedAt: null, size: 0 });
    const [rosterLoading, setRosterLoading] = useState(false);
    const [rosterError, setRosterError] = useState<string | null>(null);
    const [isOffline, setIsOffline] = useState<boolean>(false);
    const [usedOfflineData, setUsedOfflineData] = useState(false);
    const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
    const [syncingActions, setSyncingActions] = useState(false);
  
  // Logistics Context
    const [allEvents, setAllEvents] = useState<EventOption[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("");

  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const handleScanRef = useRef<(token: string) => Promise<void>>(async () => {});

    const syncRoster = useCallback(async () => {
        if (typeof window === 'undefined') return;
        if (!navigator.onLine) {
            setIsOffline(true);
            return;
        }

        try {
            setRosterLoading(true);
            setRosterError(null);
            const res = await fetch('/api/offline/participants');
            if (!res.ok) throw new Error('Failed to download roster');
            const data = await res.json();
            const participants: ParticipantRecord[] = data.participants || [];
            const syncedAt = new Date().toISOString();
            setRoster(participants);
            setRosterMeta({ syncedAt, size: participants.length });
            window.localStorage.setItem(ROSTER_CACHE_KEY, JSON.stringify({ syncedAt, participants }));
        } catch (error) {
            console.error('Roster sync error', error);
            setRosterError('Unable to sync roster. Using cached data.');
        } finally {
            setRosterLoading(false);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const cached = window.localStorage.getItem(ROSTER_CACHE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                setRoster(parsed.participants || []);
                setRosterMeta({ syncedAt: parsed.syncedAt || null, size: (parsed.participants || []).length });
            } catch (error) {
                console.warn('Failed to parse cached roster', error);
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const stored = window.localStorage.getItem(ACTION_CACHE_KEY);
        if (!stored) return;
        try {
            const parsed = JSON.parse(stored);
            setPendingActions(Array.isArray(parsed) ? parsed : []);
        } catch (error) {
            console.warn('Failed to parse pending actions', error);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const updateStatus = () => setIsOffline(!navigator.onLine);
        updateStatus();
        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        return () => {
            window.removeEventListener('online', updateStatus);
            window.removeEventListener('offline', updateStatus);
        };
    }, []);

    const persistPendingActions = useCallback((actions: PendingAction[]) => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(ACTION_CACHE_KEY, JSON.stringify(actions));
    }, []);

    useEffect(() => {
        if (!isOffline) {
            syncRoster();
        }
    }, [isOffline, syncRoster]);

    useEffect(() => {
        if (isOffline || pendingActions.length === 0 || syncingActions) return;
        let cancelled = false;

        const flushQueue = async () => {
            setSyncingActions(true);
            const remaining: PendingAction[] = [];

            for (const action of pendingActions) {
                try {
                    if (action.type === 'KIT') {
                        const res = await updateKitStatus(action.participantId);
                        if (!res.success) {
                            remaining.push(action);
                        }
                    } else if (action.type === 'ATTENDANCE' && action.payload?.eventName) {
                        const res = await markEventAttendance(action.participantId, action.payload.eventName);
                        if (!res.success) {
                            remaining.push(action);
                        }
                    } else {
                        remaining.push(action);
                    }
                } catch (error) {
                    console.error('Failed to replay action', error);
                    remaining.push(action);
                }
                if (cancelled) break;
            }

            if (!cancelled) {
                setPendingActions(remaining);
                persistPendingActions(remaining);
                if (remaining.length === 0) {
                    setMsg({ type: 'success', text: 'Offline actions synced.' });
                } else {
                    setMsg({ type: 'error', text: `${remaining.length} actions still pending sync.` });
                }
            }
            setSyncingActions(false);
        };

        flushQueue();

        return () => {
            cancelled = true;
        };
    }, [isOffline, pendingActions, persistPendingActions, syncingActions]);

    useEffect(() => {
    // 1. Fetch Event List for Dropdown
        getAvailableEvents().then((events) => {
            if (!Array.isArray(events)) {
                setAllEvents([]);
                return;
            }

            const normalized = events.filter(isEventOption);
            setAllEvents(normalized);
        });

    // 2. Init Scanner
    // We delay slightly to ensure DOM is ready
    setTimeout(() => {
        const scanner = new Html5QrcodeScanner(
            "reader", 
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
        );
        
        scanner.render((decodedText) => {
            void handleScanRef.current(decodedText);
            // Optional: Pause scanning after success?
            // scanner.pause(); 
        }, () => {
            // ignore scan errors, they happen every frame
        });
        scannerRef.current = scanner;
    }, 100);

    return () => {
        // Cleanup is tricky with html5-qrcode in React StrictMode
        // Currently we leave it be or use scanner.clear() carefully
        if(scannerRef.current) {
            scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
        }
    };
  }, []);

    const hashTokenClient = useCallback(async (token: string) => {
        const msgUint8 = new TextEncoder().encode(token);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }, []);

    const resolveOfflineParticipant = useCallback(async (token: string) => {
        if (!token || roster.length === 0) return null;
        try {
            const hash = await hashTokenClient(token);
            return roster.find((record) => record.qrTokenHash === hash) || null;
        } catch (error) {
            console.error('Offline match failed', error);
            return null;
        }
    }, [hashTokenClient, roster]);

    const enqueuePendingAction = useCallback((action: PendingAction) => {
        setPendingActions((prev) => {
            const next = [...prev, action];
            persistPendingActions(next);
            return next;
        });
    }, [persistPendingActions]);

    const handleScan = useCallback(async (token: string) => {
        if (loading || scanResult === token) return; // Debounce

        setScanResult(token);
        setLoading(true);
        setMsg(null);
        setParticipant(null);

        let resolved = false;
        let lastError = '';

        if (!isOffline) {
            try {
                const res = await scanParticipantQR(token);
                if (res.success) {
                    const normalizedParticipant = toParticipantRecord(res.data);
                    if (normalizedParticipant) {
                        setParticipant(normalizedParticipant);
                        setUsedOfflineData(false);
                        resolved = true;
                    } else {
                        lastError = 'Unable to read participant details.';
                    }
                } else {
                    lastError = res.error || 'Invalid QR';
                }
            } catch (error) {
                console.error('Online scan failed', error);
                lastError = 'Network error during scan.';
            }
        }

        if (!resolved) {
            const offlineRecord = await resolveOfflineParticipant(token);
            if (offlineRecord) {
                setParticipant(offlineRecord);
                setUsedOfflineData(true);
                setMsg({ type: 'success', text: 'Offline cache hit. Actions will sync later.' });
                resolved = true;
            } else {
                setUsedOfflineData(false);
                setMsg({
                    type: 'error',
                    text: isOffline
                        ? 'Offline cache missing participant. Please sync when back online.'
                        : lastError || 'Invalid QR',
                });
            }
        }

        setLoading(false);
    }, [isOffline, loading, resolveOfflineParticipant, scanResult]);

        useEffect(() => {
            handleScanRef.current = handleScan;
        }, [handleScan]);

  const handleAttendance = async (eventName: string) => {
    if (!participant) return;
        if (isOffline) {
            enqueuePendingAction({
                id: generateActionId(),
                participantId: participant.id,
                type: 'ATTENDANCE',
                payload: { eventName },
                createdAt: Date.now(),
            });
            setParticipant((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    events: (prev.events || []).map((event) =>
                        event.eventName === eventName ? { ...event, attended: true } : event
                    ),
                };
            });
            setMsg({ type: 'success', text: `Queued attendance for ${eventName}.` });
            return;
        }
    setLoading(true);
    
    const res = await markEventAttendance(participant.id, eventName);
    
    if (res.success) {
      setMsg({ type: 'success', text: res.message || "Marked Present!" });
      // Refresh participant data
      handleScan(scanResult!); 
    } else {
        if(res.code === "NOT_REGISTERED") {
             setMsg({ type: 'error', text: res.error || "Not Registered" });
             // We allow the UI to show the 'Register Now' button now
        } else {
             setMsg({ type: 'error', text: res.error || "Failed" });
        }
    }
    setLoading(false);
  };

  const handleQuickRegister = async (eventName: string) => {
    if (!participant) return;
    if(!confirm(`Confirm registration for ${eventName}?`)) return;

    setLoading(true);
    const res = await quickRegisterForEvent(participant.id, eventName);
    if(res.success) {
        setMsg({ type: 'success', text: "Registered & Checked In!" });
        handleScan(scanResult!); // Reload
    } else {
        setMsg({ type: 'error', text: res.error || "Failed" });
    }
    setLoading(false);
  }

  const handleKitIssue = async () => {
    if (!participant) return;
    if(!confirm("Confirm Kit Issue?")) return;

        if (isOffline) {
            enqueuePendingAction({
                id: generateActionId(),
                participantId: participant.id,
                type: 'KIT',
                createdAt: Date.now(),
            });
            setParticipant((prev) => prev ? { ...prev, kitStatus: 'ISSUED' } : prev);
            setMsg({ type: 'success', text: 'Kit issuance queued for sync.' });
            return;
        }

    setLoading(true);
    const res = await updateKitStatus(participant.id);
    if (res.success) {
      setMsg({ type: 'success', text: "Kit Issued!" });
      handleScan(scanResult!);
    } else {
      setMsg({ type: 'error', text: res.error || "Failed" });
    }
    setLoading(false);
  };

  // Helper to check registration
  const getRegStatus = (eventName: string) => {
      if(!participant) return null;
      return participant.events.find((e) => e.eventName === eventName) || null;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 pb-20">
      <div className="max-w-md mx-auto space-y-4">
        
        {/* HEADER */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
           <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
             Volunteer Scanner
           </h1>
           <p className="text-xs text-gray-400">Scan QR to verify & manage participants</p>
           
           {/* Context Selector */}
           <div className="mt-3">
             <label className="text-xs font-bold text-gray-500 uppercase">Current Station</label>
             <select 
                className="w-full mt-1 p-2 border rounded-lg text-sm bg-gray-50"
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value)}
             >
                <option value="">General / Help Desk</option>
                <option value="KIT_DISTRIBUTION">Kit Distribution Counter</option>
                <optgroup label="Events">
                    {allEvents.map(e => (
                        <option key={e.name} value={e.name}>{e.name}</option>
                    ))}
                </optgroup>
             </select>
           </div>

                        {/* Offline Cache Status */}
                        <div className="mt-4 border border-gray-100 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-2">
                            <div className="flex items-center justify-between font-semibold">
                                <span>Offline Cache</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isOffline ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                                    {isOffline ? 'Offline' : 'Online'}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{rosterMeta.size} participants cached</span>
                                <button
                                    onClick={syncRoster}
                                    disabled={isOffline || rosterLoading}
                                    className="px-3 py-1 rounded-md border text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {rosterLoading ? 'Syncing…' : 'Sync now'}
                                </button>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                                <span>Pending sync</span>
                                <span className="font-semibold">{pendingActions.length}</span>
                            </div>
                            <p className="text-[11px] text-gray-400">
                                Last sync: {rosterMeta.syncedAt ? new Date(rosterMeta.syncedAt).toLocaleString() : 'Never'}
                            </p>
                                                     {syncingActions && (
                                                         <p className="text-[11px] text-blue-600 font-semibold">Syncing pending actions…</p>
                                                     )}
                            {rosterError && (
                                <p className="text-[11px] text-red-500">{rosterError}</p>
                            )}
                        </div>
        </div>

        {/* SCANNER */}
        <div className="bg-black rounded-xl overflow-hidden shadow-lg relative aspect-square">
           <div id="reader" className="w-full h-full"></div>
        </div>

        {/* LOADING */}
        {loading && (
            <div className="text-center py-4 text-blue-600 animate-pulse">
                <Loader2 className="w-8 h-8 mx-auto animate-spin" />
                <span className="text-sm font-medium">Processing...</span>
            </div>
        )}

        {/* MESSAGES */}
        {msg && (
            <div className={`p-4 rounded-lg flex items-center gap-3 ${msg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {msg.type === 'success' ? <CheckCircle className="w-5 h-5"/> : <AlertTriangle className="w-5 h-5"/>}
                <span className="text-sm font-medium">{msg.text}</span>
            </div>
        )}

        {pendingActions.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
                <div className="flex items-center justify-between font-semibold">
                    <span>Offline actions queued</span>
                    <span>{pendingActions.length}</span>
                </div>
                <ul className="mt-2 space-y-1 max-h-24 overflow-auto">
                    {pendingActions.slice(0, 3).map((action) => (
                        <li key={action.id} className="flex items-center justify-between">
                            <span>
                                {action.type === 'KIT'
                                  ? 'Kit issuance'
                                  : `Attendance: ${action.payload?.eventName || 'Event'}`}
                            </span>
                            <span className="text-[10px] font-mono">
                                {new Date(action.createdAt).toLocaleTimeString()}
                            </span>
                        </li>
                    ))}
                </ul>
                {pendingActions.length > 3 && (
                    <p className="text-[10px] text-amber-700 mt-1">+{pendingActions.length - 3} more in queue</p>
                )}
            </div>
        )}

        {/* RESULT CARD */}
        {participant && (
            <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                
                {/* User Header */}
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-start">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">{participant.firstName}</h2>
                        <div className="font-mono text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded w-fit mt-1">
                            {participant.shacklesId || "NO ID"}
                        </div>
                    </div>
                    {usedOfflineData && (
                      <span className="text-[10px] uppercase tracking-widest font-bold text-amber-600">Offline Cache</span>
                    )}
                </div>

                {/* SCENARIO 1: KIT STATION */}
                {selectedEvent === "KIT_DISTRIBUTION" && (
                    <div className="p-4 border-b border-gray-100">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-sm font-medium flex items-center gap-2">
                                <Package className="w-4 h-4 text-gray-400"/> Kit Status
                            </span>
                            <span className={`px-2 py-1 rounded text-xs font-bold ${participant.kitStatus === 'ISSUED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                {participant.kitStatus}
                            </span>
                        </div>
                        {participant.kitStatus === 'PENDING' ? (
                            <button 
                                onClick={handleKitIssue}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow transition"
                            >
                                Issue Kit Now
                            </button>
                        ) : (
                            <div className="text-center text-xs text-gray-400 py-2">
                                Kit already issued.
                            </div>
                        )}
                    </div>
                )}

                {/* SCENARIO 2: SPECIFIC EVENT STATION */}
                {selectedEvent && selectedEvent !== "KIT_DISTRIBUTION" && (
                     <div className="p-4 bg-blue-50/50">
                        <h3 className="text-xs font-bold text-blue-800 uppercase mb-3 flex items-center gap-2">
                            <Calendar className="w-4 h-4"/> Event Action: {selectedEvent}
                        </h3>
                        
                        {(() => {
                            const reg = getRegStatus(selectedEvent);
                            if (reg) {
                                // Is Registered
                                if (reg.attended) {
                                    return (
                                        <div className="p-3 bg-green-100 text-green-800 rounded-lg text-sm font-medium flex items-center gap-2">
                                            <CheckCircle className="w-4 h-4"/> Present
                                        </div>
                                    );
                                } else {
                                    return (
                                        <button 
                                            onClick={() => handleAttendance(selectedEvent)}
                                            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow pulse"
                                        >
                                            Mark Present
                                        </button>
                                    );
                                }
                            } else {
                                // Not Registered
                                return (
                                    <div className="space-y-2">
                                        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2 border border-red-100">
                                            <XCircle className="w-4 h-4"/> Not Registered for {selectedEvent}
                                        </div>
                                        <button 
                                            onClick={() => handleQuickRegister(selectedEvent)}
                                            disabled={isOffline}
                                            className="w-full py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isOffline ? 'Reconnect to register' : 'Register & Check-In'}
                                        </button>
                                    </div>
                                );
                            }
                        })()}
                     </div>
                )}

                {/* SCENARIO 3: GENERAL INFO (If no station selected) */}
                {!selectedEvent && (
                    <div className="p-4 space-y-2">
                        <div className="text-xs font-bold text-gray-400 uppercase">Registrations</div>
                        {participant.events.length === 0 && <p className="text-sm text-gray-400 italic">No events registered.</p>}
                        {participant.events.map((e) => (
                            <div key={e.eventName} className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded">
                                <span>{e.eventName}</span>
                                {e.attended ? 
                                    <CheckCircle className="w-4 h-4 text-green-500"/> : 
                                    <span className="text-gray-300 text-xs">Absent</span>
                                }
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
}
