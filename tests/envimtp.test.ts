import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findMarker, parseMarker, parseMarkersXml, toIsoTh, toNumber, UpstreamError } from "../lib/envimtp";
import { isFresh, secondsToNextHH05, toThaiIso, ttlSeconds } from "../lib/ttl";

const fixture = readFileSync(join(__dirname, "fixtures", "markers.xml"), "utf8");

// เวลาไทย → Date
const th = (s: string) => new Date(`${s}+07:00`);

describe("toNumber", () => {
  it("แปลง comma และค่าว่าง", () => {
    expect(toNumber("1,012.53")).toBe(1012.53);
    expect(toNumber("2.00")).toBe(2);
    expect(toNumber("-")).toBeNull();
    expect(toNumber("")).toBeNull();
    expect(toNumber(undefined)).toBeNull();
  });
});

describe("toIsoTh", () => {
  it("แปลง dateTime ของ envimtp เป็น ISO +07:00", () => {
    expect(toIsoTh("2026-11-16 10:00")).toBe("2026-11-16T10:00:00+07:00");
    expect(toIsoTh("garbage")).toBeNull();
    expect(toIsoTh(undefined)).toBeNull();
  });
});

describe("parseMarkersXml + parseMarker (fixture จริง)", () => {
  const markers = parseMarkersXml(fixture);

  it("อ่านได้ทุกสถานี (fixture มี BOM)", () => {
    expect(markers.length).toBeGreaterThan(10);
  });

  it("BLCP A แปลงครบตาม num", () => {
    const s = parseMarker(findMarker(markers, "BLCP A")!);
    expect(s.name).toBe("BLCP A");
    expect(s.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\+07:00$/);
    expect(s.lat).toBeCloseTo(12.674339);
    expect(s.parameters.length).toBe(9);
    const so2 = s.parameters[0];
    expect(so2.name).toBe("SO2");
    expect(so2.limit).toBe(100);
    expect(so2.unit).toBe("ppb");
    expect(typeof so2.value).toBe("number");
  });

  it("BP ที่มี comma กลายเป็นตัวเลข และ limit '-' เป็น null", () => {
    const s = parseMarker(findMarker(markers, "ASIA_STATION (New)")!);
    const bp = s.parameters.find((p) => p.name === "BP")!;
    expect(bp.value_text).toContain(",");
    expect(bp.value).toBe(toNumber(bp.value_text));
    expect(bp.limit).toBeNull();
  });

  it("num=0 → parameters ว่าง (CPGC1-AQMS)", () => {
    const m = findMarker(markers, "CPGC1-AQMS");
    if (!m) return; // สถานีอาจหายจาก fixture ชุดใหม่
    expect(parseMarker(m).parameters).toEqual([]);
  });
});

describe("parseMarker กรณีพิเศษ", () => {
  const xml = `<?xml version="1.0"?><markers>
    <marker name="X (1)" lat="0" lng="0" dateTime="2026-11-16 10:00" num="3"
      mot0="PM10" val0="1,012.53" limit0="-" unit0="uG/M3" status0="Normal" warning0="2"
      mot1="SO2" val1="5" limit1="100" unit1="ppb" status1="Calib" warning1="0"
      mot2="NO2" />
    <marker name="Empty" num="0" dateTime="2026-11-16 10:00"/>
  </markers>`;
  const markers = parseMarkersXml(xml);

  it("แปลง comma, '-', warning=2, พิกัด 0, attribute หาย", () => {
    const s = parseMarker(markers[0]);
    expect(s.lat).toBeNull();
    expect(s.lng).toBeNull();
    expect(s.parameters[0]).toMatchObject({ value: 1012.53, value_text: "1,012.53", limit: null, warning: 2, exceeded: true });
    expect(s.parameters[1]).toMatchObject({ status: "Calib", exceeded: false });
    expect(s.parameters[2]).toMatchObject({ name: "NO2", value: null, limit: null, unit: null, warning: null, exceeded: false });
  });

  it("num=0 → []", () => {
    expect(parseMarker(markers[1]).parameters).toEqual([]);
  });

  it("marker เดียวก็ยังเป็น array", () => {
    expect(parseMarkersXml(`<markers><marker name="A" num="0"/></markers>`)).toHaveLength(1);
    expect(parseMarkersXml(`<markers></markers>`)).toEqual([]);
  });

  it("HTML (เช่น Cloudflare challenge) → UpstreamError", () => {
    expect(() => parseMarkersXml("<!DOCTYPE html><html><body>Just a moment...</body></html>")).toThrow(UpstreamError);
  });
});

describe("findMarker", () => {
  const markers = parseMarkersXml(fixture);
  it("ไม่สนตัวพิมพ์ + trim + มีวงเล็บ", () => {
    expect(findMarker(markers, "  takuan_sta(2026) ")?.name).toBe("TAKUAN_STA(2026)");
  });
  it("ไม่ทำ partial match", () => {
    expect(findMarker(markers, "TAKUAN")).toBeUndefined();
    expect(findMarker(markers, "")).toBeUndefined();
  });
});

describe("ttl", () => {
  it("วินาทีถึง HH:05 และ TTL ที่ส่งจริง (ต่ำสุด 60)", () => {
    const times = ["2026-11-16T10:00:00", "2026-11-16T10:04:59", "2026-11-16T10:05:00", "2026-11-16T10:59:59"];
    expect(times.map((t) => secondsToNextHH05(th(t)))).toEqual([300, 1, 3600, 301]);
    expect(times.map((t) => ttlSeconds(true, th(t)))).toEqual([300, 60, 3600, 301]);
    expect(ttlSeconds(false, th(times[0]))).toBe(120);
  });

  it("isFresh ที่ 10:30", () => {
    const now = th("2026-11-16T10:30:00");
    expect(isFresh("2026-11-16T10:00:00+07:00", now)).toBe(true);
    expect(isFresh("2026-11-16T09:00:00+07:00", now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
  });

  it("toThaiIso", () => {
    expect(toThaiIso(new Date("2026-11-16T03:05:12Z"))).toBe("2026-11-16T10:05:12+07:00");
  });
});
