import { describe, expect, it } from "vitest";
import { criteriaOf, levelOf } from "../lib/aqi";

describe("levelOf (เกณฑ์ตาม design)", () => {
  it("PM10 ตามขอบบน 50/80/120/180", () => {
    const c = criteriaOf("PM10")!;
    expect([23, 50, 51, 80, 120, 180, 181].map((v) => levelOf(c, v).level)).toEqual([1, 1, 2, 2, 3, 4, 5]);
  });
  it("NO2, SO2 และชื่อตัวพิมพ์เล็ก", () => {
    expect(levelOf(criteriaOf("no2")!, 8.05).label_th).toBe("ดีมาก");
    expect(levelOf(criteriaOf("SO2")!, 450).level).toBe(5);
    expect(criteriaOf("TEMP")).toBeUndefined();
  });
});
