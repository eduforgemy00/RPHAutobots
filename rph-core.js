/* =====================================================================
 * rph-core.js — OTAK RPH Autobot (dikongsi oleh website + skrip agent)
 *
 * Kenapa satu fail kongsi?
 *   Website (index.html) dan skrip agent (jana-rph.mjs) guna fungsi yang SAMA,
 *   jadi RPH yang dijana Hermes/Antigravity = RPH yang awak jana manual.
 *   Nak ubah template aktiviti / objektif? Ubah DI SINI sahaja.
 *
 * Tiada akses DB dalam fail ni — semua fungsi "tulen" (input → output).
 * Senang diuji, senang difahami.
 * ===================================================================== */
(function (root) {
  'use strict';

  // -------------------------------------------------------------------
  // 1. UTIL TEKS & TARIKH
  // -------------------------------------------------------------------
  const escapeHtml = (v) => String(v ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const normalizeSubject = (v) => String(v || '').toUpperCase().trim().replace(/\s+/g, ' ');
  const cleanText = (v) => String(v || '').trim().replace(/\s+/g, ' ');
  const stripEndPeriod = (v) => cleanText(v).replace(/\.+$/, '');
  const lowerFirstSentence = (v) => {
    const t = stripEndPeriod(v);
    return t ? t.charAt(0).toLowerCase() + t.slice(1) : '';
  };
  const truncateText = (v, max) => { const t = cleanText(v); return t.length > max ? t.slice(0, max) + '…' : t; };

  // Pecah ikut koma DULU, baru buang duplikat (elak 'Memerhati, ..., Memerhati')
  function uniqueJoin(values) {
    const seen = new Set();
    return values.flatMap(v => String(v || '').split(',')).map(cleanText).filter(Boolean)
      .filter(p => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .join(', ');
  }
  const joinDan = (items) => items.length <= 1 ? (items[0] || '')
    : items.slice(0, -1).join(', ') + ' dan ' + items[items.length - 1];
  const labelKemahiran = (subjek) => normalizeSubject(subjek) === 'SAINS' ? 'KEMAHIRAN SAINS' : 'KEMAHIRAN';

  // Tarikh sebagai string 'YYYY-MM-DD' (elak isu zon masa). Kira guna UTC.
  const localISODate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function addDaysISO(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return t.toISOString().slice(0, 10);
  }
  const isoToDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const formatDisplayDate = (d) => {
    const dt = typeof d === 'string' ? isoToDate(d) : d;
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
  };
  const getTahunFromKelas = (kelas) => { const m = String(kelas || '').match(/^(\d)/); return m ? parseInt(m[1], 10) : null; };
  function parseMasaForSort(masa) {
    const [h, m] = String(masa || '').split('-')[0].trim().split(':').map(Number);
    let hour = h || 0; if (hour < 7) hour += 12;   // 1:15 tengah hari = 13:15
    return hour * 60 + (m || 0);
  }

  const HARI = ['AHAD', 'ISNIN', 'SELASA', 'RABU', 'KHAMIS'];   // Kedah: Ahad–Khamis
  const HARI_OFFSET = { AHAD: 0, ISNIN: 1, SELASA: 2, RABU: 3, KHAMIS: 4 };

  const REFLEKSI_OPTIONS = [
    'PdP ditangguhkan kerana Mesyuarat / Kursus / Sukan.',
    'PdP ditangguhkan kerana Program Sekolah.',
    'PdP ditangguhkan kerana Cuti Peristiwa / Cuti Umum.',
    'Aktiviti PdP dibawa ke sesi akan datang kerana murid tidak menguasai.',
    'Guru tidak hadir atas urusan Cuti Sakit.'
  ];
  const isTangguhRefleksi = (r) => /^(PdP ditangguhkan|Guru tidak hadir)/.test(r || '');

  // -------------------------------------------------------------------
  // 2. JANA KANDUNGAN RPH (objektif, aktiviti, dll.)
  // -------------------------------------------------------------------
  function generateAktiviti(skText, spTexts) {
    const topik = lowerFirstSentence(skText);
    const sp1 = lowerFirstSentence(spTexts[0] || '');
    const semua = joinDan(spTexts.map(lowerFirstSentence)) + '.';
    return `Set induksi:
1. Guru memperkenalkan topik ${topik} dengan menggunakan teknik soal jawab/ bahan bantu mengajar.

Perkembangan:
1. Secara bimbingan guru, murid merumuskan konsep asas berkaitan ${sp1}.
2. Murid dibahagikan kepada kumpulan untuk menjalankan aktiviti penerokaan/ simulasi tentang ${semua}
3. Murid berbincang untuk menghasilkan dan merekodkan hasil dapatan dalam pelbagai bentuk kreatif.
4. Kumpulan murid membentangkan dapatan mereka dan bersoal jawab dengan rakan sekelas.

Penutup:
1. Murid membuat kesimpulan tajuk pembelajaran pada hari ini dengan bimbingan guru.`;
  }

  function buildDskpMap(dskpRows) {
    const map = {};
    for (const r of dskpRows) map[`${normalizeSubject(r.subjek_text)}|${r.tahun}|${cleanText(r.kod_sp)}`] = r;
    return map;
  }

  /**
   * Bina objek RPH untuk satu slot.
   * input: { slot (baris jadual_waktu), tarikhISO, hari, codes[], hadir, refleksi_pilihan, refleksi_manual }
   * pulang: { rph } atau { error: 'mesej' }
   */
  function buildRph(input, dskpMap) {
    const { slot, tarikhISO, hari } = input;
    const codes = (input.codes || []).map(cleanText).filter(Boolean);
    if (!codes.length) return { error: `${slot.kelas} ${slot.masa_text}: Tiada kod SP dipilih` };

    const tahun = getTahunFromKelas(slot.kelas);
    const subj = normalizeSubject(slot.subjek_text);
    const rows = [];
    for (const c of codes) {
      const r = dskpMap[`${subj}|${tahun}|${c}`];
      if (!r) return { error: `${slot.subjek_text} ${slot.kelas}: Kod SP ${c} tidak jumpa dalam DSKP` };
      rows.push(r);
    }

    const spTexts = rows.map(r => cleanText(r.standard_pembelajaran));
    const skSeen = new Set();
    const skDisplay = rows
      .filter(r => { const k = cleanText(r.kod_sk); if (skSeen.has(k)) return false; skSeen.add(k); return true; })
      .map(r => `${cleanText(r.kod_sk)} ${cleanText(r.standard_kandungan)}`).join('\n');
    const spDisplay = rows.map(r => `${cleanText(r.kod_sp)} ${cleanText(r.standard_pembelajaran)}`).join('\n');
    const objektif = spTexts.length === 1
      ? `Pada akhir PdP, semua murid dapat ${lowerFirstSentence(spTexts[0])} dengan bimbingan guru.`
      : `Pada akhir PdP, semua murid dapat:\n` + spTexts.map((s, i) => `${i + 1}. ${lowerFirstSentence(s)}`).join('\n') + `\ndengan bimbingan guru.`;

    // total: dari sistem kehadiran jika ada (lebih tepat), jika tidak dari jadual waktu
    const total = Number.isFinite(input.total) ? input.total : (slot.bil_murid || 0);
    const hadir = Number.isFinite(input.hadir) ? input.hadir : total;
    const pilihan = cleanText(input.refleksi_pilihan || 'AUTO');
    const refleksi = cleanText(input.refleksi_manual) ||
      (pilihan === 'AUTO' ? `${hadir}/${total} murid dapat mencapai objektif yang ditetapkan.` : pilihan);

    return {
      rph: {
        ...slot,
        tarikhISO, hari,
        kod_sk: rows[0].kod_sk,
        skDisplay, spDisplay, spCodes: codes, objektif,
        aktiviti: generateAktiviti(cleanText(rows[0].standard_kandungan), spTexts),
        kemahiran: uniqueJoin(rows.map(r => r.kemahiran)),
        kbat: uniqueJoin(rows.map(r => r.kbat)),
        emk: uniqueJoin(rows.map(r => r.emk_nilai)),
        hadir, total, refleksi
      }
    };
  }

  // -------------------------------------------------------------------
  // 3. HTML CETAKAN (satu muka surat A4 per RPH)
  // -------------------------------------------------------------------
  const RPH_PRINT_CSS = `
    @page { size: A4; margin: 0; }
    .rph-page { width: 210mm; height: 297mm; padding: 10mm; box-sizing: border-box; overflow: hidden;
      page-break-after: always; font-family: Arial, sans-serif; color: #000; background: #fff; }
    .rph-page:last-child { page-break-after: auto; }
    .rph-table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #000; }
    .rph-table td { border: 1px solid #000; padding: 4px 5px; font-size: 8.8pt; line-height: 1.25;
      vertical-align: top; word-wrap: break-word; white-space: pre-line; }
    .rph-title { text-align: center; font-weight: bold; font-size: 12pt; padding: 7px 5px; }
    .rph-label { font-weight: bold; background: #f3f3f3 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .rph-aktiviti { padding-bottom: 28mm; }`;

  function buildRphPage(rph) {
    const subjek = cleanText(rph.subjek_text);
    const row = (label, val, cls = '') =>
      `<tr><td class="rph-label">${label}</td><td colspan="5"${cls ? ` class="${cls}"` : ''}>${escapeHtml(val)}</td></tr>`;
    return `
<div class="rph-page"><table class="rph-table">
  <colgroup><col style="width:16.8%"><col style="width:18.9%"><col style="width:12.6%"><col style="width:18.9%"><col style="width:11.6%"><col style="width:21.2%"></colgroup>
  <tr><td colspan="6" class="rph-title">RANCANGAN PENGAJARAN HARIAN</td></tr>
  <tr><td class="rph-label">MATA PELAJARAN</td><td>${escapeHtml(subjek)}</td>
      <td class="rph-label">TARIKH</td><td>${formatDisplayDate(rph.tarikhISO)}</td>
      <td class="rph-label">HARI</td><td>${escapeHtml(rph.hari)}</td></tr>
  <tr><td class="rph-label">KELAS</td><td>${escapeHtml(rph.kelas)}</td>
      <td class="rph-label">MASA</td><td>${escapeHtml(rph.masa_text)}</td>
      <td class="rph-label">BIL. MURID</td><td>${rph.hadir}/${rph.total} orang</td></tr>
  ${row('S. KANDUNGAN', rph.skDisplay)}
  ${row('S. PEMBELAJARAN', rph.spDisplay)}
  ${row('OBJEKTIF PDP', rph.objektif)}
  ${row('AKTIVITI', rph.aktiviti, 'rph-aktiviti')}
  ${row(labelKemahiran(subjek), rph.kemahiran)}
  ${row('KBAT', rph.kbat)}
  ${row('EMK/ NILAI', rph.emk)}
  ${row('REFLEKSI', rph.refleksi)}
</table></div>`;
  }

  // -------------------------------------------------------------------
  // 4. CADANG SP — mod SAMBUNG & mod RPT
  //
  // Konsep:
  //  - "Famili" SP = nombor pertama kod. PJ ada famili 1/2 (kemahiran),
  //    3/4 (kecergasan), 5 (nilai). Sains biasanya satu famili sahaja.
  //  - SAMBUNG: cari blok RPT yang mengandungi SP terakhir kelas.
  //      * Satu famili (Sains): ambil k SP seterusnya dalam blok tu.
  //      * Banyak famili (PJ): setiap famili mesti ada SP seterusnya dalam
  //        blok; kalau tak, lompat ke blok berikutnya & ambil SP PERTAMA
  //        setiap famili.   cth PJ 3.4.1+4.4.1 → 3.5.1+4.5.1
  //      * Blok habis → blok berikutnya.
  //  - RPT: mula dari blok RPT untuk minggu tu (abaikan sejarah).
  // -------------------------------------------------------------------
  const fam = (c) => c.split('.')[0];
  const codeCmp = (a, b) => {
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
    return 0;
  };

  /** Blok RPT untuk satu subjek/tahun, ikut susunan minggu. */
  function rptBlocks(rptRows, subjek, tahun, versi = 'KSSR2017') {
    return rptRows
      .filter(r => normalizeSubject(r.subjek_text) === normalizeSubject(subjek) && r.tahun === tahun && (r.versi || 'KSSR2017') === versi)
      .sort((a, b) => a.minggu_mula - b.minggu_mula || a.minggu_akhir - b.minggu_akhir)
      .map(r => ({ ...r, kod_sp: [...(r.kod_sp || [])].sort(codeCmp) }));
  }

  /** SP pertama setiap famili (ikut famili yang diminta jika ada). */
  function firstPerFamily(codes, families) {
    let cand = families && families.length ? codes.filter(c => families.includes(fam(c))) : codes;
    if (!cand.length) cand = codes;
    const out = [], seen = new Set();
    for (const c of cand) if (!seen.has(fam(c))) { seen.add(fam(c)); out.push(c); }
    return out;
  }

  /** Mula dari awal satu blok. k = bilangan SP satu sesi (default 2). */
  function startOfBlock(block, k, families) {
    const fams = [...new Set(block.kod_sp.map(fam))];
    const wanted = families && families.length ? families : null;
    // Sains: satu famili → k SP pertama
    if ((wanted || fams).length <= 1 || fams.length <= 1) {
      const pool = wanted ? block.kod_sp.filter(c => wanted.includes(fam(c))) : block.kod_sp;
      return (pool.length ? pool : block.kod_sp).slice(0, k);
    }
    // PJ: SP pertama setiap famili, abaikan famili 5 (nilai) kecuali diminta
    const fs = wanted || fams.filter(f => f !== '5');
    return firstPerFamily(block.kod_sp, fs).slice(0, Math.max(k, fs.length));
  }

  /**
   * Cadang SP seterusnya selepas `last` (array kod).
   * Pulang { codes, blockIndex, note }
   */
  function nextAfter(blocks, last) {
    if (!blocks.length) return { codes: [], blockIndex: -1, note: 'Tiada RPT untuk subjek/tahun ini' };
    const k = Math.max(1, last.length);
    const families = [...new Set(last.map(fam))];
    // Blok TERKINI yang mengandungi semua SP terakhir (jika tiada, mana-mana satu)
    let bi = -1;
    for (let i = blocks.length - 1; i >= 0; i--) if (last.every(c => blocks[i].kod_sp.includes(c))) { bi = i; break; }
    if (bi < 0) for (let i = blocks.length - 1; i >= 0; i--) if (last.some(c => blocks[i].kod_sp.includes(c))) { bi = i; break; }
    if (bi < 0) return { codes: [], blockIndex: -1, note: `SP terakhir (${last.join(', ')}) tiada dalam RPT` };

    const b = blocks[bi];
    if (families.length <= 1) {
      // Satu famili: SP selepas yang terbesar dalam famili tu
      const pool = b.kod_sp.filter(c => fam(c) === families[0]);
      const maxLast = last.slice().sort(codeCmp).pop();
      const rest = pool.filter(c => codeCmp(c, maxLast) > 0);
      if (rest.length) return { codes: rest.slice(0, k), blockIndex: bi };
    } else {
      // Banyak famili: setiap famili mesti ada SP seterusnya dalam blok sama
      const picks = [];
      for (const f of families) {
        const lastF = last.filter(c => fam(c) === f).sort(codeCmp).pop();
        const nxt = b.kod_sp.filter(c => fam(c) === f && codeCmp(c, lastF) > 0)[0];
        if (!nxt) { picks.length = 0; break; }
        picks.push(nxt);
      }
      if (picks.length === families.length) return { codes: picks, blockIndex: bi };
    }
    // Blok seterusnya yang ada SP berbeza (RPT kadang ulang blok sama 2 minggu)
    for (let j = bi + 1; j < blocks.length; j++) {
      const same = blocks[j].kod_sp.join() === b.kod_sp.join();
      if (same) continue;
      return { codes: startOfBlock(blocks[j], k, families.length > 1 ? families : null), blockIndex: j };
    }
    return { codes: [], blockIndex: bi, note: 'Dah sampai hujung RPT' };
  }

  /** Blok untuk minggu RPT tertentu (atau blok terdekat sebelum). */
  function blockForWeek(blocks, mingguRpt) {
    let idx = blocks.findIndex(b => b.minggu_mula <= mingguRpt && mingguRpt <= b.minggu_akhir);
    if (idx < 0) for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].minggu_mula <= mingguRpt) { idx = i; break; }
    return idx;
  }

  /**
   * Rancang satu minggu.
   * ctx = { slots: [{slot, tarikhISO, hari}], history: [{kelas, subjek_text, tarikh, kod_sp, status}],
   *         existing: {'tarikh|jadual_id': entri}, rpt, cuti: {tarikhISO: sebab},
   *         mingguRpt, modOverride: {kelas|'*': 'RPT'|'SAMBUNG'}, paksa }
   * pulang: array pelan per slot
   */
  function planWeek(ctx) {
    const hist = {};   // kunci kelas|subjek → entri terakhir (dikemas kini semasa loop)
    const kk = (kelas, subj) => `${normalizeSubject(kelas)}|${normalizeSubject(subj)}`;
    for (const h of [...ctx.history].sort((a, b) => a.tarikh.localeCompare(b.tarikh)))
      if ((h.kod_sp || []).length) hist[kk(h.kelas, h.subjek_text)] = h;

    const slots = [...ctx.slots].sort((a, b) =>
      a.tarikhISO.localeCompare(b.tarikhISO) || parseMasaForSort(a.slot.masa_text) - parseMasaForSort(b.slot.masa_text));

    const plan = [];
    for (const s of slots) {
      const { slot, tarikhISO } = s;
      const key = kk(slot.kelas, slot.subjek_text);
      const tahun = getTahunFromKelas(slot.kelas);
      const blocks = rptBlocks(ctx.rpt, slot.subjek_text, tahun);
      const ex = ctx.existing[`${tarikhISO}|${slot.id}`];
      const mod = (ctx.modOverride[normalizeSubject(slot.kelas)] || ctx.modOverride['*'] || slot.mod_sp || 'SAMBUNG').toUpperCase();
      const p = { ...s, mod, codes: [], status: 'DRAF', refleksi_pilihan: 'AUTO', refleksi_manual: null, notes: [], tindakan: 'TULIS' };

      // Jangan tindih kerja manual / yang dah dicetak
      if (ex && !ctx.paksa && (ex.status === 'SIAP' || (ex.sumber === 'MANUAL' && (ex.kod_sp || []).length))) {
        p.tindakan = 'KEKAL'; p.codes = ex.kod_sp || []; p.status = ex.status;
        p.notes.push(ex.status === 'SIAP' ? 'Dah dicetak — tidak diubah' : 'Diisi manual — tidak diubah');
        if (p.codes.length) hist[key] = { ...ex, kelas: slot.kelas, subjek_text: slot.subjek_text, tarikh: tarikhISO };
        plan.push(p); continue;
      }

      const last = hist[key];
      let res;
      // SP ditetapkan guru (--sp) → guna untuk sesi PERTAMA kelas tu minggu ni; sesi berikutnya sambung dari situ
      const ov = (ctx.spOverride || {})[key] || (ctx.spOverride || {})[`${normalizeSubject(slot.kelas)}|*`];
      const ovUsed = ctx._ovUsed || (ctx._ovUsed = new Set());
      if (ov && !ovUsed.has(key)) {
        ovUsed.add(key);
        res = { codes: ov, blockIndex: -1 };
        p.notes.push('SP ditetapkan guru');
      } else if (mod === 'RPT' || !last) {
        const bi = blockForWeek(blocks, ctx.mingguRpt);
        const sameWeekEarlier = last && last.tarikh >= s.weekStartISO && last._fromRun;
        if (bi < 0) res = { codes: [], blockIndex: -1, note: 'Tiada blok RPT untuk minggu ini' };
        else if (sameWeekEarlier) res = nextAfter(blocks, last.kod_sp);       // sesi ke-2 minggu sama: sambung
        else res = { codes: startOfBlock(blocks[bi], 2, null), blockIndex: bi };
        if (!last && mod !== 'RPT') p.notes.push('Tiada sejarah kelas ni — mula ikut RPT');
      } else if (last.status === 'TANGGUH') {
        res = { codes: last.kod_sp, blockIndex: -1 };
        p.notes.push('Sesi lepas ditangguh — ulang SP sama');
      } else {
        res = nextAfter(blocks, last.kod_sp);
      }
      if (res.note) p.notes.push(res.note);
      p.codes = res.codes;

      // Amaran ketinggalan berbanding RPT
      const target = blockForWeek(blocks, ctx.mingguRpt);
      if (!p.codes.length && !res.note) p.notes.push('Tiada SP — tanya guru');
      if (res.blockIndex >= 0 && target >= 0) {
        const lag = blocks[target].minggu_mula - blocks[res.blockIndex].minggu_akhir;
        if (lag >= 2) p.notes.push(`⚠ Ketinggalan ~${lag} minggu dari RPT`);
        if (blocks[res.blockIndex].minggu_mula - blocks[target].minggu_akhir >= 2) p.notes.push('ℹ Mendahului RPT');
      }

      // Cuti harian → TANGGUH (SP dibawa ke sesi berikutnya)
      const sebab = ctx.cuti[tarikhISO];
      if (sebab) {
        p.status = 'TANGGUH';
        const opt = REFLEKSI_OPTIONS.find(o => o.startsWith('PdP') && new RegExp(sebab.split(/\s+/)[0], 'i').test(o));
        if (opt) p.refleksi_pilihan = opt;
        else { p.refleksi_pilihan = 'PdP ditangguhkan kerana Cuti Peristiwa / Cuti Umum.'; p.refleksi_manual = `PdP ditangguhkan kerana ${stripEndPeriod(sebab)}.`; }
        p.notes.push(`Tangguh: ${sebab}`);
      }

      if (p.codes.length) hist[key] = { kelas: slot.kelas, subjek_text: slot.subjek_text, tarikh: tarikhISO, kod_sp: p.codes, status: p.status, _fromRun: true };
      if (ex) p.notes.push('Ganti draf agent sebelum ini');
      plan.push(p);
    }
    return plan;
  }

  const api = {
    escapeHtml, normalizeSubject, cleanText, stripEndPeriod, lowerFirstSentence, truncateText,
    uniqueJoin, joinDan, labelKemahiran, localISODate, addDaysISO, isoToDate, formatDisplayDate,
    getTahunFromKelas, parseMasaForSort, HARI, HARI_OFFSET, REFLEKSI_OPTIONS, isTangguhRefleksi,
    generateAktiviti, buildDskpMap, buildRph, RPH_PRINT_CSS, buildRphPage,
    rptBlocks, nextAfter, startOfBlock, blockForWeek, planWeek, codeCmp
  };
  root.RPHCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
