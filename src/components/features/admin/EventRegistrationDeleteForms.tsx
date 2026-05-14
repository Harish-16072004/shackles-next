'use client';

import { useState, useTransition } from "react";
import { deleteTeam, deleteTeamMember } from "@/server/actions/event-logistics";

type TeamDeleteFormProps = {
  teamId: string;
  teamName: string;
  eventId: string;
};

type MemberDeleteFormProps = {
  registrationId: string;
  fullName: string;
  hasTeam: boolean;
  eventId: string;
};

export function TeamDeleteForm({ teamId, teamName, eventId }: TeamDeleteFormProps) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    const ok = window.confirm(`Delete team "${teamName}" and all its members from this event?`);
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteTeam({ teamId, eventId });
      if (result.success) {
        window.location.reload();
      } else {
        alert(result.error || "Failed to delete team");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      style={{ pointerEvents: 'auto' }}
      className="relative z-10 rounded-sm border border-red-300 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
    >
      {isPending ? "Deleting..." : "Delete Team"}
    </button>
  );
}

export function MemberDeleteForm({ registrationId, fullName, hasTeam, eventId }: MemberDeleteFormProps) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    const ok = window.confirm(`Delete ${fullName} from this event registration?`);
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteTeamMember({ registrationId, eventId });
      if (result.success) {
        window.location.reload();
      } else {
        alert(result.error || "Failed to delete member");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      style={{ pointerEvents: 'auto' }}
      className="relative z-10 rounded-sm border border-red-300 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
    >
      {isPending ? "Deleting..." : (hasTeam ? "Delete Member" : "Delete Participant")}
    </button>
  );
}