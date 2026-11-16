"use client";

import { useEffect, useRef, useState } from "react";
import type { Parameter, Station } from "../../lib/envimtp";

type Meta = { fresh: boolean; cache_ttl: number; fetched_at: string };
type ListItem = { name: string; datetime: string | null; fresh: boolean };

const STALE_MS = 2 * 3600_000; // datetime เก่ากว่า 2 ชม. → "ข้อมูลล่าช้า"
const PAGE_SIZE = 3; // การ์ดต่อหน้าบนจอ 480×240
const PAGE_MS = 8000; // สลับหน้าทุก 8 วิ เมื่อพารามิเตอร์เกิน 3 ค่า

/* ---------------- format helpers ---------------- */
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "2026-11-16T11:00:00+07:00" → "16 พ.ย. 69 · 11:00 น." (อ่านจากสตริงตรง ๆ ไม่พึ่ง Intl ของ player) */
function thaiStamp(iso: string | null): string {
  if (!iso) return "–";
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const be = (Number(m[1]) + 543) % 100;
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1]} ${String(be).padStart(2, "0")} · ${m[4]}:${m[5]} น.`;
}

function thaiClock(iso: string | undefined): string {
  const m = iso && /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : "–";
}

const MET_LABELS: Record<string, string> = {
  TEMP: "อุณหภูมิ", RH: "ความชื้น", BP: "ความกดอากาศ", WS: "ความเร็วลม", WD: "ทิศลม",
  RAIN: "ฝน", SR: "รังสีอาทิตย์", NR: "รังสีสุทธิ",
};
const FORMULA = /^(SO|NO|O|CO|CH|NH|H|PM)(\d+(?:\.\d+)?)(S?)$/i;

function Label({ name }: { name: string | null }) {
  if (!name) return <>–</>;
  const up = name.toUpperCase();
  if (MET_LABELS[up]) return <>{MET_LABELS[up]}</>;
  if (up === "NOX") return <>NO<sub>x</sub></>;
  const m = FORMULA.exec(name);
  if (m) return <>{m[1].toUpperCase()}<sub>{m[2]}</sub>{m[3].toUpperCase()}</>;
  return <>{name}</>;
}

function prettyUnit(u: string | null): string {
  if (!u) return "";
  const k = u.trim().toLowerCase();
  if (k === "ug/m3") return "µg/m³";
  if (k === "mg/m3") return "mg/m³";
  if (k === "degc" || k === "c") return "°C";
  if (k === "deg") return "°";
  if (k === "mbar") return "mbar";
  if (k === "m/s") return "m/s";
  return u;
}

type Kind = "ok" | "exceed" | "calib";
const kindOf = (p: Parameter): Kind =>
  p.status && p.status.toLowerCase() !== "normal" ? "calib" : p.exceeded ? "exceed" : "ok";

/* ---------------- card ---------------- */
function Card({ p }: { p: Parameter }) {
  const kind = kindOf(p);
  const text = p.value_text ?? "–";
  const pct = p.limit && p.value !== null ? Math.max(2, Math.min(100, (p.value / p.limit) * 100)) : 0;
  return (
    <div className={`s-card ${kind === "exceed" ? "exceed" : ""}`}>
      <div className="s-top">
        <span className="s-code"><span><Label name={p.name} /></span></span>
        <i className={`s-dot ${kind}`} />
      </div>
      {kind === "calib" ? (
        <div className="s-val calib">สอบเทียบ</div>
      ) : (
        <div className={`s-val ${text.length > 6 ? "long" : ""} ${kind === "exceed" ? "exceed" : ""}`}>{text}</div>
      )}
      <div className="s-unit">{prettyUnit(p.unit)}</div>
      <div className="s-bar">{p.limit !== null && <span className={kind === "exceed" ? "exceed" : ""} style={{ width: `${pct}%` }} />}</div>
      <div className={`s-std ${kind === "exceed" ? "exceed" : ""}`}>
        {p.limit === null
          ? "ไม่มีค่ามาตรฐาน"
          : kind === "exceed"
            ? `เกินมาตรฐาน (${p.limit})`
            : `มาตรฐาน ≤ ${p.limit} ${prettyUnit(p.unit)}`}
      </div>
      <div className={`s-lvl ${kind}`}>
        {kind === "exceed" ? "เกินมาตรฐาน" : kind === "calib" ? `สถานะ: ${p.status}` : "ปกติ"}
      </div>
    </div>
  );
}

/* ---------------- station picker (ไม่มี #station ใน URL) ---------------- */
function Picker() {
  const [list, setList] = useState<ListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/aqms", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.success ? setList(j.data) : setErr(j.message || j.error)))
      .catch((e) => setErr(String(e)));
  }, []);
  return (
    <main className="picker">
      <h1>เลือกสถานี AQMS</h1>
      <p>
        ตั้ง URL ของจอใน VNNOX เป็น <code>/display#&lt;marker name&gt;</code> · ดูพรีวิวขยาย 2 เท่าด้วย <code>?z=2</code>
      </p>
      {err && <p style={{ color: "var(--red)" }}>โหลดรายชื่อไม่ได้: {err}</p>}
      {!list && !err && <p>กำลังโหลด…</p>}
      <ul>
        {list?.map((s) => (
          <li key={s.name}>
            <a href={`/display?z=2#${encodeURIComponent(s.name)}`}>
              <b>{s.name}</b>
              <span className={s.fresh ? "" : "stale"}>{thaiStamp(s.datetime)}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

/* ---------------- screen ---------------- */
type View =
  | { state: "loading" }
  | { state: "notfound" }
  | { state: "offline" } // ยังไม่เคยได้ข้อมูลเลย และเรียกไม่สำเร็จ
  | { state: "ok"; data: Station; meta: Meta };

function Screen({ station, zoom }: { station: string; zoom: number }) {
  const [view, setView] = useState<View>({ state: "loading" });
  const [stale, setStale] = useState(false);
  const [page, setPage] = useState(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  // smart polling ตามหัวข้อ 6 ของ spec
  useEffect(() => {
    const API = `/api/aqms?station=${encodeURIComponent(station)}`;
    let lastKey: string | null = null;
    let failCount = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let nextAt = 0;
    let inFlight = false;
    let alive = true;

    function schedule(sec: number) {
      clearTimeout(timer);
      const ms = (sec + Math.random() * 15) * 1000;
      nextAt = Date.now() + ms;
      timer = setTimeout(poll, ms);
    }

    async function poll() {
      if (inFlight || !alive) return;
      inFlight = true;
      try {
        const res = await fetch(API, { cache: "no-store" });
        if (res.status === 404) {
          lastKey = null;
          setView({ state: "notfound" });
          return schedule(300);
        }
        if (!res.ok) throw new Error(String(res.status));
        const { meta, data } = (await res.json()) as { meta: Meta; data: Station };
        failCount = 0;
        const key = data.datetime + JSON.stringify(data.parameters);
        if (key !== lastKey) {
          setView({ state: "ok", data, meta });
          lastKey = key;
        }
        setStale(!data.datetime || Date.now() - Date.parse(data.datetime) > STALE_MS);
        schedule(meta.fresh ? meta.cache_ttl : 120);
      } catch {
        failCount++;
        // ค่าเดิมยังอยู่บนจอ แค่ขึ้นป้ายล่าช้า
        if (viewRef.current.state === "ok") setStale(true);
        else setView({ state: "offline" });
        schedule(Math.min(60 * 2 ** (failCount - 1), 300));
      } finally {
        inFlight = false;
      }
    }

    // watchdog: player บางรุ่นพัก setTimeout
    const watchdog = setInterval(() => {
      if (Date.now() > nextAt + 60_000) poll();
    }, 60_000);
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    addEventListener("online", poll);
    document.addEventListener("visibilitychange", onVisible);
    // reload ทั้งหน้าวันละครั้งตอน 03:00 (เวลาเครื่อง)
    const nightly = setInterval(() => {
      const d = new Date();
      if (d.getHours() === 3 && d.getMinutes() === 0) location.reload();
    }, 60_000);

    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(watchdog);
      clearInterval(nightly);
      removeEventListener("online", poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [station]);

  // สลับหน้าการ์ดเมื่อพารามิเตอร์เกิน 3 ค่า
  const params = view.state === "ok" ? view.data.parameters : [];
  const pages = Math.max(1, Math.ceil(params.length / PAGE_SIZE));
  useEffect(() => {
    setPage(0);
    if (pages <= 1) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), PAGE_MS);
    return () => clearInterval(t);
  }, [pages]);

  const shown = params.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const name = view.state === "ok" ? view.data.name : station;

  const scr = (
    <div className="scr" style={zoom !== 1 ? { transform: `scale(${zoom})` } : undefined}>
      <header className="s-hdr">
        <div className="s-mark">AQ</div>
        <div className="s-title">
          <b>คุณภาพอากาศ มาบตาพุดคอมเพล็กซ์</b>
          <span>
            <em>{name}</em>
            {view.state === "ok" && <> · {thaiStamp(view.data.datetime)}</>}
          </span>
        </div>
        {view.state === "ok" && stale && <span className="s-badge">ข้อมูลล่าช้า</span>}
      </header>

      <section className="s-body">
        {view.state === "loading" && <div className="s-msg">กำลังโหลด…</div>}
        {view.state === "offline" && (
          <div className="s-msg"><div>กำลังเชื่อมต่อ…<small>จะลองใหม่อัตโนมัติ</small></div></div>
        )}
        {view.state === "notfound" && (
          <div className="s-msg"><div>ไม่พบสถานี<small>{station}</small></div></div>
        )}
        {view.state === "ok" && params.length === 0 && (
          <div className="s-msg"><div>ไม่มีข้อมูลจากสถานีนี้<small>envimtp ไม่ได้ส่งค่าพารามิเตอร์</small></div></div>
        )}
        {shown.map((p, i) => <Card key={`${page}-${i}-${p.name}`} p={p} />)}
      </section>

      <footer className="s-foot">
        <span>ที่มา: envimtp.com</span>
        <span className="s-pages">
          {pages > 1 && Array.from({ length: pages }, (_, i) => <i key={i} className={i === page ? "on" : ""} />)}
        </span>
        <span>{view.state === "ok" ? `ตรวจล่าสุด ${thaiClock(view.meta.fetched_at)}` : ""}</span>
      </footer>
    </div>
  );

  if (zoom === 1) return <div className="kiosk">{scr}</div>;
  return (
    <div className="preview">
      <div className="frame" style={{ width: 480 * zoom, height: 240 * zoom }}>{scr}</div>
    </div>
  );
}

export default function DisplayPage() {
  const [station, setStation] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const read = () => {
      let s = "";
      try {
        s = decodeURIComponent(location.hash.slice(1));
      } catch {
        s = location.hash.slice(1);
      }
      setStation(s.trim());
    };
    const z = Number(new URLSearchParams(location.search).get("z"));
    setZoom(z >= 1 && z <= 4 ? z : 1);
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);

  if (station === null) return null;
  if (!station) return <Picker />;
  return <Screen key={station} station={station} zoom={zoom} />;
}
