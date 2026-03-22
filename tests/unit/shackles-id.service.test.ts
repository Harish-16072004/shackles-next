import { describe, expect, it } from "vitest";
import { getShacklesPrefix } from "@/server/services/shackles-id.service";

describe("shackles id prefix", () => {
  it("formats GENERAL prefix by year", () => {
    expect(getShacklesPrefix({ year: 2027, registrationType: "GENERAL" })).toBe("SH27G");
  });

  it("formats WORKSHOP prefix by year", () => {
    expect(getShacklesPrefix({ year: 2028, registrationType: "WORKSHOP" })).toBe("SH28W");
  });

  it("formats COMBO prefix by year", () => {
    expect(getShacklesPrefix({ year: 2030, registrationType: "COMBO" })).toBe("SH30C");
  });
});
