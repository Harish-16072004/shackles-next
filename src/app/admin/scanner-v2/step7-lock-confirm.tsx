'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Unlock } from 'lucide-react';
import { useScannerContext } from './ScannerContext';
import { lockTeamAfterRegistration } from '@/server/actions/event-logistics';
import { generateActionId } from './scanner-steps-lib';
import {
  readOfflineQueue,
  appendOfflineAction,
  removeOfflineAction,
  type OfflineAction,
} from '@/lib/offline-queue-db';

// Removed localStorage helpers in favor of IndexedDB logic from offline-queue-db.ts

export function Step7LockConfirm() {
  const {
    participant,
    selectedFunction,
    pendingTeamLock,
    actionState,
    setActionState,
    setPendingTeamLock,
  } = useScannerContext();
  const [queuedLockCount, setQueuedLockCount] = useState(0);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);

  const enqueueTeamLock = useCallback(async (payload: Record<string, unknown>) => {
    const newAction: OfflineAction = {
      id: generateActionId(),
      type: 'TEAM_LOCK',
      payload,
      createdAt: new Date().toISOString(),
    };
    await appendOfflineAction(newAction);
    const current = await readOfflineQueue();
    setQueuedLockCount(current.filter((item) => item.type === 'TEAM_LOCK').length);
  }, []);

  const flushLockQueue = useCallback(async () => {
    if (isSyncingQueue) return;

    const current = await readOfflineQueue();
    if (current.length === 0) {
      setQueuedLockCount(0);
      return;
    }

    setIsSyncingQueue(true);
    try {
      const remaining: OfflineAction[] = [];

      for (const action of current) {
        if (action.type !== 'TEAM_LOCK') {
          remaining.push(action);
          continue;
        }

        const result = await lockTeamAfterRegistration({
          eventName: String(action.payload.eventName || ''),
          teamName: String(action.payload.teamName || ''),
          leaderUserId:
            typeof action.payload.leaderUserId === 'string' ? String(action.payload.leaderUserId) : undefined,
        });

        if (result.success) {
          await removeOfflineAction(action.id);
        } else {
          remaining.push(action);
        }
      }

      setQueuedLockCount(remaining.filter((item) => item.type === 'TEAM_LOCK').length);

      if (remaining.every((item) => item.type !== 'TEAM_LOCK')) {
        setActionState({
          status: 'success',
          message: 'Queued team lock actions synced successfully.',
          error: null,
        });
      }
    } finally {
      setIsSyncingQueue(false);
    }
  }, [isSyncingQueue, setActionState]);

  useEffect(() => {
    const init = async () => {
      const current = await readOfflineQueue();
      setQueuedLockCount(current.filter((item) => item.type === 'TEAM_LOCK').length);

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void flushLockQueue();
      }
    };
    init();

    const onOnline = () => {
      void flushLockQueue();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
      return () => window.removeEventListener('online', onOnline);
    }

    return;
  }, [flushLockQueue]);

  if (selectedFunction !== 'TEAM_REGISTRATION') {
    return (
      <div className="text-center p-8 text-gray-500">
        <p>Lock confirmation applies only to team registration.</p>
      </div>
    );
  }

  if (!pendingTeamLock) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
        No team draft is pending lock. Complete Step 6 first.
      </div>
    );
  }

  const lockTeam = async () => {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
      await enqueueTeamLock({
        eventName: pendingTeamLock.eventName,
        teamName: pendingTeamLock.teamName,
        leaderUserId: participant?.id,
      });

      setActionState({
        status: 'success',
        message: `Lock action queued for ${pendingTeamLock.teamName}. It will sync when online.`,
        error: null,
      });
      setPendingTeamLock(null);
      return;
    }

    setActionState({ status: 'processing', message: null, error: null });

    try {
      const result = await lockTeamAfterRegistration({
        eventName: pendingTeamLock.eventName,
        teamName: pendingTeamLock.teamName,
        leaderUserId: participant?.id,
      });

      if (!result.success) {
        setActionState({
          status: 'error',
          message: null,
          error: result.error || 'Failed to lock team.',
        });
        return;
      }

      const successMessage = 'message' in result ? result.message : 'Team locked successfully.';

      setActionState({
        status: 'success',
        message: successMessage,
        error: null,
      });
      setPendingTeamLock(null);
    } catch (error) {
      setActionState({
        status: 'error',
        message: null,
        error: error instanceof Error ? error.message : 'Unable to lock team.',
      });
    }
  };

  const keepDraft = () => {
    setActionState({
      status: 'success',
      message: `Team ${pendingTeamLock.teamName} kept as draft. You can lock it later from scanner/admin actions.`,
      error: null,
    });
    setPendingTeamLock(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-amber-900 mb-2">Step 7: Lock Team Confirmation</h2>
        <p className="text-sm text-amber-700">Locking finalizes membership and prevents further edits.</p>
      </div>

      <div className="p-4 border border-gray-200 rounded-lg space-y-2 text-sm">
        <p><strong>Event:</strong> {pendingTeamLock.eventName}</p>
        <p><strong>Team:</strong> {pendingTeamLock.teamName}</p>
      </div>

      <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-sm text-red-700">
        <AlertTriangle className="w-4 h-4 mt-0.5" />
        <span>Once locked, the team cannot be modified in draft flow.</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={lockTeam}
          disabled={actionState.status === 'processing'}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
        >
          {actionState.status === 'processing' ? 'Locking...' : 'Lock Team'}
        </button>

        <button
          type="button"
          onClick={keepDraft}
          className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300"
        >
          <span className="inline-flex items-center gap-2">
            <Unlock className="w-4 h-4" /> Keep Draft
          </span>
        </button>
      </div>

      {actionState.status === 'processing' && (
        <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Updating team status...
        </div>
      )}

      {(queuedLockCount > 0 || isSyncingQueue) && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-1">
          {isSyncingQueue ? (
            <p>Syncing queued lock actions...</p>
          ) : (
            <p>Queued lock actions: <strong>{queuedLockCount}</strong></p>
          )}
          {!isSyncingQueue && (
            <button
              type="button"
              onClick={() => void flushLockQueue()}
              className="text-xs px-2 py-1 rounded-sm bg-amber-100 hover:bg-amber-200"
            >
              Retry lock sync
            </button>
          )}
        </div>
      )}

      {actionState.status === 'success' && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex gap-2 text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4 mt-0.5" />
          <span>{actionState.message || 'Completed.'}</span>
        </div>
      )}
    </div>
  );
}
