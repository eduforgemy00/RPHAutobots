#!/usr/bin/env node
/* =====================================================================
 * jana-rph.mjs — skrip untuk AGENT (Hermes / Antigravity / manusia)
 *
 *   node jana-rph.mjs --minggu 39 --semak        # tengok cadangan sahaja (tiada tulis)
 *   node jana-rph.mjs --minggu 39                # simpan draf + jana PDF ke Desktop
 *
 * Pilihan:
 *   --tahun 2026                 tahun takwim (default: tahun semasa)
 *   --rpt "4 KREATIF,5 DEDIKASI" kelas yang ikut RPT minggu ni (pemantauan). --rpt semua = semua kelas
 *   --cuti 2026-11-03="Sukan Tahunan"   tarikh tak mengajar (boleh ulang). Slot jadi TANGGUH
 *   --tarikh-ahad 2026-11-01     cipta baris takwim jika minggu belum ada
 *   --sp "5 DEDIKASI/SAINS=9.1.1,9.1.2"   SP pilihan guru (sesi pertama minggu ni; sesi seterusnya sambung)
 *   --paksa                      tindih juga slot MANUAL/SIAP (berhati-hati)
 *   --tanpa-pdf                  simpan draf sahaja
 *   --json                       output pelan dalam JSON (untuk agent)
 *
 * Kod keluar: 0 = berjaya, 2 = perlu input guru (lihat mesej), 1 = ralat
 * ===================================================================== */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const C = require('./rph-core.js');

// ---------- argumen ----------
function parseArgs(argv) {
  const a = { cuti: {}, rpt: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--minggu') { a.minggu = parseInt(v, 10); i++; }
    else if (k === '--tahun') { a.tahun = parseInt(v, 10); i++; }
    else if (k === '--rpt') { a.rpt = v.split(',').map(s => s.trim()).filter(Boolean); i++; }
    else if (k === '--cuti') { const [t, ...s] = v.split('='); a.cuti[t.trim()] = s.join('=').replace(/^"|"$/g, '').trim() || 'Cuti'; i++; }
    else if (k === '--tarikh-ahad') { a.tarikhAhad = v; i++; }
    else if (k === '--sp') {   // "5 DEDIKASI/SAINS=10.1.1,10.1.2"  (subjek boleh tinggal jika kelas ada 1 subjek)
      const [lhs, rhs = ''] = v.split('=');
      const [kelas, subjek = '*'] = lhs.split('/').map(s => s.trim());
      (a.sp ||= []).push({ kelas, subjek, codes: rhs.split(',').map(s => s.trim()).filter(Boolean) });
      i++;
    }
    else if (k === '--paksa') a.paksa = true;
    else if (k === '--semak') a.semak = true;
    else if (k === '--tanpa-pdf') a.tanpaPdf = true;
    else if (k === '--json') a.json = true;
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
const out = (msg) => { if (!args.json) console.log(msg); };
const berhenti = (code, mesej, extra = {}) => {
  if (args.json) console.log(JSON.stringify({ ok: code === 0, kod: code, mesej, ...extra }, null, 2));
  else console.error((code === 2 ? '❓ PERLU INPUT GURU: ' : '❌ ') + mesej);
  process.exit(code);
};

if (!args.minggu) berhenti(2, 'Nyatakan minggu. Contoh: node jana-rph.mjs --minggu 39');
const tahun = args.tahun || new Date().getFullYear();

// ---------- config & login ----------
const cfgPath = join(HERE, 'rph-agent.config.json');
if (!existsSync(cfgPath)) berhenti(1, `Fail ${cfgPath} tiada. Salin rph-agent.config.example.json → rph-agent.config.json dan isi.`);
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));

let createClient;
try { ({ createClient } = await import('@supabase/supabase-js')); }
catch { berhenti(1, 'Pakej belum dipasang. Jalankan: npm install'); }

const db = createClient(cfg.supabaseUrl, cfg.anonKey);
{
  const { error } = await db.auth.signInWithPassword({ email: cfg.email, password: cfg.password });
  if (error) berhenti(1, 'Login Supabase gagal: ' + error.message);
}
const must = (res, what) => { if (res.error) berhenti(1, `${what}: ${res.error.message}`); return res.data; };

// ---------- 1. takwim ----------
let takwim = must(await db.from('takwim').select('*').eq('tahun', tahun).eq('minggu', args.minggu).maybeSingle(), 'Baca takwim');
if (!takwim) {
  if (!args.tarikhAhad) berhenti(2, `Takwim ${tahun} minggu ${args.minggu} belum ada. Tanya guru tarikh Ahad minggu tu, kemudian ulang dengan --tarikh-ahad YYYY-MM-DD`, { perlu: 'tarikh_ahad' });
  if (new Date(args.tarikhAhad + 'T00:00:00').getDay() !== 0) berhenti(2, `${args.tarikhAhad} bukan hari Ahad.`);
  const baru = { tahun, minggu: args.minggu, tarikh_ahad: args.tarikhAhad, minggu_rpt: args.minggu, status: 'SEKOLAH' };
  if (args.semak) { takwim = baru; out(`(semak) Takwim minggu ${args.minggu} akan dicipta: Ahad ${args.tarikhAhad}`); }
  else {
    takwim = must(await db.from('takwim').insert(baru).select().single(), 'Cipta takwim');
    out(`➕ Takwim minggu ${args.minggu} dicipta (Ahad ${args.tarikhAhad}).`);
  }
}
if ((takwim.status || 'SEKOLAH') !== 'SEKOLAH') berhenti(2, `Minggu ${args.minggu} bertanda ${takwim.status} dalam takwim — tiada PdP. Sahkan dengan guru.`);
const weekStart = takwim.tarikh_ahad;
const weekEnd = C.addDaysISO(weekStart, 4);
const mingguRpt = takwim.minggu_rpt ?? takwim.minggu;

// ---------- 2. cuti dari argumen → simpan ke DB (website pun nampak) ----------
for (const [t, sebab] of Object.entries(args.cuti)) {
  if (t < weekStart || t > weekEnd) berhenti(2, `Tarikh cuti ${t} di luar minggu ${args.minggu} (${weekStart} – ${weekEnd}).`);
  if (!args.semak) must(await db.from('cuti').upsert({ tarikh: t, sebab }), 'Simpan cuti');
}

// ---------- 3. data asas ----------
const jadual = must(await db.from('jadual_waktu').select('*').eq('active', true).eq('tahun', tahun), 'Baca jadual');
if (!jadual.length) berhenti(2, `Tiada jadual waktu aktif untuk ${tahun}. Guru perlu isi tab Jadual Waktu dulu.`);
const dskp = must(await db.from('dskp_database').select('*').eq('active', true), 'Baca DSKP');
const rpt = must(await db.from('rpt').select('*'), 'Baca RPT');
const cutiRows = must(await db.from('cuti').select('*').gte('tarikh', weekStart).lte('tarikh', weekEnd), 'Baca cuti');
const cuti = Object.fromEntries(cutiRows.map(r => [r.tarikh, r.sebab]));
Object.assign(cuti, args.cuti);
const existingRows = must(await db.from('rph_entri').select('*').gte('tarikh', weekStart).lte('tarikh', weekEnd), 'Baca rph_entri');
const existing = Object.fromEntries(existingRows.map(r => [`${r.tarikh}|${r.jadual_id}`, r]));
const histRows = must(await db.from('rph_entri').select('*').lt('tarikh', weekStart)
  .gte('tarikh', C.addDaysISO(weekStart, -150)).order('tarikh'), 'Baca sejarah');
const jById = Object.fromEntries(jadual.map(j => [j.id, j]));
// Sejarah perlukan kelas/subjek; jadual lama mungkin tak aktif lagi → tarik semua
const allJ = must(await db.from('jadual_waktu').select('id,kelas,subjek_text'), 'Baca jadual penuh');
const jAll = Object.fromEntries(allJ.map(j => [j.id, j]));
// Sejarah = rph_log (rekod setiap PDF yang pernah dijana, termasuk era v2) + rph_entri.
// rph_log diletak DULU; sort dalam planWeek stabil, jadi rph_entri menang jika tarikh sama.
const logRows = must(await db.from('rph_log').select('kelas,subjek_text,tarikh_pdp,kod_sp,refleksi')
  .lt('tarikh_pdp', weekStart).gte('tarikh_pdp', C.addDaysISO(weekStart, -150)), 'Baca rph_log');
const history = [
  ...logRows.map(l => ({ kelas: l.kelas, subjek_text: l.subjek_text, tarikh: l.tarikh_pdp, kod_sp: l.kod_sp,
                         status: C.isTangguhRefleksi(l.refleksi) ? 'TANGGUH' : 'SIAP' })),
  ...histRows.filter(h => jAll[h.jadual_id]).map(h => ({ ...h, kelas: jAll[h.jadual_id].kelas, subjek_text: jAll[h.jadual_id].subjek_text }))
];

// ---------- 4. pelan ----------
const modOverride = {};
for (const k of args.rpt) modOverride[k.toLowerCase() === 'semua' ? '*' : C.normalizeSubject(k)] = 'RPT';
// --sp: SP pilihan guru. Semak kelas wujud, subjek jelas, dan kod ada dalam DSKP.
const spOverride = {};
for (const o of args.sp || []) {
  const subjKelas = [...new Set(jadual.filter(j => C.normalizeSubject(j.kelas) === C.normalizeSubject(o.kelas)).map(j => j.subjek_text))];
  if (!subjKelas.length) berhenti(2, `Kelas "${o.kelas}" tiada dalam jadual.`);
  let subj = o.subjek === '*' ? null : subjKelas.find(s => C.normalizeSubject(s) === C.normalizeSubject(o.subjek));
  if (o.subjek === '*' && subjKelas.length === 1) subj = subjKelas[0];
  if (!subj) berhenti(2, `Kelas ${o.kelas} ada subjek ${subjKelas.join(' / ')}. Guna --sp "${o.kelas}/SUBJEK=kod,kod".`);
  if (!o.codes.length) berhenti(2, `Tiada kod SP untuk ${o.kelas}/${subj}.`);
  const tahunD = C.getTahunFromKelas(o.kelas);
  const tiada = o.codes.filter(c => !dskp.some(d => C.normalizeSubject(d.subjek_text) === C.normalizeSubject(subj) && d.tahun === tahunD && C.cleanText(d.kod_sp) === c));
  if (tiada.length) berhenti(2, `Kod ${tiada.join(', ')} tiada dalam DSKP ${subj} Tahun ${tahunD}. Sahkan kod dengan guru.`);
  spOverride[`${C.normalizeSubject(o.kelas)}|${C.normalizeSubject(subj)}`] = o.codes;
}
const slots = jadual.filter(j => C.HARI_OFFSET[j.hari] !== undefined)
  .map(slot => ({ slot, hari: slot.hari, tarikhISO: C.addDaysISO(weekStart, C.HARI_OFFSET[slot.hari]), weekStartISO: weekStart }));
const plan = C.planWeek({ slots, history, existing, rpt, cuti, mingguRpt, modOverride, spOverride, paksa: !!args.paksa });

// ---------- Kehadiran (sistem kehadiransktd, projek Supabase lain) ----------
// log_harian: satu baris = satu kelas satu hari → bil_murid & bil_hadir. Baca sahaja.
const logHadir = {};
const jumlahTerkini = {};   // kelas → bil_murid dari rekod kehadiran TERKINI (untuk hari belum direkod)
if (cfg.kehadiran?.url && cfg.kehadiran?.anonKey) {
  try {
    const kdb = createClient(cfg.kehadiran.url, cfg.kehadiran.anonKey);
    // Tarik 30 hari ke belakang juga — supaya ada jumlah murid terkini walaupun minggu ni belum direkod
    const { data, error } = await kdb.from('log_harian').select('tarikh,kelas,bil_murid,bil_hadir')
      .gte('tarikh', C.addDaysISO(weekStart, -30)).lte('tarikh', weekEnd).order('tarikh');
    if (error) throw error;
    for (const r of data) {
      const k = C.normalizeSubject(r.kelas);
      if (r.tarikh >= weekStart) logHadir[`${r.tarikh}|${k}`] = r;
      if (r.bil_murid != null) jumlahTerkini[k] = r.bil_murid;   // susunan ikut tarikh → yang terakhir menang
    }
  } catch (e) { out(`⚠ Kehadiran tak dapat dibaca (${e.message}) — guna jumlah murid.`); }
}
// Keutamaan: (1) guru isi manual  (2) log_harian  (3) nilai lama  (4) jumlah murid (anggap penuh)
function kehadiranFor(p) {
  const ex = existing[`${p.tarikhISO}|${p.slot.id}`];
  const lg = logHadir[`${p.tarikhISO}|${C.normalizeSubject(p.slot.kelas)}`];
  if (ex?.sumber === 'MANUAL' && ex.hadir != null) return { hadir: ex.hadir, total: ex.total ?? p.slot.bil_murid, src: 'manual' };
  if (lg) return { hadir: lg.bil_hadir, total: lg.bil_murid, src: 'kehadiran' };
  // Belum direkod: anggap penuh, guna jumlah murid terkini dari sistem kehadiran (bukan jadual waktu yang mungkin lapuk)
  const jt = jumlahTerkini[C.normalizeSubject(p.slot.kelas)] ?? p.slot.bil_murid ?? null;
  return { hadir: jt, total: jt, src: 'anggaran' };
}
const hadirFor = (p) => kehadiranFor(p).hadir;

const ringkas = plan.map(p => ({
  tarikh: p.tarikhISO, hari: p.hari, masa: p.slot.masa_text, kelas: p.slot.kelas, subjek: p.slot.subjek_text,
  mod: p.mod, tindakan: p.tindakan, status: p.status, sp: p.codes,
  hadir: `${kehadiranFor(p).hadir}/${kehadiranFor(p).total}`, sumber_hadir: kehadiranFor(p).src, nota: p.notes
}));
if (!args.json) {
  out(`\n📅 Minggu ${args.minggu} (${weekStart} – ${weekEnd}) · minggu RPT ${mingguRpt}${args.semak ? ' · MOD SEMAK (tiada perubahan)' : ''}\n`);
  for (const r of ringkas)
    out(`${r.hari.padEnd(7)} ${r.masa.padEnd(14)} ${r.kelas.padEnd(11)} ${r.subjek.padEnd(15)} ${r.tindakan === 'KEKAL' ? '🔒' : r.status === 'TANGGUH' ? '⏸' : '📝'} ${(r.sp.join(', ') || '— tiada —').padEnd(22)} ${(r.hadir + ({ kehadiran: ' ✓', manual: ' ✎', anggaran: ' ⏳' }[r.sumber_hadir])).padEnd(9)} ${r.nota.join(' | ')}`);
  out(`\nHadir: ✓ dari sistem kehadiran · ✎ guru isi · ⏳ belum direkod (anggap penuh)`);
}
const kosong = plan.filter(p => !p.codes.length);
if (args.semak) {
  if (args.json) console.log(JSON.stringify({ ok: true, minggu: args.minggu, weekStart, mingguRpt, pelan: ringkas }, null, 2));
  process.exit(0);
}

// ---------- 5. simpan draf ----------
const tulis = plan.filter(p => p.tindakan === 'TULIS' && p.codes.length);
for (const p of tulis) {
  const kh = kehadiranFor(p);
  must(await db.from('rph_entri').upsert({
    tarikh: p.tarikhISO, jadual_id: p.slot.id, kod_sp: p.codes, hadir: kh.hadir, total: kh.total,
    refleksi_pilihan: p.refleksi_pilihan, refleksi_manual: p.refleksi_manual, status: p.status,
    sumber: 'AGENT', updated_at: new Date().toISOString()
  }, { onConflict: 'tarikh,jadual_id' }), `Simpan ${p.slot.kelas} ${p.tarikhISO}`);
}
// Slot KEKAL (dah dicetak / manual) — kemas kini hadir SAHAJA jika sistem kehadiran dah ada data baru
// (kecuali guru isi hadir manual). SP & status tidak disentuh. Jadi jana semula hujung minggu = hadir sebenar.
let hadirDikemas = 0;
for (const p of plan.filter(p => p.tindakan === 'KEKAL')) {
  const ex = existing[`${p.tarikhISO}|${p.slot.id}`]; const kh = kehadiranFor(p);
  if (kh.src === 'kehadiran' && ex && (ex.hadir !== kh.hadir || ex.total !== kh.total)) {
    must(await db.from('rph_entri').update({ hadir: kh.hadir, total: kh.total }).eq('id', ex.id), 'Kemas hadir');
    hadirDikemas++;
  }
}
if (hadirDikemas) out(`👥 ${hadirDikemas} slot sedia ada dikemas kini dengan kehadiran sebenar.`);
out(`\n💾 ${tulis.length} slot disimpan sebagai draf.${kosong.length ? ` ⚠ ${kosong.length} slot tiada SP (lihat nota).` : ''}`);
if (args.tanpaPdf) { if (args.json) console.log(JSON.stringify({ ok: true, disimpan: tulis.length, pelan: ringkas })); process.exit(0); }

// ---------- 6. jana PDF ----------
const fresh = must(await db.from('rph_entri').select('*').gte('tarikh', weekStart).lte('tarikh', weekEnd), 'Baca semula rph_entri');
const dskpMap = C.buildDskpMap(dskp);
const rphs = [], ralat = [];
for (const p of plan) {
  const e = fresh.find(r => r.tarikh === p.tarikhISO && r.jadual_id === p.slot.id);
  if (!e || !(e.kod_sp || []).length) continue;
  const res = C.buildRph({ slot: p.slot, tarikhISO: p.tarikhISO, hari: p.hari, codes: e.kod_sp,
    hadir: e.hadir ?? undefined, total: e.total ?? undefined, refleksi_pilihan: e.refleksi_pilihan, refleksi_manual: e.refleksi_manual }, dskpMap);
  if (res.error) ralat.push(res.error); else rphs.push({ ...res.rph, _status: e.status });
}
if (ralat.length) out('\n⚠ Slot dilangkau:\n  ' + ralat.join('\n  '));
if (!rphs.length) berhenti(1, 'Tiada RPH yang boleh dijana.');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}${C.RPH_PRINT_CSS}</style></head>
<body>${rphs.map(C.buildRphPage).join('')}</body></html>`;
const keluarDir = (cfg.keluarDir || '~/Desktop').replace(/^~/, homedir());
mkdirSync(keluarDir, { recursive: true });
const pdfPath = join(keluarDir, `RPH Minggu ${args.minggu}.pdf`);

let pw;
try { pw = await import('playwright'); } catch { berhenti(1, 'Playwright belum dipasang. Jalankan: npm install'); }
let browser;
try { browser = await pw.chromium.launch({ channel: 'chrome' }); }          // guna Google Chrome sedia ada
catch { try { browser = await pw.chromium.launch(); }                         // atau Chromium Playwright
        catch { berhenti(1, 'Tiada browser. Jalankan: npx playwright install chromium'); } }
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
await browser.close();

// ---------- 7. tanda SIAP + log ----------
for (const r of rphs.filter(r => r._status !== 'TANGGUH'))
  await db.from('rph_entri').update({ status: 'SIAP' }).eq('tarikh', r.tarikhISO).eq('jadual_id', r.id);
await db.from('rph_log').insert(rphs.map(r => ({
  tarikh_pdp: r.tarikhISO, hari: r.hari, kelas: r.kelas, masa: r.masa_text, subject_id: r.subject_id || null,
  subjek_text: r.subjek_text, kod_sk: r.kod_sk, kod_sp: r.spCodes, hadir: r.hadir, total: r.total,
  refleksi: r.refleksi, status: 'JANA'
})));

if (args.json) console.log(JSON.stringify({ ok: true, pdf: pdfPath, bilangan_rph: rphs.length, dilangkau: ralat, pelan: ringkas }, null, 2));
else out(`\n✅ ${rphs.length} RPH → ${pdfPath}`);
process.exit(0);
