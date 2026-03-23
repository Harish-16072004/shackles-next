'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Search } from 'lucide-react';
import { useScannerContext } from './ScannerContext';
import {
  generateActionId,
  formatTeamRegistrationError,
  normalizeShacklesInput,
} from './scanner-steps-lib';
import {
  lockTeamAfterRegistration,
  markEventAttendance,
  quickRegisterForEvent,
  scannerBulkRegisterTeam,
  getScannerJoinableTeams,
  scannerRegisterTeamMember,
  updateKitStatus,
} from '@/server/actions/event-logistics';

type JoinableTeam = {
  id: string;
  name: string;
  teamCode: string;
  memberCount: number;
  maxTeamSize: number;
  hasCapacity: boolean;
};

type OfflineAction = {
  id: string;
  type:
    | 'MARK_ATTENDANCE'
    | 'ISSUE_KIT'
    | 'QUICK_REGISTER'
    | 'TEAM_BULK_REGISTER'
    | 'TEAM_REGISTER_MEMBER'
    | 'TEAM_LOCK';
  payload: Record<string, unknown>;
  createdAt: string;
};

const QUEUE_KEY = 'scanner-v2-offline-actions';

function readQueue(): OfflineAction[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineAction[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(actions: OfflineAction[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(actions));
}

export function Step6ReviewExecute() {
  const {
    participant,
    selectedFunction,
    selectedEvent,
    selectedTeamMode,
    bulkTeamDraft,
    actionState,
    setActionState,
    setPendingTeamLock,
  } = useScannerContext();

  const [teamNameInput, setTeamNameInput] = useState('');
  const [joinSearch, setJoinSearch] = useState('');
  const [joinTeams, setJoinTeams] = useState<JoinableTeam[]>([]);
  const [joinTeamsLoading, setJoinTeamsLoading] = useState(false);
  const [selectedJoinTeamName, setSelectedJoinTeamName] = useState('');
  const [queuedCount, setQueuedCount] = useState(0);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);

  const resolvedTeamName = useMemo(() => {
    if (selectedTeamMode === 'CREATE_BULK') return bulkTeamDraft?.teamName || '';
    if (selectedTeamMode === 'JOIN_EXISTING') return selectedJoinTeamName;
    if (teamNameInput.trim().length > 0) return teamNameInput.trim();
    if (selectedTeamMode === 'CREATE_SOLO' && participant?.firstName) {
      return `${participant.firstName} Team`;
    }
    return '';
  }, [selectedTeamMode, bulkTeamDraft, selectedJoinTeamName, teamNameInput, participant]);

  useEffect(() => {
    if (!selectedEvent || selectedTeamMode !== 'JOIN_EXISTING') {
      setJoinTeams([]);
      setSelectedJoinTeamName('');
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setJoinTeamsLoading(true);
      try {
        const result = await getScannerJoinableTeams({
          eventName: selectedEvent.name,
          query: joinSearch,
        });
        if (!cancelled) {
          setJoinTeams(Array.isArray(result) ? (result as JoinableTeam[]) : []);
        }
      } finally {
        if (!cancelled) {
          setJoinTeamsLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [joinSearch, selectedEvent, selectedTeamMode]);

  const enqueueAction = useCallback((action: Omit<OfflineAction, 'id' | 'createdAt'>) => {
    const current = readQueue();
    const next = [
      ...current,
      {
        id: generateActionId(),
        createdAt: new Date().toISOString(),
        ...action,
      },
    ];
    writeQueue(next);
    setQueuedCount(next.length);
  }, []);

  const replayAction = useCallback(async (action: OfflineAction) => {
    if (action.type === 'MARK_ATTENDANCE') {
      const result = await markEventAttendance(String(action.payload.userId), String(action.payload.eventName));
      return result.success;
    }

    if (action.type === 'ISSUE_KIT') {
      const result = await updateKitStatus(String(action.payload.userId));
      return result.success;
    }

    if (action.type === 'QUICK_REGISTER') {
      const result = await quickRegisterForEvent(String(action.payload.userId), String(action.payload.eventName));
      return result.success;
    }

    if (action.type === 'TEAM_BULK_REGISTER') {
      const result = await scannerBulkRegisterTeam({
        eventName: String(action.payload.eventName),
        teamName: String(action.payload.teamName),
        memberShacklesIds: Array.isArray(action.payload.memberShacklesIds)
          ? (action.payload.memberShacklesIds as string[])
          : [],
        leaderShacklesId: String(action.payload.leaderShacklesId || ''),
        lockTeam: false,
        operationId: String(action.payload.operationId || generateActionId()),
      });
      return result.success;
    }

    if (action.type === 'TEAM_REGISTER_MEMBER') {
      const result = await scannerRegisterTeamMember(
        String(action.payload.userId),
        String(action.payload.eventName),
        String(action.payload.teamName)
      );
      return result.success;
    }

    if (action.type === 'TEAM_LOCK') {
      const result = await lockTeamAfterRegistration({
        eventName: String(action.payload.eventName),
        teamName: String(action.payload.teamName),
        leaderUserId:
          typeof action.payload.leaderUserId === 'string' ? String(action.payload.leaderUserId) : undefined,
      });
      return result.success;
    }

    return false;
  }, []);

  const flushQueue = useCallback(async () => {
    if (isSyncingQueue) return;
    const current = readQueue();
    if (current.length === 0) {
      setQueuedCount(0);
      return;
    }

    setIsSyncingQueue(true);
    try {
      const remaining: OfflineAction[] = [];
      for (const action of current) {
        const ok = await replayAction(action);
        if (!ok) {
          remaining.push(action);
        }
      }

      writeQueue(remaining);
      setQueuedCount(remaining.length);

      if (remaining.length === 0) {
        setActionState({
          status: 'success',
          message: 'All queued offline actions synced successfully.',
          error: null,
        });
      }
    } finally {
      setIsSyncingQueue(false);
    }
  }, [isSyncingQueue, replayAction, setActionState]);

  useEffect(() => {
    setQueuedCount(readQueue().length);
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      void flushQueue();
    }

    const onOnline = () => {
      void flushQueue();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
      return () => window.removeEventListener('online', onOnline);
    }

    return;
  }, [flushQueue]);

  if (!participant || !selectedFunction || !selectedEvent) {
    return (
      <div className="text-center p-8 text-gray-500">
        <p>Please complete previous steps first.</p>
      </div>
    );
  }

  const execute = async () => {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
      if (selectedFunction === 'MARK_ATTENDANCE') {
        enqueueAction({
          type: 'MARK_ATTENDANCE',
          payload: { userId: participant.id, eventName: selectedEvent.name },
        });
        setActionState({ status: 'success', message: 'Queued attendance action for sync.', error: null });
        return;
      }

      if (selectedFunction === 'ISSUE_KIT') {
        enqueueAction({ type: 'ISSUE_KIT', payload: { userId: participant.id } });
        setActionState({ status: 'success', message: 'Queued kit issue action for sync.', error: null });
        return;
      }

      if (selectedFunction === 'QUICK_REGISTER') {
        enqueueAction({
          type: 'QUICK_REGISTER',
          payload: { userId: participant.id, eventName: selectedEvent.name },
        });
        setActionState({ status: 'success', message: 'Queued quick register action for sync.', error: null });
        return;
      }

      if (selectedFunction === 'TEAM_REGISTRATION' && selectedTeamMode === 'CREATE_BULK' && bulkTeamDraft) {
        enqueueAction({
          type: 'TEAM_BULK_REGISTER',
          payload: {
            eventName: selectedEvent.name,
            teamName: bulkTeamDraft.teamName,
            memberShacklesIds: bulkTeamDraft.memberShacklesIds,
            leaderShacklesId: bulkTeamDraft.leaderShacklesId,
            operationId: generateActionId(),
          },
        });
        setActionState({ status: 'success', message: 'Queued bulk registration action for sync.', error: null });
        return;
      }

      if (selectedFunction === 'TEAM_REGISTRATION' && resolvedTeamName) {
        enqueueAction({
          type: 'TEAM_REGISTER_MEMBER',
          payload: {
            userId: participant.id,
            eventName: selectedEvent.name,
            teamName: resolvedTeamName,
          },
        });
        setActionState({ status: 'success', message: 'Queued team member action for sync.', error: null });
        return;
      }

      setActionState({ status: 'error', message: null, error: 'Cannot queue this action while offline.' });
      return;
    }

    setActionState({ status: 'processing', message: null, error: null });

    try {
      if (selectedFunction === 'MARK_ATTENDANCE') {
        const result = await markEventAttendance(participant.id, selectedEvent.name);
        if (!result.success) {
          setActionState({ status: 'error', message: null, error: result.error || 'Attendance failed.' });
          return;
        }
        setActionState({ status: 'success', message: result.message || 'Attendance marked.', error: null });
        return;
      }

      if (selectedFunction === 'ISSUE_KIT') {
        const result = await updateKitStatus(participant.id);
        if (!result.success) {
          setActionState({ status: 'error', message: null, error: result.error || 'Kit issue failed.' });
          return;
        }
        setActionState({ status: 'success', message: result.message || 'Kit issued.', error: null });
        return;
      }

      if (selectedFunction === 'QUICK_REGISTER') {
        const result = await quickRegisterForEvent(participant.id, selectedEvent.name);
        if (!result.success) {
          setActionState({ status: 'error', message: null, error: result.error || 'Quick register failed.' });
          return;
        }
        setActionState({ status: 'success', message: result.message || 'Registered successfully.', error: null });
        return;
      }

      if (selectedFunction === 'TEAM_REGISTRATION') {
        if (!selectedTeamMode) {
          setActionState({ status: 'error', message: null, error: 'Select a team mode.' });
          return;
        }

        if (selectedTeamMode === 'CREATE_BULK') {
          if (!bulkTeamDraft) {
            setActionState({ status: 'error', message: null, error: 'Save bulk draft before submitting.' });
            return;
          }

          const result = await scannerBulkRegisterTeam({
            eventName: selectedEvent.name,
            teamName: bulkTeamDraft.teamName,
            memberShacklesIds: bulkTeamDraft.memberShacklesIds,
            leaderShacklesId: bulkTeamDraft.leaderShacklesId,
            lockTeam: false,
            operationId: generateActionId(),
          });

          if (!result.success) {
            const details = formatTeamRegistrationError((result as { details?: unknown }).details);
            setActionState({
              status: 'error',
              message: null,
              error: `${result.error || 'Bulk registration failed.'}${details}`,
            });
            return;
          }

          setPendingTeamLock({
            eventName: selectedEvent.name,
            teamName: bulkTeamDraft.teamName,
          });

          setActionState({
            status: 'success',
            message: 'Bulk members registered as draft. Continue to Step 7 to lock the team.',
            error: null,
          });
          return;
        }

        if (!resolvedTeamName) {
          setActionState({ status: 'error', message: null, error: 'Team name is required.' });
          return;
        }

        const result = await scannerRegisterTeamMember(participant.id, selectedEvent.name, resolvedTeamName);
        if (!result.success) {
          const details = formatTeamRegistrationError((result as { details?: unknown }).details);
          setActionState({
            status: 'error',
            message: null,
            error: `${result.error || 'Team registration failed.'}${details}`,
          });
          return;
        }

        const successMessage = 'message' in result ? result.message : 'Member registered to team.';

        setPendingTeamLock({
          eventName: selectedEvent.name,
          teamName: resolvedTeamName,
        });

        setActionState({
          status: 'success',
          message: `${successMessage} Continue to Step 7 to lock team if ready.`,
          error: null,
        });
      }
    } catch (error) {
      setActionState({
        status: 'error',
        message: null,
        error: error instanceof Error ? error.message : 'Execution failed.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-blue-900 mb-2">Step 6: Review and Execute</h2>
        <p className="text-sm text-blue-700">Verify details, then run the selected scanner action.</p>
      </div>

      <div className="p-4 border border-gray-200 rounded-lg space-y-2 text-sm">
        <p><strong>Participant:</strong> {participant.firstName} {participant.shacklesId ? `(${participant.shacklesId})` : ''}</p>
        <p><strong>Function:</strong> {selectedFunction}</p>
        <p><strong>Event:</strong> {selectedEvent.name}</p>
        {selectedFunction === 'TEAM_REGISTRATION' && <p><strong>Team mode:</strong> {selectedTeamMode}</p>}
        {selectedTeamMode === 'CREATE_BULK' && bulkTeamDraft && (
          <>
            <p><strong>Team:</strong> {bulkTeamDraft.teamName}</p>
            <p><strong>Members:</strong> {bulkTeamDraft.memberShacklesIds.join(', ')}</p>
            <p><strong>Leader:</strong> {bulkTeamDraft.leaderShacklesId}</p>
          </>
        )}
      </div>

      {selectedFunction === 'TEAM_REGISTRATION' && selectedTeamMode === 'CREATE_SOLO' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Team name</label>
          <input
            value={teamNameInput}
            onChange={(e) => setTeamNameInput(e.target.value)}
            placeholder={`${participant.firstName} Team`}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      )}

      {selectedFunction === 'TEAM_REGISTRATION' && selectedTeamMode === 'JOIN_EXISTING' && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Find existing team</label>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              value={joinSearch}
              onChange={(e) => setJoinSearch(e.target.value)}
              placeholder="Search team by name or code"
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm"
            />
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {joinTeamsLoading ? (
              <div className="p-3 text-sm text-gray-500">Loading teams...</div>
            ) : joinTeams.length === 0 ? (
              <div className="p-3 text-sm text-gray-500">No joinable draft teams found.</div>
            ) : (
              <div className="max-h-48 overflow-auto divide-y divide-gray-100">
                {joinTeams.map((team) => {
                  const selected = selectedJoinTeamName === team.name;
                  return (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => setSelectedJoinTeamName(team.name)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${selected ? 'bg-blue-50' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900">{team.name}</span>
                        <span className="text-xs text-gray-500">{team.memberCount}/{team.maxTeamSize}</span>
                      </div>
                      <div className="text-xs text-gray-500">Code: {team.teamCode}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedJoinTeamName && (
            <p className="text-xs text-green-700">Selected team: {selectedJoinTeamName}</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={execute}
        disabled={actionState.status === 'processing'}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
      >
        {actionState.status === 'processing' ? 'Executing...' : 'Execute action'}
      </button>

      {actionState.status === 'processing' && (
        <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Processing request...
        </div>
      )}

      {(queuedCount > 0 || isSyncingQueue) && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-1">
          {isSyncingQueue ? (
            <p>Syncing queued actions...</p>
          ) : (
            <p>Queued offline actions: <strong>{queuedCount}</strong></p>
          )}
          {!isSyncingQueue && (
            <button
              type="button"
              onClick={() => void flushQueue()}
              className="text-xs px-2 py-1 rounded bg-amber-100 hover:bg-amber-200"
            >
              Retry sync now
            </button>
          )}
        </div>
      )}

      {actionState.status === 'success' && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex gap-2 text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4 mt-0.5" />
          <span>{actionState.message || 'Action completed successfully.'}</span>
        </div>
      )}

      {actionState.status === 'error' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <span>{actionState.error || 'Action failed.'}</span>
        </div>
      )}

      {selectedFunction === 'TEAM_REGISTRATION' && actionState.status === 'success' && (
        <p className="text-xs text-gray-500">Next: go to Step 7 to lock team now, or keep it in draft.</p>
      )}

      {selectedTeamMode === 'CREATE_BULK' && bulkTeamDraft && (
        <p className="text-xs text-gray-500">
          Member IDs are normalized to uppercase format (example: {normalizeShacklesInput('sh26g001')}).
        </p>
      )}
    </div>
  );
}
