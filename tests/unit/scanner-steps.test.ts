import { describe, expect, it } from "vitest";
import {
  canProceedToStep,
  filterEventsByFunction,
  getAvailableFunctions,
  getAvailableTeamModes,
  isValidShacklesId,
  normalizeShacklesInput,
} from "../../src/app/admin/scanner-v2/scanner-steps-lib";
import type { EventMetadata, ParticipantRecord } from "../../src/app/admin/scanner-v2/ScannerContext";

const participant: ParticipantRecord = {
  id: "u-1",
  firstName: "Alex",
  shacklesId: "SH26G001",
  events: [
    {
      eventName: "Hackathon",
      attended: false,
      teamName: "BYTE TITANS",
      memberRole: "MEMBER",
    },
  ],
};

const events: EventMetadata[] = [
  {
    name: "Hackathon",
    type: "TECHNICAL",
    participationMode: "TEAM",
    teamMinSize: 2,
    teamMaxSize: 4,
  },
  {
    name: "Workshop A",
    type: "KIT_DISTRIBUTION",
    participationMode: "INDIVIDUAL",
    teamMinSize: null,
    teamMaxSize: null,
  },
  {
    name: "Solo Quiz",
    type: "TECHNICAL",
    participationMode: "INDIVIDUAL",
    teamMinSize: null,
    teamMaxSize: null,
  },
];

describe("scanner-steps-lib", () => {
  it("returns all scanner functions when participant exists", () => {
    expect(getAvailableFunctions(participant)).toEqual([
      "MARK_ATTENDANCE",
      "ISSUE_KIT",
      "QUICK_REGISTER",
      "TEAM_REGISTRATION",
    ]);
  });

  it("filters events by selected function", () => {
    expect(filterEventsByFunction(events, "TEAM_REGISTRATION", participant).map((e) => e.name)).toEqual(["Hackathon"]);
    expect(filterEventsByFunction(events, "QUICK_REGISTER", participant).map((e) => e.name)).toEqual(["Workshop A", "Solo Quiz"]);
    expect(filterEventsByFunction(events, "ISSUE_KIT", participant).map((e) => e.name)).toEqual(["Workshop A"]);
  });

  it("builds team mode availability based on participant status", () => {
    const modes = getAvailableTeamModes(participant, events[0], true);
    const modeMap = new Map(modes.map((mode) => [mode.value, mode.enabled]));

    expect(modeMap.get("CREATE_SOLO")).toBe(false);
    expect(modeMap.get("CREATE_BULK")).toBe(false);
    expect(modeMap.get("JOIN_EXISTING")).toBe(true);
  });

  it("normalizes and validates Shackles IDs", () => {
    expect(normalizeShacklesInput(" sh26-g001 ")).toBe("SH26G001");
    expect(isValidShacklesId("sh26g001")).toBe(true);
    expect(isValidShacklesId("BAD-ID")).toBe(false);
  });

  it("guards progression through bulk review/lock steps", () => {
    const baseSession = {
      participant,
      selectedFunction: "TEAM_REGISTRATION",
      selectedEvent: events[0],
      selectedTeamMode: "CREATE_BULK",
    };

    expect(canProceedToStep(5, baseSession).canProceed).toBe(true);

    const reviewGate = canProceedToStep(6, {
      ...baseSession,
      bulkTeamDraft: null,
    });
    expect(reviewGate.canProceed).toBe(false);

    const lockGate = canProceedToStep(7, {
      ...baseSession,
      bulkTeamDraft: {
        teamName: "BYTE TITANS",
        memberShacklesIds: ["SH26G001", "SH26G002"],
      },
      pendingTeamLock: {
        eventName: "Hackathon",
        teamName: "BYTE TITANS",
      },
    });
    expect(lockGate.canProceed).toBe(true);
  });
});
