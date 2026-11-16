import { XMLParser } from "fast-xml-parser";

export const DEFAULT_ENVIMTP_URL = "https://www.envimtp.com/markers.php?type=2";
export const UPSTREAM_TIMEOUT_MS = 8000;

export type Parameter = {
  name: string | null;
  value: number | null;
  value_text: string | null;
  limit: number | null;
  unit: string | null;
  status: string | null;
  warning: number | null;
  exceeded: boolean;
};

export type Station = {
  name: string;
  datetime: string | null;
  lat: number | null;
  lng: number | null;
  parameters: Parameter[];
};

type Attrs = Record<string, string | undefined>;

export class UpstreamError extends Error {
  constructor(
    public kind: "bad_response" | "timeout",
    message: string,
    public httpStatus?: number,
  ) {
    super(message);
  }
}

/** "1,012.53" → 1012.53 · "-" / "" / ไม่มี → null */
export function toNumber(v: string | undefined | null): number | null {
  if (v == null) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toCoord(v: string | undefined): number | null {
  const n = toNumber(v);
  return n === null || n === 0 ? null : n;
}

/** "2026-11-16 10:00" (เวลาไทย) → "2026-11-16T10:00:00+07:00" */
export function toIsoTh(v: string | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v.trim());
  if (!m) return null;
  return `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? "00"}+07:00`;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false, // เก็บเป็น string ทั้งหมด แปลงเอง
  isArray: (name) => name === "marker",
});

/** ตรวจว่าเป็น XML ของ markers จริง (ไม่ใช่หน้า HTML challenge) แล้วคืน attribute ของทุก marker */
export function parseMarkersXml(xml: string): Attrs[] {
  const body = xml.replace(/^﻿/, "").trimStart();
  if (!/^(<\?xml[^>]*\?>\s*)?<markers[\s>/]/.test(body)) {
    throw new UpstreamError("bad_response", "upstream body is not markers XML");
  }
  const doc = parser.parse(body);
  const list = doc?.markers?.marker;
  if (list === undefined) return []; // <markers/> ว่าง
  if (!Array.isArray(list)) throw new UpstreamError("bad_response", "unexpected XML shape");
  return list as Attrs[];
}

export function parseMarker(a: Attrs): Station {
  const num = Math.max(0, Math.trunc(toNumber(a.num) ?? 0));
  const parameters: Parameter[] = [];
  for (let i = 0; i < num; i++) {
    const warning = toNumber(a[`warning${i}`]);
    const w = warning === null ? null : Math.trunc(warning);
    parameters.push({
      name: a[`mot${i}`] ?? null,
      value: toNumber(a[`val${i}`]),
      value_text: a[`val${i}`] ?? null,
      limit: toNumber(a[`limit${i}`]),
      unit: a[`unit${i}`] ?? null,
      status: a[`status${i}`] ?? null,
      warning: w,
      exceeded: w === 2,
    });
  }
  return {
    name: a.name ?? "",
    datetime: toIsoTh(a.dateTime),
    lat: toCoord(a.lat),
    lng: toCoord(a.lng),
    parameters,
  };
}

const norm = (s: string) => s.trim().toLowerCase();

/** หาแบบตรงตัว (trim + ไม่สนตัวพิมพ์) ไม่ทำ partial match */
export function findMarker(markers: Attrs[], name: string): Attrs | undefined {
  const key = norm(name);
  if (!key) return undefined;
  return markers.find((m) => norm(m.name ?? "") === key);
}

export type FetchResult = { xml: string; status: number; ms: number; bytes: number };

export async function fetchMarkers(url = process.env.ENVIMTP_URL || DEFAULT_ENVIMTP_URL): Promise<FetchResult> {
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: {
        "User-Agent": process.env.UPSTREAM_USER_AGENT || "ESI-AQMS-POC/0.1",
        Accept: "text/xml,application/xml;q=0.9,*/*;q=0.1",
      },
    });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new UpstreamError("timeout", `upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`);
    }
    throw new UpstreamError("bad_response", `upstream fetch failed: ${(e as Error)?.message}`);
  }
  const xml = await res.text();
  const ms = Date.now() - t0;
  const bytes = Buffer.byteLength(xml);
  if (!res.ok) {
    throw new UpstreamError("bad_response", `upstream HTTP ${res.status}`, res.status);
  }
  return { xml, status: res.status, ms, bytes };
}
