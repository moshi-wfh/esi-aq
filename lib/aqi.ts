// เกณฑ์ระดับคุณภาพอากาศ ตาม UI design (public/mockup/display.html)
// ใช้แค่จับระดับสีและหน้ายิ้มบนจอ ไม่ได้คำนวณค่า AQI รวม

export type Level = {
  level: 1 | 2 | 3 | 4 | 5;
  label_th: string;
  label_short_th: string;
  color: string;
};

export const LEVELS: Level[] = [
  { level: 1, label_th: "ดีมาก", label_short_th: "ดีมาก", color: "#1fb6d6" },
  { level: 2, label_th: "ดี", label_short_th: "ดี", color: "#3bb36b" },
  { level: 3, label_th: "ปานกลาง", label_short_th: "ปานกลาง", color: "#f5c518" },
  { level: 4, label_th: "เริ่มมีผลกระทบต่อสุขภาพ", label_short_th: "เริ่มมีผลกระทบ", color: "#f08a2c" },
  { level: 5, label_th: "มีผลกระทบต่อสุขภาพ", label_short_th: "มีผลกระทบ", color: "#e5484d" },
];

export type Criteria = {
  code: string;
  unit: string; // หน่วยที่เกณฑ์ใช้ (หน่วยของ envimtp: uG/M3, ppb)
  decimals: number;
  standard: number; // ค่ามาตรฐาน ใช้เมื่อ envimtp ไม่ส่ง limit
  max: number[]; // ขอบบนของระดับ 1–4 (ระดับ 5 = เกินกว่านั้น)
};

/** พารามิเตอร์ที่จอแสดง เรียงตาม design: PM10, NO2, SO2 */
export const CRITERIA: Criteria[] = [
  { code: "PM10", unit: "µg/m³", decimals: 0, standard: 100, max: [50, 80, 120, 180] },
  { code: "NO2", unit: "ppb", decimals: 2, standard: 120, max: [60, 106, 170, 340] },
  { code: "SO2", unit: "ppb", decimals: 2, standard: 100, max: [100, 200, 300, 400] },
];

export function criteriaOf(name: string | null): Criteria | undefined {
  if (!name) return undefined;
  const k = name.trim().toUpperCase();
  return CRITERIA.find((c) => c.code === k);
}

/** ระดับตามช่วงค่า (value <= ขอบบน) เหมือน levelOf() ใน design */
export function levelOf(c: Criteria, value: number): Level {
  const i = c.max.findIndex((m) => value <= m);
  return LEVELS[i < 0 ? 4 : i];
}
