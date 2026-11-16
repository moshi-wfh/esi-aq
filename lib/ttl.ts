// เวลาไทย = UTC+7 ไม่มี DST
export const TH_OFFSET_MS = 7 * 3600_000;

/** วินาทีที่เลยต้นชั่วโมง (เวลาไทย) */
function secInHourTh(now: Date): number {
  const th = new Date(now.getTime() + TH_OFFSET_MS);
  return th.getUTCMinutes() * 60 + th.getUTCSeconds();
}

/** epoch ms ของต้นชั่วโมงปัจจุบัน (เวลาไทย) */
export function startOfHourTh(now: Date): number {
  const ms = now.getTime() + TH_OFFSET_MS;
  return Math.floor(ms / 3600_000) * 3600_000 - TH_OFFSET_MS;
}

/** fresh = datetime อยู่ในชั่วโมงปัจจุบัน (เวลาไทย) หรือใหม่กว่า */
export function isFresh(datetimeIso: string | null, now: Date = new Date()): boolean {
  if (!datetimeIso) return false;
  const t = Date.parse(datetimeIso);
  if (Number.isNaN(t)) return false;
  return t >= startOfHourTh(now);
}

/** วินาทีถึง HH:05 ถัดไป (เวลาไทย) ถ้าตรง HH:05:00 พอดีคือ 3600 */
export function secondsToNextHH05(now: Date = new Date()): number {
  return (3600 + 300 - secInHourTh(now)) % 3600 || 3600;
}

/** TTL ของ CDN (s-maxage) ตามหัวข้อ 5 ของ spec */
export function ttlSeconds(fresh: boolean, now: Date = new Date()): number {
  return fresh ? Math.max(secondsToNextHH05(now), 60) : 120;
}

/** แปลง Date เป็น ISO แบบ +07:00 เช่น 2026-11-16T10:05:12+07:00 */
export function toThaiIso(d: Date): string {
  const th = new Date(d.getTime() + TH_OFFSET_MS);
  return th.toISOString().slice(0, 19) + "+07:00";
}
