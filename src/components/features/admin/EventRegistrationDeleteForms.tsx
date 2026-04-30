'use client';

import type { FormEvent } from "react";

type TeamDeleteFormProps = {
  teamId: string;
  teamName: string;
};

type MemberDeleteFormProps = {
  registrationId: string;
  fullName: string;
  hasTeam: boolean;
};

export function TeamDeleteForm({ teamId, teamName }: TeamDeleteFormProps) {
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const ok = window.confirm(`Delete team "${teamName}" and all its members from this event?`);
    if (!ok) event.preventDefault();
  };

  return (
    <form action="/api/admin/event-registrations/delete-team" method="post" onSubmit={onSubmit}>
      <input type="hidden" name="teamId" value={teamId} />
      <button
        type="submit"
        className="rounded-sm border border-red-300 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
      >
        Delete Team
      </button>
    </form>
  );
}

export function MemberDeleteForm({ registrationId, fullName, hasTeam }: MemberDeleteFormProps) {
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const ok = window.confirm(`Delete ${fullName} from this event registration?`);
    if (!ok) event.preventDefault();
  };

  return (
    <form action="/api/admin/event-registrations/delete-member" method="post" onSubmit={onSubmit}>
      <input type="hidden" name="registrationId" value={registrationId} />
      <button
        type="submit"
        className="rounded-sm border border-red-300 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
      >
        {hasTeam ? "Delete Member" : "Delete Participant"}
      </button>
    </form>
  );
}