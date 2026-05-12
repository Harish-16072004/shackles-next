'use client';

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    const ok = window.confirm(`Delete team "${teamName}" and all its members from this event?`);
    if (!ok) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("teamId", teamId || "");
    formData.append("eventId", eventId || "");

    try {
      const res = await fetch("/api/admin/event-registrations/delete-team", {
        method: "POST",
        body: formData,
      });
      if (res.ok || res.redirected) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete team");
      }
    } catch (e) {
      alert("An error occurred");
    }
    setLoading(false);
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      style={{ pointerEvents: 'auto' }}
      className="relative z-10 rounded-sm border border-red-300 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
    >
      {loading ? "Deleting..." : "Delete Team"}
    </button>
  );
}

export function MemberDeleteForm({ registrationId, fullName, hasTeam, eventId }: MemberDeleteFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    const ok = window.confirm(`Delete ${fullName} from this event registration?`);
    if (!ok) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("registrationId", registrationId || "");
    formData.append("eventId", eventId || "");

    try {
      const res = await fetch("/api/admin/event-registrations/delete-member", {
        method: "POST",
        body: formData,
      });
      if (res.ok || res.redirected) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete member");
      }
    } catch (e) {
      alert("An error occurred");
    }
    setLoading(false);
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      style={{ pointerEvents: 'auto' }}
      className="relative z-10 rounded-sm border border-red-300 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
    >
      {loading ? "Deleting..." : (hasTeam ? "Delete Member" : "Delete Participant")}
    </button>
  );
}