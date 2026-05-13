"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";

type FeedbackState = {
  type: "success" | "warning" | "error" | "idle" | "processing";
  message: string;
};

export default function ScannerWidget({ eventId, stationId = "WEB_SCANNER" }: { eventId?: string; stationId?: string }) {
  const [operationType, setOperationType] = useState<"ATTENDANCE" | "KIT">("ATTENDANCE");
  const operationTypeRef = useRef<"ATTENDANCE" | "KIT">("ATTENDANCE");
  const [feedback, setFeedback] = useState<FeedbackState>({ type: "idle", message: "AWAITING INPUT..." });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

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

  const handleScan = useCallback(async (decodedText: string) => {
    if (isPaused) return;

    setIsPaused(true);
    setFeedback({ type: "processing", message: "DECRYPTING PAYLOAD..." });

    try {
      const res = await fetch("/api/scanner/qr-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrData: decodedText,
          stationId,
          eventId,
          operationType: operationTypeRef.current,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setFeedback({ type: "error", message: data.error || "SCAN ERROR" });
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
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">SCAN TERMINAL v2.0</span>
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

          {isPaused && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center z-30 backdrop-blur-md">
              <div className="relative">
                <div className="w-12 h-12 border-2 border-blue-500/20 rounded-full animate-ping absolute inset-0" />
                <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin relative" />
              </div>
              <p className="mt-6 text-blue-400 text-[10px] font-black tracking-[0.4em] uppercase">{feedback.type === 'processing' ? 'Processing' : 'Standby'}</p>
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
              className={`flex-1 py-3 text-[11px] font-black tracking-widest rounded-xl transition-all duration-300 ${
                operationType === type 
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
    </div>
  );
}

