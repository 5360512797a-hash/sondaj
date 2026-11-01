'use strict';
/* =========================================================
   Sondaj Hesap Cebi — v2
   Tüm veriler kuyu bazında localStorage'da tutulur.
   Uzunluklar içeride her zaman ft olarak saklanır.
   ========================================================= */
const $ = id => document.getElementById(id);
const BBL_M3 = 0.158987, LB_KG = 0.453592, M_FT = 3.28084, PSI_BAR = 0.0689476, FT3_BBL = 5.61458;
const KEY = 'sondaj-db-v2';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f = (x, d = 1) => (x != null && isFinite(x)) ? Number(x).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const row = (k, v, u, big) => `<div class="row${big ? ' big' : ''}"><span class="k">${k}</span><span class="v">${v}<em>${u || ''}</em></span></div>`;
const err = m => `<div class="err">${m}</div>`;
const uid = () => Math.random().toString(36).slice(2, 10);
const num = v => { if (v === '' || v == null) return NaN; return parseFloat(String(v).replace(',', '.')); };
const n = id => num($(id).value);
const round = (x, d = 3) => isFinite(x) ? +(+x).toFixed(d) : '';
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const fmtDate = s => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const fmtDay = s => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('tr-TR'); };

function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2600); }

/* ---------------- birimler ---------------- */
let DB;
const unit = () => DB.unit || 'ft';
const toFt = x => unit() === 'm' ? x * M_FT : x;
const fromFt = x => unit() === 'm' ? x / M_FT : x;
const tankBbl = ft3 => ft3 / FT3_BBL;

/* ---------------- çamur özellikleri ---------------- */
const PROPS = [
  { k: 'mw', n: 'Yoğunluk', u: 'ppg', d: 2, lo: 10, hi: 10.8 },
  { k: 'fv', n: 'Huni viskozitesi', u: 'sn/qt', d: 0, lo: 40, hi: 55 },
  { k: 'pv', n: 'PV', u: 'cP', d: 0, lo: 10, hi: 22 },
  { k: 'yp', n: 'YP', u: 'lb/100ft²', d: 0, lo: 10, hi: 20 },
  { k: 'g10s', n: 'Jel 10 sn', u: 'lb/100ft²', d: 0, lo: 2, hi: 6 },
  { k: 'g10m', n: 'Jel 10 dk', u: 'lb/100ft²', d: 0, lo: 5, hi: 15 },
  { k: 'ph', n: 'pH', u: '', d: 1, lo: 9, hi: 10.5 },
  { k: 'fl', n: 'API filtrat', u: 'ml/30dk', d: 1, lo: null, hi: 6 },
  { k: 'cake', n: 'Kek', u: '1/32 in', d: 0, lo: null, hi: 2 },
  { k: 'sol', n: 'Katı', u: '%', d: 1, lo: null, hi: 10 },
  { k: 'sand', n: 'Kum', u: '%', d: 2, lo: null, hi: 0.5 },
  { k: 'mbt', n: 'MBT', u: 'ppb', d: 1, lo: null, hi: 20 },
  { k: 'cl', n: 'Klorür', u: 'mg/L', d: 0, lo: null, hi: null },
  { k: 'ca', n: 'Kalsiyum', u: 'mg/L', d: 0, lo: null, hi: 200 },
  { k: 'pf', n: 'Pf', u: 'ml', d: 2, lo: null, hi: null },
  { k: 'mf', n: 'Mf', u: 'ml', d: 2, lo: null, hi: null },
  { k: 'temp', n: 'Sıcaklık', u: '°C', d: 0, lo: null, hi: null }
];
const defaultTargets = () => Object.fromEntries(PROPS.map(p => [p.k, { lo: p.lo, hi: p.hi }]));

/* ---------------- veri modeli ---------------- */
function sampleTanks() {
  return [
    { id: uid(), name: 'Shaker tankı', comps: [
      { name: 'Kum kapanı', use: 'settle', shape: 'rect', L: 6, W: 8, H: 7, level: 6.2, mw: '' },
      { name: 'Degasser', use: 'settle', shape: 'rect', L: 8, W: 8, H: 7, level: 5.8, mw: '' } ] },
    { id: uid(), name: 'Aktif tank', comps: [
      { name: 'Aktif 1', use: 'active', shape: 'rect', L: 12, W: 8, H: 7, level: 5.5, mw: 10.5 },
      { name: 'Emiş', use: 'active', shape: 'rect', L: 12, W: 8, H: 7, level: 5.0, mw: 10.5 } ] },
    { id: uid(), name: 'Rezerv tank', comps: [
      { name: 'Rezerv 1', use: 'reserve', shape: 'rect', L: 16, W: 8, H: 7, level: 4.0, mw: 11.2 },
      { name: 'Su', use: 'other', shape: 'rect', L: 10, W: 8, H: 7, level: 6.0, mw: 8.33 } ] },
    { id: uid(), name: 'Trip tank', comps: [
      { name: 'Trip', use: 'trip', shape: 'cyl', L: 4, W: 0, H: 10, level: 6.5, mw: 10.5 } ] }
  ];
}
function sampleStock() {
  return [
    { id: uid(), name: 'Barit', unit: 'torba', kg: 50, qty: 400, min: 100 },
    { id: uid(), name: 'Bentonit', unit: 'torba', kg: 25, qty: 120, min: 40 },
    { id: uid(), name: 'PAC-LV', unit: 'torba', kg: 25, qty: 30, min: 20 },
    { id: uid(), name: 'XC polimer', unit: 'torba', kg: 25, qty: 18, min: 10 },
    { id: uid(), name: 'Kostik soda', unit: 'torba', kg: 25, qty: 12, min: 10 }
  ];
}
const defaultSecs = () => [
  { name: 'Muhafaza 9⅝" / DP 5"', dh: 8.681, od: 5, id: 4.276, len: 6000 },
  { name: 'Açık kuyu 8½" / DP 5"', dh: 8.5, od: 5, id: 4.276, len: 2700 },
  { name: 'Açık kuyu 8½" / DC 6½"', dh: 8.5, od: 6.5, id: 2.8125, len: 800 }
];
function newWell(name, extra = {}) {
  return Object.assign({
    id: uid(), name: name || 'Yeni kuyu', field: '', rig: '', op: '', start: new Date().toISOString().slice(0, 10), depth: '',
    status: 'aktif', end: null, created: new Date().toISOString(),
    secs: defaultSecs(), vals: {}, reports: [], targets: defaultTargets(),
    tanks: sampleTanks(), stock: sampleStock(), stockLog: [],
    recipe: { rows: [{ stockId: '', name: 'Bentonit', target: 20, current: 0 }, { stockId: '', name: 'PAC-LV', target: 1.5, current: 0 }] },
    tally: { rows: [], unit: 'ft', inHole: 0, bha: 0, kb: 0, source: '' }
  }, extra);
}
function load() {
  try { DB = JSON.parse(localStorage.getItem(KEY)); } catch (e) { DB = null; }
  if (!DB || !DB.wells) {
    const w = newWell('Örnek kuyu');
    try { // v1'den aktarım
      const s = JSON.parse(localStorage.getItem('secs')); if (Array.isArray(s) && s.length) w.secs = s;
      const v = JSON.parse(localStorage.getItem('vals')); if (v) w.vals = v;
    } catch (e) {}
    w.recipe.rows.forEach(r => { const s = w.stock.find(x => x.name === r.name); if (s) r.stockId = s.id; });
    DB = { v: 2, unit: 'ft', active: w.id, wells: { [w.id]: w }, lastBackup: null, group: 'kuyu', tab: {} };
  }
  if (!DB.wells[DB.active]) DB.active = Object.keys(DB.wells)[0];
}
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { toast('Kayıt yapılamadı: cihaz hafızası dolu olabilir.'); } }, 250); }
const W = () => DB.wells[DB.active];
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

/* ---------------- gezinme ---------------- */
const GROUPS = {
  kuyu: [['kuyu', 'Kuyu & Arşiv'], ['hacim', 'Kuyu Hacmi'], ['tally', 'Tally']],
  camur: [['olcum', 'Ölçümler'], ['seviye', 'Seviye (cm)'], ['tank', 'Tanklar'], ['stok', 'Stok'], ['hazir', 'Hazırlama'], ['agir', 'Ağırlaştırma'], ['seyr', 'Seyreltme']],
  hesap: [['pompa', 'Dolaşım'], ['hid', 'Basınç'], ['kill', '<span lang="en">Kill sheet</span>'], ['cim', 'Çimento'], ['hidr', 'Hidrolik'], ['trip', 'Tripping']]
};
function showGroup(g) {
  DB.group = g; save();
  document.querySelectorAll('#bar button').forEach(b => b.setAttribute('aria-selected', b.dataset.g === g));
  $('sub').innerHTML = GROUPS[g].map(([t, l]) => `<button role="tab" data-t="${t}">${l}</button>`).join('');
  showTab((DB.tab && DB.tab[g]) || GROUPS[g][0][0]);
}
function showTab(t) {
  DB.tab = DB.tab || {}; DB.tab[DB.group] = t; save();
  document.querySelectorAll('#sub button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t));
  document.querySelectorAll('main > section').forEach(s => s.hidden = s.id !== 't-' + t);
  const b = document.querySelector(`#sub button[data-t="${t}"]`); if (b && b.scrollIntoView) b.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  window.scrollTo(0, 0);
  if (t === 'tally') loadLib('pdf').catch(() => {});
  renderAll();
}
$('bar').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showGroup(b.dataset.g); });
$('sub').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.t); });

/* ---------------- birim düğmesi ---------------- */
// uzunluk alanlarını işaretle
document.querySelectorAll('small.lu').forEach(s => { const i = s.closest('label') && s.closest('label').querySelector('input'); if (i) i.dataset.len = '1'; });
function setUnit(u, convert) {
  const old = unit();
  if (convert && old !== u) {
    const fac = u === 'm' ? 1 / M_FT : M_FT;
    CALC_INPUTS.forEach(id => { const el = $(id); if (el.dataset.len && el.value !== '') { const v = round(num(el.value) * fac, 2); el.value = v; W().vals[id] = String(v); } });
  }
  DB.unit = u; save();
  $('u-ft').setAttribute('aria-pressed', u === 'ft'); $('u-m').setAttribute('aria-pressed', u === 'm');
  document.querySelectorAll('.lu').forEach(e => e.textContent = e.textContent.replace(/\((ft|m)/, '(' + u));
  document.querySelectorAll('.lu2').forEach(e => e.textContent = u);
  renderAll(true);
}
$('u-ft').onclick = () => setUnit('ft', true); $('u-m').onclick = () => setUnit('m', true);

/* ---------------- hesap girdileri (kuyu bazlı) ---------------- */
const CALC_INPUTS = [...document.querySelectorAll('#t-hacim input[id], #t-agir input[id], #t-agir select[id], #t-seyr input[id], #t-pompa input[id], #t-pompa select[id], #t-hid input[id], #t-kill input[id], #t-cim input[id], #t-hidr input[id], #t-trip input[id], #t-hazir select[id], #t-hazir input[id]')]
  .map(e => e.id).filter(id => !['a-stock', 'z-tank'].includes(id));
const DEFAULTS = Object.fromEntries(CALC_INPUTS.map(id => [id, $(id).value]));
function loadCalcInputs() { const v = W().vals || {}; CALC_INPUTS.forEach(id => { $(id).value = v[id] != null ? v[id] : DEFAULTS[id]; }); }
CALC_INPUTS.forEach(id => $(id).addEventListener('input', () => { W().vals[id] = $(id).value; save(); calcAll(); }));

/* =========================================================
   KUYU BİLGİSİ & ARŞİV
   ========================================================= */
const INFO = { 'w-name': 'name', 'w-field': 'field', 'w-rig': 'rig', 'w-op': 'op', 'w-start': 'start' };
Object.entries(INFO).forEach(([id, k]) => $(id).addEventListener('input', () => { W()[k] = $(id).value; save(); renderHeader(); renderWells(); }));
$('w-depth').addEventListener('input', () => { const v = n('w-depth'); W().depth = isFinite(v) ? toFt(v) : ''; save(); });
function renderHeader() {
  const w = W();
  $('hdrWell').innerHTML = `${esc(w.name || 'Adsız kuyu')}${w.status === 'tamamlandı' ? ' <span>· tamamlandı</span>' : ''}`;
}
function renderKuyu() {
  const w = W();
  Object.entries(INFO).forEach(([id, k]) => { if (document.activeElement !== $(id)) $(id).value = w[k] || ''; });
  if (document.activeElement !== $('w-depth')) $('w-depth').value = w.depth !== '' && w.depth != null ? round(fromFt(w.depth), 1) : '';
  $('doneBanner').hidden = w.status !== 'tamamlandı';
  $('btnFinish').textContent = w.status === 'tamamlandı' ? 'Kuyuyu yeniden aktif yap' : 'Kuyuyu tamamla';
  $('lastBackup').textContent = DB.lastBackup ? 'Son yedek: ' + fmtDate(DB.lastBackup) : 'Henüz yedek alınmadı.';
  renderWells();
}
function renderWells() {
  const list = Object.values(DB.wells).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  $('wellList').innerHTML = list.map(w => `
    <div class="wellrow">
      <div><b>${esc(w.name || 'Adsız')}</b> ${w.id === DB.active ? '<span class="chip ok">açık</span>' : ''} ${w.status === 'tamamlandı' ? '<span class="chip na">tamamlandı</span>' : ''}
        <div class="meta">${esc([w.field, w.rig].filter(Boolean).join(' · ') || '—')} · ${fmtDay(w.start)}${w.end ? ' → ' + fmtDay(w.end) : ''} · ${w.reports.length} ölçüm · ${w.tally.rows.length} joint</div></div>
      <div class="btns" style="margin:0">
        ${w.id !== DB.active ? `<button class="btn ghost" data-open="${w.id}">Aç</button>` : ''}
        <button class="btn ghost" data-xls="${w.id}">Excel</button>
        ${list.length > 1 ? `<button class="btn ghost" data-delw="${w.id}">Sil</button>` : ''}
      </div>
    </div>`).join('');
}
$('wellList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.open) { DB.active = b.dataset.open; save(); switchWell(); toast('Kuyu açıldı'); }
  if (b.dataset.xls) exportExcel(DB.wells[b.dataset.xls]);
  if (b.dataset.delw) {
    const w = DB.wells[b.dataset.delw];
    if (!confirm(`"${w.name}" kuyusu ve tüm kayıtları silinsin mi? Bu işlem geri alınamaz.`)) return;
    delete DB.wells[w.id]; if (DB.active === w.id) DB.active = Object.keys(DB.wells)[0]; save(); switchWell(); toast('Kuyu silindi');
  }
});
$('btnNewWell').onclick = () => { $('newWellBox').hidden = false; $('nw-name').focus(); };
$('nwCancel').onclick = () => $('newWellBox').hidden = true;
$('nwCreate').onclick = () => {
  const old = W(), name = $('nw-name').value.trim() || 'Yeni kuyu';
  const w = newWell(name, { targets: JSON.parse(JSON.stringify(old.targets)) });
  if ($('nw-carry').checked) { w.stock = JSON.parse(JSON.stringify(old.stock)); w.tanks = JSON.parse(JSON.stringify(old.tanks)); w.recipe = JSON.parse(JSON.stringify(old.recipe)); }
  else { w.stock = []; w.tanks = []; w.recipe = { rows: [] }; }
  if ($('nw-secs').checked) w.secs = JSON.parse(JSON.stringify(old.secs));
  DB.wells[w.id] = w; DB.active = w.id; save();
  $('newWellBox').hidden = true; $('nw-name').value = ''; switchWell(); toast(`"${name}" oluşturuldu`);
};
$('btnFinish').onclick = () => {
  const w = W();
  if (w.status === 'tamamlandı') { w.status = 'aktif'; w.end = null; save(); renderKuyu(); renderHeader(); return; }
  if (!confirm(`"${w.name}" tamamlandı olarak işaretlensin mi? Tüm kayıtlar arşivde kalır.`)) return;
  w.status = 'tamamlandı'; w.end = new Date().toISOString().slice(0, 10); save(); renderKuyu(); renderHeader();
  toast('Kuyu tamamlandı. Excel raporu ve yedek almayı unutma.');
};
$('btnExcel').onclick = () => exportExcel(W());
$('btnBackup').onclick = () => {
  const blob = new Blob([JSON.stringify(DB, null, 1)], { type: 'application/json' });
  saveFile(blob, `sondaj-yedek-${new Date().toISOString().slice(0, 10)}.json`).then(ok => { if (ok) { DB.lastBackup = new Date().toISOString(); save(); renderKuyu(); } });
};
$('restoreFile').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !data.wells) throw new Error('format');
    const cnt = Object.keys(data.wells).length;
    if (!confirm(`Yedekte ${cnt} kuyu var. Mevcut kayıtlarla birleştirilsin mi? Aynı kuyu varsa yedekteki sürüm kullanılır.`)) return;
    Object.assign(DB.wells, data.wells); if (!DB.wells[DB.active]) DB.active = Object.keys(DB.wells)[0];
    save(); switchWell(); toast(`${cnt} kuyu geri yüklendi`);
  } catch (x) { toast('Bu dosya geçerli bir yedek değil.'); }
};
function switchWell() { loadCalcInputs(); renderAll(true); }

/* ---------------- dosya kaydetme / kütüphaneler ---------------- */
async function saveFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
  } catch (e) { if (e.name === 'AbortError') return false; }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000); return true;
}
const LIBS = { xlsx: 'xlsx.full.min.js', pdf: 'pdf.min.js' };
const libP = {};
function loadLib(k) {
  if (libP[k]) return libP[k];
  return libP[k] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = LIBS[k];
    s.onload = () => { if (k === 'pdf' && window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js'; res(); };
    s.onerror = () => { delete libP[k]; rej(new Error('lib')); }; document.head.appendChild(s);
  });
}
setTimeout(() => loadLib('xlsx').catch(() => {}), 1500);

/* =========================================================
   KUYU HACMİ
   ========================================================= */
let wellRes = { pipe: 0, ann: 0, disp: 0, lastAnnCap: 0, depth: 0 }, pumpRes = { out: 0, gpm: 0, bpm: 0 };
function renderSecs() {
  $('secs').innerHTML = W().secs.map((s, i) => `
   <div class="sec">
     <div class="sec-h"><b>Bölüm ${i + 1}</b><button class="btn ghost" data-del="${i}">Sil</button></div>
     <label>Açıklama<input id="s${i}-name" data-i="${i}" data-k="name" type="text" value="${esc(s.name)}"></label>
     <div class="grid">
       <label>Kuyu / muhafaza ID <small>(in)</small><input id="s${i}-dh" data-i="${i}" data-k="dh" type="text" inputmode="decimal" value="${s.dh}"></label>
       <label>Boru OD <small>(in)</small><input id="s${i}-od" data-i="${i}" data-k="od" type="text" inputmode="decimal" value="${s.od}"></label>
       <label>Boru ID <small>(in)</small><input id="s${i}-id" data-i="${i}" data-k="id" type="text" inputmode="decimal" value="${s.id}"></label>
       <label>Uzunluk <small>(${unit()})</small><input id="s${i}-len" data-i="${i}" data-k="len" type="text" inputmode="decimal" value="${round(fromFt(s.len), 2)}"></label>
     </div>
   </div>`).join('') || '<p class="note">Henüz bölüm yok.</p>';
}
$('secs').addEventListener('input', e => {
  const t = e.target, k = t.dataset.k; if (!k) return;
  const s = W().secs[t.dataset.i];
  s[k] = k === 'name' ? t.value : k === 'len' ? toFt(num(t.value)) : num(t.value);
  save(); calcAll();
});
$('secs').addEventListener('click', e => { const d = e.target.dataset.del; if (d != null) { W().secs.splice(+d, 1); save(); renderSecs(); calcAll(); } });
$('addSec').onclick = () => { const s = W().secs, l = s[s.length - 1] || { dh: 8.5, od: 5, id: 4.276 }; s.push({ name: 'Yeni bölüm', dh: l.dh, od: l.od, id: l.id, len: 500 }); save(); renderSecs(); calcAll(); };

function annAbove(depthFt) { // numune derinliğinin üstündeki anülüs hacmi
  let rem = depthFt, v = 0;
  for (const s of W().secs) { if (rem <= 0) break; const L = Math.min(s.len || 0, rem); v += ((s.dh ** 2) - (s.od ** 2)) / 1029.4 * L; rem -= L; }
  return v;
}
function calcHacim() {
  let pipe = 0, ann = 0, disp = 0, open = 0, depth = 0, rows = '', lastAnnCap = 0;
  W().secs.forEach((s, i) => {
    const L = s.len || 0;
    const pc = (s.id ** 2) / 1029.4, ac = ((s.dh ** 2) - (s.od ** 2)) / 1029.4, dc = ((s.od ** 2) - (s.id ** 2)) / 1029.4;
    pipe += pc * L; ann += ac * L; disp += dc * L; open += (s.dh ** 2) / 1029.4 * L; depth += L; lastAnnCap = ac;
    rows += row(`${i + 1}. ${esc(s.name || 'Bölüm')}`, `${f(pc * L)} / ${f(ac * L)}`, 'bbl');
  });
  const surf = n('h-surf') || 0;
  wellRes = { pipe, ann, disp, lastAnnCap, depth };
  const total = pipe + ann + surf;
  $('r-hacim').innerHTML = `<h3>Sonuç</h3>
   ${row('Toplam sirkülasyon hacmi', f(total), 'bbl', true)}${row('', f(total * BBL_M3, 2), 'm³')}
   ${row('Dizi içi hacim', f(pipe), 'bbl')}${row('Anülüs hacmi', f(ann), 'bbl')}
   ${row('Çelik deplasmanı', f(disp), 'bbl')}${row('Boş kuyu hacmi (dizi yok)', f(open), 'bbl')}
   ${row('Toplam uzunluk', f(fromFt(depth), 0), unit())}
   <div class="sp"></div><h3>Bölümler · dizi içi / anülüs</h3>${rows}`;
}

/* =========================================================
   POMPA & DOLAŞIM
   ========================================================= */
function calcPompa() {
  const t = $('m-type').value, id = n('m-id'), L = n('m-l'), rod = n('m-rod') || 0, eff = (n('m-eff') || 100) / 100, spm = n('m-spm'), np = Math.max(1, n('m-np') || 1), man = n('m-man');
  const calcOut = t === 'tri' ? 0.000243 * id * id * L * eff : 0.000162 * L * (2 * id * id - rod * rod) * eff;
  const out = isFinite(man) && man > 0 ? man : calcOut;
  const bpm = out * spm * np, gpm = bpm * 42; pumpRes = { out, gpm, bpm };
  const { pipe, ann, depth } = wellRes, surf = n('h-surf') || 0;
  const sdIn = n('m-sd'), sd = isFinite(sdIn) && sdIn > 0 ? Math.min(toFt(sdIn), depth) : depth;
  const lagV = annAbove(sd);
  const stk = v => out > 0 ? v / out / np : NaN, mn = v => bpm > 0 ? v / bpm : NaN;
  const hm = m => { if (!isFinite(m)) return '—'; const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? `${h} sa ${r} dk` : `${r} dk`; };
  $('r-pompa').innerHTML = `<h3>Çamur yüzeye gelme süresi</h3>
    ${row(sd < depth - 1 ? `Lag (${f(fromFt(sd), 0)} ${unit()}'den)` : 'Bottoms-up (dipten)', hm(mn(lagV)), '', true)}
    ${row('Strok', f(stk(lagV), 0), 'stk/pompa')}${row('Anülüs hacmi', f(lagV), 'bbl')}
    <div class="sp"></div><h3>Pompa</h3>
    ${row('Strok hacmi', f(out, 4), 'bbl/stk')}${isFinite(man) && man > 0 ? '' : row('', f(out * 42, 2), 'gal/stk')}
    ${row('Toplam debi', f(gpm, 0), 'gpm')}${row('', f(bpm, 2), 'bbl/dk')}${row('', f(gpm * 3.78541, 0), 'L/dk')}
    <div class="sp"></div><h3>Diğer dolaşımlar</h3>
    ${row('Yüzeyden matkaba', `${f(stk(pipe), 0)} stk`, hm(mn(pipe)))}
    ${row('Tam devir (kuyu)', `${f(stk(pipe + ann + surf), 0)} stk`, hm(mn(pipe + ann + surf)))}
    ${row('Aktif sistem devri', `${f(stk(pipe + ann + surf + tankTotals().active), 0)} stk`, hm(mn(pipe + ann + surf + tankTotals().active)))}`;
}

/* =========================================================
   ÇAMUR ÖLÇÜMLERİ
   ========================================================= */
let editingRep = null, chartKey = 'mw';
$('o-props').innerHTML = PROPS.map(p => `<label>${p.n} <small>${p.u ? '(' + p.u + ')' : ''}</small><input id="op-${p.k}" type="text" inputmode="decimal" step="any"></label>`).join('');
function stat(k, v) {
  if (v == null || !isFinite(v)) return 'na';
  const t = W().targets[k] || {};
  if (t.lo != null && t.lo !== '' && v < t.lo) return 'lo';
  if (t.hi != null && t.hi !== '' && v > t.hi) return 'hi';
  return 'ok';
}
const rangeTxt = k => { const t = W().targets[k] || {}; const lo = t.lo != null && t.lo !== '', hi = t.hi != null && t.hi !== ''; return lo && hi ? `${f(t.lo, 2).replace(/,?0+$/, '')}–${f(t.hi, 2).replace(/,?0+$/, '')}` : lo ? `≥ ${t.lo}` : hi ? `≤ ${t.hi}` : 'hedef yok'; };
const sortedReps = () => [...W().reports].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
function renderOlcum(skipTgt) {
  const reps = sortedReps(), last = reps[reps.length - 1];
  $('olcumWhen').textContent = last ? `Son ölçüm: ${fmtDate(last.time)} · ${last.depth ? f(fromFt(last.depth), 0) + ' ' + unit() + ' · ' : ''}${last.src || ''}` : 'Henüz ölçüm yok. Aşağıdaki formdan ilk ölçümü kaydet.';
  $('propCards').innerHTML = PROPS.map(p => {
    const v = last ? last.v[p.k] : null, s = stat(p.k, v);
    const lbl = { ok: 'aralıkta', lo: 'düşük', hi: 'yüksek', na: '—' }[s];
    return `<button class="prop ${s !== 'na' ? s : ''}" data-k="${p.k}" aria-pressed="${p.k === chartKey}">
      <span class="pn">${p.n}</span><span class="pv">${v != null && isFinite(v) ? f(v, p.d) : '—'} <small style="font-size:.7rem;color:var(--muted)">${p.u}</small></span>
      <span class="pr"><span>${rangeTxt(p.k)}</span>${s !== 'na' ? `<span class="chip ${s}">${lbl}</span>` : ''}</span></button>`;
  }).join('');
  renderTrend();
  // geçmiş
  const cols = PROPS.filter(p => reps.some(r => r.v[p.k] != null && isFinite(r.v[p.k])));
  $('histTable').innerHTML = reps.length ? `<tr><th>Tarih</th><th class="n">Derinlik</th>${cols.map(p => `<th class="n">${p.n}</th>`).join('')}<th>Not</th><th></th></tr>` +
    [...reps].reverse().map(r => `<tr data-rep="${r.id}" style="cursor:pointer"><td>${fmtDate(r.time)}</td><td class="n">${r.depth ? f(fromFt(r.depth), 0) : '—'}</td>` +
      cols.map(p => { const v = r.v[p.k], s = stat(p.k, v); return `<td class="n ${s !== 'na' && s !== 'ok' ? 'c-' + s : ''}">${v != null && isFinite(v) ? f(v, p.d) : ''}</td>`; }).join('') +
      `<td>${esc(r.note || '')}</td><td><button class="btn ghost" data-delrep="${r.id}">Sil</button></td></tr>`).join('')
    : '<tr><td style="padding:14px;color:var(--muted)">Kayıtlı ölçüm yok.</td></tr>';
  // hedef tablosu
  if (!skipTgt) $('tgtTable').innerHTML = `<tr><th>Özellik</th><th>Alt</th><th>Üst</th></tr>` + PROPS.map(p => {
    const t = W().targets[p.k] || {};
    return `<tr><td>${p.n} <small style="color:var(--muted)">${p.u}</small></td><td><input id="tg-${p.k}-lo" data-tk="${p.k}" data-tb="lo" type="text" inputmode="decimal" step="any" value="${t.lo ?? ''}"></td><td><input id="tg-${p.k}-hi" data-tk="${p.k}" data-tb="hi" type="text" inputmode="decimal" step="any" value="${t.hi ?? ''}"></td></tr>`;
  }).join('');
  if (!$('o-time').value) $('o-time').value = nowLocal();
}
function renderTrend() {
  const p = PROPS.find(x => x.k === chartKey), reps = sortedReps().filter(r => r.v[chartKey] != null && isFinite(r.v[chartKey]));
  $('chartTitle').textContent = `Trend · ${p.n}${p.u ? ' (' + p.u + ')' : ''}`;
  if (reps.length < 2) { $('trend').innerHTML = `<p class="note">Grafik için en az iki ölçüm gerekli.</p>`; return; }
  const t = W().targets[chartKey] || {}, vals = reps.map(r => r.v[chartKey]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (t.lo != null && t.lo !== '') lo = Math.min(lo, +t.lo); if (t.hi != null && t.hi !== '') hi = Math.max(hi, +t.hi);
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad;
  const Wd = 640, H = 220, L = 46, R = 14, T = 12, B = 30, x = i => L + (Wd - L - R) * (i / (reps.length - 1)), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let s = `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="${p.n} trendi">`;
  const tl = t.lo != null && t.lo !== '' ? +t.lo : lo, th = t.hi != null && t.hi !== '' ? +t.hi : hi;
  if ((t.lo != null && t.lo !== '') || (t.hi != null && t.hi !== '')) s += `<rect x="${L}" y="${y(th)}" width="${Wd - L - R}" height="${Math.max(0, y(tl) - y(th))}" style="fill:var(--ok-bg)"/>`;
  for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; s += `<line x1="${L}" x2="${Wd - R}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" style="fill:var(--muted);font-family:var(--f-num)">${f(v, p.d)}</text>`; }
  s += `<polyline points="${vals.map((v, i) => x(i) + ',' + y(v)).join(' ')}" style="fill:none;stroke:var(--ink)" stroke-width="2" stroke-linejoin="round"/>`;
  vals.forEach((v, i) => { const st = stat(chartKey, v); s += `<circle cx="${x(i)}" cy="${y(v)}" r="${i === vals.length - 1 ? 5.5 : 4}" style="fill:var(--${st === 'na' ? 'muted' : st});stroke:var(--panel)" stroke-width="2"/>`; });
  s += `<text x="${L}" y="${H - 8}" font-size="11" style="fill:var(--muted)">${fmtDate(reps[0].time)}</text><text x="${Wd - R}" y="${H - 8}" text-anchor="end" font-size="11" style="fill:var(--muted)">${fmtDate(reps[reps.length - 1].time)}</text></svg>`;
  $('trend').innerHTML = s;
}
$('propCards').addEventListener('click', e => { const b = e.target.closest('.prop'); if (b) { chartKey = b.dataset.k; renderOlcum(); } });
$('o-tgtBtn').onclick = () => $('o-tgt').hidden = !$('o-tgt').hidden;
$('tgtTable').addEventListener('input', e => { const i = e.target; if (!i.dataset.tk) return; const t = W().targets[i.dataset.tk] = W().targets[i.dataset.tk] || {}; const v = num(i.value); t[i.dataset.tb] = isFinite(v) ? v : null; save(); renderOlcum(true); });
function clearForm() { editingRep = null; PROPS.forEach(p => $('op-' + p.k).value = ''); $('o-note').value = ''; $('o-time').value = nowLocal(); $('olcumFormTitle').textContent = 'Yeni ölçüm'; $('o-save').textContent = 'Ölçümü kaydet'; $('o-cancel').hidden = true; }
$('o-save').onclick = () => {
  const v = {}; let any = false;
  PROPS.forEach(p => { const x = n('op-' + p.k); if (isFinite(x)) { v[p.k] = x; any = true; } });
  if (!any) { toast('En az bir özellik değeri gir.'); return; }
  const d = n('o-depth');
  const rec = { id: editingRep || uid(), time: $('o-time').value || nowLocal(), depth: isFinite(d) ? toFt(d) : '', src: $('o-src').value, note: $('o-note').value, v };
  const reps = W().reports, i = reps.findIndex(r => r.id === rec.id);
  if (i >= 0) reps[i] = rec; else reps.push(rec);
  if (isFinite(d)) W().depth = toFt(d);
  save(); toast(i >= 0 ? 'Ölçüm güncellendi' : 'Ölçüm kaydedildi'); clearForm(); renderOlcum();
};
$('o-cancel').onclick = clearForm;
$('histTable').addEventListener('click', e => {
  const del = e.target.dataset.delrep;
  if (del) { if (confirm('Bu ölçüm silinsin mi?')) { W().reports = W().reports.filter(r => r.id !== del); save(); renderOlcum(); } return; }
  const tr = e.target.closest('tr[data-rep]'); if (!tr) return;
  const r = W().reports.find(x => x.id === tr.dataset.rep); if (!r) return;
  editingRep = r.id; PROPS.forEach(p => $('op-' + p.k).value = r.v[p.k] ?? '');
  $('o-time').value = r.time; $('o-depth').value = r.depth ? round(fromFt(r.depth), 1) : ''; $('o-src').value = r.src || 'Akış hattı'; $('o-note').value = r.note || '';
  $('olcumFormTitle').textContent = 'Ölçümü düzenle · ' + fmtDate(r.time); $('o-save').textContent = 'Değişiklikleri kaydet'; $('o-cancel').hidden = false;
  $('olcumFormTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* =========================================================
   TANKLAR
   ========================================================= */
const USES = { active: 'Aktif', reserve: 'Rezerv', trip: 'Trip', settle: 'Çökeltme', other: 'Diğer' };
const USEVAR = { active: '--u-active', reserve: '--u-reserve', trip: '--u-trip', settle: '--u-settle', other: '--u-other' };
/* Bölme hacmi: üç yöntem
   dim    → ölçülerden (boy × en veya silindir çapı), seviye ft
   factor → cm başına sabit varil katsayısı
   table  → kalibrasyon tablosu (cm → bbl), ara değerler doğrusal */
const CM_FT = 30.48;
const cmOf = c => (c.cm != null && c.cm !== '' && isFinite(+c.cm)) ? +c.cm : (+c.level || 0) * CM_FT;
const sortedTable = c => (c.table || []).filter(p => isFinite(p[0]) && isFinite(p[1])).sort((a, b) => a[0] - b[0]);
function interp(pts, x, xi = 0, yi = 1) {
  if (!pts.length) return 0;
  if (pts.length === 1) return pts[0][xi] ? pts[0][yi] * x / pts[0][xi] : pts[0][yi];
  let i = pts.findIndex(p => p[xi] >= x); if (i <= 0) i = i === 0 ? 1 : pts.length - 1;
  const [a, b] = [pts[i - 1], pts[i]], dx = b[xi] - a[xi];
  return dx ? a[yi] + (b[yi] - a[yi]) * (x - a[xi]) / dx : a[yi];
}
function dimArea(c) { return c.shape === 'cyl' ? Math.PI / 4 * (+c.L || 0) ** 2 : (+c.L || 0) * (+c.W || 0); }
function volAtCm(c, cm) {
  const m = c.method || 'dim';
  if (m === 'factor') return Math.max(0, cm * (+c.factor || 0) + (+c.dead || 0));
  if (m === 'table') return Math.max(0, interp(sortedTable(c), cm, 0, 1));
  return tankBbl(dimArea(c) * cm / CM_FT);
}
function cmAtVol(c, bbl) {
  const m = c.method || 'dim';
  if (m === 'factor') return +c.factor ? (bbl - (+c.dead || 0)) / +c.factor : NaN;
  if (m === 'table') { const t = sortedTable(c); return t.length ? interp(t, bbl, 1, 0) : NaN; }
  const per = volAtCm(c, 1); return per ? bbl / per : NaN;
}
function maxCm(c) {
  const m = c.method || 'dim';
  if (m === 'factor') return +c.maxCm || 0;
  if (m === 'table') { const t = sortedTable(c); return t.length ? t[t.length - 1][0] : 0; }
  return (+c.H || 0) * CM_FT;
}
function compVol(c, atLevelFt) { return volAtCm(c, atLevelFt == null ? cmOf(c) : atLevelFt * CM_FT); }
function tankTotals() {
  const t = { active: 0, reserve: 0, trip: 0, settle: 0, other: 0, all: 0, mwSum: 0 };
  (W().tanks || []).forEach(tk => tk.comps.forEach(c => { const v = compVol(c); t[c.use] = (t[c.use] || 0) + v; t.all += v; if (c.use === 'active' && +c.mw) t.mwSum += v * c.mw; }));
  return t;
}
function renderTanks() {
  const tanks = W().tanks || [];
  // şema: her tank ayrı çizim, dar ekranda alt satıra geçer
  const cw = 96, padX = 10, top = 30, h = 130, H = top + h + 62;
  $('tankSvg').innerHTML = tanks.length ? tanks.map(tk => {
    const w = tk.comps.length * cw + padX * 2 + 4; let body = '';
    body += `<rect x="2" y="${top - 8}" width="${w - 4}" height="${h + 16}" rx="6" style="fill:none;stroke:var(--muted)" stroke-width="1.5"/>`;
    body += `<text x="6" y="${top - 16}" font-size="13" font-weight="700" style="fill:var(--ink);font-family:var(--f-display);letter-spacing:.04em">${esc(tk.name).toLocaleUpperCase('tr-TR')}</text>`;
    tk.comps.forEach((c, i) => {
      const cx = 2 + padX + i * cw, mx = maxCm(c), lvl = mx > 0 ? Math.max(0, Math.min(1, cmOf(c) / mx)) : 0, fh = h * lvl, v = compVol(c);
      body += `<rect x="${cx + 4}" y="${top}" width="${cw - 8}" height="${h}" rx="${c.shape === 'cyl' ? 14 : 3}" style="fill:var(--field);stroke:var(--line)" stroke-width="1.2"/>`;
      body += `<rect x="${cx + 5}" y="${top + h - fh}" width="${cw - 10}" height="${Math.max(0, fh - 1)}" rx="${c.shape === 'cyl' ? 12 : 2}" style="fill:var(${USEVAR[c.use] || '--u-other'})" opacity=".85"/>`;
      body += `<text x="${cx + cw / 2}" y="${top + h - fh - 5 < top + 12 ? top + 14 : top + h - fh - 5}" text-anchor="middle" font-size="11" style="fill:var(--ink);font-family:var(--f-num)">%${Math.round(lvl * 100)}</text>`;
      body += `<text x="${cx + cw / 2}" y="${top + h + 18}" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--ink)">${esc(c.name).slice(0, 12)}</text>`;
      body += `<text x="${cx + cw / 2}" y="${top + h + 34}" text-anchor="middle" font-size="11.5" style="fill:var(--muted);font-family:var(--f-num)">${f(v, 0)} bbl</text>`;
      if (+c.mw) body += `<text x="${cx + cw / 2}" y="${top + h + 50}" text-anchor="middle" font-size="11.5" style="fill:var(--muted);font-family:var(--f-num)">${f(+c.mw, 2)} ppg</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="${esc(tk.name)}">${body}</svg>`;
  }).join('') : '<p class="note">Henüz tank yok. Aşağıdan ekle.</p>';
  const t = tankTotals();
  $('tankTotals').innerHTML = `<div><span>Aktif sistem</span><b>${f(t.active, 0)} bbl</b></div><div><span>Rezerv</span><b>${f(t.reserve, 0)} bbl</b></div><div><span>Trip</span><b>${f(t.trip, 0)} bbl</b></div><div><span>Tüm tanklar</span><b>${f(t.all, 0)} bbl</b></div>`
    + `<div><span>Aktif + kuyu</span><b>${f(t.active + wellRes.pipe + wellRes.ann, 0)} bbl</b></div>` + (t.mwSum ? `<div><span>Aktif ort. yoğunluk</span><b>${f(t.mwSum / t.active, 2)} ppg</b></div>` : '');
  // düzenleme
  if (renderTanks.skipEdit) return;
  const u = unit();
  $('tankEdit').innerHTML = tanks.map((tk, ti) => `
    <div class="sec">
      <div class="sec-h"><input data-tn="${ti}" type="text" value="${esc(tk.name)}" style="font-weight:600;max-width:260px" aria-label="Tank adı"><button class="btn ghost" data-deltank="${ti}">Tankı sil</button></div>
      <div class="tw"><table class="t">
        <tr><th>Bölme</th><th>Kullanım</th><th>Şekil</th><th class="n">Boy / çap (${u})</th><th class="n">En (${u})</th><th class="n">Yükseklik (${u})</th><th class="n">Seviye (${u})</th><th class="n">MW (ppg)</th><th class="n">Hacim</th><th class="n">bbl/${u === 'm' ? 'cm' : 'in'}</th><th></th></tr>
        ${tk.comps.map((c, ci) => `<tr>
          <td><input data-t="${ti}" data-c="${ci}" data-k="name" type="text" value="${esc(c.name)}"></td>
          <td><select data-t="${ti}" data-c="${ci}" data-k="use">${Object.entries(USES).map(([k, l]) => `<option value="${k}"${c.use === k ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
          <td><select data-t="${ti}" data-c="${ci}" data-k="shape"><option value="rect"${c.shape === 'rect' ? ' selected' : ''}>Dikdörtgen</option><option value="cyl"${c.shape === 'cyl' ? ' selected' : ''}>Silindir</option></select></td>
          ${['L', 'W', 'H', 'level'].map(k => `<td><input data-t="${ti}" data-c="${ci}" data-k="${k}" type="text" inputmode="decimal" step="any" value="${k === 'W' && c.shape === 'cyl' ? '' : round(fromFt(+c[k] || 0), 3)}"${k === 'W' && c.shape === 'cyl' ? ' disabled placeholder="—"' : ''}></td>`).join('')}
          <td><input data-t="${ti}" data-c="${ci}" data-k="mw" type="text" inputmode="decimal" step="any" value="${c.mw ?? ''}"></td>
          <td class="n" data-vol="${ti}-${ci}">${f(compVol(c), 1)}</td>
          <td class="n" data-per="${ti}-${ci}">${f(compVol(c, u === 'm' ? 0.01 * M_FT : 1 / 12), 2)}</td>
          <td><button class="btn ghost" data-delc="${ti}-${ci}">Sil</button></td></tr>`).join('')}
      </table></div>
      <div><button class="btn ghost" data-addc="${ti}">+ Bölme ekle</button></div>
    </div>`).join('');
}
$('tankEdit').addEventListener('input', e => {
  const i = e.target, tanks = W().tanks;
  if (i.dataset.tn != null) { tanks[i.dataset.tn].name = i.value; }
  else if (i.dataset.k) {
    const c = tanks[i.dataset.t].comps[i.dataset.c], k = i.dataset.k;
    if (['L', 'W', 'H', 'level'].includes(k)) { c[k] = toFt(num(i.value) || 0); if (k === 'level') c.cm = round(c.level * CM_FT, 1); }
    else if (k === 'mw') c.mw = i.value === '' ? '' : num(i.value);
    else c[k] = i.value;
    const key = i.dataset.t + '-' + i.dataset.c;
    const vc = document.querySelector(`[data-vol="${key}"]`); if (vc) vc.textContent = f(compVol(c), 1);
    const pc = document.querySelector(`[data-per="${key}"]`); if (pc) pc.textContent = f(compVol(c, unit() === 'm' ? 0.01 * M_FT : 1 / 12), 2);
  }
  save(); renderTanks.skipEdit = true; renderTanks(); renderTanks.skipEdit = false;
  if (i.dataset.k === 'shape') renderTanks();
});
$('tankEdit').addEventListener('change', e => { if (e.target.dataset.k === 'shape') renderTanks(); });
$('tankEdit').addEventListener('click', e => {
  const d = e.target.dataset, tanks = W().tanks;
  if (d.deltank != null) { if (confirm(`"${tanks[d.deltank].name}" silinsin mi?`)) { tanks.splice(+d.deltank, 1); save(); renderTanks(); } }
  if (d.addc != null) { tanks[d.addc].comps.push({ name: 'Bölme ' + (tanks[d.addc].comps.length + 1), use: 'active', shape: 'rect', L: 10, W: 8, H: 7, level: 0, mw: '' }); save(); renderTanks(); }
  if (d.delc) { const [t, c] = d.delc.split('-'); tanks[t].comps.splice(+c, 1); save(); renderTanks(); }
});
$('addTank').onclick = () => { W().tanks.push({ id: uid(), name: 'Tank ' + (W().tanks.length + 1), comps: [{ name: 'Bölme 1', use: 'active', shape: 'rect', L: 10, W: 8, H: 7, level: 0, mw: '' }] }); save(); renderTanks(); };

/* =========================================================
   TANK SEVİYESİ (cm)
   ========================================================= */
const lvOpen = new Set();
const METHODS = { dim: 'Ölçülerden (boy × en)', factor: 'Sabit katsayı (bbl/cm)', table: 'Kalibrasyon tablosu' };
function parseTarget(c) { // { bbl } ya da null
  const s = String(c.target ?? '').trim(); if (!s) return null;
  const rel = /^[+-]/.test(s), v = num(s.replace(/^\+/, '')); if (!isFinite(v)) return { bad: true };
  return { bbl: rel ? compVol(c) + v : v, rel };
}
function lvCells(c) {
  const cm = cmOf(c), bbl = volAtCm(c, cm), mx = maxCm(c), per = volAtCm(c, cm + 1) - bbl;
  const tg = parseTarget(c); let need = '', diff = '', note = '';
  if (tg && tg.bad) note = '<span class="chip hi">geçersiz hedef</span>';
  else if (tg) {
    if (tg.bbl < 0) note = '<span class="chip hi">hacim 0’ın altına inemez</span>';
    else {
      const rc = cmAtVol(c, tg.bbl), d = rc - cm;
      if (!isFinite(rc)) note = '<span class="chip hi">yöntem ayarı eksik</span>';
      else {
        need = f(rc, 1);
        diff = Math.abs(d) < 0.05 ? '<span class="chip ok">hedefte</span>' : `<span class="chip ${d > 0 ? 'ok' : 'lo'}">${d > 0 ? '▲ ' + f(d, 1) + ' cm doldur' : '▼ ' + f(-d, 1) + ' cm boşalt'}</span>`;
        if (mx && rc > mx) note = `<span class="chip hi">bölme ${f(mx, 0)} cm, taşar</span>`;
        if (tg.rel) note += ` <span class="note">→ ${f(tg.bbl, 1)} bbl</span>`;
      }
    }
  }
  const warn = mx && cm > mx ? ' <span class="chip hi">bölme yüksekliğini aşıyor</span>' : '';
  return { bbl: f(bbl, 1), m3: f(bbl * BBL_M3, 2), per: isFinite(per) && per > 0 ? f(per, 2) : '—', need, diff: diff + (note ? ' ' + note : '') + warn };
}
function renderSeviye() {
  const tanks = W().tanks || [];
  $('lvTanks').innerHTML = tanks.length ? tanks.map((tk, ti) => `
    <div class="card lv">
      <h2>${esc(tk.name)}</h2>
      <div class="tw"><table class="t">
        <tr><th>Bölme</th><th class="n">Ölçülen (cm)</th><th class="n">Varil</th><th class="n">m³</th><th class="n">bbl / cm</th><th class="n">Hedef (bbl veya ±)</th><th class="n">Gereken (cm)</th><th>Yapılacak</th><th></th></tr>
        ${tk.comps.map((c, ci) => { const k = ti + '-' + ci, v = lvCells(c); return `
        <tr>
          <td><b>${esc(c.name)}</b><div class="note" style="margin:0;font-size:.74rem">${USES[c.use] || ''} · ${c.method === 'factor' ? 'katsayı' : c.method === 'table' ? 'tablo' : 'ölçü'}</div></td>
          <td><input id="lv-cm-${k}" data-lv="${k}" data-lk="cm" type="text" inputmode="decimal" value="${round(cmOf(c), 1)}"></td>
          <td class="n big" data-o="bbl-${k}">${v.bbl}</td>
          <td class="n" data-o="m3-${k}">${v.m3}</td>
          <td class="n" data-o="per-${k}">${v.per}</td>
          <td><input id="lv-tg-${k}" data-lv="${k}" data-lk="target" type="text" inputmode="decimal" placeholder="örn. +50" value="${esc(c.target ?? '')}"></td>
          <td class="n big" data-o="need-${k}">${v.need}</td>
          <td data-o="diff-${k}">${v.diff}</td>
          <td><button class="btn ghost" data-lvcfg="${k}">Ayar</button></td>
        </tr>
        ${lvOpen.has(k) ? `<tr class="cfg"><td colspan="9"><div class="cfgbox">
          <label>cm → varil yöntemi<select data-lv="${k}" data-lk="method">${Object.entries(METHODS).map(([m, l]) => `<option value="${m}"${(c.method || 'dim') === m ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          ${(c.method || 'dim') === 'dim' ? `<p class="note" style="margin:0">Ölçüler <b>Tanklar</b> sekmesinden alınıyor: ${c.shape === 'cyl' ? 'çap ' + f(fromFt(+c.L), 2) : f(fromFt(+c.L), 2) + ' × ' + f(fromFt(+c.W), 2)} ${unit()}, yükseklik ${f(fromFt(+c.H), 2)} ${unit()}.</p>` : ''}
          ${c.method === 'factor' ? `<label>1 cm kaç varil <small>(bbl/cm)</small><input id="lv-f-${k}" data-lv="${k}" data-lk="factor" type="text" inputmode="decimal" value="${c.factor ?? ''}"></label>
            <label>Ölü hacim <small>(0 cm'deki bbl)</small><input id="lv-d-${k}" data-lv="${k}" data-lk="dead" type="text" inputmode="decimal" value="${c.dead ?? 0}"></label>
            <label>Bölme yüksekliği <small>(cm)</small><input id="lv-x-${k}" data-lv="${k}" data-lk="maxCm" type="text" inputmode="decimal" value="${c.maxCm ?? ''}"></label>` : ''}
          ${c.method === 'table' ? `<label style="grid-column:1/-1">Kalibrasyon tablosu <small>(her satıra: cm  varil — örn. "50  42,5")</small><textarea id="lv-t-${k}" data-lv="${k}" data-lk="table" placeholder="0  0&#10;10  8,6&#10;20  17,4">${esc((c.table || []).map(p => `${String(p[0]).replace('.', ',')}  ${String(p[1]).replace('.', ',')}`).join('\n'))}</textarea></label>
            <p class="note" style="margin:0">${sortedTable(c).length} satır okundu. Tablodaki noktalar arası doğrusal hesaplanır.</p>` : ''}
        </div></td></tr>` : ''}`; }).join('')}
      </table></div>
    </div>`).join('') : '<div class="card"><p class="note">Henüz tank yok. Önce Tanklar sekmesinden tank ve bölmeleri ekle.</p></div>';
  renderLvTotals(); renderLvHist();
}
function renderLvTotals() {
  const t = tankTotals();
  $('lvTotals').innerHTML = `<div><span>Aktif sistem</span><b>${f(t.active, 1)} bbl</b></div><div><span>Rezerv</span><b>${f(t.reserve, 1)} bbl</b></div><div><span>Trip</span><b>${f(t.trip, 1)} bbl</b></div><div><span>Tüm tanklar</span><b>${f(t.all, 1)} bbl</b></div><div><span>Tüm tanklar</span><b>${f(t.all * BBL_M3, 1)} m³</b></div>`;
}
function parseCalTable(s) {
  return s.split(/\r?\n/).map(l => { l = l.trim(); if (!l) return null;
    let p = l.split(/[\s;\t]+/).filter(Boolean); if (p.length === 1 && (p[0].match(/,/g) || []).length === 1) p = p[0].split(',');
    return p.length >= 2 ? [num(p[0]), num(p[1])] : null; }).filter(p => p && isFinite(p[0]) && isFinite(p[1]));
}
$('lvTanks').addEventListener('input', e => {
  const i = e.target, k = i.dataset.lv; if (!k) return;
  const [ti, ci] = k.split('-'), c = W().tanks[ti].comps[ci], lk = i.dataset.lk;
  if (lk === 'cm') { const v = num(i.value); c.cm = isFinite(v) ? v : 0; c.level = c.cm / CM_FT; }
  else if (lk === 'target') c.target = i.value;
  else if (lk === 'table') c.table = parseCalTable(i.value);
  else if (lk === 'method') { c.method = i.value; save(); renderSeviye(); return; }
  else c[lk] = num(i.value);
  save();
  const v = lvCells(c); ['bbl', 'm3', 'per', 'need', 'diff'].forEach(x => { const el = document.querySelector(`[data-o="${x}-${k}"]`); if (el) el.innerHTML = v[x]; });
  renderLvTotals();
  if (lk === 'table') { const nt = i.closest('label').nextElementSibling; if (nt) nt.textContent = `${sortedTable(c).length} satır okundu. Tablodaki noktalar arası doğrusal hesaplanır.`; }
});
$('lvTanks').addEventListener('click', e => { const k = e.target.dataset.lvcfg; if (!k) return; lvOpen.has(k) ? lvOpen.delete(k) : lvOpen.add(k); renderSeviye(); });
$('lvSave').onclick = () => {
  const w = W(); w.gauges = w.gauges || [];
  const t = tankTotals();
  w.gauges.push({ t: new Date().toISOString(), totals: { active: t.active, reserve: t.reserve, trip: t.trip, all: t.all },
    items: w.tanks.flatMap(tk => tk.comps.map(c => ({ tank: tk.name, comp: c.name, use: c.use, cm: round(cmOf(c), 1), bbl: round(compVol(c), 1) }))) });
  save(); renderLvHist(); toast('Seviye ölçümü kaydedildi');
};
function renderLvHist() {
  const g = W().gauges || [];
  $('lvLast').textContent = g.length ? `Son kayıt: ${fmtDate(g[g.length - 1].t)}` : 'Henüz kaydedilmiş seviye ölçümü yok.';
  $('lvHist').innerHTML = `<tr><th>Tarih</th><th class="n">Aktif</th><th class="n">Değişim</th><th class="n">Rezerv</th><th class="n">Trip</th><th class="n">Toplam</th><th></th></tr>` +
    (g.length ? [...g].map((x, i) => ({ x, i })).reverse().map(({ x, i }) => { const d = i ? x.totals.active - g[i - 1].totals.active : null;
      return `<tr><td>${fmtDate(x.t)}</td><td class="n">${f(x.totals.active, 1)}</td><td class="n">${d == null ? '—' : `<span class="chip ${d >= 0 ? 'ok' : 'hi'}">${d >= 0 ? '+' : ''}${f(d, 1)}</span>`}</td><td class="n">${f(x.totals.reserve, 1)}</td><td class="n">${f(x.totals.trip, 1)}</td><td class="n">${f(x.totals.all, 1)}</td><td><button class="btn ghost" data-delg="${i}">Sil</button></td></tr>`; }).join('')
      : '<tr><td colspan="7" style="padding:14px;color:var(--muted)">Kayıt yok.</td></tr>');
}
$('lvHist').addEventListener('click', e => { const d = e.target.dataset.delg; if (d != null && confirm('Bu seviye kaydı silinsin mi?')) { W().gauges.splice(+d, 1); save(); renderLvHist(); } });

/* =========================================================
   STOK
   ========================================================= */
function stockUse(itemId, qty, note, kind = 'kullanım') {
  const s = W().stock.find(x => x.id === itemId); if (!s) return false;
  const delta = kind === 'giriş' ? qty : -qty;
  s.qty = round((+s.qty || 0) + delta, 2);
  W().stockLog.push({ t: new Date().toISOString(), item: s.name, itemId: s.id, qty: delta, unit: s.unit, kind, note: note || '' });
  save(); return true;
}
function renderStok() {
  const st = W().stock;
  $('stockTable').innerHTML = `<tr><th>Kimyasal</th><th class="n">Mevcut</th><th>Birim</th><th class="n">kg/birim</th><th class="n">Asgari</th><th>Durum</th><th>Hareket</th><th></th></tr>` +
    (st.length ? st.map(s => {
      const low = +s.qty <= +s.min;
      return `<tr>
      <td><input data-sid="${s.id}" data-sk="name" type="text" value="${esc(s.name)}"></td>
      <td><input data-sid="${s.id}" data-sk="qty" type="text" inputmode="decimal" step="any" value="${s.qty}" style="width:90px"></td>
      <td>${esc(s.unit)}</td>
      <td><input data-sid="${s.id}" data-sk="kg" type="text" inputmode="decimal" step="any" value="${s.kg}" style="width:80px"></td>
      <td><input data-sid="${s.id}" data-sk="min" type="text" inputmode="decimal" step="any" value="${s.min}" style="width:80px"></td>
      <td>${low ? '<span class="chip hi">sipariş ver</span>' : '<span class="chip ok">yeterli</span>'}</td>
      <td style="display:flex;gap:6px;align-items:center"><input id="mv-${s.id}" type="text" inputmode="decimal" placeholder="miktar" style="width:90px">
        <button class="btn ghost" data-mv="${s.id}" data-kind="giriş">Giriş</button><button class="btn ghost" data-mv="${s.id}" data-kind="kullanım">Kullanım</button></td>
      <td><button class="btn ghost" data-dels="${s.id}">Sil</button></td></tr>`;
    }).join('') : '<tr><td colspan="8" style="padding:14px;color:var(--muted)">Stok listesi boş.</td></tr>');
  const log = [...W().stockLog].reverse().slice(0, 200);
  $('stockLog').innerHTML = `<tr><th>Tarih</th><th>Kimyasal</th><th>İşlem</th><th class="n">Miktar</th><th>Not</th></tr>` +
    (log.length ? log.map(l => `<tr><td>${fmtDate(l.t)}</td><td>${esc(l.item)}</td><td>${l.kind}</td><td class="n" style="color:var(--${l.qty < 0 ? 'hi' : 'ok'})">${l.qty > 0 ? '+' : ''}${f(l.qty, l.qty % 1 ? 1 : 0)} ${esc(l.unit)}</td><td>${esc(l.note)}</td></tr>`).join('')
      : '<tr><td colspan="5" style="padding:14px;color:var(--muted)">Henüz hareket yok.</td></tr>');
}
$('stockTable').addEventListener('change', e => {
  const i = e.target, s = W().stock.find(x => x.id === i.dataset.sid); if (!s || !i.dataset.sk) return;
  if (i.dataset.sk === 'name') s.name = i.value;
  else if (i.dataset.sk === 'qty') { const nv = num(i.value); if (isFinite(nv)) { const d = round(nv - (+s.qty || 0), 2); if (d) W().stockLog.push({ t: new Date().toISOString(), item: s.name, itemId: s.id, qty: d, unit: s.unit, kind: 'sayım', note: 'Sayım düzeltmesi' }); s.qty = nv; } }
  else s[i.dataset.sk] = num(i.value) || 0;
  save(); renderStok(); fillStockSelects();
});
$('stockTable').addEventListener('click', e => {
  const d = e.target.dataset;
  if (d.mv) { const q = n('mv-' + d.mv); if (!(q > 0)) { toast('Önce miktarı gir.'); return; } stockUse(d.mv, q, '', d.kind); renderStok(); toast(d.kind === 'giriş' ? 'Stok girişi kaydedildi' : 'Kullanım kaydedildi'); }
  if (d.dels) { const s = W().stock.find(x => x.id === d.dels); if (confirm(`"${s.name}" stok listesinden silinsin mi?`)) { W().stock = W().stock.filter(x => x.id !== d.dels); save(); renderStok(); fillStockSelects(); } }
});
$('addStock').onclick = () => { $('stockNew').hidden = false; $('sn-name').focus(); };
$('snCancel').onclick = () => $('stockNew').hidden = true;
$('sn-unit').onchange = () => { const u = $('sn-unit').value; if (u === 'kg') $('sn-kg').value = 1; if (u === 'ton') $('sn-kg').value = 1000; };
$('snSave').onclick = () => {
  const name = $('sn-name').value.trim(); if (!name) { toast('Kimyasal adını gir.'); return; }
  const s = { id: uid(), name, unit: $('sn-unit').value, kg: n('sn-kg') || 1, qty: n('sn-qty') || 0, min: n('sn-min') || 0 };
  W().stock.push(s); if (s.qty) W().stockLog.push({ t: new Date().toISOString(), item: s.name, itemId: s.id, qty: s.qty, unit: s.unit, kind: 'giriş', note: 'Açılış stoğu' });
  save(); $('stockNew').hidden = true; $('sn-name').value = ''; renderStok(); fillStockSelects(); toast(`${name} eklendi`);
};
function fillStockSelects() {
  const st = W().stock, sel = $('a-stock'), cur = sel.value || (W().vals['a-stock-id'] || '');
  sel.innerHTML = '<option value="">— stok seçme —</option>' + st.map(s => `<option value="${s.id}">${esc(s.name)} (${f(s.qty, 0)} ${esc(s.unit)})</option>`).join('');
  sel.value = st.some(s => s.id === cur) ? cur : (st.find(s => /barit|barite/i.test(s.name)) || {}).id || '';
}

/* =========================================================
   ÇAMUR HAZIRLAMA / İLAVE
   ========================================================= */
function fillTankSelect() {
  const sel = $('z-tank'), cur = sel.value; let o = '<option value="">— elle gir —</option><option value="active">Tüm aktif sistem (tank + kuyu)</option>';
  W().tanks.forEach((tk, ti) => tk.comps.forEach((c, ci) => { o += `<option value="${ti}-${ci}">${esc(tk.name)} · ${esc(c.name)} (${f(compVol(c), 0)} bbl)</option>`; }));
  sel.innerHTML = o; sel.value = cur;
}
$('z-tank').onchange = () => {
  const v = $('z-tank').value; if (!v) return;
  let vol; if (v === 'active') vol = tankTotals().active + wellRes.pipe + wellRes.ann; else { const [t, c] = v.split('-'); vol = compVol(W().tanks[t].comps[c]); }
  $('z-vol').value = round(vol, 1); W().vals['z-vol'] = $('z-vol').value; save(); calcAll();
};
function renderHazirRows() {
  const st = W().stock, add = $('z-mode').value === 'add';
  $('z-rows').innerHTML = W().recipe.rows.map((r, i) => `
    <div class="sec">
      <div class="sec-h"><b>${i + 1}. kimyasal</b><button class="btn ghost" data-zdel="${i}">Sil</button></div>
      <div class="grid">
        <label>Stoktan<select data-zi="${i}" data-zk="stockId"><option value="">— serbest —</option>${st.map(s => `<option value="${s.id}"${r.stockId === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        ${r.stockId ? '' : `<label>Ad<input data-zi="${i}" data-zk="name" type="text" value="${esc(r.name)}"></label><label>Torba <small>(kg)</small><input data-zi="${i}" data-zk="kg" type="text" inputmode="decimal" value="${r.kg ?? 25}"></label>`}
        <label>Hedef <small class="zu"></small><input data-zi="${i}" data-zk="target" type="text" inputmode="decimal" step="any" value="${r.target ?? ''}"></label>
        ${add ? `<label>Mevcut <small class="zu"></small><input data-zi="${i}" data-zk="current" type="text" inputmode="decimal" step="any" value="${r.current ?? 0}"></label>` : ''}
      </div>
    </div>`).join('') || '<p class="note">Kimyasal satırı ekle.</p>';
  document.querySelectorAll('.zu').forEach(e => e.textContent = $('z-unit').value === 'ppb' ? '(ppb)' : '(kg/m³)');
}
$('z-rows').addEventListener('input', e => {
  const i = e.target; if (i.dataset.zi == null) return; const r = W().recipe.rows[i.dataset.zi], k = i.dataset.zk;
  r[k] = (k === 'name' || k === 'stockId') ? i.value : num(i.value);
  if (k === 'stockId') { const s = W().stock.find(x => x.id === i.value); if (s) r.name = s.name; renderHazirRows(); }
  save(); calcHazir();
});
$('z-rows').addEventListener('click', e => { const d = e.target.dataset.zdel; if (d != null) { W().recipe.rows.splice(+d, 1); save(); renderHazirRows(); calcHazir(); } });
$('z-add').onclick = () => { W().recipe.rows.push({ stockId: '', name: 'Kimyasal', target: 1, current: 0, kg: 25 }); save(); renderHazirRows(); calcHazir(); };
$('z-mode').addEventListener('change', renderHazirRows); $('z-unit').addEventListener('change', renderHazirRows);
let hazirPlan = [];
function calcHazir() {
  const V = n('z-vol'), u = $('z-unit').value, add = $('z-mode').value === 'add';
  hazirPlan = []; let rowsH = '', totKg = 0, short = 0;
  W().recipe.rows.forEach(r => {
    const s = r.stockId ? W().stock.find(x => x.id === r.stockId) : null;
    const unitKg = s ? +s.kg || 1 : +r.kg || 25, uname = s ? s.unit : 'torba';
    const conv = x => u === 'ppb' ? x : x / 2.853;
    const d = conv(+r.target || 0) - (add ? conv(+r.current || 0) : 0);
    const kg = Math.max(0, d) * V * LB_KG, units = Math.ceil(kg / unitKg - 1e-9);
    totKg += kg;
    let chip = '';
    if (s) { const ok = +s.qty >= units; if (!ok) short++; chip = `<span class="tag" style="${ok ? '' : 'color:#F08B73'}">${ok ? 'stok yeterli' : 'stok: ' + f(s.qty, 0)}</span>`; }
    hazirPlan.push({ stockId: s && s.id, name: s ? s.name : r.name, units, kg });
    rowsH += row(`${esc(s ? s.name : r.name)} ${chip}`, d > 0 ? f(units, 0) : '—', d > 0 ? `${uname} · ${f(kg, 0)} kg` : 'gerek yok');
  });
  $('r-hazir').innerHTML = `<h3>${add ? 'İlave edilecek' : 'Hazırlama için gereken'}</h3>${row('Hacim', f(V, 0), `bbl · ${f(V * BBL_M3, 1)} m³`, true)}${rowsH || '<p class="note" style="color:#93A1AB">Kimyasal yok.</p>'}
    <div class="sp"></div>${row('Toplam kimyasal', f(totKg, 0), 'kg')}${short ? err(`${short} kimyasalda stok yetersiz.`) : ''}
    <div class="btns"><button class="btn" id="z-use"${hazirPlan.some(p => p.stockId && p.units > 0) ? '' : ' disabled'}>Stoktan düş</button></div>
    <p class="note" style="color:#93A1AB">Stok listesinden seçili kimyasalların kullanımı kaydedilir.</p>`;
  $('z-use').onclick = () => {
    const list = hazirPlan.filter(p => p.stockId && p.units > 0); if (!list.length) return;
    if (!confirm('Şu kullanımlar stoktan düşülsün mü?\n' + list.map(p => `• ${p.name}: ${p.units}`).join('\n'))) return;
    const note = `${add ? 'İlave' : 'Hazırlama'} · ${f(V, 0)} bbl`;
    list.forEach(p => stockUse(p.stockId, p.units, note)); toast('Stoktan düşüldü'); fillStockSelects(); calcHazir();
  };
}

/* =========================================================
   AĞIRLAŞTIRMA / SEYRELTME / DİĞER HESAPLAR
   ========================================================= */
let agirUnits = 0;
$('a-stock').onchange = () => { const s = W().stock.find(x => x.id === $('a-stock').value); W().vals['a-stock-id'] = $('a-stock').value; if (s) { $('a-sack').value = s.kg; W().vals['a-sack'] = String(s.kg); } save(); calcAll(); };
$('a-use').onclick = () => {
  const id = $('a-stock').value; if (!id) { toast('Önce stok kalemini seç.'); return; }
  if (!(agirUnits > 0)) { toast('Hesaplanan miktar yok.'); return; }
  const s = W().stock.find(x => x.id === id);
  if (!confirm(`${s.name}: ${agirUnits} ${s.unit} stoktan düşülsün mü?`)) return;
  stockUse(id, agirUnits, `Ağırlaştırma ${n('a-w1')} → ${n('a-w2')} ppg`); fillStockSelects(); toast('Stoktan düşüldü');
};
function calcAgir() {
  const V = n('a-v'), w1 = n('a-w1'), w2 = n('a-w2'), sg = parseFloat($('a-mat').value), sack = n('a-sack');
  const dm = 8.33 * sg, h = '<h3>Sonuç</h3>'; agirUnits = 0;
  if (!(w2 > w1)) return $('r-agir').innerHTML = h + err('Hedef yoğunluk mevcut yoğunluktan büyük olmalı.');
  if (w2 >= dm) return $('r-agir').innerHTML = h + err(`Hedef yoğunluk ağırlaştırıcının yoğunluğuna (${f(dm, 2)} ppg) ulaşamaz.`);
  const lbbbl = 350 * sg * (w2 - w1) / (dm - w2), lb = lbbbl * V, kg = lb * LB_KG, inc = lb / (350 * sg);
  agirUnits = Math.ceil(kg / sack);
  const s = W().stock.find(x => x.id === $('a-stock').value);
  $('r-agir').innerHTML = h + row('Gereken torba', f(agirUnits, 0), `× ${sack} kg`, true)
    + (s ? row('Stokta', f(s.qty, 0), s.unit) + (+s.qty < agirUnits ? err('Stok yetersiz.') : '') : '')
    + row('Toplam ağırlaştırıcı', f(kg / 1000, 2), 'ton') + row('', f(lb, 0), 'lb')
    + row('Birim ilave', f(lbbbl, 1), 'lb/bbl') + row('', f(lbbbl * 2.853, 1), 'kg/m³')
    + row('Hacim artışı', f(inc), 'bbl') + row('Son hacim', f(V + inc), 'bbl');
}
function calcSeyr() {
  const V = n('s-v'), w1 = n('s-w1'), w2 = n('s-w2'), dw = n('s-dw'), h = '<h3>Sonuç</h3>';
  if (!(w2 < w1)) return $('r-seyr').innerHTML = h + err('Hedef yoğunluk mevcut yoğunluktan küçük olmalı.');
  if (!(w2 > dw)) return $('r-seyr').innerHTML = h + err('Hedef yoğunluk eklenen sıvının yoğunluğundan büyük olmalı.');
  const vw = V * (w1 - w2) / (w2 - dw);
  $('r-seyr').innerHTML = h + row('Eklenecek sıvı', f(vw), 'bbl', true) + row('', f(vw * BBL_M3, 2), 'm³')
    + row('Son hacim', f(V + vw), 'bbl') + row('Hacim artışı', f(vw / V * 100, 1), '%');
}
function calcHid() {
  const mw = n('p-mw'), tvd = toFt(n('p-tvd')), apl = n('p-apl') || 0, pp = n('p-pp');
  const p = 0.052 * mw * tvd, g = 0.052 * mw, ecd = mw + apl / (0.052 * tvd);
  let o = '<h3>Sonuç</h3>' + row('Hidrostatik basınç', f(p, 0), 'psi', true) + row('', f(p * PSI_BAR, 1), 'bar')
    + row('Basınç gradyanı', f(g, 3), 'psi/ft') + row('', f(g * M_FT * PSI_BAR, 4), 'bar/m')
    + row('ECD', f(ecd, 2), 'ppg') + row('Dolaşımda dip basıncı', f(p + apl, 0), 'psi');
  if (isFinite(pp) && pp > 0) { const emw = pp / (0.052 * tvd); o += row('Gözenek basıncı EMW', f(emw, 2), 'ppg') + row('Overbalance', f(p - pp, 0), 'psi') + row('', f(mw - emw, 2), 'ppg'); }
  $('r-hid').innerHTML = o;
}
function calcKill() {
  const omw = n('w-omw'), tvd = toFt(n('w-tvd')), sidpp = n('w-sidpp'), sicp = n('w-sicp'), pit = n('w-pit'),
    scr = n('w-scr'), kspm = n('w-spm'), sm = n('w-sm') || 0, shoe = toFt(n('w-shoe')), lot = n('w-lot');
  const kmw = omw + sidpp / (0.052 * tvd) + sm, icp = sidpp + scr, fcp = scr * kmw / omw;
  const maasp = (lot - omw) * 0.052 * shoe, maaspNew = (lot - kmw) * 0.052 * shoe;
  const out = pumpRes.out, stb = out > 0 ? wellRes.pipe / out : NaN, btu = out > 0 ? wellRes.ann / out : NaN;
  const cap = wellRes.lastAnnCap, kh = cap > 0 ? pit / cap : NaN, kg = 0.052 * omw - (sicp - sidpp) / kh;
  let typ = '—'; if (isFinite(kg)) typ = kg < 0.25 ? 'Gaz' : kg <= 0.4 ? 'Yağ / gaz karışımı' : 'Su (tuzlu su)';
  let o = '<h3>Kill çamuru</h3>' + row('Kill çamuru (KMW)', f(kmw, 2), 'ppg', true)
    + row('ICP', f(icp, 0), 'psi') + row('FCP', f(fcp, 0), 'psi')
    + row('MAASP (mevcut çamur)', f(maasp, 0), 'psi') + row('MAASP (kill çamuru)', f(maaspNew, 0), 'psi')
    + '<div class="sp"></div><h3>Kick</h3>' + row('Kick boyu (dip anülüs)', f(fromFt(kh), 0), unit()) + row('Kick gradyanı', f(kg, 3), 'psi/ft')
    + `<div class="row"><span class="k">Muhtemel sıvı</span><span class="tag">${typ}</span></div>`
    + '<div class="sp"></div><h3>Dolaşım</h3>' + row('Yüzeyden matkaba', f(stb, 0), 'stk') + row('', f(stb / kspm, 1), 'dk')
    + row('Matkaptan yüzeye', f(btu, 0), 'stk') + row('', f(btu / kspm, 1), 'dk');
  if (sicp > maasp) o += err('SICP, MAASP değerini aşıyor. Pabuçta çatlama riski var.');
  if (isFinite(stb) && stb > 0) {
    let t = '<div class="sp"></div><h3>Basınç düşüş tablosu</h3><div style="overflow-x:auto"><table class="sch"><tr><th>Adım</th><th>Strok</th><th>DP basıncı (psi)</th></tr>';
    for (let i = 0; i <= 10; i++) t += `<tr><td>${i}</td><td>${f(stb * i / 10, 0)}</td><td>${f(icp - (icp - fcp) * i / 10, 0)}</td></tr>`;
    o += t + '</table></div>';
  }
  $('r-kill').innerHTML = o;
}
function calcCim() {
  const dh = n('c-dh'), od = n('c-od'), id = n('c-id'), prev = n('c-prev'), depth = toFt(n('c-depth')), pshoe = toFt(n('c-pshoe')),
    toc = toFt(n('c-toc')), st = toFt(n('c-st')), ex = (n('c-ex') || 0) / 100, y = n('c-y'), w = n('c-w'), sk = n('c-sk'), dens = n('c-dens'), dmw = n('c-dmw');
  const h = '<h3>Bulamaç</h3>';
  if (!(depth > toc)) return $('r-cim').innerHTML = h + err('Çimento tepesi pabuç derinliğinden sığ olmalı.');
  const Loh = Math.max(0, depth - Math.max(toc, pshoe)), Lov = Math.max(0, Math.min(pshoe, depth) - toc);
  const vOh = (dh * dh - od * od) / 1029.4 * Loh * (1 + ex), vOv = (prev * prev - od * od) / 1029.4 * Lov, vSt = id * id / 1029.4 * st;
  const tot = vOh + vOv + vSt, ft3 = tot * FT3_BBL, sacks = ft3 / y, water = sacks * w / 42;
  const disp = id * id / 1029.4 * (depth - st), out = pumpRes.out, hp = 0.052 * dens * (depth - toc) + 0.052 * dmw * toc;
  $('r-cim').innerHTML = h + row('Toplam bulamaç', f(tot), 'bbl', true) + row('', f(ft3, 0), 'ft³') + row('', f(tot * BBL_M3, 2), 'm³')
    + row('Açık kuyu anülüsü', f(vOh), 'bbl') + row('Bindirme (muhafaza içi)', f(vOv), 'bbl') + row('Shoe track', f(vSt), 'bbl')
    + '<div class="sp"></div><h3>Malzeme</h3>' + row('Çimento torbası', f(Math.ceil(sacks), 0), `× ${sk} lb`, true) + row('Toplam çimento', f(sacks * sk * LB_KG / 1000, 1), 'ton')
    + row('Karışım suyu', f(water), 'bbl') + row('', f(water * BBL_M3, 2), 'm³')
    + '<div class="sp"></div><h3>Deplasman</h3>' + row('Deplasman hacmi', f(disp), 'bbl', true) + row('Pompa stroku', f(out > 0 ? disp / out : NaN, 0), 'stk')
    + row('Çimentolu kolon', f(fromFt(depth - toc), 0), unit()) + row('Pabuçta son hidrostatik', f(hp, 0), 'psi') + row('Pabuç EMW', f(hp / (0.052 * depth), 2), 'ppg');
}
function calcHidr() {
  const t6 = n('r-600'), t3 = n('r-300'), mw = n('r-mw'), qIn = n('r-q'), q = isFinite(qIn) && qIn > 0 ? qIn : pumpRes.gpm;
  const pv = t6 - t3, yp = t3 - pv, av = t6 / 2, nn = 3.32 * Math.log10(t6 / t3), K = 510 * t3 / Math.pow(511, nn);
  let tfa = 0;[[n('n1c'), n('n1s')], [n('n2c'), n('n2s')]].forEach(([c, s]) => { if (c > 0 && s > 0) tfa += c * Math.PI / 4 * (s / 32) ** 2; });
  const dpb = tfa > 0 ? mw * q * q / (12031 * tfa * tfa) : NaN, hhp = dpb * q / 1714, vj = tfa > 0 ? 0.32086 * q / tfa : NaN;
  const dh = n('r-dh'), od = n('r-od'), van = 24.51 * q / (dh * dh - od * od), hsi = hhp / (Math.PI / 4 * dh * dh), jif = 0.01823 * 0.95 * q * Math.sqrt(mw * dpb);
  $('r-hidr').innerHTML = '<h3>Reoloji</h3>' + row('PV', f(pv, 0), 'cP', true) + row('YP', f(yp, 0), 'lb/100ft²', true)
    + row('Görünür viskozite', f(av, 1), 'cP') + row('Akış indeksi n', f(nn, 3), '') + row('Tutarlılık K', f(K, 1), 'eq cP')
    + '<div class="sp"></div><h3>Bit</h3>' + row('Kullanılan debi', f(q, 0), 'gpm') + row('TFA', f(tfa, 4), 'in²')
    + row('Bit basınç kaybı', f(dpb, 0), 'psi', true) + row('Jet hızı', f(vj, 0), 'ft/s') + row('Bit hidrolik gücü', f(hhp, 0), 'HHP')
    + row('HSI', f(hsi, 2), 'HHP/in²') + row('Jet çarpma kuvveti', f(jif, 0), 'lbf')
    + '<div class="sp"></div><h3>Anülüs</h3>' + row('Anülüs hızı', f(van, 0), 'ft/dk') + row('', f(van / M_FT, 1), 'm/dk');
}
function calcTrip() {
  const od = n('t-od'), id = n('t-id'), cas = n('t-cas'), sl = toFt(n('t-sl')), ns = n('t-n') || 0, mw = n('t-mw'),
    wdp = n('t-wdp'), ldp = toFt(n('t-ldp')), wdc = n('t-wdc') || 0, ldc = toFt(n('t-ldc')) || 0, pull = n('t-pull'), str = n('t-str');
  const dry = (od * od - id * id) / 1029.4, wet = od * od / 1029.4, cc = cas * cas / 1029.4, fd = dry * sl, fw = wet * sl;
  const dropD = fd / (cc - dry), dropW = fw / (cc - dry), bf = (65.5 - mw) / 65.5, air = wdp * ldp + wdc * ldc, buoy = air * bf;
  const fp = pull > 0 ? 735294 * str * wdp / pull : NaN;
  $('r-trip').innerHTML = '<h3>Doldurma (stand başına)</h3>' + row('Kuru çekme', f(fd, 2), 'bbl', true) + row('Islak çekme', f(fw, 2), 'bbl')
    + row(`${ns} stand · kuru`, f(fd * ns, 1), 'bbl') + row(`${ns} stand · ıslak`, f(fw * ns, 1), 'bbl')
    + '<div class="sp"></div><h3>Doldurmazsan (stand başına)</h3>'
    + row('Seviye düşüşü · kuru', f(fromFt(dropD), 1), unit()) + row('Basınç kaybı · kuru', f(0.052 * mw * dropD, 1), 'psi')
    + row('Seviye düşüşü · ıslak', f(fromFt(dropW), 1), unit()) + row('Basınç kaybı · ıslak', f(0.052 * mw * dropW, 1), 'psi')
    + '<div class="sp"></div><h3>Dizi ağırlığı</h3>' + row('Kaldırma faktörü', f(bf, 3), '') + row('Havadaki ağırlık', f(air / 1000, 1), 'klb')
    + row('Çamurdaki ağırlık', f(buoy / 1000, 1), 'klb', true) + row('', f(buoy * LB_KG / 1000, 1), 'ton')
    + '<div class="sp"></div><h3>Sıkışma</h3>' + row('Serbest nokta derinliği', f(fromFt(fp), 0), unit(), true);
}

/* =========================================================
   TALLY — Excel / CSV / PDF okuma
   ========================================================= */
const RANGE = { ft: [25, 48], m: [7.6, 14.7] }, BROAD = { ft: [3, 50], m: [0.9, 15.3] };
const HDR_LEN = /(length|uzunluk|boy|len\b|lenght|feet|ft\b|metre|meter|\(m\)|\bm\b)/i, HDR_NO = /(^no\.?$|joint|jt|^#$|sıra|sira|numara)/i, SKIP_ROW = /(toplam|total|kümülatif|kumulatif|cumul|sum|ara toplam|subtotal)/i;
function cellNum(v) {
  if (typeof v === 'number') return { v, dec: !Number.isInteger(v) };
  if (v == null) return null;
  const s = String(v).trim().replace(/\s*(ft|m|')$/i, '');
  if (!/^-?\d{1,3}([.,]\d+)?$/.test(s)) return null;
  return { v: parseFloat(s.replace(',', '.')), dec: /[.,]/.test(s) };
}
function parseGrid(grid) {
  grid = grid.filter(r => r && r.some(c => c !== '' && c != null));
  if (!grid.length) return null;
  const nc = Math.max(...grid.map(r => r.length));
  // başlık satırı (ilk 15 satırda)
  // başlık satırı: ilk 15 satırda en çok "uzunluk" başlığı içeren kısa hücreli satır
  let hdrRow = -1, lenHdrCols = new Set();
  for (let r = 0; r < Math.min(15, grid.length); r++) {
    const hits = grid[r].map((c, i) => typeof c === 'string' && c.trim().length <= 16 && HDR_LEN.test(c) && !HDR_NO.test(c) ? i : -1).filter(i => i >= 0);
    if (hits.length > lenHdrCols.size) { hdrRow = r; lenHdrCols = new Set(hits); }
  }
  const stats = [];
  for (let c = 0; c < nc; c++) {
    let numc = 0, inFt = 0, inM = 0, dec = 0, seq = 0, prev = null;
    grid.forEach((r, ri) => { if (ri <= hdrRow) return; const x = cellNum(r[c]); if (!x) return; numc++; if (x.dec) dec++;
      if (prev != null && !x.dec && x.v === prev + 1) seq++; prev = x.dec ? null : x.v;
      if (x.v >= RANGE.ft[0] && x.v <= RANGE.ft[1]) inFt++; if (x.v >= RANGE.m[0] && x.v <= RANGE.m[1]) inM++; });
    stats.push({ c, numc, inFt, inM, dec, seqCol: numc > 2 && seq / (numc - 1) > 0.6 });
  }
  const anyDec = stats.some(s => s.dec >= 3);
  const pick = (u, strict) => stats.filter(s => {
    const inR = u === 'ft' ? s.inFt : s.inM;
    if (s.seqCol) return false;                       // 1,2,3… joint numarası sütunu
    if (inR < 3 || inR / s.numc < 0.6) return false;
    if (strict) return lenHdrCols.size ? lenHdrCols.has(s.c) : s.dec / s.numc >= 0.5;
    return !anyDec || s.dec / s.numc >= 0.3;          // ondalıklı veri varsa tamsayı sütunlarını alma
  });
  let best = null;
  for (const strict of [true, false]) {
    for (const u of ['ft', 'm']) { const cols = pick(u, strict); const score = cols.reduce((a, s) => a + (u === 'ft' ? s.inFt : s.inM), 0); if (cols.length && (!best || score > best.score)) best = { u, cols: cols.map(s => s.c), score }; }
    if (best) break;
  }
  if (!best) return null;
  const isIntCol = c => { let k = 0, t = 0; grid.forEach((r, ri) => { if (ri <= hdrRow) return; const x = cellNum(r[c]); if (x) { t++; if (!x.dec && x.v > 0 && x.v < 2000) k++; } }); return t > 2 && k / t > 0.8; };
  const joints = [];
  best.cols.forEach(c => {
    const noCol = c > 0 && !best.cols.includes(c - 1) && isIntCol(c - 1) ? c - 1 : -1;
    grid.forEach((r, ri) => {
      if (ri <= hdrRow) return;
      if (r.some(x => typeof x === 'string' && SKIP_ROW.test(x))) return;
      const x = cellNum(r[c]); if (!x) return;
      const [lo, hi] = BROAD[best.u]; if (x.v < lo || x.v > hi) return;
      const no = noCol >= 0 ? cellNum(r[noCol]) : null;
      joints.push({ no: no ? no.v : '', len: x.v });
    });
  });
  return { unit: best.u, joints, cols: best.cols.length };
}
async function readTallyFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) {
    await loadLib('pdf');
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const all = []; let unitVotes = { ft: 0, m: 0 }, pagesWithText = 0;
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p), tc = await page.getTextContent();
      const toks = [];
      tc.items.forEach(it => {
        if (!it.str || !it.str.trim()) return; const x0 = it.transform[4], y0 = it.transform[5], w = it.width || it.str.length * 5;
        const parts = it.str.split(/(\s+)/); let off = 0;
        parts.forEach(pt => { if (pt.trim()) toks.push({ s: pt.trim(), x: x0 + w * (off + pt.length / 2) / it.str.length, y: y0 }); off += pt.length; });
      });
      if (!toks.length) continue; pagesWithText++;
      // satırlar
      toks.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = []; toks.forEach(t => { const l = lines.find(L => Math.abs(L.y - t.y) < 3); if (l) l.t.push(t); else lines.push({ y: t.y, t: [t] }); });
      // sütunlar: x merkezlerini kümele
      const xs = toks.map(t => t.x).sort((a, b) => a - b), cents = [];
      xs.forEach(x => { const c = cents[cents.length - 1]; if (c && x - c.max < 14) { c.max = x; c.sum += x; c.n++; } else cents.push({ min: x, max: x, sum: x, n: 1 }); });
      const colOf = x => { let bi = 0, bd = 1e9; cents.forEach((c, i) => { const d = Math.abs(c.sum / c.n - x); if (d < bd) { bd = d; bi = i; } }); return bi; };
      const grid = lines.map(L => { const r = []; L.t.forEach(t => { const c = colOf(t.x); r[c] = r[c] ? r[c] + ' ' + t.s : t.s; }); return Array.from(r, v => v ?? ''); });
      const res = parseGrid(grid); if (res) { unitVotes[res.unit] += res.joints.length; all.push(...res.joints); }
    }
    if (!pagesWithText) throw new Error('scan');
    return { unit: unitVotes.m > unitVotes.ft ? 'm' : 'ft', joints: all, src: `${file.name} · ${pdf.numPages} sayfa` };
  }
  await loadLib('xlsx');
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  let best = null, bestSheet = '';
  wb.SheetNames.forEach(sn => { const grid = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' }); const r = parseGrid(grid); if (r && (!best || r.joints.length > best.joints.length)) { best = r; bestSheet = sn; } });
  if (!best) return null;
  return { unit: best.unit, joints: best.joints, src: `${file.name} · "${bestSheet}" sayfası · ${best.cols} uzunluk sütunu` };
}
$('tallyFile').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  $('tallyStatus').textContent = 'Okunuyor…';
  try {
    const r = await readTallyFile(file);
    if (!r || !r.joints.length) { $('tallyStatus').textContent = 'Dosyada boru uzunluğu bulunamadı. Uzunlukları yapıştırmayı dene.'; return; }
    applyTally(r);
  } catch (x) {
    $('tallyStatus').textContent = x.message === 'scan' ? 'Bu PDF taranmış görüntü; içinde okunabilir metin yok. Excel sürümünü veya yapıştırmayı dene.'
      : x.message === 'lib' ? 'Okuyucu yüklenemedi. Uygulamayı bir kez internetliyken açman gerekiyor.' : 'Dosya okunamadı: ' + x.message;
  }
};
function applyTally(r) {
  const t = W().tally, had = t.rows.length;
  if (had && !confirm(`Mevcut listede ${had} joint var. Yeni dosyadaki ${r.joints.length} joint ile değiştirilsin mi?`)) { $('tallyStatus').textContent = 'İptal edildi.'; return; }
  t.rows = r.joints.map((j, i) => ({ no: j.no !== '' ? j.no : i + 1, len: j.len }));
  t.unit = r.unit; t.source = r.src; if (!t.inHole || t.inHole > t.rows.length) t.inHole = t.rows.length;
  save(); $('tallyStatus').textContent = `${r.joints.length} joint okundu · birim: ${r.unit} · ${r.src}`; renderTally(); toast('Tally okundu, listeyi kontrol et.');
}
$('tallyPasteBtn').onclick = () => {
  const grid = $('tallyPaste').value.split(/\r?\n/).map(l => l.trim().split(/[\t;]+|\s{2,}|\s+/));
  const r = parseGrid(grid);
  if (!r) { toast('Geçerli uzunluk bulunamadı.'); return; }
  r.src = 'yapıştırılan liste'; applyTally(r); $('tallyPaste').value = '';
};
function tallyStats() {
  const t = W().tally, L = t.rows.map(r => +r.len).filter(isFinite), u = t.unit, [lo, hi] = RANGE[u];
  const tot = L.reduce((a, b) => a + b, 0), ih = Math.min(t.inHole || 0, L.length), inSum = L.slice(0, ih).reduce((a, b) => a + b, 0);
  return { L, tot, avg: L.length ? tot / L.length : NaN, min: Math.min(...L), max: Math.max(...L), out: L.filter(v => v < lo || v > hi).length, ih, inSum, u };
}
function renderTally() {
  const t = W().tally, s = tallyStats(), u = t.unit, lo = RANGE[u][0], hi = RANGE[u][1];
  $('tl-unit').value = u; $('tl-in').value = t.inHole || 0; $('tl-bha').value = t.bha || 0; $('tl-kb').value = t.kb || 0;
  document.querySelectorAll('.tlu').forEach(e => e.textContent = `(${u})`);
  if (t.source && $('tallyStatus').textContent === 'Dosya seçilmedi') $('tallyStatus').textContent = `Son okunan: ${t.source}`;
  let cum = 0;
  $('tallyTable').innerHTML = `<tr><th class="n">#</th><th class="n"><span lang="en">Joint</span> no</th><th class="n">Uzunluk (${u})</th><th class="n">Kümülatif</th><th>Durum</th><th></th></tr>` +
    (t.rows.length ? t.rows.map((r, i) => { cum += +r.len || 0; const bad = r.len < lo || r.len > hi;
      return `<tr class="${bad ? 'flag' : ''}"><td class="n">${i + 1}</td><td><input data-tr="${i}" data-tk="no" type="text" value="${esc(r.no)}" style="width:70px"></td><td><input data-tr="${i}" data-tk="len" type="text" inputmode="decimal" step="any" value="${r.len}" style="width:100px"></td><td class="n">${f(cum, 2)}</td><td>${i < s.ih ? '<span class="chip ok">kuyuda</span>' : '<span class="chip na">rafta</span>'}${bad ? ' <span class="chip hi">kontrol et</span>' : ''}</td><td><button class="btn ghost" data-trdel="${i}">Sil</button></td></tr>`; }).join('')
      : '<tr><td colspan="6" style="padding:14px;color:var(--muted)">Liste boş. Dosya seç veya uzunlukları yapıştır.</td></tr>');
  renderTallyOut();
}
function renderTallyOut() {
  const t = W().tally, s = tallyStats(), u = s.u, other = u === 'ft' ? 'm' : 'ft', cv = x => u === 'ft' ? x / M_FT : x * M_FT;
  const bit = (+t.bha || 0) + s.inSum, rkb = bit + (+t.kb || 0);
  $('r-tally').innerHTML = `<h3>Tally özeti</h3>${row('Joint sayısı', f(s.L.length, 0), 'adet', true)}
    ${row('Toplam uzunluk', f(s.tot, 2), u)}${row('', f(cv(s.tot), 2), other)}
    ${row('Ortalama', f(s.avg, 2), u)}${row('En kısa / en uzun', `${f(s.min, 2)} / ${f(s.max, 2)}`, u)}
    ${s.out ? err(`${s.out} joint olağan aralığın (${RANGE[u][0]}–${RANGE[u][1]} ${u}) dışında. Pup joint mi, okuma hatası mı kontrol et.`) : ''}
    <div class="sp"></div><h3>Dizi</h3>
    ${row('Kuyudaki joint', f(s.ih, 0), 'adet')}${row('Kuyudaki boru boyu', f(s.inSum, 2), u)}
    ${row('Matkap derinliği', f(bit, 2), u, true)}${row('', f(cv(bit), 2), other)}
    ${+t.kb ? row('RKB\'den matkap', f(rkb, 2), u) : ''}
    ${row('Rafta kalan', `${f(s.L.length - s.ih, 0)} joint`, `${f(s.tot - s.inSum, 1)} ${u}`)}`;
}
$('tallyTable').addEventListener('input', e => {
  const i = e.target; if (i.dataset.tr == null) return; const r = W().tally.rows[i.dataset.tr];
  r[i.dataset.tk] = i.dataset.tk === 'len' ? num(i.value) : i.value; save(); renderTallyOut();
});
$('tallyTable').addEventListener('change', e => { if (e.target.dataset.tk === 'len') renderTally(); });
$('tallyTable').addEventListener('click', e => { const d = e.target.dataset.trdel; if (d != null) { W().tally.rows.splice(+d, 1); save(); renderTally(); } });
$('tallyAdd').onclick = () => { const t = W().tally; t.rows.push({ no: t.rows.length + 1, len: t.unit === 'm' ? 9.5 : 31 }); save(); renderTally(); };
$('tallyClear').onclick = () => { if (!W().tally.rows.length || !confirm('Tally listesi temizlensin mi?')) return; W().tally.rows = []; W().tally.source = ''; save(); $('tallyStatus').textContent = 'Dosya seçilmedi'; renderTally(); };
[['tl-in', 'inHole'], ['tl-bha', 'bha'], ['tl-kb', 'kb']].forEach(([id, k]) => $(id).addEventListener('input', () => { W().tally[k] = n(id) || 0; save(); if (k === 'inHole') renderTally(); else renderTallyOut(); }));
$('tl-unit').onchange = () => { W().tally.unit = $('tl-unit').value; save(); renderTally(); };
$('tallyXls').onclick = () => exportExcel(W(), 'tally');

/* =========================================================
   EXCEL RAPOR
   ========================================================= */
async function exportExcel(w, only) {
  try { await loadLib('xlsx'); } catch (e) { toast('Excel modülü yüklenemedi. Uygulamayı bir kez internetliyken aç.'); return; }
  const wb = XLSX.utils.book_new(), add = (name, aoa, widths) => { const ws = XLSX.utils.aoa_to_sheet(aoa); if (widths) ws['!cols'] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
  const tl = w.tally;
  const tallySheet = () => { let c = 0; add('Tally', [['#', 'Joint no', `Uzunluk (${tl.unit})`, `Kümülatif (${tl.unit})`, 'Durum'], ...tl.rows.map((r, i) => { c += +r.len || 0; return [i + 1, r.no, +r.len, +c.toFixed(2), i < (tl.inHole || 0) ? 'Kuyuda' : 'Rafta']; }),
    [], ['Joint sayısı', tl.rows.length], ['Kuyudaki joint', tl.inHole || 0], [`BHA (${tl.unit})`, +tl.bha || 0], [`Matkap derinliği (${tl.unit})`, +((+tl.bha || 0) + tl.rows.slice(0, tl.inHole || 0).reduce((a, r) => a + (+r.len || 0), 0)).toFixed(2)]], [6, 10, 14, 16, 10]); };
  if (only === 'tally') { tallySheet(); }
  else {
    add('Kuyu', [['Kuyu adı', w.name], ['Saha', w.field], ['Rig', w.rig], ['Operatör', w.op], ['Başlangıç', w.start], ['Bitiş', w.end || ''], ['Durum', w.status], ['Güncel derinlik (ft)', w.depth ? +(+w.depth).toFixed(1) : ''], ['Rapor tarihi', new Date().toLocaleString('tr-TR')]], [22, 30]);
    add('Kuyu hacmi', [['Bölüm', 'Kuyu/muhafaza ID (in)', 'Boru OD (in)', 'Boru ID (in)', 'Uzunluk (ft)', 'Dizi içi (bbl)', 'Anülüs (bbl)'],
      ...w.secs.map(s => [s.name, s.dh, s.od, s.id, +(+s.len).toFixed(1), +((s.id ** 2) / 1029.4 * s.len).toFixed(2), +(((s.dh ** 2) - (s.od ** 2)) / 1029.4 * s.len).toFixed(2)])], [28, 12, 10, 10, 12, 12, 12]);
    const reps = [...w.reports].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    add('Çamur ölçümleri', [['Tarih', 'Derinlik (ft)', 'Numune', ...PROPS.map(p => `${p.n}${p.u ? ' (' + p.u + ')' : ''}`), 'Not'],
      ['Hedef (alt–üst)', '', '', ...PROPS.map(p => { const t = w.targets[p.k] || {}; return [t.lo ?? '', t.hi ?? ''].join('–'); }), ''],
      ...reps.map(r => [fmtDate(r.time), r.depth ? +(+r.depth).toFixed(0) : '', r.src || '', ...PROPS.map(p => r.v[p.k] ?? ''), r.note || ''])], [16, 11, 12, ...PROPS.map(() => 11), 30]);
    add('Stok', [['Kimyasal', 'Mevcut', 'Birim', 'kg/birim', 'Asgari', 'Durum'], ...w.stock.map(s => [s.name, +s.qty, s.unit, +s.kg, +s.min, +s.qty <= +s.min ? 'Sipariş ver' : 'Yeterli'])], [22, 10, 8, 10, 10, 12]);
    add('Stok hareketleri', [['Tarih', 'Kimyasal', 'İşlem', 'Miktar', 'Birim', 'Not'], ...w.stockLog.map(l => [fmtDate(l.t), l.item, l.kind, l.qty, l.unit, l.note])], [16, 20, 10, 10, 8, 30]);
    add('Tanklar', [['Tank', 'Bölme', 'Kullanım', 'Şekil', 'Boy/çap (ft)', 'En (ft)', 'Yükseklik (ft)', 'Seviye (cm)', 'Yöntem', 'MW (ppg)', 'Hacim (bbl)'],
      ...w.tanks.flatMap(t => t.comps.map(c => [t.name, c.name, USES[c.use], c.shape === 'cyl' ? 'Silindir' : 'Dikdörtgen', +(+c.L).toFixed(2), +(+c.W).toFixed(2), +(+c.H).toFixed(2), +cmOf(c).toFixed(1), METHODS[c.method || 'dim'], c.mw, +compVol(c).toFixed(1)]))], [16, 14, 10, 11, 11, 9, 12, 11, 9, 11]);
    const gs = w.gauges || [];
    if (gs.length) add('Tank seviye ölçümleri', [['Tarih', 'Tank', 'Bölme', 'Kullanım', 'Seviye (cm)', 'Hacim (bbl)'],
      ...gs.flatMap(g => g.items.map(it => [fmtDate(g.t), it.tank, it.comp, USES[it.use] || '', it.cm, it.bbl])),
      [], ['Tarih', 'Aktif (bbl)', 'Rezerv (bbl)', 'Trip (bbl)', 'Toplam (bbl)'], ...gs.map(g => [fmtDate(g.t), +g.totals.active.toFixed(1), +g.totals.reserve.toFixed(1), +g.totals.trip.toFixed(1), +g.totals.all.toFixed(1)])], [16, 16, 14, 10, 11, 11]);
    if (tl.rows.length) tallySheet();
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const safe = (w.name || 'kuyu').replace(/[^\wçğıöşüÇĞİÖŞÜ-]+/g, '_');
  await saveFile(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${safe}-${only || 'rapor'}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* =========================================================
   ÇİZİM DÖNGÜSÜ
   ========================================================= */
function calcAll() {
  [calcHacim, calcPompa, calcAgir, calcSeyr, calcHid, calcKill, calcCim, calcHidr, calcTrip, calcHazir].forEach(c => { try { c(); } catch (e) { console.error(e); } });
}
function renderAll(full) {
  renderHeader();
  if (full) { renderSecs(); fillStockSelects(); }
  calcAll();
  const t = DB.tab && DB.tab[DB.group];
  try {
    if (t === 'kuyu') renderKuyu();
    if (t === 'olcum') renderOlcum();
    if (t === 'tank') renderTanks();
    if (t === 'seviye') renderSeviye();
    if (t === 'stok') renderStok();
    if (t === 'hazir') { fillTankSelect(); renderHazirRows(); calcHazir(); }
    if (t === 'agir') { fillStockSelects(); calcAgir(); }
    if (t === 'tally') renderTally();
  } catch (e) { console.error(e); }
}

load();
loadCalcInputs();
setUnit(unit(), false);
showGroup(DB.group || 'kuyu');
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
