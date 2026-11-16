"use client";

import { useEffect, useRef, useState } from "react";
import type { Parameter, Station } from "../../lib/envimtp";
import { CRITERIA, criteriaOf, LEVELS, levelOf, type Level } from "../../lib/aqi";

type Meta = { fresh: boolean; cache_ttl: number; fetched_at: string };
type ListItem = { name: string; datetime: string | null; fresh: boolean };

const STALE_MS = 2 * 3600_000; // datetime เก่ากว่า 2 ชม. → "ข้อมูลล่าช้า"
const PAGE_SIZE = 3; // การ์ดต่อหน้าบนจอ 480×240
const PAGE_MS = 8000; // ใช้เฉพาะสถานีที่ไม่มี PM10/NO2/SO2 เลย

/* ---------------- format helpers ---------------- */
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "2026-11-16T11:00:00+07:00" → "16 พ.ย. 2569 · 11:00 น." (อ่านจากสตริงตรง ๆ ไม่พึ่ง Intl ของ player) */
function thaiStamp(iso: string | null): string {
  if (!iso) return "–";
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543} · ${m[4]}:${m[5]} น.`;
}

/** ผสมสี hex กับขาว/ดำ แทน color-mix() ที่ player รุ่นเก่าอาจไม่รองรับ */
function mix(hex: string, pct: number, withHex: string): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(withHex);
  return "#" + a.map((v, i) => Math.round(v * pct + b[i] * (1 - pct)).toString(16).padStart(2, "0")).join("");
}
const tint = (hex: string, pc: number) => mix(hex, pc / 100, "#ffffff");
const shade = (hex: string) => mix(hex, 0.7, "#000000");

const MET_LABELS: Record<string, string> = {
  TEMP: "อุณหภูมิ", RH: "ความชื้น", BP: "ความกดอากาศ", WS: "ความเร็วลม", WD: "ทิศลม",
  RAIN: "ฝน", SR: "รังสีอาทิตย์", NR: "รังสีสุทธิ",
};
const FORMULA = /^(SO|NO|O|CO|CH|NH|H)(\d+)(S?)$/i;

function Label({ name }: { name: string | null }) {
  if (!name) return <>–</>;
  const up = name.toUpperCase();
  if (MET_LABELS[up]) return <>{MET_LABELS[up]}</>;
  if (up === "NOX") return <>NO<sub>x</sub></>;
  const pm = /^PM(\d+(?:\.\d+)?)$/.exec(up);
  if (pm) return <>PM<small>{pm[1]}</small></>;
  const m = FORMULA.exec(name);
  if (m) return <>{m[1].toUpperCase()}<sub>{m[2]}</sub>{m[3].toUpperCase()}</>;
  return <>{name}</>;
}

function Unit({ u }: { u: string | null }) {
  if (!u) return null;
  const k = u.trim().toLowerCase();
  if (k === "ug/m3" || k === "µg/m³") return <>µg/m<sup>3</sup></>;
  if (k === "mg/m3") return <>mg/m<sup>3</sup></>;
  if (k === "degc" || k === "c") return <>°C</>;
  if (k === "deg") return <>°</>;
  if (k === "mbar") return <>mbar</>;
  return <>{u}</>;
}

const isCalib = (p: Parameter) => !!p.status && p.status.toLowerCase() !== "normal";

/* ---------------- face icon (จาก design) ---------------- */
const MOUTH: Record<number, string> = {
  1: "M30 60 Q50 82 70 60 Z", 2: "M32 62 Q50 76 68 62", 3: "M34 66 L66 66",
  4: "M32 70 Q50 58 68 70", 5: "M30 72 Q50 54 70 72 Z",
};
function Face({ level, color }: { level: number; color?: string }) {
  const filled = level === 1 || level === 5;
  return (
    <svg className="s-face" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill={color ?? LEVELS[level - 1]?.color ?? "#ccc"} stroke="#fff" strokeWidth="3" />
      {level <= 2 ? (
        <path d="M28 42 Q35 34 42 42 M58 42 Q65 34 72 42" stroke="#222" strokeWidth="4" fill="none" strokeLinecap="round" />
      ) : (
        <g fill="#222"><circle cx="36" cy="42" r="5" /><circle cx="64" cy="42" r="5" /></g>
      )}
      <path d={MOUTH[level]} stroke="#222" strokeWidth="4" strokeLinecap="round" fill={filled ? "#222" : "none"} />
    </svg>
  );
}

/* ---------------- card ---------------- */
const GREY = "#8b8799";

function Card({ p }: { p: Parameter }) {
  const c = criteriaOf(p.name);
  const calib = isCalib(p);
  const limit = p.limit ?? c?.standard ?? null;
  const exceed = !calib && p.exceeded;
  const level: Level | null = c && p.value !== null && !calib ? levelOf(c, p.value) : null;
  const color = calib ? GREY : exceed ? "#e5484d" : level?.color ?? "#2fc4b2";
  const text =
    p.value === null ? p.value_text ?? "–" : c ? p.value.toFixed(c.decimals) : p.value_text ?? String(p.value);
  const pct = limit && p.value !== null ? Math.max(2, Math.min(100, (p.value / limit) * 100)) : 0;
  const lvlText = calib ? "สอบเทียบ" : level ? level.label_th : exceed ? "เกินมาตรฐาน" : "ปกติ";

  return (
    <div className={`s-card${exceed ? " exceed" : ""}`}>
      <div className="s-top">
        <span className="s-code"><span><Label name={p.name} /></span></span>
        {c && (calib ? <Face level={3} color={GREY} /> : level && <Face level={level.level} />)}
      </div>
      {calib ? (
        <div className="s-val calib">สอบเทียบ</div>
      ) : (
        <div className={`s-val${text.length > 6 ? " long" : ""}${exceed ? " exceed" : ""}`}>{text}</div>
      )}
      <div className="s-unit"><Unit u={c?.unit ?? p.unit} /></div>
      <div className="s-bar">{limit !== null && !calib && <span style={{ width: `${pct}%`, background: color }} />}</div>
      <div className={`s-std${exceed ? " exceed" : ""}`}>
        {limit === null ? (
          "ไม่มีค่ามาตรฐาน"
        ) : exceed ? (
          `เกินมาตรฐาน (${limit})`
        ) : (
          <>มาตรฐาน ≤ {limit} <Unit u={c?.unit ?? p.unit} /></>
        )}
      </div>
      <div className="s-lvl" style={{ background: tint(color, 18), color: shade(color) }}>{lvlText}</div>
    </div>
  );
}

/** PM10, NO2, SO2 ตามลำดับใน design ถ้าสถานีไม่มีเลยให้แสดงทุกพารามิเตอร์แบบสลับหน้า */
function pickParams(all: Parameter[]): Parameter[] {
  const picked = CRITERIA.map((c) => all.find((p) => criteriaOf(p.name) === c)).filter(Boolean) as Parameter[];
  return picked.length ? picked : all;
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
        ตั้ง URL ของจอใน VNNOX เป็น <code>/display#&lt;marker name&gt;</code> · ใส่ชื่อที่จะแสดงบนจอด้วย{" "}
        <code>?label=สถานีหนองแฟบ</code> · พรีวิวขยาย 2 เท่าด้วย <code>?z=2</code>
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

function Screen({ station, label, zoom }: { station: string; label: string | null; zoom: number }) {
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

  const params = view.state === "ok" ? pickParams(view.data.parameters) : [];
  const pages = Math.max(1, Math.ceil(params.length / PAGE_SIZE));
  useEffect(() => {
    setPage(0);
    if (pages <= 1) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), PAGE_MS);
    return () => clearInterval(t);
  }, [pages]);

  const shown = params.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const name = label || (view.state === "ok" ? view.data.name : station);

  const scr = (
    <div className="scr" style={zoom !== 1 ? { transform: `scale(${zoom})` } : undefined}>
      <header className="s-hdr">
        <div className="s-logos">
          <img className="a" src="/logos/ieat.png" alt="กนอ. การนิคมอุตสาหกรรมแห่งประเทศไทย" />
          <img className="b" src="/logos/emcc.png" alt="E:mc² Industrial Estate Authority of Thailand" />
        </div>
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

      <footer className="s-legend">
        {LEVELS.map((lv) => (
          <span key={lv.level} style={{ background: lv.color, color: lv.level === 3 ? "#3b2f00" : "#fff" }}>
            {lv.label_short_th}
          </span>
        ))}
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
  const [label, setLabel] = useState<string | null>(null);
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
    const q = new URLSearchParams(location.search);
    const z = Number(q.get("z"));
    setZoom(z >= 1 && z <= 4 ? z : 1);
    setLabel(q.get("label")?.trim() || null);
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);

  if (station === null) return null;
  if (!station) return <Picker />;
  return <Screen key={station} station={station} label={label} zoom={zoom} />;
}
