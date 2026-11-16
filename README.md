# AQMS Dashboard POC (envimtp → Vercel → จอ)

Spec: https://claude.ai/artifact/69d7LLtVnrXtTiajeToxF4

ดึงค่าคุณภาพอากาศล่าสุดจาก `https://www.envimtp.com/markers.php?type=2` ผ่าน Vercel แล้วแสดงบนจอ 480×240
ไม่มีฐานข้อมูลและไม่มี cron: Vercel CDN cache คำตอบตาม TTL (หมดอายุตอน HH:05 ถัดไป หรือ 120 วิถ้าข้อมูลยังเก่า)

## โครงสร้าง

```
app/api/aqms/route.ts   GET /api/aqms[?station=<marker name>]   (nodejs, sin1)
app/display/page.tsx    หน้าจอ 480×240 + smart polling
lib/envimtp.ts          fetchMarkers(), parseMarkersXml(), parseMarker(), findMarker()
lib/ttl.ts              isFresh(), secondsToNextHH05(), ttlSeconds()
tests/                  vitest + fixtures/markers.xml (XML จริง 16 พ.ย. 2026)
public/mockup/          mockup HTML เดิม (board / display)
```

## รันในเครื่อง

```bash
npm install
npm test          # unit test
npm run build && npm start
```

- รายชื่อสถานี: http://localhost:3000/display
- จอ (ขนาดจริง): `http://localhost:3000/display#TAKUAN_STA(2026)`
- พรีวิวขยาย 2 เท่า: `http://localhost:3000/display?z=2#BLCP%20A`
- API: `http://localhost:3000/api/aqms?station=BLCP%20A`

## Env vars (ไม่มี secret)

| ชื่อ | ค่า default |
| --- | --- |
| `ENVIMTP_URL` | `https://www.envimtp.com/markers.php?type=2` |
| `UPSTREAM_USER_AGENT` | `ESI-AQMS-POC/0.1` (ควรใส่ contact ของทีม เช่น `ESI-AQMS-POC/0.1 (+email)`) |

## Deploy

push เข้า GitHub → import ใน Vercel → region `sin1` (ตั้งไว้ใน `vercel.json` แล้ว) →
เปิด `/api/aqms` ตรวจว่าได้รายชื่อสถานี (= ผ่าน AC1 เบื้องต้น) → ตั้ง URL จอใน VNNOX เป็น `https://<project>.vercel.app/display#<marker name>`

ดู log การเรียก upstream (1 บรรทัด JSON ต่อครั้ง: status, ms, bytes, fresh) ได้ใน Vercel Logs

## สิ่งที่ตัดสินใจเพิ่มจาก spec

- หน้าจอทำตาม UI design ใน `public/mockup/display.html`: โลโก้ กนอ./E:mc², การ์ด PM10 · NO2 · SO2,
  หน้ายิ้มและสีตามระดับ 5 ระดับ (`lib/aqi.ts`), แถบ legend ด้านล่าง
  - ระดับสีคำนวณจากช่วงค่าในตารางของ design ที่ฝั่งจอ (spec เดิมเขียนว่าไม่ทำ AQI ใน POC)
  - ทศนิยมตาม design: PM10 0 ตำแหน่ง, NO2/SO2 2 ตำแหน่ง
  - สถานีที่ไม่มีทั้ง 3 ค่า จะแสดงทุกพารามิเตอร์แบบสลับหน้าทุก 8 วิ
- ชื่อสถานีบนจอใช้ marker name ถ้าต้องการชื่อไทยใส่ `?label=` เช่น `/display?label=สถานีหนองแฟบ#NONG FEAB_STATION`
- `status` ที่ไม่ใช่ `Normal` แสดง "สอบเทียบ" สีเทา, เกินมาตรฐาน (`warning=2`) เป็นสีแดง, ข้อมูลเก่ากว่า 2 ชม. ขึ้นป้าย "ข้อมูลล่าช้า"
- เปิด `/display` โดยไม่ใส่ `#station` จะได้หน้าเลือกสถานี
