"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { processQRScanAction, scannerRegisterForEvent, scannerCreateTeam } from "@/server/actions/event-logistics";
import { CheckCircle2, UserPlus, X, Users } from "lucide-react";

type FeedbackState = {
  type: "success" | "warning" | "error" | "idle" | "processing";
  message: string;
};

type RegisteredEvent = { id: string; name: string; type: string; attended: boolean };
type AvailableEvent = { id: string; name: string; type: string; participationMode?: string; minTeamSize?: number | null; maxTeamSize?: number | null };

type ParticipantDetails = {
  userId: string;
  userName: string;
  shacklesId?: string;
  registeredEvents: RegisteredEvent[];
  availableEvents: AvailableEvent[];
};

export default function ScannerWidget({ eventId, stationId = "WEB_SCANNER" }: { eventId?: string; stationId?: string }) {
  const [operationType, setOperationType] = useState<"ATTENDANCE" | "KIT">("ATTENDANCE");
  const operationTypeRef = useRef<"ATTENDANCE" | "KIT">("ATTENDANCE");
  const [feedback, setFeedback] = useState<FeedbackState>({ type: "idle", message: "AWAITING INPUT..." });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Superadmin interactive state
  const [participantDetails, setParticipantDetails] = useState<ParticipantDetails | null>(null);
  const [lastQrData, setLastQrData] = useState<string>("");
  const [selectedAttendanceEvent, setSelectedAttendanceEvent] = useState("");
  const [selectedRegisterEvent, setSelectedRegisterEvent] = useState("");

  // Team creation state
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [teamEventId, setTeamEventId] = useState("");
  const [teamLoading, setTeamLoading] = useState(false);

  useEffect(() => {
    operationTypeRef.current = operationType;
  }, [operationType]);

  useEffect(() => {
    const sse = new EventSource("/api/live-sync");
    sse.onmessage = () => {
      setIsSyncing(true);
      setTimeout(() => setIsSyncing(false), 1000);
    };
    return () => sse.close();
  }, []);

  const resetAll = useCallback(() => {
    setParticipantDetails(null);
    setLastQrData("");
    setSelectedAttendanceEvent("");
    setSelectedRegisterEvent("");
    setShowTeamModal(false);
    setTeamName("");
    setTeamMembers([]);
    setTeamEventId("");
    setFeedback({ type: "idle", message: "AWAITING INPUT..." });
    setIsPaused(false);
  }, []);

  const handleScan = useCallback(async (decodedText: string) => {
    if (isPaused) return;

    setIsPaused(true);
    setFeedback({ type: "processing", message: "DECRYPTING PAYLOAD..." });

    try {
      const data = await processQRScanAction({
        qrData: decodedText,
        stationId: stationId || "WEB_SCANNER",
        eventId,
        operationType: operationTypeRef.current,
      });

      if (!data.success) {
        setFeedback({ type: "error", message: data.error || "SCAN ERROR" });
      } else if (data.registeredEvents && data.availableEvents) {
        // Superadmin mode — show interactive panel instead of auto-processing
        setFeedback({ type: "success", message: "PARTICIPANT FOUND" });
        setLastQrData(decodedText);
        setParticipantDetails({
          userId: data.userId,
          userName: data.userName,
          shacklesId: data.shacklesId,
          registeredEvents: data.registeredEvents,
          availableEvents: data.availableEvents,
        });
        return; // Don't auto-resume — wait for admin action
      } else if (data.message && data.message.toLowerCase().includes("already")) {
        setFeedback({ type: "warning", message: data.message.toUpperCase() });
      } else {
        setFeedback({ type: "success", message: (data.message || "SUCCESS").toUpperCase() });
      }
    } catch (err) {
      setFeedback({ type: "error", message: "NETWORK ERROR" });
    }

    setTimeout(() => {
      setFeedback({ type: "idle", message: "AWAITING INPUT..." });
      setIsPaused(false);
    }, 2500);
  }, [eventId, stationId, isPaused]);

  // ── Mark attendance for a registered event ──
  const handleMarkAttendance = async () => {
    if (!selectedAttendanceEvent) return;
    setParticipantDetails(null);
    setFeedback({ type: "processing", message: "MARKING ATTENDANCE..." });
    try {
      const data = await processQRScanAction({
        qrData: lastQrData,
        stationId: stationId || "WEB_SCANNER",
        eventId: selectedAttendanceEvent,
        operationType: "ATTENDANCE",
      });
      if (!data.success) {
        setFeedback({ type: "error", message: data.error || "FAILED" });
      } else if (data.message && data.message.toLowerCase().includes("already")) {
        setFeedback({ type: "warning", message: data.message.toUpperCase() });
      } else {
        setFeedback({ type: "success", message: (data.message || "ATTENDANCE MARKED").toUpperCase() });
      }
    } catch {
      setFeedback({ type: "error", message: "NETWORK ERROR" });
    }
    setTimeout(resetAll, 2500);
  };

  // ── Register for an available event ──
  const handleRegister = async () => {
    if (!selectedRegisterEvent || !participantDetails?.shacklesId) return;

    const selectedEvent = participantDetails.availableEvents.find(e => e.id === selectedRegisterEvent);
    if (!selectedEvent) return;

    // Team event → open the team creation modal
    if (selectedEvent.participationMode === "TEAM") {
      setTeamEventId(selectedRegisterEvent);
      setTeamMembers(new Array(Math.max(1, (selectedEvent.maxTeamSize || 2) - 1)).fill(""));
      setShowTeamModal(true);
      return;
    }

    // Individual event → register directly
    setFeedback({ type: "processing", message: "REGISTERING..." });
    setParticipantDetails(null);
    try {
      const data = await scannerRegisterForEvent({
        shacklesId: participantDetails.shacklesId,
        eventId: selectedRegisterEvent,
      });
      if (!data.success) {
        setFeedback({ type: "error", message: data.error || "REGISTRATION FAILED" });
      } else {
        setFeedback({ type: "success", message: (data.message || "REGISTERED SUCCESSFULLY").toUpperCase() });
      }
    } catch {
      setFeedback({ type: "error", message: "NETWORK ERROR" });
    }
    setTimeout(resetAll, 2500);
  };

  // ── Create team for a team event ──
  const handleCreateTeam = async (lockStatus: "OPEN" | "LOCKED") => {
    if (!participantDetails?.shacklesId || !teamEventId) return;

    if (!teamName.trim()) {
      setFeedback({ type: "error", message: "TEAM NAME REQUIRED" });
      return;
    }

    const memberIds = teamMembers.filter(id => id.trim());

    if (lockStatus === "LOCKED" && memberIds.length < teamMembers.length) {
      const confirmLock = window.confirm("LOCK TEAM WITH VACANCIES?");
      if (!confirmLock) return;
    }

    setTeamLoading(true);
    try {
      const data = await scannerCreateTeam({
        scannedShacklesId: participantDetails.shacklesId,
        memberShacklesIds: memberIds,
        eventId: teamEventId,
        teamName: teamName.trim(),
        lockStatus,
      });
      if (!data.success) {
        setFeedback({ type: "error", message: data.error || "TEAM CREATION FAILED" });
      } else {
        setFeedback({ type: "success", message: `TEAM "${teamName.toUpperCase()}" CREATED` });
      }
    } catch {
      setFeedback({ type: "error", message: "TEAM CREATION FAILED" });
    } finally {
      setTeamLoading(false);
    }
    setTimeout(resetAll, 2500);
  };

  const getFeedbackStyles = () => {
    switch (feedback.type) {
      case "success": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "warning": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "error": return "bg-rose-500/10 text-rose-500 border-rose-500/20";
      case "processing": return "bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse";
      default: return "bg-slate-500/5 text-slate-400 border-slate-500/10";
    }
  };

  return (
    <div className="flex flex-col w-full max-w-md mx-auto bg-slate-900 shadow-2xl rounded-3xl overflow-hidden border border-slate-800">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
          </div>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">SCAN TERMINAL</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${isSyncing ? "bg-emerald-400 shadow-[0_0_10px_#10b981]" : "bg-slate-700"}`} />
          <span className="text-[9px] font-bold text-slate-500 tracking-widest uppercase">Live</span>
        </div>
      </div>

      {/* Viewfinder Area */}
      <div className="relative aspect-square w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {/* Decorative Grid Overlay */}
        <div className="absolute inset-0 z-0 opacity-10 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

        <div className="w-full relative z-10">
          <Scanner
            paused={isPaused}
            onScan={(result) => {
              if (result && result.length > 0) {
                handleScan(result[0].rawValue);
              }
            }}
            allowMultiple={true}
            scanDelay={500}
            constraints={{ facingMode: "environment" }}
            components={{
              zoom: true,
              finder: true,
            }}
          />

          {/* Scanning Animation */}
          {!isPaused && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
              <div className="w-full h-[2px] bg-blue-500/50 shadow-[0_0_15px_#3b82f6] animate-scan-line" />
            </div>
          )}

          {/* Processing spinner (no participant details yet) */}
          {isPaused && !participantDetails && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center z-30 backdrop-blur-md">
              <div className="relative">
                <div className="w-12 h-12 border-2 border-blue-500/20 rounded-full animate-ping absolute inset-0" />
                <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin relative" />
              </div>
              <p className="mt-6 text-blue-400 text-[10px] font-black tracking-[0.4em] uppercase">{feedback.type === 'processing' ? 'Processing' : 'Standby'}</p>
            </div>
          )}

          {/* ── Superadmin Interactive Overlay ── */}
          {isPaused && participantDetails && !showTeamModal && (
            <div className="absolute inset-0 bg-slate-900/95 flex flex-col z-40 backdrop-blur-md p-5 overflow-y-auto">
              <button
                onClick={resetAll}
                className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors z-50"
              >
                <X size={22} />
              </button>

              {/* Participant info */}
              <div className="text-center mb-4 pt-2">
                <h3 className="text-lg font-bold text-white mb-0.5">{participantDetails.userName}</h3>
                <p className="text-xs text-blue-400 font-mono">{participantDetails.shacklesId}</p>
              </div>

              <div className="w-full space-y-4 text-left flex-1">
                {/* Mark Attendance section */}
                {participantDetails.registeredEvents.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Mark Attendance For</label>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white p-2.5 outline-none focus:border-emerald-500 transition-colors"
                        value={selectedAttendanceEvent}
                        onChange={(e) => setSelectedAttendanceEvent(e.target.value)}
                      >
                        <option value="">-- Select Event --</option>
                        {participantDetails.registeredEvents.map(e => (
                          <option key={e.id} value={e.id} disabled={e.attended}>
                            {e.name} {e.attended ? '✓ Attended' : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleMarkAttendance}
                        disabled={!selectedAttendanceEvent}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2.5 rounded-xl transition-colors flex items-center justify-center"
                      >
                        <CheckCircle2 size={18} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Divider */}
                {participantDetails.registeredEvents.length > 0 && participantDetails.availableEvents.length > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-700" />
                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">or</span>
                    <div className="flex-1 h-px bg-slate-700" />
                  </div>
                )}

                {/* Register For section */}
                {participantDetails.availableEvents.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Register For</label>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white p-2.5 outline-none focus:border-blue-500 transition-colors"
                        value={selectedRegisterEvent}
                        onChange={(e) => setSelectedRegisterEvent(e.target.value)}
                      >
                        <option value="">-- Select Event --</option>
                        {participantDetails.availableEvents.map(e => (
                          <option key={e.id} value={e.id}>
                            {e.name} ({e.type})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleRegister}
                        disabled={!selectedRegisterEvent}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2.5 rounded-xl transition-colors flex items-center justify-center"
                      >
                        <UserPlus size={18} />
                      </button>
                    </div>
                  </div>
                )}

                {/* No events available */}
                {participantDetails.registeredEvents.length === 0 && participantDetails.availableEvents.length === 0 && (
                  <p className="text-center text-sm text-slate-500 py-4">No events available for this participant.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Control Hub */}
      <div className="p-6 space-y-6 bg-slate-900">
        {/* Toggle Controls */}
        <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800">
          {(["ATTENDANCE", "KIT"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setOperationType(type)}
              className={`flex-1 py-3 text-[11px] font-black tracking-widest rounded-xl transition-all duration-300 ${operationType === type
                ? "bg-slate-800 text-white shadow-lg border border-slate-700"
                : "text-slate-500 hover:text-slate-400"
                }`}
            >
              {type === "ATTENDANCE" ? "EVENT ATTENDANCE" : "KIT LOGISTICS"}
            </button>
          ))}
        </div>

        {/* Feedback Display */}
        <div className={`group relative p-5 rounded-2xl border transition-all duration-500 overflow-hidden ${getFeedbackStyles()}`}>
          {/* Status Glow */}
          <div className="absolute top-0 right-0 p-2 opacity-20">
            <div className="w-24 h-24 bg-current rounded-full blur-[40px]" />
          </div>

          <div className="relative flex flex-col items-center justify-center min-h-[60px]">
            <p className="text-[9px] font-bold uppercase tracking-[0.3em] mb-2 opacity-60">System Status</p>
            <p className="text-sm font-black tracking-widest text-center uppercase break-words leading-relaxed">
              {feedback.message}
            </p>
          </div>
        </div>
      </div>

      {/* ── Team Creation Modal ── */}
      {showTeamModal && participantDetails && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl p-8 max-w-md w-full relative animate-in zoom-in-95 duration-300">
            <button
              onClick={() => { setShowTeamModal(false); setTeamName(""); setTeamMembers([]); }}
              className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>

            <div className="mb-8">
              <h3 className="text-2xl font-black text-white tracking-tight mb-2 uppercase">Create Team</h3>
              <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">
                {participantDetails.userName} · {participantDetails.shacklesId}
              </p>
            </div>

            <div className="space-y-6 mb-10">
              <div>
                <label className="text-[10px] font-black text-slate-500 tracking-widest uppercase block mb-2 ml-1">Team Designation</label>
                <input
                  type="text"
                  placeholder="E.G. THE VINTAGE CREW"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-950 border border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white font-bold text-sm tracking-wide"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 tracking-widest uppercase block mb-2 ml-1">Member Shackles IDs</label>
                <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {teamMembers.map((id, index) => (
                    <div key={index} className="relative group">
                      <input
                        type="text"
                        placeholder={`MEMBER ${index + 1} ID`}
                        value={id}
                        onChange={(e) => {
                          const newMembers = [...teamMembers];
                          newMembers[index] = e.target.value;
                          setTeamMembers(newMembers);
                        }}
                        className="w-full px-5 py-4 bg-slate-950 border border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white font-bold text-sm tracking-wide"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20">
                        <Users size={16} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleCreateTeam("LOCKED")}
                disabled={teamLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-blue-900/20 text-xs tracking-widest uppercase"
              >
                {teamLoading ? 'PROCESSING...' : 'FINALIZE REGISTRATION'}
              </button>
              <button
                onClick={() => handleCreateTeam("OPEN")}
                disabled={teamLoading}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-300 font-black py-4 rounded-2xl transition-all text-xs tracking-widest uppercase"
              >
                {teamLoading ? '...' : 'SAVE AS DRAFT'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
