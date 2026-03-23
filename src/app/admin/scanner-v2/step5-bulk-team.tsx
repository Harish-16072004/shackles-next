'use client';

import React, { useMemo, useState } from 'react';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useScannerContext } from './ScannerContext';
import {
  getShacklesIdExamples,
  isValidShacklesId,
  normalizeShacklesInput,
} from './scanner-steps-lib';

const MIN_FIELDS = 2;
const MAX_FIELDS = 6;

export function Step5BulkTeam() {
  const {
    participant,
    selectedEvent,
    selectedTeamMode,
    bulkTeamDraft,
    setBulkTeamDraft,
  } = useScannerContext();

  const [teamName, setTeamName] = useState(bulkTeamDraft?.teamName || '');
  const [memberInputs, setMemberInputs] = useState<string[]>(
    bulkTeamDraft?.memberShacklesIds?.length
      ? bulkTeamDraft.memberShacklesIds
      : [participant?.shacklesId || '', '']
  );
  const [leaderId, setLeaderId] = useState(
    bulkTeamDraft?.leaderShacklesId || participant?.shacklesId || ''
  );
  const [error, setError] = useState<string | null>(null);

  const normalizedMembers = useMemo(() => {
    return memberInputs.map((value) => normalizeShacklesInput(value));
  }, [memberInputs]);

  const validMembers = useMemo(() => {
    return normalizedMembers.filter((value) => isValidShacklesId(value));
  }, [normalizedMembers]);

  if (!participant || !selectedEvent || selectedTeamMode !== 'CREATE_BULK') {
    return (
      <div className="text-center p-8 text-gray-500">
        <p>Bulk setup is only available for Create Bulk mode.</p>
      </div>
    );
  }

  const addMemberField = () => {
    if (memberInputs.length >= MAX_FIELDS) return;
    setMemberInputs((prev) => [...prev, '']);
  };

  const removeMemberField = (index: number) => {
    if (memberInputs.length <= MIN_FIELDS) return;
    setMemberInputs((prev) => prev.filter((_, i) => i !== index));
  };

  const updateMember = (index: number, value: string) => {
    setMemberInputs((prev) => prev.map((current, i) => (i === index ? value : current)));
  };

  const saveDraft = () => {
    setError(null);

    const normalizedTeamName = teamName.trim();
    if (!normalizedTeamName) {
      setError('Team name is required.');
      return;
    }

    const invalidIds = normalizedMembers.filter((value) => value && !isValidShacklesId(value));
    if (invalidIds.length > 0) {
      setError(`Invalid Shackles ID format: ${invalidIds.join(', ')}`);
      return;
    }

    const uniqueValid = Array.from(new Set(validMembers));
    const minSize = selectedEvent.teamMinSize ?? 2;
    const maxSize = selectedEvent.teamMaxSize ?? 4;

    if (uniqueValid.length < minSize) {
      setError(`At least ${minSize} valid members are required.`);
      return;
    }

    if (uniqueValid.length > maxSize) {
      setError(`At most ${maxSize} members are allowed for this event.`);
      return;
    }

    if (!leaderId || !uniqueValid.includes(normalizeShacklesInput(leaderId))) {
      setError('Leader must be selected from valid members.');
      return;
    }

    setBulkTeamDraft({
      teamName: normalizedTeamName,
      memberShacklesIds: uniqueValid,
      leaderShacklesId: normalizeShacklesInput(leaderId),
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-blue-900 mb-2">Step 5: Bulk Team Setup</h2>
        <p className="text-sm text-blue-700">Enter team details and Shackles IDs for members.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Team name</label>
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Example: Byte Titans"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Member Shackles IDs</label>
            <button
              type="button"
              onClick={addMemberField}
              disabled={memberInputs.length >= MAX_FIELDS}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" /> Add member
            </button>
          </div>

          <div className="space-y-2">
            {memberInputs.map((value, index) => {
              const normalized = normalizeShacklesInput(value);
              const hasValue = normalized.length > 0;
              const valid = isValidShacklesId(normalized);

              return (
                <div key={`member-${index}`} className="flex items-center gap-2">
                  <input
                    value={value}
                    onChange={(e) => updateMember(index, e.target.value)}
                    placeholder={`Member ${index + 1} Shackles ID`}
                    className={`flex-1 border rounded-lg px-3 py-2 text-sm font-mono ${
                      hasValue && !valid ? 'border-red-400 bg-red-50' : 'border-gray-300'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => removeMemberField(index)}
                    disabled={memberInputs.length <= MIN_FIELDS}
                    className="p-2 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                    aria-label={`Remove member ${index + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-gray-500 mt-2">Examples: {getShacklesIdExamples().join(', ')}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Team leader</label>
          <select
            value={leaderId}
            onChange={(e) => setLeaderId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select leader Shackles ID</option>
            {Array.from(new Set(validMembers)).map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={saveDraft}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
      >
        Save bulk draft
      </button>

      {bulkTeamDraft && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          Draft saved for <strong>{bulkTeamDraft.teamName}</strong> with {bulkTeamDraft.memberShacklesIds.length} members.
        </div>
      )}
    </div>
  );
}
