import { formatYMD } from "./date";

describe("formatYMD", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(formatYMD(new Date(2026, 7, 17))).toBe("2026-08-17");
  });

  it("pads single-digit months and days", () => {
    expect(formatYMD(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
