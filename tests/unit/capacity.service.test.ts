import { describe, expect, it, vi } from "vitest";
import {
  countParticipants,
  getEventParticipantCount,
  isMaxParticipantsExceeded,
  isMaxTeamsExceeded,
} from "../../src/server/services/capacity.service";

describe("capacity.service", () => {
  it("counts participants with team and individual rows", () => {
    const result = countParticipants([
      { teamId: "team-1", teamSize: 4 },
      { teamId: null, teamSize: 1 },
      { teamId: null, teamSize: 3 },
      { teamId: "team-2", teamSize: 2 },
    ]);

    expect(result).toBe(6);
  });

  it("returns false when max participants is unset", () => {
    expect(isMaxParticipantsExceeded(null, 10, 1)).toBe(false);
    expect(isMaxParticipantsExceeded(undefined, 10, 1)).toBe(false);
  });

  it("detects participant overflow", () => {
    expect(isMaxParticipantsExceeded(10, 8, 2)).toBe(false);
    expect(isMaxParticipantsExceeded(10, 8, 3)).toBe(true);
  });

  it("detects team overflow", () => {
    expect(isMaxTeamsExceeded(5, 4, 1)).toBe(false);
    expect(isMaxTeamsExceeded(5, 4, 2)).toBe(true);
    expect(isMaxTeamsExceeded(null, 100, 50)).toBe(false);
  });

  it("computes participant count via DB aggregates", async () => {
    const count = vi
      .fn()
      .mockResolvedValueOnce(6);
    const aggregate = vi.fn().mockResolvedValue({
      _sum: {
        teamSize: 5,
      },
    });

    const db = {
      eventRegistration: {
        count,
        aggregate,
      },
    } as unknown as Parameters<typeof getEventParticipantCount>[0]["db"];

    const result = await getEventParticipantCount({
      db,
      eventId: "event-1",
    });

    expect(result).toBe(11);
    expect(count).toHaveBeenCalledTimes(1);
    expect(aggregate).toHaveBeenCalledTimes(1);
  });
});
