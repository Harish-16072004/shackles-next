'use client';

import React, { useEffect, useState } from 'react';
import { Users, User, Link2 } from 'lucide-react';
import { useScannerContext } from './ScannerContext';
import { getScannerBulkTeamFlowStatus } from '@/server/actions/event-logistics';

const TEAM_MODE_CONFIG: Record<string, { icon: React.ReactNode; label: string; description: string }> = {
  CREATE_SOLO: {
    icon: <User className="w-6 h-6" />,
    label: 'Create Solo Team',
    description: 'Register this person as a solo team member or single team',
  },
  CREATE_BULK: {
    icon: <Users className="w-6 h-6" />,
    label: 'Create Bulk Team',
    description: 'Register multiple teammates at once with Shackles IDs',
  },
  JOIN_EXISTING: {
    icon: <Link2 className="w-6 h-6" />,
    label: 'Join Existing Team',
    description: 'Add this person to an existing team',
  },
};

export function Step4TeamMode() {
  const { selectedFunction, selectedEvent, selectedTeamMode, setSelectedTeamMode } = useScannerContext();
  const [bulkFlowEnabled, setBulkFlowEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkBulkFlow = async () => {
      try {
        const status = await getScannerBulkTeamFlowStatus();
        setBulkFlowEnabled(status.enabled);
      } catch (err) {
        console.error('Failed to check bulk flow status', err);
      } finally {
        setLoading(false);
      }
    };
    checkBulkFlow();
  }, []);

  if (!selectedFunction || !selectedEvent) {
    return (
      <div className="text-center p-8 text-gray-500">
        <p>Please complete previous steps first.</p>
      </div>
    );
  }

  if (selectedFunction !== 'TEAM_REGISTRATION') {
    return (
      <div className="text-center p-8 text-gray-500">
        <p>This step only applies to team registration. Proceeding...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center p-8">
        <div className="w-6 h-6 mx-auto mb-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-600">Checking team mode availability...</p>
      </div>
    );
  }

  const availableModes: Array<{ value: string; label: string; config: (typeof TEAM_MODE_CONFIG)[string]; enabled: boolean }> = [
    {
      value: 'CREATE_SOLO',
      label: 'CREATE_SOLO',
      config: TEAM_MODE_CONFIG.CREATE_SOLO,
      enabled: true,
    },
    {
      value: 'CREATE_BULK',
      label: 'CREATE_BULK',
      config: TEAM_MODE_CONFIG.CREATE_BULK,
      enabled: bulkFlowEnabled,
    },
    {
      value: 'JOIN_EXISTING',
      label: 'JOIN_EXISTING',
      config: TEAM_MODE_CONFIG.JOIN_EXISTING,
      enabled: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-blue-900 mb-2">Step 4: Select Team Mode</h2>
        <p className="text-sm text-blue-700">Choose how to register for {selectedEvent.name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {availableModes.map((mode) => {
          const isSelected = selectedTeamMode === mode.value;
          const isDisabled = !mode.enabled;

          return (
            <button
              key={mode.value}
              onClick={() => !isDisabled && setSelectedTeamMode(mode.value as any)}
              disabled={isDisabled}
              className={`p-4 border-2 rounded-lg transition text-left ${
                isDisabled
                  ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                  : isSelected
                    ? 'border-blue-600 bg-blue-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-blue-400 hover:shadow-sm'
              }`}
            >
              <div className={`flex items-center gap-3 mb-2 ${isSelected ? 'text-blue-600' : 'text-gray-600'}`}>
                {mode.config.icon}
                <span className="font-semibold text-sm">{mode.config.label}</span>
              </div>
              <p className="text-xs text-gray-600">{mode.config.description}</p>
              {isDisabled && mode.value === 'CREATE_BULK' && (
                <p className="text-xs text-amber-600 mt-2 font-semibold">Bulk mode currently disabled</p>
              )}
            </button>
          );
        })}
      </div>

      {selectedTeamMode && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">
            ✓ <strong>{TEAM_MODE_CONFIG[selectedTeamMode as keyof typeof TEAM_MODE_CONFIG]?.label}</strong> selected. Proceeding to next step.
          </p>
        </div>
      )}
    </div>
  );
}
