'use client';

import React, { useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, ChevronRight, AlertCircle } from 'lucide-react';
import { ScannerProvider, useScannerContext } from './ScannerContext';
import { Step1Scan } from './step1-scan';
import { Step2Function } from './step2-function';
import { Step3Event } from './step3-event';
import { Step4TeamMode } from './step4-team-mode';
import { Step5BulkTeam } from './step5-bulk-team';
import { Step6ReviewExecute } from './step6-review-execute';
import { Step7LockConfirm } from './step7-lock-confirm';
import { canProceedToStep } from './scanner-steps-lib';

type StepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

function ScannerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawStep = Number(searchParams.get('step') || '1');
  const step = Number.isFinite(rawStep) && rawStep >= 1 && rawStep <= 7 ? (rawStep as StepNumber) : 1;

  const {
    participant,
    selectedFunction,
    selectedEvent,
    selectedTeamMode,
    bulkTeamDraft,
    pendingTeamLock,
    actionState,
    resetContext,
    resetFromStep,
  } = useScannerContext();

  const stepSequence = useMemo<StepNumber[]>(() => {
    const base: StepNumber[] = [1, 2, 3];
    if (!selectedFunction || !selectedEvent) return base;

    if (selectedFunction === 'TEAM_REGISTRATION') {
      const withTeamSteps: StepNumber[] = [1, 2, 3, 4];
      if (selectedTeamMode === 'CREATE_BULK') {
        withTeamSteps.push(5);
      }
      withTeamSteps.push(6);
      if (pendingTeamLock && actionState.status === 'success') {
        withTeamSteps.push(7);
      }
      return withTeamSteps;
    }

    return [1, 2, 3, 6];
  }, [selectedFunction, selectedEvent, selectedTeamMode, pendingTeamLock, actionState.status]);

  const currentStep = stepSequence.includes(step) ? step : stepSequence[stepSequence.length - 1];
  const currentStepIndex = Math.max(stepSequence.indexOf(currentStep), 0);

  const navigateToStep = (targetStep: StepNumber) => {
    if (targetStep < currentStep) {
      resetFromStep(targetStep);
    }
    router.push(`/admin/scanner-v2?step=${targetStep}`);
  };

  const handleNextStep = () => {
    const next = stepSequence[currentStepIndex + 1];
    if (next) {
      navigateToStep(next);
    }
  };

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      navigateToStep(stepSequence[currentStepIndex - 1]);
    }
  };

  const stepGate = canProceedToStep(currentStep, {
    participant,
    selectedFunction,
    selectedEvent,
    selectedTeamMode,
    bulkTeamDraft,
    pendingTeamLock,
    actionStatus: actionState.status,
  });

  const isCurrentStepComplete = () => {
    switch (currentStep) {
      case 1:
        return Boolean(participant);
      case 2:
        return Boolean(selectedFunction);
      case 3:
        return Boolean(selectedEvent);
      case 4:
        return Boolean(selectedTeamMode);
      case 5:
        return Boolean(bulkTeamDraft && bulkTeamDraft.memberShacklesIds.length > 0 && bulkTeamDraft.teamName.trim().length > 0);
      case 6:
        return actionState.status === 'success';
      case 7:
        return actionState.status === 'success';
      default:
        return false;
    }
  };

  const stepLabel = (stepNumber: StepNumber) => {
    const labels: Record<StepNumber, string> = {
      1: 'Scan',
      2: 'Function',
      3: 'Event',
      4: 'Team Mode',
      5: 'Bulk Team',
      6: 'Review',
      7: 'Lock',
    };
    return labels[stepNumber];
  };

  const renderStep = () => {
    if (!stepGate.canProceed) {
      return (
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
          <p className="font-semibold mb-1">Step not available yet</p>
          <p className="text-sm">{stepGate.reason || 'Complete previous steps first.'}</p>
        </div>
      );
    }

    switch (currentStep) {
      case 1:
        return <Step1Scan />;
      case 2:
        return <Step2Function />;
      case 3:
        return <Step3Event />;
      case 4:
        return <Step4TeamMode />;
      case 5:
        return <Step5BulkTeam />;
      case 6:
        return <Step6ReviewExecute />;
      case 7:
        return <Step7LockConfirm />;
      default:
        return <Step1Scan />;
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
          <h1 className="text-4xl font-bold text-white mb-2">Scanner v2</h1>
            <p className="text-slate-400">Wizard flow with isolated steps and explicit lock confirmation</p>
          </div>
          {participant && (
            <button
              onClick={() => {
                resetContext();
                router.push('/admin/scanner-v2?step=1');
              }}
              className="px-4 py-2 rounded-sm bg-slate-700 text-white text-sm hover:bg-slate-600"
            >
              New Scan
            </button>
          )}
        </div>

        <div className="mb-8">
          <div className="flex gap-2 mb-3">
            {stepSequence.map((sequenceStep, index) => (
              <React.Fragment key={sequenceStep}>
                <button
                  onClick={() => index <= currentStepIndex && navigateToStep(sequenceStep)}
                  disabled={index > currentStepIndex}
                  className={`flex-1 py-2 px-3 rounded-lg font-semibold text-sm transition ${
                    sequenceStep === currentStep
                      ? 'bg-blue-600 text-white shadow-lg'
                      : stepSequence.indexOf(sequenceStep) < currentStepIndex
                        ? 'bg-green-600 text-white cursor-pointer'
                        : 'bg-slate-700 text-slate-300 cursor-not-allowed opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    {stepSequence.indexOf(sequenceStep) < currentStepIndex ? <CheckCircle2 className="w-4 h-4" /> : <span>{sequenceStep}</span>}
                    <span className="hidden sm:inline">{stepLabel(sequenceStep)}</span>
                  </div>
                </button>
                {index < stepSequence.length - 1 && <ChevronRight className="w-4 h-4 text-slate-600 self-center" />}
              </React.Fragment>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            Step {currentStep} ({currentStepIndex + 1} of {stepSequence.length})
          </p>
        </div>

        {actionState.status === 'error' && actionState.error && (
          <div className="mb-6 p-4 bg-red-900 border border-red-700 rounded-lg flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-200 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-100">Error</p>
              <p className="text-red-200 text-sm">{actionState.error}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          {renderStep()}
        </div>

        <div className="flex gap-4 justify-between">
          <button
            onClick={handlePrevStep}
            disabled={currentStepIndex === 0}
            className="px-6 py-2 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed bg-slate-700 text-white hover:bg-slate-600"
          >
            ← Previous
          </button>

          {currentStepIndex < stepSequence.length - 1 && (
            <button
              onClick={handleNextStep}
              disabled={!isCurrentStepComplete()}
              className="px-6 py-2 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700"
            >
              Next →
            </button>
          )}
        </div>

        <div className="mt-8 p-4 bg-slate-800 rounded-lg text-slate-300 text-sm space-y-1">
          <p>
            <strong>Participant:</strong> {participant ? participant.firstName : 'Not scanned'}
          </p>
          <p>
            <strong>Function:</strong> {selectedFunction || 'Not selected'}
          </p>
          <p>
            <strong>Event:</strong> {selectedEvent?.name || 'Not selected'}
          </p>
          <p>
            <strong>Team Mode:</strong> {selectedTeamMode || 'N/A'}
          </p>
          {pendingTeamLock && <p><strong>Pending Lock:</strong> {pendingTeamLock.teamName}</p>}
        </div>
      </div>
    </div>
  );
}

export default function ScannerV2Page() {
  return (
    <ScannerProvider>
      <Suspense
        fallback={
          <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
            <div className="text-white flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p>Loading Scanner...</p>
            </div>
          </div>
        }
      >
        <ScannerContent />
      </Suspense>
    </ScannerProvider>
  );
}

export const dynamic = 'force-dynamic';
