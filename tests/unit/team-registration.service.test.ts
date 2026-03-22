import { describe, expect, it } from "vitest";
import {
  normalizeName,
  normalizeShacklesId,
  normalizeTeamName,
  parseUniqueShacklesIds,
} from "../../src/server/services/team-registration.service";

describe("team-registration.service normalizers", () => {
  it("normalizes team names", () => {
    expect(normalizeTeamName("  Alpha   Team  ")).toBe("ALPHA TEAM");
  });

  it("normalizes event names", () => {
    expect(normalizeName("  paper presentation ")).toBe("PAPER PRESENTATION");
  });

  it("normalizes shackles ids", () => {
    expect(normalizeShacklesId("  sh26gn001 ")).toBe("SH26GN001");
  });

  it("removes duplicate/blank shackles ids while preserving normalized values", () => {
    const ids = parseUniqueShacklesIds([" sh1 ", "SH1", "", "  ", "sh2"]);
    expect(ids).toEqual(["SH1", "SH2"]);
  });
});
