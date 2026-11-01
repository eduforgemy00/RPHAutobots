# AGENTS.md — RPH Autobot (untuk Hermes, Antigravity & mana-mana AI agent)

Kamu membantu **Cikgu Azmi (SK Tanjong Dawai)** menjana Rancangan Pengajaran Harian (RPH) mingguan.
Guru bercakap Bahasa Melayu santai. Balas dalam BM santai, ringkas, point form.

## Arahan biasa guru → apa kamu buat

| Guru cakap | Kamu buat |
|---|---|
| "buatkan RPH minggu 39" | Ikut **ALIRAN STANDARD** di bawah |
| "minggu 39, Selasa cuti sukan" | `--cuti 2026-MM-DD="Sukan Tahunan"` |
| "4 Kreatif ikut RPT" / "ada pemantauan" | `--rpt "4 KREATIF"` atau `--rpt semua` |
| "simpan je, jangan PDF" | `--tanpa-pdf` |
| "5D sains guna 9.1.1 dan 9.1.2" | `--sp "5 DEDIKASI/SAINS=9.1.1,9.1.2"` |
| "5K ulang 10.1.4" / "4K sambung dari 6.1.1" | `--sp "5 KREATIF/SAINS=10.1.4"` · `--sp "4 KREATIF/SAINS=6.1.1,6.1.2"` |
| "minggu 1 tahun depan" | `--tahun 2027 --minggu 1` (takwim baru — lihat kod keluar 2) |

## ALIRAN STANDARD (wajib ikut urutan)

1. **Tanya guru 2 soalan sahaja** (satu mesej):
   - "Minggu ni ada hari cuti / tak mengajar? (contoh: Selasa sukan)"
   - "Ada kelas nak ikut RPT? (pemantauan) — atau semua sambung biasa?"
   Jika guru jawab "takde"/"biasa" → tiada flag tambahan.
2. **Semak dulu** (tiada apa ditulis):
   ```
   node jana-rph.mjs --minggu N [flag] --semak
   ```
3. **Tunjuk ringkasan** kepada guru: hari, kelas, SP cadangan, dan semua baris ⚠ amaran.
   - Jika ada slot **"— tiada —"** (nota *Dah sampai hujung RPT* / *Tiada SP*), TANYA guru:
     "5 Dedikasi Sains dah habis RPT. Nak guna SP apa minggu ni?"
     Kemudian semak semula dengan `--sp "KELAS/SUBJEK=kod,kod"` (satu `--sp` untuk setiap kelas).
     `--sp` hanya tetapkan sesi PERTAMA kelas tu; sesi seterusnya minggu sama akan sambung sendiri.
   - Tanya: "Ok jana?" — tunggu guru setuju.
4. **Jana**:
   ```
   node jana-rph.mjs --minggu N [flag yang sama]
   ```
5. Beritahu lokasi PDF (default `~/Desktop/RPH Minggu N.pdf`) dan slot yang dilangkau (jika ada).

> Guru kata "terus je / tak payah tanya"? Langkau langkah 1 & 3, tetapi **tetap** jalankan `--semak` dulu dan
> berhenti jika ada ⚠ "tiada dalam RPT" / "tiada SP".

## Kod keluar skrip

- `0` berjaya.
- `2` **perlu input guru** — baca mesej. Kes biasa:
  - *Takwim minggu belum ada* → tanya guru tarikh **Ahad** minggu tu, ulang dengan `--tarikh-ahad YYYY-MM-DD`.
  - *Tiada jadual waktu aktif* → guru perlu isi tab Jadual Waktu di website dulu.
  - *Minggu bertanda CUTI/UASA* → sahkan dengan guru.
- `1` ralat teknikal — lihat bahagian **Masalah biasa**.

Guna `--json` jika kamu mahu output berstruktur.

## Peraturan (JANGAN langgar)

- **Jangan ubah DB terus** (SQL / REST). Semua tulis melalui `jana-rph.mjs` sahaja.
- **Jangan guna `--paksa`** kecuali guru minta secara jelas. Ia menindih slot yang guru isi manual / dah dicetak.
- **Jangan reka kod SP.** SP datang daripada skrip (logik dalam `rph-core.js`).
- **Jangan push** `rph-agent.config.json` ke GitHub (ada password). Ia dah dalam `.gitignore`.
- Jangan ubah `rph-core.js` / `jana-rph.mjs` tanpa izin guru — website guna fail yang sama.

## Cara skrip pilih SP (supaya kamu boleh terangkan kepada guru)

- **SAMBUNG** (default): teruskan dari SP terakhir kelas tu, ikut susunan RPT.
  - Sains: 5.1.1+5.1.2 → 5.1.3+5.1.4 → blok seterusnya.
  - PJ: SP pertama setiap SK berkaitan, cth 3.4.1+4.4.1 → 3.5.1+4.5.1.
- **RPT**: ikut blok RPT minggu semasa (untuk pemantauan).
- Sesi **TANGGUH** (cuti/program) → SP sama dibawa ke sesi berikutnya.
- Slot yang guru isi manual atau dah dicetak (✅) **tidak diubah** (🔒).
- ⚠ *Ketinggalan X minggu* = kelas jauh di belakang RPT. Maklumkan sahaja, jangan ubah apa-apa.
  (Nota: angka untuk **Sains Tahun 4** tak tepat — fail RPT Sains 4 edisi berbeza. Abaikan angka tu.)

## Persediaan kali pertama (sekali sahaja)

```
cd ~/Desktop/rphautobots
npm install
npx playwright install chromium     # hanya jika Google Chrome tiada
cp rph-agent.config.example.json rph-agent.config.json   # isi anonKey, email, password
node jana-rph.mjs --minggu 1 --semak                     # ujian
```

## Masalah biasa

| Mesej | Penyelesaian |
|---|---|
| `Pakej belum dipasang` / `Playwright belum dipasang` | `npm install` |
| `Tiada browser` | `npx playwright install chromium` |
| `Login Supabase gagal` | Semak email/password dalam `rph-agent.config.json` |
| `Kod SP X tidak jumpa dalam DSKP` | DSKP tahun/subjek tu belum ada — maklumkan guru (boleh run `sql/02b_dskp_tambahan.sql`) |
| `Tiada RPT untuk subjek/tahun ini` | Maklumkan guru; isi SP manual di website |

## Struktur projek (rujukan)

- `index.html` — website (manual). Login → Dashboard → isi/semak → Jana PDF.
- `rph-core.js` — logik kongsi: cadang SP, jana objektif/aktiviti, HTML RPH.
- `jana-rph.mjs` — skrip agent.
- `sql/` — skema & data Supabase.
- Jadual Supabase: `jadual_waktu`, `takwim` (+`minggu_rpt`, `status`), `cuti`, `rpt`, `dskp_database`, `rph_entri` (data slot), `rph_log`.

## Kehadiran murid (automatik)

- Skrip baca `log_harian` dari **sistem kehadiran sekolah** (projek Supabase lain, baca sahaja).
- Lajur hadir dalam ringkasan: `✓` dari sistem kehadiran · `✎` guru isi manual · `⏳` belum direkod (anggap penuh).
- RPH biasanya dijana **sebelum** minggu bermula → banyak slot `⏳`. Itu normal.
- **Hujung minggu**, bila guru minta "kemas kehadiran minggu N" atau "jana semula minggu N":
  jalankan `node jana-rph.mjs --minggu N` sekali lagi. Hadir dikemas kini dari sistem kehadiran
  (SP & status TIDAK berubah) dan PDF dijana semula dengan angka sebenar.
- Jika guru isi hadir sendiri di website (✎), nilai guru dikekalkan.
- **Jangan sekali-kali** tulis/ubah apa-apa dalam sistem kehadiran.
