export const EVENT_TYPE_OPTIONS = [
  { value: "TECHNICAL", label: "Technical" },
  { value: "NON-TECHNICAL", label: "Non Technical" },
  { value: "SPECIAL", label: "Special" },
];

export const DAY_LABEL_OPTIONS = [
  { value: "DAY1", label: "Day 1" },
  { value: "DAY2", label: "Day 2" },
];

export const CATEGORY_OPTIONS = [
  { value: "EVENT", label: "Event" },
  { value: "WORKSHOP", label: "Workshop" },
];

export function toDateTimeLocalValue(date?: Date | null) {
  if (!date) return "";
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

export function splitCoordinatorField(value?: string | null) {
  const parts = (value || "")
    .split(" | ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);

  return [parts[0] || "", parts[1] || "", parts[2] || ""] as const;
}
