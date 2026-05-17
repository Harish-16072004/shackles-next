import React from 'react';
import { Prisma } from '@prisma/client';
import { 
  updateEventAction, 
  createEventAction
} from '../actions';
import {
  EVENT_TYPE_OPTIONS,
  DAY_LABEL_OPTIONS,
  CATEGORY_OPTIONS,
  toDateTimeLocalValue,
  splitCoordinatorField
} from '../utils';

type BaseEvent = Prisma.EventGetPayload<{}>;

interface EventModalsProps {
  editingEvent: BaseEvent | null;
  createType: string | null;
  selectedYear: number;
  q: string;
  showArchived: boolean;
  formReset: string;
}

export function EventModals({ 
  editingEvent, 
  createType, 
  selectedYear, 
  q, 
  showArchived, 
  formReset 
}: EventModalsProps) {
  
  const [editingCoordinatorName1, editingCoordinatorName2, editingCoordinatorName3] = splitCoordinatorField(editingEvent?.coordinatorName);
  const [editingCoordinatorPhone1, editingCoordinatorPhone2, editingCoordinatorPhone3] = splitCoordinatorField(editingEvent?.coordinatorPhone);

  return (
    <>
      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-5xl my-auto bg-white border-2 border-gray-900 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Edit {editingEvent.category === 'WORKSHOP' ? 'Workshop' : 'Event'}</h2>
                <p className="text-sm text-gray-500">Update the details for "{editingEvent.name}"</p>
              </div>
              <a href={`/admin/events?year=${selectedYear}`} className="rounded-lg p-2 hover:bg-gray-100 transition-colors">
                Close Form
              </a>
            </div>
            <form action={updateEventAction} className="space-y-3">
              <input type="hidden" name="eventId" value={editingEvent.id} />
              <input type="hidden" name="year" value={editingEvent.year} />
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Event Name*
                  <input name="name" required defaultValue={editingEvent.name} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Type
                  <select
                    name="type"
                    defaultValue={editingEvent.type || ""}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">Select type</option>
                    {EVENT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Participation Mode
                  <select name="participationMode" defaultValue={editingEvent.participationMode} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900">
                    <option value="INDIVIDUAL">INDIVIDUAL</option>
                    <option value="TEAM">TEAM</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Category
                  <select
                    name="category"
                    defaultValue={editingEvent.category || "EVENT"}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900"
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 mt-7">
                  <input type="checkbox" name="isAllDay" defaultChecked={editingEvent.isAllDay} /> All Day Event
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Day Label
                  <select
                    name="dayLabel"
                    defaultValue={editingEvent.dayLabel || ""}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">Select day</option>
                    {DAY_LABEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Date & Time
                  <input type="datetime-local" name="date" defaultValue={toDateTimeLocalValue(editingEvent.date)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  End Date & Time
                  <input type="datetime-local" name="endDate" defaultValue={toDateTimeLocalValue(editingEvent.endDate)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Max Participants
                  <input type="number" min={1} name="maxParticipants" defaultValue={editingEvent.maxParticipants ?? ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Max Teams
                  <input type="number" min={1} name="maxTeams" defaultValue={editingEvent.maxTeams ?? ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Team Min Size
                  <input type="number" min={1} name="teamMinSize" defaultValue={editingEvent.teamMinSize ?? ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Team Max Size
                  <input type="number" min={1} name="teamMaxSize" defaultValue={editingEvent.teamMaxSize ?? ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 mt-7">
                  <input type="checkbox" name="isActive" defaultChecked={editingEvent.isActive} /> Active
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Description
                  <textarea name="description" rows={3} defaultValue={editingEvent.description || ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Rules URL
                    <input name="rulesUrl" defaultValue={editingEvent.rulesUrl || ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Submission Form URL
                    <input name="submissionUrl" placeholder="e.g. Google Forms link" defaultValue={editingEvent.submissionUrl || ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Submission Deadline
                    <input type="datetime-local" name="submissionDeadline" defaultValue={toDateTimeLocalValue(editingEvent.submissionDeadline)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Trainer Name (Workshops)
                    <input name="trainerName" defaultValue={editingEvent.trainerName || ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Coordinator 1 Name*
                    <input name="coordinatorName1" required defaultValue={editingCoordinatorName1} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Coordinator 1 Phone*
                    <input name="coordinatorPhone1" required defaultValue={editingCoordinatorPhone1} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Coordinator 2 Name
                    <input name="coordinatorName2" defaultValue={editingCoordinatorName2} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Coordinator 2 Phone
                    <input name="coordinatorPhone2" defaultValue={editingCoordinatorPhone2} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Coordinator 3 Name
                    <input name="coordinatorName3" defaultValue={editingCoordinatorName3} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Coordinator 3 Phone
                    <input name="coordinatorPhone3" defaultValue={editingCoordinatorPhone3} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900" />
                  </label>
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800">Update Event</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-5xl my-auto bg-white border-2 border-gray-900 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-6 flex items-center justify-between border-b pb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Create New {createType === 'WORKSHOP' ? 'Workshop' : 'Event'}</h2>
                <p className="text-sm text-gray-500">Fill in the details below for the {selectedYear} edition.</p>
              </div>
              <a 
                href={`/admin/events?year=${selectedYear}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                ✕
              </a>
            </div>

            <form key={formReset} action={createEventAction} className="space-y-6" autoComplete="off">
              <input type="hidden" name="year" value={selectedYear} />
              <input type="hidden" name="category" value={createType} />
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                  {createType === 'WORKSHOP' ? 'Workshop Name*' : 'Event Name*'}
                  <input name="name" required placeholder={createType === 'WORKSHOP' ? "e.g. AI & Robotics Workshop" : "e.g. Paper Presentation"} className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden transition-all" />
                </label>

                {createType === 'EVENT' && (
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                    Event Type
                    <select
                      name="type"
                      defaultValue=""
                      className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden bg-white"
                    >
                      <option value="">Select type</option>
                      {EVENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {createType === 'WORKSHOP' && (
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                    Trainer Name*
                    <input name="trainerName" required placeholder="Full Name of the Trainer" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden transition-all bg-amber-50/20" />
                  </label>
                )}

                {createType === 'EVENT' ? (
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                    Participation Mode
                    <select name="participationMode" defaultValue="INDIVIDUAL" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden bg-white">
                      <option value="INDIVIDUAL">Individual</option>
                      <option value="TEAM">Team</option>
                    </select>
                  </label>
                ) : (
                  <input type="hidden" name="participationMode" value="INDIVIDUAL" />
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                  Day
                  <select
                    name="dayLabel"
                    defaultValue=""
                    className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden bg-white"
                  >
                    <option value="">Select day</option>
                    {DAY_LABEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                  Start Date & Time
                  <input type="datetime-local" name="date" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                  End Date & Time
                  <input type="datetime-local" name="endDate" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                </label>
                <div className="flex items-center gap-4 pt-7">
                  <label className="inline-flex items-center gap-2 cursor-pointer group">
                    <input type="checkbox" name="isAllDay" className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900" />
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">All Day</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer group">
                    <input type="checkbox" name="isActive" defaultChecked className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900" />
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">Active</span>
                  </label>
                </div>
              </div>

              {createType === 'EVENT' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                    Max Participants
                    <input type="number" min={1} name="maxParticipants" placeholder="Unlimited" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                    Max Teams
                    <input type="number" min={1} name="maxTeams" placeholder="Unlimited" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                    Team Min Size
                    <input type="number" min={1} name="teamMinSize" placeholder="Default 1" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                    Team Max Size
                    <input type="number" min={1} name="teamMaxSize" placeholder="Default 1" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                  </label>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                  Description
                  <textarea name="description" rows={4} placeholder="Briefly describe the rules and highlights..." className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden resize-none" />
                </label>
                <div className="space-y-4">
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                    Rules URL
                    <input name="rulesUrl" placeholder="Link to document (optional)" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                      Submission URL
                      <input name="submissionUrl" placeholder="Google Forms Link" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                      Submission Deadline
                      <input type="datetime-local" name="submissionDeadline" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                      Coordinator 1 Name*
                      <input name="coordinatorName1" required className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                      Coordinator 1 Phone*
                      <input name="coordinatorPhone1" required className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                      Coordinator 2 Name
                      <input name="coordinatorName2" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                      Coordinator 2 Phone
                      <input name="coordinatorPhone2" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                      Coordinator 3 Name
                      <input name="coordinatorName3" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
                      Coordinator 3 Phone
                      <input name="coordinatorPhone3" className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-hidden" />
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t pt-6">
                <a 
                  href={`/admin/events?year=${selectedYear}`}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-all active:scale-95"
                >
                  Cancel
                </a>
                <button 
                  type="submit"
                  className="px-8 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 text-white shadow-lg hover:bg-gray-800 transition-all hover:shadow-xl active:scale-95"
                >
                  Create {createType === 'WORKSHOP' ? 'Workshop' : 'Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
