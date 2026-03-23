'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type ParticipantRecord = {
  id: string;
  firstName: string;
  shacklesId: string | null;
  events: Array<{
    eventName: string;
    attended: boolean;
    teamName?: string | null;
    memberRole?: string | null;
  }>;
};

export type EventMetadata = {
  name: string;
  type: string | null;
  participationMode: 'INDIVIDUAL' | 'TEAM';
  teamMinSize: number | null;
  teamMaxSize: number | null;
};

export type BulkTeamDraft = {
  teamName: string;
  memberShacklesIds: string[];
  leaderShacklesId: string;
};

export type PendingTeamLock = {
  eventName: string;
  teamName: string;
};

export type ActionState = {
  status: 'idle' | 'processing' | 'success' | 'error';
  message: string | null;
  error: string | null;
};

export type ScannerContextType = {
  // Phase 1: Scanned participant
  participant: ParticipantRecord | null;
  scannedShacklesId: string | null;
  setScannedData: (participant: ParticipantRecord, shacklesId: string) => void;

  // Phase 2-3: Action and event selection
  selectedFunction: 'MARK_ATTENDANCE' | 'ISSUE_KIT' | 'QUICK_REGISTER' | 'TEAM_REGISTRATION' | null;
  setSelectedFunction: (fn: 'MARK_ATTENDANCE' | 'ISSUE_KIT' | 'QUICK_REGISTER' | 'TEAM_REGISTRATION' | null) => void;

  selectedEvent: EventMetadata | null;
  setSelectedEvent: (event: EventMetadata | null) => void;

  // Phase 4: Team mode (for team registration only)
  selectedTeamMode: 'CREATE_SOLO' | 'CREATE_BULK' | 'JOIN_EXISTING' | null;
  setSelectedTeamMode: (mode: 'CREATE_SOLO' | 'CREATE_BULK' | 'JOIN_EXISTING' | null) => void;

  bulkTeamDraft: BulkTeamDraft | null;
  setBulkTeamDraft: (draft: BulkTeamDraft | null) => void;

  pendingTeamLock: PendingTeamLock | null;
  setPendingTeamLock: (pending: PendingTeamLock | null) => void;

  actionState: ActionState;
  setActionState: (state: ActionState) => void;

  // Phase 5-7: Form state (not shared between steps for cleanliness)
  // Each step manages its own state locally

  // Utilities
  resetContext: () => void;
  resetFromStep: (step: number) => void;
};

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

export function ScannerProvider({ children }: { children: ReactNode }) {
  const [participant, setParticipant] = useState<ParticipantRecord | null>(null);
  const [scannedShacklesId, setScannedShacklesId] = useState<string | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<ScannerContextType['selectedFunction']>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventMetadata | null>(null);
  const [selectedTeamMode, setSelectedTeamMode] = useState<ScannerContextType['selectedTeamMode']>(null);
  const [bulkTeamDraft, setBulkTeamDraft] = useState<BulkTeamDraft | null>(null);
  const [pendingTeamLock, setPendingTeamLock] = useState<PendingTeamLock | null>(null);
  const [actionState, setActionState] = useState<ActionState>({
    status: 'idle',
    message: null,
    error: null,
  });

  const setScannedData = (p: ParticipantRecord, shacklesId: string) => {
    setParticipant(p);
    setScannedShacklesId(shacklesId);
    // Reset downstream selections when new scan happens
    setSelectedFunction(null);
    setSelectedEvent(null);
    setSelectedTeamMode(null);
    setBulkTeamDraft(null);
    setPendingTeamLock(null);
    setActionState({ status: 'idle', message: null, error: null });
  };

  const resetContext = () => {
    setParticipant(null);
    setScannedShacklesId(null);
    setSelectedFunction(null);
    setSelectedEvent(null);
    setSelectedTeamMode(null);
    setBulkTeamDraft(null);
    setPendingTeamLock(null);
    setActionState({ status: 'idle', message: null, error: null });
  };

  const resetFromStep = (step: number) => {
    // If going back from step 2+, might want to reset certain things
    // For now, minimal reset strategy: only clear downstream steps
    if (step <= 1) {
      resetContext();
    } else if (step === 2) {
      setSelectedEvent(null);
      setSelectedTeamMode(null);
      setBulkTeamDraft(null);
      setPendingTeamLock(null);
      setActionState({ status: 'idle', message: null, error: null });
    } else if (step === 3) {
      setSelectedTeamMode(null);
      setBulkTeamDraft(null);
      setPendingTeamLock(null);
      setActionState({ status: 'idle', message: null, error: null });
    } else if (step === 4) {
      setBulkTeamDraft(null);
      setPendingTeamLock(null);
      setActionState({ status: 'idle', message: null, error: null });
    } else if (step === 5) {
      setPendingTeamLock(null);
      setActionState({ status: 'idle', message: null, error: null });
    }
  };

  return (
    <ScannerContext.Provider
      value={{
        participant,
        scannedShacklesId,
        setScannedData,
        selectedFunction,
        setSelectedFunction,
        selectedEvent,
        setSelectedEvent,
        selectedTeamMode,
        setSelectedTeamMode,
        bulkTeamDraft,
        setBulkTeamDraft,
        pendingTeamLock,
        setPendingTeamLock,
        actionState,
        setActionState,
        resetContext,
        resetFromStep,
      }}
    >
      {children}
    </ScannerContext.Provider>
  );
}

export function useScannerContext() {
  const ctx = useContext(ScannerContext);
  if (!ctx) {
    throw new Error('useScannerContext must be called within ScannerProvider');
  }
  return ctx;
}
