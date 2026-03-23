'use client';

import React, { useMemo } from 'react';
import { Calendar, Package, UserCheck, Users } from 'lucide-react';
import { useScannerContext } from './ScannerContext';
import { getAvailableFunctions } from './scanner-steps-lib';

const FUNCTION_DESCRIPTIONS: Record<string, { icon: React.ReactNode; label: string; description: string }> = {
  MARK_ATTENDANCE: {
    icon: <UserCheck className="w-6 h-6" />,
    label: 'Mark Attendance',
    description: 'Check in for a registered event',
  },
  ISSUE_KIT: {
    icon: <Package className="w-6 h-6" />,
    label: 'Issue Kit',
    description: 'Record kit distribution',
  },
  QUICK_REGISTER: {
    icon: <Calendar className="w-6 h-6" />,
    label: 'Quick Register',
    description: 'Register & check-in in one step (individual events only)',
  },
  TEAM_REGISTRATION: {
    icon: <Users className="w-6 h-6" />,
    label: 'Team Registration',
    description: 'Register a team or bulk members',
  },
};

export function Step2Function() {
  const { participant, selectedFunction, setSelectedFunction } = useScannerContext();

  const availableFunctions = useMemo(() => {
    return getAvailableFunctions(participant);
  }, [participant]);

  if (!participant) {
    return (
      <div className="text-center p-8 text-gray-500">
        <p>No participant scanned. Go back to scan first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-blue-900 mb-2">Step 2: Select Action</h2>
        <p className="text-sm text-blue-700">Choose what you want to do for {participant.firstName}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {availableFunctions.map((fn) => {
          const config = FUNCTION_DESCRIPTIONS[fn as keyof typeof FUNCTION_DESCRIPTIONS];
          if (!config) return null;

          const isSelected = selectedFunction === fn;

          return (
            <button
              key={fn}
              onClick={() => setSelectedFunction(fn as any)}
              className={`p-4 border-2 rounded-lg transition text-left ${
                isSelected
                  ? 'border-blue-600 bg-blue-50 shadow-md'
                  : 'border-gray-200 bg-white hover:border-blue-400 hover:shadow'
              }`}
            >
              <div className={`flex items-center gap-3 mb-2 ${isSelected ? 'text-blue-600' : 'text-gray-600'}`}>
                {config.icon}
                <span className="font-semibold text-sm">{config.label}</span>
              </div>
              <p className="text-xs text-gray-600">{config.description}</p>
            </button>
          );
        })}
      </div>

      {selectedFunction && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">
            ✓ <strong>{FUNCTION_DESCRIPTIONS[selectedFunction as keyof typeof FUNCTION_DESCRIPTIONS]?.label}</strong> selected. Proceeding to next step.
          </p>
        </div>
      )}
    </div>
  );
}
