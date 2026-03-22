import { describe, expect, it } from "vitest";
import { getActivePublicDomain, getActiveThemeKey, getActiveYear, getActiveYearShort } from "@/lib/edition";

describe("edition resolver", () => {
  it("falls back to current year when ACTIVE_YEAR is missing", () => {
    const previous = process.env.ACTIVE_YEAR;
    delete process.env.ACTIVE_YEAR;

    try {
      expect(getActiveYear()).toBe(new Date().getUTCFullYear());
    } finally {
      if (previous) process.env.ACTIVE_YEAR = previous;
    }
  });

  it("uses ACTIVE_YEAR when valid", () => {
    const previous = process.env.ACTIVE_YEAR;
    process.env.ACTIVE_YEAR = "2027";

    try {
      expect(getActiveYear()).toBe(2027);
      expect(getActiveYearShort()).toBe("27");
    } finally {
      if (previous) process.env.ACTIVE_YEAR = previous;
      else delete process.env.ACTIVE_YEAR;
    }
  });

  it("falls back to default theme key when missing", () => {
    const previous = process.env.ACTIVE_THEME_KEY;
    delete process.env.ACTIVE_THEME_KEY;

    try {
      expect(getActiveThemeKey()).toBe("default");
    } finally {
      if (previous) process.env.ACTIVE_THEME_KEY = previous;
    }
  });

  it("derives public domain from NEXT_PUBLIC_APP_URL fallback", () => {
    const prevDomain = process.env.ACTIVE_PUBLIC_DOMAIN;
    const prevAppUrl = process.env.NEXT_PUBLIC_APP_URL;

    delete process.env.ACTIVE_PUBLIC_DOMAIN;
    process.env.NEXT_PUBLIC_APP_URL = "https://events.example.com";

    try {
      expect(getActivePublicDomain()).toBe("events.example.com");
    } finally {
      if (prevDomain) process.env.ACTIVE_PUBLIC_DOMAIN = prevDomain;
      else delete process.env.ACTIVE_PUBLIC_DOMAIN;
      if (prevAppUrl) process.env.NEXT_PUBLIC_APP_URL = prevAppUrl;
      else delete process.env.NEXT_PUBLIC_APP_URL;
    }
  });
});
