import { TeamStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { applyAttendanceMark, evaluateAttendanceState } from "../../src/server/services/attendance.service";

describe("attendance.service state evaluation", () => {
  it("returns NOT_REGISTERED when registration missing", () => {
    const result = evaluateAttendanceState(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_REGISTERED");
    }
  });

  it("returns TEAM_NOT_COMPLETED when team is not locked", () => {
    const result = evaluateAttendanceState({
      id: "r1",
      attended: false,
      teamId: "t1",
      team: { status: TeamStatus.DRAFT },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("TEAM_NOT_COMPLETED");
    }
  });

  it("returns already attended state", () => {
    const result = evaluateAttendanceState({
      id: "r1",
      attended: true,
      teamId: null,
      team: null,
    });

    expect(result).toEqual({ ok: true, alreadyAttended: true, message: "Already attended." });
  });
});

describe("attendance.service applyAttendanceMark", () => {
  it("marks attendance for eligible registration", async () => {
    const update = vi.fn().mockResolvedValue({});

    const db = {
      event: {
        findFirst: vi.fn().mockResolvedValue({ id: "event-1" }),
      },
      eventRegistration: {
        findUnique: vi.fn().mockResolvedValue({
          id: "reg-1",
          attended: false,
          teamId: null,
          team: null,
        }),
        update,
      },
    };

    const result = await applyAttendanceMark({
      db,
      userId: "user-1",
      eventName: "Paper Presentation",
    });

    expect(result.status).toBe("MARKED");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("returns ALREADY_ATTENDED without update", async () => {
    const update = vi.fn().mockResolvedValue({});

    const db = {
      event: {
        findFirst: vi.fn().mockResolvedValue({ id: "event-1" }),
      },
      eventRegistration: {
        findUnique: vi.fn().mockResolvedValue({
          id: "reg-1",
          attended: true,
          teamId: null,
          team: null,
        }),
        update,
      },
    };

    const result = await applyAttendanceMark({
      db,
      userId: "user-1",
      eventName: "Paper Presentation",
    });

    expect(result.status).toBe("ALREADY_ATTENDED");
    expect(update).not.toHaveBeenCalled();
  });
});
