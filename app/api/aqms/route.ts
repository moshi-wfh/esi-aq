import {
  fetchMarkers,
  findMarker,
  parseMarker,
  parseMarkersXml,
  UpstreamError,
  DEFAULT_ENVIMTP_URL,
} from "../../../lib/envimtp";
import { isFresh, toThaiIso, ttlSeconds } from "../../../lib/ttl";

export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

const SOURCE = (process.env.ENVIMTP_URL || DEFAULT_ENVIMTP_URL).replace(/^https?:\/\/(www\.)?/, "");

function json(body: unknown, status: number, cdnTtl: number | null): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8" };
  if (cdnTtl === null) {
    headers["Cache-Control"] = "no-store";
    headers["Vercel-CDN-Cache-Control"] = "no-store";
  } else {
    headers["Cache-Control"] = "no-cache";
    headers["Vercel-CDN-Cache-Control"] = `s-maxage=${cdnTtl}, stale-while-revalidate=300`;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function meta(now: Date, fresh: boolean, ttl: number) {
  return {
    source: SOURCE,
    fetched_at: toThaiIso(now),
    fresh,
    cache_ttl: ttl,
    next_check_at: toThaiIso(new Date(now.getTime() + ttl * 1000)),
  };
}

function log(entry: Record<string, unknown>) {
  console.log(JSON.stringify({ at: toThaiIso(new Date()), ...entry }));
}

export async function GET(req: Request): Promise<Response> {
  const station = new URL(req.url).searchParams.get("station");

  let markers;
  try {
    const r = await fetchMarkers();
    markers = parseMarkersXml(r.xml);
    const now = new Date();
    const latest = markers.map((m) => parseMarker(m).datetime).sort().at(-1) ?? null;
    log({ upstream: r.status, ms: r.ms, bytes: r.bytes, markers: markers.length, fresh: isFresh(latest, now), station });
  } catch (e) {
    if (e instanceof UpstreamError) {
      const timeout = e.kind === "timeout";
      log({ upstream: e.httpStatus ?? null, error: e.kind, message: e.message, station });
      return json(
        { success: false, error: timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_BAD_RESPONSE", message: e.message },
        timeout ? 504 : 502,
        null,
      );
    }
    log({ error: "internal", message: (e as Error)?.message, station });
    return json({ success: false, error: "UPSTREAM_BAD_RESPONSE", message: "parse failed" }, 502, null);
  }

  const now = new Date();

  // ไม่ใส่ station → รายชื่อสถานี + datetime ล่าสุด
  if (!station) {
    const list = markers.map((m) => {
      const s = parseMarker(m);
      return { name: s.name, datetime: s.datetime, fresh: isFresh(s.datetime, now) };
    });
    const anyFresh = list.some((s) => s.fresh);
    const ttl = ttlSeconds(anyFresh, now);
    return json({ success: true, meta: meta(now, anyFresh, ttl), data: list }, 200, ttl);
  }

  const hit = findMarker(markers, station);
  if (!hit) {
    return json(
      {
        success: false,
        error: "STATION_NOT_FOUND",
        message: `ไม่พบสถานี "${station}"`,
        available: markers.map((m) => m.name),
      },
      404,
      300,
    );
  }

  const data = parseMarker(hit);
  const fresh = isFresh(data.datetime, now);
  const ttl = ttlSeconds(fresh, now);
  return json({ success: true, meta: meta(now, fresh, ttl), data }, 200, ttl);
}
