import { TeamStatus } from "@prisma/client";

export type AttendanceRegistrationState = {
  id: string;
  attended: boolean;
  teamId: string | null;
  team: { status: TeamStatus } | null;
};

export function evaluateAttendanceState(registration: AttendanceRegistrationState | null) {
  if (!registration) {
    return {
      ok: false as const,
      reason: "NOT_REGISTERED",
      message: "Participant is not registered for this event.",
    };
  }

  if (registration.teamId && registration.team?.status !== TeamStatus.LOCKED) {
    return {
      ok: false as const,
      reason: "TEAM_NOT_COMPLETED",
      message: "Team must be completed and locked before attendance can be marked.",
    };
  }

  if (registration.attended) {
    return {
      ok: true as const,
      alreadyAttended: true,
      message: "Already attended.",
    };
  }

  return {
    ok: true as const,
    alreadyAttended: false,
  };
}

type AttendanceDb = {
  event: {
    findUnique: (args: { where: { name: string }; select: { id: true } }) => Promise<{ id: string } | null>;
  };
  eventRegistration: {
    findUnique: (args: {
      where: { userId_eventId: { userId: string; eventId: string } };
      select: {
        id: true;
        attended: true;
        teamId: true;
        team: { select: { status: true } };
      };
    }) => Promise<AttendanceRegistrationState | null>;
    update: (args: { where: { id: string }; data: { attended: true; attendedAt: Date } }) => Promise<unknown>;
  };
};

export type ApplyAttendanceResult =
  | { status: "EVENT_NOT_FOUND"; message: string }
  | { status: "NOT_REGISTERED"; message: string }
  | { status: "TEAM_NOT_COMPLETED"; message: string }
  | { status: "ALREADY_ATTENDED"; message: string }
  | { status: "MARKED"; message: string };

export async function applyAttendanceMark(input: {
  db: AttendanceDb;
  userId: string;
  eventName: string;
  notRegisteredMessage?: string;
  alreadyAttendedMessage?: string;
  markedMessage?: string;
}): Promise<ApplyAttendanceResult> {
  const event = await input.db.event.findUnique({
    where: { name: input.eventName },
    select: { id: true },
  });

  if (!event) {
    return { status: "EVENT_NOT_FOUND", message: "Event not found." };
  }

  const registration = await input.db.eventRegistration.findUnique({
    where: {
      userId_eventId: {
        userId: input.userId,
        eventId: event.id,
      },
    },
    select: {
      id: true,
      attended: true,
      teamId: true,
      team: {
        select: {
          status: true,
        },
      },
    },
  });

  const attendanceState = evaluateAttendanceState(registration);
  if (!attendanceState.ok) {
    const failureStatus = attendanceState.reason === "NOT_REGISTERED"
      ? "NOT_REGISTERED"
      : "TEAM_NOT_COMPLETED";

    return {
      status: failureStatus,
      message:
        attendanceState.reason === "NOT_REGISTERED"
          ? input.notRegisteredMessage || "Participant is not registered for this event."
          : attendanceState.message,
    };
  }

  if (attendanceState.alreadyAttended) {
    return {
      status: "ALREADY_ATTENDED",
      message: input.alreadyAttendedMessage || "Already attended.",
    };
  }

  if (!registration) {
    return {
      status: "NOT_REGISTERED",
      message: input.notRegisteredMessage || "Participant is not registered for this event.",
    };
  }

  await input.db.eventRegistration.update({
    where: { id: registration.id },
    data: {
      attended: true,
      attendedAt: new Date(),
    },
  });

  return {
    status: "MARKED",
    message: input.markedMessage || "Attendance marked.",
  };
}
