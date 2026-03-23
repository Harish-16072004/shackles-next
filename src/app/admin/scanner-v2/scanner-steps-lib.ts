import { ParticipantRecord, EventMetadata } from './ScannerContext';

/**
 * Validate if a participant can perform a specific function
 */
export function getAvailableFunctions(participant: ParticipantRecord | null): string[] {
  if (!participant) return [];

  // TODO: Enhance with actual eligibility logic from event-logistics
  // For now, assume all functions available
  return [
    'MARK_ATTENDANCE',
    'ISSUE_KIT',
    'QUICK_REGISTER',
    'TEAM_REGISTRATION',
  ];
}

/**
 * Filter available events based on selected function
 */
export function filterEventsByFunction(
  events: EventMetadata[],
  selectedFunction: string | null,
  participant: ParticipantRecord | null
) {
  if (!selectedFunction || !participant) return [];

  let filtered = events;

  switch (selectedFunction) {
    case 'MARK_ATTENDANCE':
      // Only events where participant is registered but not attended
      filtered = events.filter((e) => {
        const reg = participant.events.find((ev) => ev.eventName === e.name);
        return reg && !reg.attended;
      });
      break;

    case 'ISSUE_KIT':
      // Only KIT_DISTRIBUTION (one-off, not event-specific)
      // For now, filter type === 'KIT_DISTRIBUTION'
      filtered = events.filter((e) => e.type === 'KIT_DISTRIBUTION');
      break;

    case 'QUICK_REGISTER':
      // Only INDIVIDUAL events
      filtered = events.filter((e) => e.participationMode === 'INDIVIDUAL');
      break;

    case 'TEAM_REGISTRATION':
      // Only TEAM events
      filtered = events.filter((e) => e.participationMode === 'TEAM');
      break;

    default:
      return [];
  }

  return filtered;
}

/**
 * Get available team modes based on participant and event
 */
export function getAvailableTeamModes(
  participant: ParticipantRecord | null,
  selectedEvent: EventMetadata | null,
  bulkFlowEnabled: boolean
) {
  if (!participant || !selectedEvent) return [];

  const modes: Array<{ value: string; label: string; enabled: boolean }> = [];

  // Check if already in a team for this event
  const existingReg = participant.events.find((e) => e.eventName === selectedEvent.name);
  const alreadyInTeam = existingReg && existingReg.teamName;

  modes.push({
    value: 'CREATE_SOLO',
    label: 'Create Solo Team',
    enabled: !alreadyInTeam,
  });

  if (bulkFlowEnabled) {
    modes.push({
      value: 'CREATE_BULK',
      label: 'Create Bulk Team (Multiple Members)',
      enabled: !alreadyInTeam,
    });
  }

  modes.push({
    value: 'JOIN_EXISTING',
    label: 'Join Existing Team',
    enabled: true, // TODO: Check if team joins are open in event
  });

  return modes;
}

/**
 * Format Shackles ID (normalize: uppercase, remove spaces/special chars)
 */
export const SHACKLES_ID_PATTERN = /^SH\d{2}[GWC]\d{3,}$/;

export function normalizeShacklesInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

export function isValidShacklesId(value: string): boolean {
  const normalized = normalizeShacklesInput(value);
  return SHACKLES_ID_PATTERN.test(normalized);
}

/**
 * Shackles ID format examples: SH26G001, SH26W123, SH26C999
 */
export function getShacklesIdExamples(): string[] {
  return ['SH26G001', 'SH26W123', 'SH26C999'];
}

/**
 * Validate step progression
 */
export function canProceedToStep(
  currentStep: number,
  sessionData: {
    participant?: ParticipantRecord | null;
    selectedFunction?: string | null;
    selectedEvent?: EventMetadata | null;
    selectedTeamMode?: string | null;
    bulkTeamDraft?: { teamName: string; memberShacklesIds: string[] } | null;
    pendingTeamLock?: { eventName: string; teamName: string } | null;
    actionStatus?: 'idle' | 'processing' | 'success' | 'error';
  }
): { canProceed: boolean; reason?: string } {
  // Step 1 (scan) can always be accessed
  if (currentStep === 1) return { canProceed: true };

  // Step 2+ requires scanned participant
  if (!sessionData.participant) {
    return { canProceed: false, reason: 'Scan a participant first' };
  }

  if (currentStep === 2) return { canProceed: true };

  // Step 3+ requires selected function
  if (!sessionData.selectedFunction) {
    return { canProceed: false, reason: 'Select an action first' };
  }

  if (currentStep === 3) return { canProceed: true };

  // Step 4+ requires selected event
  if (!sessionData.selectedEvent) {
    return { canProceed: false, reason: 'Select an event first' };
  }

  if (currentStep === 4) {
    if (sessionData.selectedFunction !== 'TEAM_REGISTRATION') {
      return { canProceed: false, reason: 'Step 4 is only for team registration flows' };
    }
    return { canProceed: true };
  }

  // Step 5+ requires selected team mode (for team registration only)
  if (sessionData.selectedFunction === 'TEAM_REGISTRATION' && !sessionData.selectedTeamMode) {
    return { canProceed: false, reason: 'Select a team mode first' };
  }

  if (currentStep === 5) {
    if (sessionData.selectedFunction !== 'TEAM_REGISTRATION' || sessionData.selectedTeamMode !== 'CREATE_BULK') {
      return { canProceed: false, reason: 'Step 5 is only for bulk team mode' };
    }
    return { canProceed: true };
  }

  if (currentStep === 6) {
    if (sessionData.selectedFunction === 'TEAM_REGISTRATION' && sessionData.selectedTeamMode === 'CREATE_BULK') {
      if (!sessionData.bulkTeamDraft || !sessionData.bulkTeamDraft.teamName || sessionData.bulkTeamDraft.memberShacklesIds.length === 0) {
        return { canProceed: false, reason: 'Save bulk draft before review' };
      }
    }
    return { canProceed: true };
  }

  if (currentStep === 7) {
    if (sessionData.selectedFunction !== 'TEAM_REGISTRATION') {
      return { canProceed: false, reason: 'Step 7 is only for team registration' };
    }
    if (!sessionData.pendingTeamLock) {
      return { canProceed: false, reason: 'No team is pending lock' };
    }
    return { canProceed: true };
  }

  return { canProceed: true };
}

/**
 * Generate a unique action ID for idempotency
 */
export function generateActionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Format team registration error details
 */
export function formatTeamRegistrationError(details: unknown): string {
  if (!details || typeof details !== 'object') return '';

  const typed = details as Record<string, unknown>;
  const labels: Array<{ key: string; label: string }> = [
    { key: 'missingIds', label: 'Unknown IDs' },
    { key: 'unpaidIds', label: 'Payment pending' },
    { key: 'existingIds', label: 'Already registered' },
  ];

  const lines = labels
    .map(({ key, label }) => {
      const value = typed[key];
      if (!Array.isArray(value) || value.length === 0) return '';
      return `${label}: ${value.join(', ')}`;
    })
    .filter((line) => line.length > 0);

  return lines.length > 0 ? ` (${lines.join(' | ')})` : '';
}
