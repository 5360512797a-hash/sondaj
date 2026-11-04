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
/* yoğunluk: içeride her zaman ppg; ekranda ppg veya lb/ft³ (pcf). 1 ppg = 7.48 pcf */
const PCF = 7.48;
const dunit = () => (DB && DB.dunit) || 'ppg';
const isPcf = () => dunit() === 'pcf';
const toPpg = x => isPcf() ? x / PCF : x;
const fromPpg = x => isPcf() ? x * PCF : x;
const dLbl = () => isPcf() ? 'lb/ft³' : 'ppg';
const fd = (ppg, d) => f(fromPpg(ppg), d != null ? d : (isPcf() ? 1 : 2));
const nd = id => toPpg(n(id));

/* ---------------- çamur özellikleri ---------------- */
const BASE_PROPS = [
  { k: 'mw', n: 'Yoğunluk', u: 'ppg', d: 2, lo: 10, hi: 10.8, dens: true },
  { k: 'fv', n: 'Huni viskozitesi', u: 'sn/qt', d: 0, lo: 40, hi: 55 },
  { k: 'pv', n: 'PV', u: 'cP', d: 0, lo: 10, hi: 22 },
  { k: 'yp', n: 'YP', u: 'lb/100ft²', d: 0, lo: 10, hi: 20 },
  { k: 'r6', n: 'θ6', u: '', d: 0, lo: null, hi: null },
  { k: 'r3', n: 'θ3', u: '', d: 0, lo: null, hi: null },
  { k: 'g10s', n: 'Jel 10 sn', u: 'lb/100ft²', d: 0, lo: 2, hi: 6 },
  { k: 'g10m', n: 'Jel 10 dk', u: 'lb/100ft²', d: 0, lo: 5, hi: 15 },
  { k: 'g30m', n: 'Jel 30 dk', u: 'lb/100ft²', d: 0, lo: null, hi: null },
  { k: 'ph', n: 'pH', u: '', d: 1, lo: 9, hi: 10.5 },
  { k: 'fl', n: 'API filtrat', u: 'ml/30dk', d: 1, lo: null, hi: 6 },
  { k: 'cake', n: 'Kek', u: '1/32 in', d: 0, lo: null, hi: 2 },
  { k: 'hpht', n: 'HPHT filtrat', u: 'ml/30dk', d: 1, lo: null, hi: null },
  { k: 'water', n: 'Su (retort)', u: '%', d: 1, lo: null, hi: null },
  { k: 'oil', n: 'Petrol (retort)', u: '%', d: 1, lo: null, hi: null },
  { k: 'sol', n: 'Katı', u: '%', d: 1, lo: null, hi: 10 },
  { k: 'sand', n: 'Kum', u: '%', d: 2, lo: null, hi: 0.5 },
  { k: 'mbt', n: 'MBT', u: 'ppb', d: 1, lo: null, hi: 20 },
  { k: 'cl', n: 'Klorür', u: 'mg/L', d: 0, lo: null, hi: null },
  { k: 'th', n: 'Toplam sertlik', u: 'mg/L', d: 0, lo: null, hi: null },
  { k: 'ca', n: 'Kalsiyum', u: 'mg/L', d: 0, lo: null, hi: 200 },
  { k: 'kcl', n: 'KCl', u: '% ağ.', d: 1, lo: null, hi: null },
  { k: 'pf', n: 'Pf', u: 'ml', d: 2, lo: null, hi: null },
  { k: 'mf', n: 'Mf', u: 'ml', d: 2, lo: null, hi: null },
  { k: 'pm', n: 'Pm', u: 'ml', d: 2, lo: null, hi: null },
  { k: 'temp', n: 'Sıcaklık', u: '°C', d: 0, lo: null, hi: null }
];
const defaultTargets = () => Object.fromEntries(BASE_PROPS.map(p => [p.k, { lo: p.lo, hi: p.hi }]));
/* test listesi kullanıcıya göre: gizlenen testler formda ve kartlarda görünmez, eski verisi silinmez.
   Kullanıcı kendi testini de ekleyebilir (DB.propCfg.custom). */
let ALLPROPS = BASE_PROPS.slice(), PROPS = BASE_PROPS.slice();
const propCfg = () => { DB.propCfg = DB.propCfg || { hidden: [], custom: [], order: [] }; return DB.propCfg; };
function rebuildProps() {
  const c = propCfg();
  ALLPROPS = [...BASE_PROPS, ...(c.custom || []).map(x => ({ k: x.k, n: x.n, u: x.u || '', d: isFinite(+x.d) ? +x.d : 1, lo: null, hi: null, custom: true }))];
  PROPS = ALLPROPS.filter(p => !(c.hidden || []).includes(p.k));
  if (!PROPS.length) PROPS = [ALLPROPS[0]];
  if (!PROPS.some(p => p.k === chartKey)) chartKey = PROPS[0].k;
}
/* yoğunluk özelliği içeride ppg; ekranda seçili birim */
const pU = p => p.dens ? dLbl() : p.u;
const pD = p => p.dens ? (isPcf() ? 1 : 2) : p.d;
const pOut = (p, v) => p.dens && v != null && v !== '' && isFinite(v) ? fromPpg(+v) : v;
const pIn = (p, v) => p.dens && isFinite(v) ? toPpg(v) : v;

/* ---------------- veri modeli ---------------- */
/* MR 8000 kulesi tank seti ("MR 8000 Tank Hacimleri" Excel dosyası).
   Tank yüksekliği 225 cm, eni 2,45 m. Eğimli tabanlı bölmeler kademeli katsayıyla:
   0–80 cm · 80–115 cm · 115–225 cm arası bbl/cm. Emiş seviyesi 30 cm (altı pompalanamaz). */
const M2FT = m => m * M_FT;
function mrComp(name, use, lenM, f1, f2, f3) {
  return { name, use, shape: 'rect', L: M2FT(lenM || 0), W: M2FT(2.45), H: 225 / CM_FT, method: f2 ? 'step' : 'factor',
    factor: f1, f1, f2: f2 || '', f3: f3 || '', b1: 80, b2: 115, maxCm: 225, dead: 0, suct: 30, cm: 0, level: 0, mw: '' };
}
function mr8000Tanks() {
  const cok = (name, use, k = 'bölme') => ({ id: uid(), name, comps: [mrComp('1. ' + k, use, 4.7, 0.724), mrComp('2. ' + k, use, 6.6, 0.532, 0.786, 1.017)] });
  return [
    { id: uid(), name: 'Elek tankı', comps: [mrComp('3. bölme', 'active', 2.16, 0.333), mrComp('2. bölme', 'active', 2.16, 0.333), mrComp('1. bölme', 'active', 2.15, 0.331), mrComp('Kum tuzağı', 'active', 2.08, 0.298, 0.321, 0.321)] },
    cok('Çökelme tankı', 'active'),
    cok('Rezerv-1 tankı', 'reserve'),
    cok('Rezerv-2 tankı', 'reserve'),
    cok('Hopper', 'reserve'),
    { id: uid(), name: 'Emiş-1 tankı', comps: [mrComp('1. bölme', 'active', 2.25, 0.347), mrComp('2. bölme', 'active', 3.73, 0.575), mrComp('3. bölme', 'active', 5.3, 0.344, 0.592, 0.817)] },
    cok('Emiş-2 tankı', 'reserve', 'kısım')
  ].map(t => (t.comps.forEach(c => c.id = uid()), t));
}
function sampleTanks() { return mr8000Tanks(); }
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
  migrate();
}
/* sürüm geçişleri: kayıtlı veriyi bozmadan uygula */
function migrate() {
  DB.mig = DB.mig || {};
  Object.values(DB.wells).forEach(w => {
    (w.tanks || []).forEach(t => (t.comps || []).forEach(c => { if (!c.id) c.id = uid(); }));
    if (!DB.mig.mr2 && Array.isArray(w.tanks)) {
      // MR 8000: Emiş-1 ↔ Rezerv-1, Emiş-2 ↔ Rezerv-2 yer değiştirir, su tankları çıkar
      const T = w.tanks, ix = nm => T.findIndex(t => t.name === nm);
      const sw = (a, b) => { const i = ix(a), j = ix(b); if (i >= 0 && j >= 0) [T[i], T[j]] = [T[j], T[i]]; };
      if (ix('Emiş-1 tankı') >= 0 && ix('Rezerv-1 tankı') >= 0) { sw('Emiş-1 tankı', 'Rezerv-1 tankı'); sw('Emiş-2 tankı', 'Rezerv-2 tankı'); w.tanks = T.filter(t => !/^Su tankı-[12]$/.test(t.name)); }
    }
  });
  DB.mig.mr2 = true;
}
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { toast('Kayıt yapılamadı: cihaz hafızası dolu olabilir.'); } }, 250); }
const W = () => DB.wells[DB.active];
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

/* ---------------- gezinme ---------------- */
const GROUPS = {
  kuyu: [['kuyu', 'Kuyu & Arşiv'], ['hacim', 'Kuyu Hacmi'], ['tally', 'Tally']],
  camur: [['olcum', 'Ölçümler'], ['seviye', 'Seviye (cm)'], ['tank', 'Tanklar'], ['stok', 'Stok'], ['hazir', 'Hazırlama'], ['agir', 'Ağırlaştırma'], ['seyr', 'Düşürme'], ['kati', 'Katı analizi']],
  hesap: [['etki', 'Kimyasal etkisi'], ['pompa', 'Dolaşım'], ['hid', 'Basınç'], ['kill', '<span lang="en">Kill sheet</span>'], ['cim', 'Çimento'], ['hidr', 'Hidrolik'], ['trip', 'Tripping']]
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

/* yoğunluk birimi: ppg ↔ lb/ft³ */
document.querySelectorAll('small.du').forEach(s => { const i = s.closest('label') && s.closest('label').querySelector('input'); if (i) i.dataset.dens = '1'; });
function setDUnit(u, convert) {
  const old = dunit();
  if (convert && old !== u) {
    const fac = u === 'pcf' ? PCF : 1 / PCF, d = u === 'pcf' ? 2 : 3;
    CALC_INPUTS.forEach(id => { const el = $(id); if (el.dataset.dens && el.value !== '' && isFinite(num(el.value))) { const v = round(num(el.value) * fac, d); el.value = v; W().vals[id] = String(v); } });
    PROPS.filter(p => p.dens).forEach(p => { const el = $('op-' + p.k); if (el && el.value !== '' && isFinite(num(el.value))) el.value = round(num(el.value) * fac, d); });
  }
  DB.dunit = u; save();
  $('d-ppg').setAttribute('aria-pressed', u === 'ppg'); $('d-pcf').setAttribute('aria-pressed', u === 'pcf');
  document.querySelectorAll('.du').forEach(e => e.textContent = '(' + dLbl() + ')');
  document.querySelectorAll('.du2').forEach(e => e.textContent = dLbl());
  if (convert) { renderPropInputs(); renderAll(true); }
}
$('d-ppg').onclick = () => setDUnit('ppg', true); $('d-pcf').onclick = () => setDUnit('pcf', true);

/* ---------------- hesap girdileri (kuyu bazlı) ---------------- */
const CALC_INPUTS = [...document.querySelectorAll('#t-hacim input[id], #t-agir input[id], #t-agir select[id], #t-seyr input[id], #t-seyr select[id], #t-pompa input[id], #t-pompa select[id], #t-hid input[id], #t-kill input[id], #t-cim input[id], #t-hidr input[id], #t-hidr select[id], #t-trip input[id], #t-hazir select[id], #t-hazir input[id], #t-kati input[id], #t-kati select[id], #e-v, #e-mode')]
  .map(e => e.id).filter(id => !['a-stock', 'z-tank'].includes(id));
const DEFAULTS = Object.fromEntries(CALC_INPUTS.map(id => [id, $(id).value]));
function loadCalcInputs() {
  const v = W().vals || {};
  CALC_INPUTS.forEach(id => {
    const el = $(id); if (v[id] != null) { el.value = v[id]; return; }
    let d = DEFAULTS[id]; const x = num(d); // varsayılanlar ft ve ppg cinsinden yazılı
    if (d !== '' && isFinite(x) && el.tagName === 'INPUT') { if (el.dataset.len && unit() === 'm') d = String(round(x / M_FT, 2)); if (el.dataset.dens && isPcf()) d = String(round(x * PCF, 1)); }
    el.value = d;
  });
}
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
  if ($('nw-carry').checked) { w.stock = JSON.parse(JSON.stringify(old.stock)); w.tanks = JSON.parse(JSON.stringify(old.tanks)); if (old.custTot) w.custTot = JSON.parse(JSON.stringify(old.custTot)); w.recipe = JSON.parse(JSON.stringify(old.recipe)); }
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
function renderPropInputs() {
  const keep = Object.fromEntries(PROPS.map(p => [p.k, $('op-' + p.k) ? $('op-' + p.k).value : '']));
  $('o-props').innerHTML = PROPS.map(p => `<label>${p.n} <small>${pU(p) ? '(' + pU(p) + ')' : ''}</small><input id="op-${p.k}" type="text" inputmode="decimal" step="any" value="${esc(keep[p.k])}"></label>`).join('');
}
renderPropInputs();
function stat(k, v) {
  if (v == null || !isFinite(v)) return 'na';
  const t = W().targets[k] || {};
  if (t.lo != null && t.lo !== '' && v < t.lo) return 'lo';
  if (t.hi != null && t.hi !== '' && v > t.hi) return 'hi';
  return 'ok';
}
const rangeTxt = k => {
  const p = ALLPROPS.find(x => x.k === k), t = W().targets[k] || {}, lo = t.lo != null && t.lo !== '', hi = t.hi != null && t.hi !== '';
  const s = v => f(pOut(p, +v), pD(p)).replace(/,0+$/, '').replace(/(,\d*?)0+$/, '$1');
  return lo && hi ? `${s(t.lo)}–${s(t.hi)}` : lo ? `≥ ${s(t.lo)}` : hi ? `≤ ${s(t.hi)}` : 'hedef yok';
};
const sortedReps = () => [...W().reports].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
function renderOlcum(skipTgt) {
  const reps = sortedReps(), last = reps[reps.length - 1];
  $('olcumWhen').textContent = last ? `Son ölçüm: ${fmtDate(last.time)} · ${last.depth ? f(fromFt(last.depth), 0) + ' ' + unit() + ' · ' : ''}${last.src || ''}` : 'Henüz ölçüm yok. Aşağıdaki formdan ilk ölçümü kaydet.';
  $('propCards').innerHTML = PROPS.map(p => {
    const v = last ? last.v[p.k] : null, s = stat(p.k, v);
    const lbl = { ok: 'aralıkta', lo: 'düşük', hi: 'yüksek', na: '—' }[s];
    return `<button class="prop ${s !== 'na' ? s : ''}" data-k="${p.k}" aria-pressed="${p.k === chartKey}">
      <span class="pn">${p.n}</span><span class="pv">${v != null && isFinite(v) ? f(pOut(p, v), pD(p)) : '—'} <small style="font-size:.7rem;color:var(--muted)">${pU(p)}</small></span>
      <span class="pr"><span>${rangeTxt(p.k)}</span>${s !== 'na' ? `<span class="chip ${s}">${lbl}</span>` : ''}</span></button>`;
  }).join('');
  renderTrend();
  // geçmiş
  const cols = ALLPROPS.filter(p => reps.some(r => r.v[p.k] != null && isFinite(r.v[p.k])));
  $('histTable').innerHTML = reps.length ? `<tr><th>Tarih</th><th class="n">Derinlik</th>${cols.map(p => `<th class="n">${p.n}</th>`).join('')}<th>Not</th><th></th></tr>` +
    [...reps].reverse().map(r => `<tr data-rep="${r.id}" style="cursor:pointer"><td>${fmtDate(r.time)}</td><td class="n">${r.depth ? f(fromFt(r.depth), 0) : '—'}</td>` +
      cols.map(p => { const v = r.v[p.k], s = stat(p.k, v); return `<td class="n ${s !== 'na' && s !== 'ok' ? 'c-' + s : ''}">${v != null && isFinite(v) ? f(pOut(p, v), pD(p)) : ''}</td>`; }).join('') +
      `<td>${esc(r.note || '')}</td><td><button class="btn ghost" data-delrep="${r.id}">Sil</button></td></tr>`).join('')
    : '<tr><td style="padding:14px;color:var(--muted)">Kayıtlı ölçüm yok.</td></tr>';
  // hedef tablosu
  if (!skipTgt) $('tgtTable').innerHTML = `<tr><th>Özellik</th><th>Alt</th><th>Üst</th></tr>` + PROPS.map(p => {
    const t = W().targets[p.k] || {};
    const tv = x => x == null || x === '' ? '' : round(pOut(p, +x), pD(p) + 1);
    return `<tr><td>${p.n} <small style="color:var(--muted)">${pU(p)}</small></td><td><input id="tg-${p.k}-lo" data-tk="${p.k}" data-tb="lo" type="text" inputmode="decimal" step="any" value="${tv(t.lo)}"></td><td><input id="tg-${p.k}-hi" data-tk="${p.k}" data-tb="hi" type="text" inputmode="decimal" step="any" value="${tv(t.hi)}"></td></tr>`;
  }).join('');
  if (!$('o-time').value) $('o-time').value = nowLocal();
}
function renderTrend() {
  const p = PROPS.find(x => x.k === chartKey), reps = sortedReps().filter(r => r.v[chartKey] != null && isFinite(r.v[chartKey]));
  $('chartTitle').textContent = `Trend · ${p.n}${pU(p) ? ' (' + pU(p) + ')' : ''}`;
  if (reps.length < 2) { $('trend').innerHTML = `<p class="note">Grafik için en az iki ölçüm gerekli.</p>`; return; }
  const t0 = W().targets[chartKey] || {}, t = { lo: t0.lo == null || t0.lo === '' ? t0.lo : pOut(p, +t0.lo), hi: t0.hi == null || t0.hi === '' ? t0.hi : pOut(p, +t0.hi) };
  const vals = reps.map(r => pOut(p, r.v[chartKey]));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (t.lo != null && t.lo !== '') lo = Math.min(lo, +t.lo); if (t.hi != null && t.hi !== '') hi = Math.max(hi, +t.hi);
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad;
  const Wd = 640, H = 220, L = 46, R = 14, T = 12, B = 30, x = i => L + (Wd - L - R) * (i / (reps.length - 1)), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let s = `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="${p.n} trendi">`;
  const tl = t.lo != null && t.lo !== '' ? +t.lo : lo, th = t.hi != null && t.hi !== '' ? +t.hi : hi;
  if ((t.lo != null && t.lo !== '') || (t.hi != null && t.hi !== '')) s += `<rect x="${L}" y="${y(th)}" width="${Wd - L - R}" height="${Math.max(0, y(tl) - y(th))}" style="fill:var(--ok-bg)"/>`;
  for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; s += `<line x1="${L}" x2="${Wd - R}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" style="fill:var(--muted);font-family:var(--f-num)">${f(v, pD(p))}</text>`; }
  s += `<polyline points="${vals.map((v, i) => x(i) + ',' + y(v)).join(' ')}" style="fill:none;stroke:var(--ink)" stroke-width="2" stroke-linejoin="round"/>`;
  vals.forEach((v, i) => { const st = stat(chartKey, reps[i].v[chartKey]); s += `<circle cx="${x(i)}" cy="${y(v)}" r="${i === vals.length - 1 ? 5.5 : 4}" style="fill:var(--${st === 'na' ? 'muted' : st});stroke:var(--panel)" stroke-width="2"/>`; });
  s += `<text x="${L}" y="${H - 8}" font-size="11" style="fill:var(--muted)">${fmtDate(reps[0].time)}</text><text x="${Wd - R}" y="${H - 8}" text-anchor="end" font-size="11" style="fill:var(--muted)">${fmtDate(reps[reps.length - 1].time)}</text></svg>`;
  $('trend').innerHTML = s;
}
$('propCards').addEventListener('click', e => { const b = e.target.closest('.prop'); if (b) { chartKey = b.dataset.k; renderOlcum(); } });
$('o-tgtBtn').onclick = () => $('o-tgt').hidden = !$('o-tgt').hidden;
$('o-cfgBtn').onclick = () => { $('o-cfg').hidden = !$('o-cfg').hidden; renderPropCfg(); };
function renderPropCfg() {
  const c = propCfg(), reps = W().reports;
  $('o-cfgList').innerHTML = ALLPROPS.map(p => {
    const cnt = reps.filter(r => r.v[p.k] != null && isFinite(r.v[p.k])).length;
    return `<div class="pcfg"><label class="chk"><input type="checkbox" data-pk="${p.k}"${(c.hidden || []).includes(p.k) ? '' : ' checked'}> ${esc(p.n)} <small style="color:var(--muted)">${esc(pU(p))}</small></label>
      <span class="note" style="margin:0">${cnt ? cnt + ' kayıt' : ''}</span>${p.custom ? `<button class="btn ghost" data-pdel="${p.k}">Sil</button>` : '<span></span>'}</div>`;
  }).join('');
}
$('o-cfgList').addEventListener('change', e => {
  const k = e.target.dataset.pk; if (!k) return; const c = propCfg(); c.hidden = (c.hidden || []).filter(x => x !== k);
  if (!e.target.checked) { if (PROPS.length <= 1) { e.target.checked = true; toast('En az bir test açık kalmalı.'); return; } c.hidden.push(k); }
  save(); rebuildProps(); renderPropInputs(); renderOlcum();
});
$('o-cfgList').addEventListener('click', e => {
  const k = e.target.dataset.pdel; if (!k) return; const p = ALLPROPS.find(x => x.k === k);
  if (!confirm(`"${p.n}" testi listeden silinsin mi? Kayıtlı ölçümlerdeki değerleri silinmez, sadece gizlenir.`)) return;
  const c = propCfg(); c.custom = c.custom.filter(x => x.k !== k); c.hidden = (c.hidden || []).filter(x => x !== k);
  save(); rebuildProps(); renderPropInputs(); renderPropCfg(); renderOlcum();
});
$('o-cfgAll').onclick = () => { propCfg().hidden = []; save(); rebuildProps(); renderPropInputs(); renderPropCfg(); renderOlcum(); };
$('o-cfgBasic').onclick = () => { // günlük temel testler
  const basic = ['mw', 'fv', 'pv', 'yp', 'g10s', 'g10m', 'ph', 'fl', 'cake', 'sol', 'sand', 'cl', 'ca'];
  propCfg().hidden = ALLPROPS.filter(p => !basic.includes(p.k) && !p.custom).map(p => p.k); save(); rebuildProps(); renderPropInputs(); renderPropCfg(); renderOlcum();
};
$('o-cfgAdd').onclick = () => {
  const name = $('pc-name').value.trim(); if (!name) { toast('Test adını yaz.'); return; }
  const c = propCfg(), k = 'c_' + uid();
  c.custom.push({ k, n: name, u: $('pc-unit').value.trim(), d: n('pc-d') >= 0 ? Math.min(4, Math.round(n('pc-d'))) : 1 });
  Object.values(DB.wells).forEach(w => { w.targets[k] = { lo: null, hi: null }; });
  $('pc-name').value = ''; $('pc-unit').value = '';
  save(); rebuildProps(); renderPropInputs(); renderPropCfg(); renderOlcum(); toast(`"${name}" testi eklendi`);
};
$('tgtTable').addEventListener('input', e => { const i = e.target; if (!i.dataset.tk) return; const p = ALLPROPS.find(x => x.k === i.dataset.tk), t = W().targets[i.dataset.tk] = W().targets[i.dataset.tk] || {}; const v = num(i.value); t[i.dataset.tb] = isFinite(v) ? pIn(p, v) : null; save(); renderOlcum(true); });
function clearForm() { editingRep = null; PROPS.forEach(p => $('op-' + p.k).value = ''); $('o-note').value = ''; $('o-time').value = nowLocal(); $('olcumFormTitle').textContent = 'Yeni ölçüm'; $('o-save').textContent = 'Ölçümü kaydet'; $('o-cancel').hidden = true; }
$('o-save').onclick = () => {
  const old = editingRep ? (W().reports.find(r => r.id === editingRep) || {}).v || {} : {};
  const v = Object.fromEntries(Object.entries(old).filter(([k]) => !PROPS.some(p => p.k === k))); let any = false;
  PROPS.forEach(p => { const x = n('op-' + p.k); if (isFinite(x)) { v[p.k] = pIn(p, x); any = true; } });
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
  editingRep = r.id; PROPS.forEach(p => $('op-' + p.k).value = r.v[p.k] != null ? round(pOut(p, r.v[p.k]), pD(p) + 1) : '');
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
/* kademeli katsayı: [başlangıç cm, bitiş cm, bbl/cm] parçaları */
function stepSegs(c) {
  const f1 = +c.f1 || 0, f2 = c.f2 !== '' && c.f2 != null && isFinite(+c.f2) ? +c.f2 : f1, f3 = c.f3 !== '' && c.f3 != null && isFinite(+c.f3) ? +c.f3 : f2;
  const b1 = isFinite(+c.b1) && c.b1 !== '' ? +c.b1 : 80, b2 = Math.max(b1, isFinite(+c.b2) && c.b2 !== '' ? +c.b2 : 115);
  return [[0, b1, f1], [b1, b2, f2], [b2, Infinity, f3]];
}
function volAtCm(c, cm) {
  const m = c.method || 'dim';
  if (m === 'factor') return Math.max(0, cm * (+c.factor || 0) + (+c.dead || 0));
  if (m === 'step') { let v = +c.dead || 0; for (const [a, b, k] of stepSegs(c)) if (cm > a) v += (Math.min(cm, b) - a) * k; return Math.max(0, v); }
  if (m === 'table') return Math.max(0, interp(sortedTable(c), cm, 0, 1));
  return tankBbl(dimArea(c) * cm / CM_FT);
}
function cmAtVol(c, bbl) {
  const m = c.method || 'dim';
  if (m === 'factor') return +c.factor ? (bbl - (+c.dead || 0)) / +c.factor : NaN;
  if (m === 'step') {
    let rem = bbl - (+c.dead || 0); if (rem <= 0) return 0;
    for (const [a, b, k] of stepSegs(c)) { if (!(k > 0)) return NaN; const cap = (b - a) * k; if (rem <= cap) return a + rem / k; rem -= cap; }
    return NaN;
  }
  if (m === 'table') { const t = sortedTable(c); return t.length ? interp(t, bbl, 1, 0) : NaN; }
  const per = volAtCm(c, 1); return per ? bbl / per : NaN;
}
function maxCm(c) {
  const m = c.method || 'dim';
  if (m === 'factor' || m === 'step') return +c.maxCm || 0;
  if (m === 'table') { const t = sortedTable(c); return t.length ? t[t.length - 1][0] : 0; }
  return (+c.H || 0) * CM_FT;
}
function compVol(c, atLevelFt) { return volAtCm(c, atLevelFt == null ? cmOf(c) : atLevelFt * CM_FT); }
/* kullanılabilir (pompalanabilir) hacim: emiş seviyesinin üstü */
const suctCm = c => isFinite(+c.suct) && c.suct !== '' && c.suct != null ? +c.suct : 0;
function compUsable(c) { const s = suctCm(c); return s > 0 ? Math.max(0, compVol(c) - volAtCm(c, s)) : compVol(c); }
function tankTotals() {
  const t = { active: 0, reserve: 0, trip: 0, settle: 0, other: 0, all: 0, mwSum: 0, mwVol: 0, activeUse: 0, reserveUse: 0 };
  (W().tanks || []).forEach(tk => tk.comps.forEach(c => {
    const v = compVol(c), u = compUsable(c); t[c.use] = (t[c.use] || 0) + v; t.all += v;
    if (c.use === 'active') { t.activeUse += u; if (+c.mw) { t.mwSum += v * c.mw; t.mwVol += v; } }
    if (c.use === 'reserve') t.reserveUse += u;
  }));
  return t;
}
const methodTxt = c => { const m = c.method || 'dim'; if (m === 'step') { const g = stepSegs(c); return `kademeli ${f(g[0][2], 3)} / ${f(g[1][2], 3)} / ${f(g[2][2], 3)}`; } if (m === 'factor') return `${f(+c.factor, 3)} bbl/cm`; if (m === 'table') return `tablo (${sortedTable(c).length} nokta)`; return 'ölçülerden'; };
function totalsHtml(t, d = 0) {
  return `<div><span>Aktif sistem</span><b>${f(t.active, d)} bbl</b></div><div><span>Aktif · emiş üstü</span><b>${f(t.activeUse, d)} bbl</b></div>`
    + `<div><span>Rezerv / yedek</span><b>${f(t.reserve, d)} bbl</b></div><div><span>Rezerv · emiş üstü</span><b>${f(t.reserveUse, d)} bbl</b></div>`
    + (t.trip ? `<div><span>Trip</span><b>${f(t.trip, d)} bbl</b></div>` : '') + `<div><span>Aktif + rezerv</span><b>${f(t.active + t.reserve, d)} bbl</b></div>`
    + `<div><span>Tüm tanklar</span><b>${f(t.all, d)} bbl</b><span style="text-transform:none">${f(t.all * BBL_M3, 1)} m³</span></div>`
    + `<div><span>Aktif + kuyu</span><b>${f(t.active + wellRes.pipe + wellRes.ann, d)} bbl</b></div>`
    + (t.mwVol ? `<div><span>Aktif ort. yoğunluk</span><b>${fd(t.mwSum / t.mwVol)} ${dLbl()}</b></div>` : '');
}
/* başlık toplamları: toplam sistem + kullanıcının belirlediği özel toplam */
const custTot = () => { const w = W(); w.custTot = w.custTot || { name: '', sel: [], hole: false, extra: 0 }; return w.custTot; };
function custVal() {
  const c = custTot(), sel = new Set(c.sel || []); let v = 0, any = false;
  (W().tanks || []).forEach(tk => tk.comps.forEach(cp => { if (sel.has(cp.id)) { v += compVol(cp); any = true; } }));
  if (c.hole) { v += wellRes.pipe + wellRes.ann; any = true; }
  const ex = +c.extra || 0; if (ex) { v += ex; any = true; }
  return any ? v : null;
}
function renderHdrTot() {
  if (!$('hdrTot') || !DB) return;
  const t = tankTotals(), sys = t.active + t.reserve + wellRes.pipe + wellRes.ann, c = custTot(), cv = custVal();
  $('hdrTot').innerHTML = `<button data-go="tank" title="Aktif + rezerv tanklar + kuyu içi">Toplam sistem <b>${f(sys, 0)} bbl</b></button>`
    + `<button data-go="ct"${cv == null ? ' class="set"' : ''}>${esc(c.name || 'Özel toplam')} <b>${cv == null ? 'ayarla' : f(cv, 0) + ' bbl'}</b></button>`
    + `<button data-go="tank">Aktif <b>${f(t.active, 0)} bbl</b></button>`;
  if ($('ctOut')) $('ctOut').innerHTML = `<div><span>${esc(c.name || 'Özel toplam')}</span><b>${cv == null ? '—' : f(cv, 1) + ' bbl'}</b>${cv == null ? '' : `<span style="text-transform:none">${f(cv * BBL_M3, 1)} m³</span>`}</div><div><span>Toplam sistem</span><b>${f(sys, 1)} bbl</b></div>`;
}
$('hdrTot').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (DB.group !== 'camur') showGroup('camur');
  showTab('tank');
  if (b.dataset.go === 'ct') setTimeout(() => $('ctCard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
});
function renderCustTot() {
  const c = custTot(), sel = new Set(c.sel || []);
  if (document.activeElement !== $('ct-name')) $('ct-name').value = c.name || '';
  if (document.activeElement !== $('ct-extra')) $('ct-extra').value = c.extra || 0;
  $('ct-hole').checked = !!c.hole;
  $('ctList').innerHTML = (W().tanks || []).map(tk => {
    const all = tk.comps.length && tk.comps.every(cp => sel.has(cp.id));
    return `<div class="sec"><label class="chk" style="font-weight:700"><input type="checkbox" data-cttank="${tk.id}"${all ? ' checked' : ''}> ${esc(tk.name)}</label>
      ${tk.comps.map(cp => `<label class="chk" style="padding-left:22px"><input type="checkbox" data-ctc="${cp.id}"${sel.has(cp.id) ? ' checked' : ''}> ${esc(cp.name)} <small style="color:var(--muted)">${f(compVol(cp), 1)} bbl</small></label>`).join('')}</div>`;
  }).join('') || '<p class="note">Önce tank ekle.</p>';
  renderHdrTot();
}
$('ct-name').addEventListener('input', () => { custTot().name = $('ct-name').value; save(); renderHdrTot(); });
$('ct-extra').addEventListener('input', () => { const v = num($('ct-extra').value); custTot().extra = isFinite(v) ? v : 0; save(); renderHdrTot(); });
$('ct-hole').addEventListener('change', () => { custTot().hole = $('ct-hole').checked; save(); renderHdrTot(); });
$('ctList').addEventListener('change', e => {
  const c = custTot(), sel = new Set(c.sel || []), d = e.target.dataset;
  if (d.ctc) e.target.checked ? sel.add(d.ctc) : sel.delete(d.ctc);
  if (d.cttank) { const tk = W().tanks.find(t => t.id === d.cttank); tk.comps.forEach(cp => e.target.checked ? sel.add(cp.id) : sel.delete(cp.id)); }
  c.sel = [...sel]; save(); renderCustTot();
});
function renderTanks() {
  const tanks = W().tanks || [];
  // şema: her tank ayrı çizim, dar ekranda alt satıra geçer
  const cw = 96, padX = 10, top = 30, h = 130, H = top + h + 62;
  $('tankSvg').innerHTML = tanks.length ? tanks.map(tk => {
    const w = tk.comps.length * cw + padX * 2 + 4; let body = '';
    body += `<rect x="2" y="${top - 8}" width="${w - 4}" height="${h + 16}" rx="6" style="fill:none;stroke:var(--muted)" stroke-width="1.5"/>`;
    body += `<text x="6" y="${top - 16}" font-size="13" font-weight="700" style="fill:var(--ink);font-family:var(--f-display);letter-spacing:.04em">${esc(tk.name).toLocaleUpperCase('tr-TR')}</text>`;
    tk.comps.forEach((c, i) => {
      const cx = 2 + padX + i * cw, mx = maxCm(c), lvl = mx > 0 ? Math.max(0, Math.min(1, cmOf(c) / mx)) : 0, fh = h * lvl, v = compVol(c), sc = suctCm(c);
      body += `<rect x="${cx + 4}" y="${top}" width="${cw - 8}" height="${h}" rx="${c.shape === 'cyl' ? 14 : 3}" style="fill:var(--field);stroke:var(--line)" stroke-width="1.2"/>`;
      body += `<rect x="${cx + 5}" y="${top + h - fh}" width="${cw - 10}" height="${Math.max(0, fh - 1)}" rx="${c.shape === 'cyl' ? 12 : 2}" style="fill:var(${USEVAR[c.use] || '--u-other'})" opacity=".85"/>`;
      if (mx > 0 && sc > 0 && sc < mx) { const ys = top + h - h * sc / mx; body += `<line x1="${cx + 5}" x2="${cx + cw - 5}" y1="${ys}" y2="${ys}" style="stroke:var(--ink)" stroke-width="1" stroke-dasharray="3 3" opacity=".55"/>`; }
      body += `<text x="${cx + cw / 2}" y="${top + h - fh - 5 < top + 12 ? top + 14 : top + h - fh - 5}" text-anchor="middle" font-size="11" style="fill:var(--ink);font-family:var(--f-num)">${f(cmOf(c), 0)} cm</text>`;
      body += `<text x="${cx + cw / 2}" y="${top + h + 18}" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--ink)">${esc(c.name).slice(0, 12)}</text>`;
      body += `<text x="${cx + cw / 2}" y="${top + h + 34}" text-anchor="middle" font-size="11.5" style="fill:var(--muted);font-family:var(--f-num)">${f(v, 1)} bbl</text>`;
      if (+c.mw) body += `<text x="${cx + cw / 2}" y="${top + h + 50}" text-anchor="middle" font-size="11.5" style="fill:var(--muted);font-family:var(--f-num)">${fd(+c.mw)} ${dLbl()}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="${esc(tk.name)}">${body}</svg>`;
  }).join('') : '<p class="note">Henüz tank yok. Aşağıdan ekle.</p>';
  $('tankTotals').innerHTML = totalsHtml(tankTotals());
  renderHdrTot();
  // düzenleme
  if (renderTanks.skipEdit) return;
  renderCustTot();
  const u = unit();
  $('tankEdit').innerHTML = tanks.map((tk, ti) => `
    <div class="sec">
      <div class="sec-h"><input data-tn="${ti}" type="text" value="${esc(tk.name)}" style="font-weight:600;max-width:260px" aria-label="Tank adı"><button class="btn ghost" data-deltank="${ti}">Tankı sil</button></div>
      <div class="tw"><table class="t">
        <tr><th>Bölme</th><th>Kullanım</th><th>cm → varil</th><th class="n">Seviye (cm)</th><th class="n">Emiş (cm)</th><th class="n">MW (<span class="du2">${dLbl()}</span>)</th><th class="n">Hacim (bbl)</th><th class="n">Emiş üstü</th><th>Şekil</th><th class="n">Boy / çap (${u})</th><th class="n">En (${u})</th><th class="n">Yükseklik (${u})</th><th></th></tr>
        ${tk.comps.map((c, ci) => { const dim = (c.method || 'dim') === 'dim'; return `<tr>
          <td><input data-t="${ti}" data-c="${ci}" data-k="name" type="text" value="${esc(c.name)}"></td>
          <td><select data-t="${ti}" data-c="${ci}" data-k="use">${Object.entries(USES).map(([k, l]) => `<option value="${k}"${c.use === k ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
          <td style="font-size:.8rem;color:var(--muted)">${methodTxt(c)}</td>
          <td><input data-t="${ti}" data-c="${ci}" data-k="cm" type="text" inputmode="decimal" value="${round(cmOf(c), 1)}"></td>
          <td><input data-t="${ti}" data-c="${ci}" data-k="suct" type="text" inputmode="decimal" value="${c.suct ?? ''}" placeholder="0"></td>
          <td><input data-t="${ti}" data-c="${ci}" data-k="mw" type="text" inputmode="decimal" step="any" value="${+c.mw ? round(fromPpg(+c.mw), isPcf() ? 1 : 2) : ''}"></td>
          <td class="n" data-vol="${ti}-${ci}">${f(compVol(c), 1)}</td>
          <td class="n" data-use="${ti}-${ci}">${f(compUsable(c), 1)}</td>
          <td><select data-t="${ti}" data-c="${ci}" data-k="shape"${dim ? '' : ' disabled'}><option value="rect"${c.shape === 'rect' ? ' selected' : ''}>Dikdörtgen</option><option value="cyl"${c.shape === 'cyl' ? ' selected' : ''}>Silindir</option></select></td>
          ${['L', 'W', 'H'].map(k => `<td><input data-t="${ti}" data-c="${ci}" data-k="${k}" type="text" inputmode="decimal" step="any" value="${k === 'W' && c.shape === 'cyl' ? '' : round(fromFt(+c[k] || 0), 2)}"${(k === 'W' && c.shape === 'cyl') || !dim ? ' disabled' : ''}></td>`).join('')}
          <td><button class="btn ghost" data-delc="${ti}-${ci}">Sil</button></td></tr>`; }).join('')}
      </table></div>
      <div><button class="btn ghost" data-addc="${ti}">+ Bölme ekle</button></div>
    </div>`).join('');
}
$('tankEdit').addEventListener('input', e => {
  const i = e.target, tanks = W().tanks;
  if (i.dataset.tn != null) { tanks[i.dataset.tn].name = i.value; }
  else if (i.dataset.k) {
    const c = tanks[i.dataset.t].comps[i.dataset.c], k = i.dataset.k;
    if (['L', 'W', 'H'].includes(k)) c[k] = toFt(num(i.value) || 0);
    else if (k === 'cm') { const v = num(i.value); c.cm = isFinite(v) ? v : 0; c.level = c.cm / CM_FT; }
    else if (k === 'suct') { const v = num(i.value); c.suct = isFinite(v) ? v : ''; }
    else if (k === 'mw') { const v = num(i.value); c.mw = isFinite(v) ? toPpg(v) : ''; }
    else c[k] = i.value;
    const key = i.dataset.t + '-' + i.dataset.c;
    const vc = document.querySelector(`[data-vol="${key}"]`); if (vc) vc.textContent = f(compVol(c), 1);
    const uc = document.querySelector(`[data-use="${key}"]`); if (uc) uc.textContent = f(compUsable(c), 1);
  }
  save(); renderTanks.skipEdit = true; renderTanks(); renderTanks.skipEdit = false;
  if (i.dataset.k === 'shape') renderTanks();
});
$('tankEdit').addEventListener('change', e => { if (e.target.dataset.k === 'shape') renderTanks(); });
$('tankEdit').addEventListener('click', e => {
  const d = e.target.dataset, tanks = W().tanks;
  if (d.deltank != null) { if (confirm(`"${tanks[d.deltank].name}" silinsin mi?`)) { tanks.splice(+d.deltank, 1); save(); renderTanks(); } }
  if (d.addc != null) { tanks[d.addc].comps.push({ id: uid(), name: 'Bölme ' + (tanks[d.addc].comps.length + 1), use: 'active', shape: 'rect', L: 10, W: 8, H: 7, level: 0, cm: 0, suct: 30, mw: '' }); save(); renderTanks(); }
  if (d.delc) { const [t, c] = d.delc.split('-'); tanks[t].comps.splice(+c, 1); save(); renderTanks(); }
});
$('addTank').onclick = () => { W().tanks.push({ id: uid(), name: 'Tank ' + (W().tanks.length + 1), comps: [{ id: uid(), name: 'Bölme 1', use: 'active', shape: 'rect', L: 10, W: 8, H: 7, level: 0, cm: 0, suct: 30, mw: '' }] }); save(); renderTanks(); };
$('loadMR').onclick = () => {
  const w = W(), has = (w.tanks || []).length;
  if (has && !confirm('Mevcut tank listesi silinip MR 8000 tank seti (Elek, Çökelme, Rezerv-1, Rezerv-2, Hopper, Emiş-1, Emiş-2) yüklensin mi?')) return;
  w.tanks = mr8000Tanks(); save(); renderTanks(); toast('MR 8000 tank seti yüklendi');
};

/* =========================================================
   TANK SEVİYESİ (cm)
   ========================================================= */
const lvOpen = new Set();
const METHODS = { step: 'Kademeli katsayı (eğimli taban)', factor: 'Sabit katsayı (bbl/cm)', table: 'Kalibrasyon tablosu', dim: 'Ölçülerden (boy × en)' };
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
  return { bbl: f(bbl, 1), use: f(compUsable(c), 1), m3: f(bbl * BBL_M3, 2), per: isFinite(per) && per > 0 ? f(per, 3) : '—', need, diff: diff + (note ? ' ' + note : '') + warn };
}
function renderSeviye() {
  const tanks = W().tanks || [];
  $('lvTanks').innerHTML = tanks.length ? tanks.map((tk, ti) => `
    <div class="card lv">
      <h2>${esc(tk.name)}</h2>
      <div class="tw"><table class="t">
        <tr><th>Bölme</th><th class="n">Ölçülen (cm)</th><th class="n">Varil</th><th class="n">Emiş üstü</th><th class="n">m³</th><th class="n">bbl / cm</th><th class="n">Hedef (bbl veya ±)</th><th class="n">Gereken (cm)</th><th>Yapılacak</th><th></th></tr>
        ${tk.comps.map((c, ci) => { const k = ti + '-' + ci, v = lvCells(c); return `
        <tr>
          <td><b>${esc(c.name)}</b><div class="note" style="margin:0;font-size:.74rem">${USES[c.use] || ''} · ${{ step: 'kademeli', factor: 'katsayı', table: 'tablo' }[c.method] || 'ölçü'}</div></td>
          <td><input id="lv-cm-${k}" data-lv="${k}" data-lk="cm" type="text" inputmode="decimal" value="${round(cmOf(c), 1)}"></td>
          <td class="n big" data-o="bbl-${k}">${v.bbl}</td>
          <td class="n" data-o="use-${k}">${v.use}</td>
          <td class="n" data-o="m3-${k}">${v.m3}</td>
          <td class="n" data-o="per-${k}">${v.per}</td>
          <td><input id="lv-tg-${k}" data-lv="${k}" data-lk="target" type="text" inputmode="decimal" placeholder="örn. +50" value="${esc(c.target ?? '')}"></td>
          <td class="n big" data-o="need-${k}">${v.need}</td>
          <td data-o="diff-${k}">${v.diff}</td>
          <td><button class="btn ghost" data-lvcfg="${k}">Ayar</button></td>
        </tr>
        ${lvOpen.has(k) ? `<tr class="cfg"><td colspan="10"><div class="cfgbox">
          <label>cm → varil yöntemi<select data-lv="${k}" data-lk="method">${Object.entries(METHODS).map(([m, l]) => `<option value="${m}"${(c.method || 'dim') === m ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          ${(c.method || 'dim') === 'dim' ? `<p class="note" style="margin:0">Ölçüler <b>Tanklar</b> sekmesinden alınıyor: ${c.shape === 'cyl' ? 'çap ' + f(fromFt(+c.L), 2) : f(fromFt(+c.L), 2) + ' × ' + f(fromFt(+c.W), 2)} ${unit()}, yükseklik ${f(fromFt(+c.H), 2)} ${unit()}.</p>` : ''}
          ${c.method === 'factor' ? `<label>1 cm kaç varil <small>(bbl/cm)</small><input id="lv-f-${k}" data-lv="${k}" data-lk="factor" type="text" inputmode="decimal" value="${c.factor ?? ''}"></label>
            <label>Ölü hacim <small>(0 cm'deki bbl)</small><input id="lv-d-${k}" data-lv="${k}" data-lk="dead" type="text" inputmode="decimal" value="${c.dead ?? 0}"></label>
            <label>Bölme yüksekliği <small>(cm)</small><input id="lv-x-${k}" data-lv="${k}" data-lk="maxCm" type="text" inputmode="decimal" value="${c.maxCm ?? ''}"></label>` : ''}
          ${c.method === 'step' ? `<label>1. kademe <small>(bbl/cm)</small><input id="lv-f1-${k}" data-lv="${k}" data-lk="f1" type="text" inputmode="decimal" value="${c.f1 ?? ''}"></label>
            <label>1. kademe biter <small>(cm)</small><input id="lv-b1-${k}" data-lv="${k}" data-lk="b1" type="text" inputmode="decimal" value="${c.b1 ?? 80}"></label>
            <label>2. kademe <small>(bbl/cm)</small><input id="lv-f2-${k}" data-lv="${k}" data-lk="f2" type="text" inputmode="decimal" value="${c.f2 ?? ''}"></label>
            <label>2. kademe biter <small>(cm)</small><input id="lv-b2-${k}" data-lv="${k}" data-lk="b2" type="text" inputmode="decimal" value="${c.b2 ?? 115}"></label>
            <label>3. kademe <small>(bbl/cm)</small><input id="lv-f3-${k}" data-lv="${k}" data-lk="f3" type="text" inputmode="decimal" value="${c.f3 ?? ''}"></label>
            <label>Bölme yüksekliği <small>(cm)</small><input id="lv-x-${k}" data-lv="${k}" data-lk="maxCm" type="text" inputmode="decimal" value="${c.maxCm ?? ''}"></label>
            <p class="note" style="margin:0;grid-column:1/-1">Hacim = 1. kademe × cm (sınıra kadar) + 2. kademe × aradaki cm + 3. kademe × kalan cm. Boş bırakılan kademe bir öncekinin katsayısını alır.</p>` : ''}
          <label>Emiş seviyesi <small>(cm, altı pompalanamaz)</small><input id="lv-s-${k}" data-lv="${k}" data-lk="suct" type="text" inputmode="decimal" value="${c.suct ?? ''}" placeholder="0"></label>
          ${c.method === 'table' ? `<label style="grid-column:1/-1">Kalibrasyon tablosu <small>(her satıra: cm  varil — örn. "50  42,5")</small><textarea id="lv-t-${k}" data-lv="${k}" data-lk="table" placeholder="0  0&#10;10  8,6&#10;20  17,4">${esc((c.table || []).map(p => `${String(p[0]).replace('.', ',')}  ${String(p[1]).replace('.', ',')}`).join('\n'))}</textarea></label>
            <p class="note" style="margin:0">${sortedTable(c).length} satır okundu. Tablodaki noktalar arası doğrusal hesaplanır.</p>` : ''}
        </div></td></tr>` : ''}`; }).join('')}
      </table></div>
    </div>`).join('') : '<div class="card"><p class="note">Henüz tank yok. Önce Tanklar sekmesinden tank ve bölmeleri ekle.</p></div>';
  renderLvTotals(); renderLvHist(); renderBalance();
}
function renderLvTotals() {
  const t = tankTotals();
  $('lvTotals').innerHTML = totalsHtml(t, 1); renderHdrTot();
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
  else if (lk === 'method') {
    c.method = i.value;
    if (c.method === 'step' && !isFinite(+c.f1)) { c.f1 = +c.factor || ''; c.b1 = 80; c.b2 = 115; if (!c.maxCm) c.maxCm = 225; }
    save(); renderSeviye(); return;
  }
  else if (['f2', 'f3', 'suct'].includes(lk)) { const v = num(i.value); c[lk] = isFinite(v) ? v : ''; }
  else c[lk] = num(i.value);
  save();
  const v = lvCells(c); ['bbl', 'use', 'm3', 'per', 'need', 'diff'].forEach(x => { const el = document.querySelector(`[data-o="${x}-${k}"]`); if (el) el.innerHTML = v[x]; });
  renderLvTotals(); renderBalance(true);
  if (lk === 'table') { const nt = i.closest('label').nextElementSibling; if (nt) nt.textContent = `${sortedTable(c).length} satır okundu. Tablodaki noktalar arası doğrusal hesaplanır.`; }
});
$('lvTanks').addEventListener('click', e => { const k = e.target.dataset.lvcfg; if (!k) return; lvOpen.has(k) ? lvOpen.delete(k) : lvOpen.add(k); renderSeviye(); });
$('lvSave').onclick = () => {
  const w = W(); w.gauges = w.gauges || [];
  const t = tankTotals();
  w.gauges.push({ t: new Date().toISOString(), totals: { active: t.active, reserve: t.reserve, trip: t.trip, all: t.all, activeUse: t.activeUse },
    items: w.tanks.flatMap(tk => tk.comps.map(c => ({ tank: tk.name, comp: c.name, use: c.use, cm: round(cmOf(c), 1), bbl: round(compVol(c), 1), usable: round(compUsable(c), 1) }))) });
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
const MAT_BAG = { '35': 1500, '22.5': 1000, '34.2': 1500, '41.7': 1500 };
const matPpg = () => { let v = num($('a-mat').value); if (!isFinite(v)) { $('a-mat').value = '35'; v = 35; } return v < 10 ? v * 8.33 : v; };
$('a-stock').onchange = () => { const s = W().stock.find(x => x.id === $('a-stock').value); W().vals['a-stock-id'] = $('a-stock').value; if (s) { $('a-sack').value = s.kg; W().vals['a-sack'] = String(s.kg); } save(); calcAll(); };
$('a-mat').addEventListener('change', () => { const kg = MAT_BAG[$('a-mat').value]; if (kg && !$('a-stock').value) { $('a-sack').value = kg; W().vals['a-sack'] = String(kg); save(); calcAll(); } });
$('a-mode').addEventListener('change', () => agirFields());
function agirFields() {
  const m = $('a-mode').value || 'target';
  document.querySelectorAll('#t-agir [data-am]').forEach(l => l.hidden = !l.dataset.am.split(' ').includes(m));
  $('a-vlbl').textContent = m === 'prep' ? '(bbl, bilgi için)' : '(bbl)';
}
$('a-use').onclick = () => {
  const id = $('a-stock').value; if (!id) { toast('Önce stok kalemini seç.'); return; }
  if (!(agirUnits > 0)) { toast('Hesaplanan miktar yok.'); return; }
  const s = W().stock.find(x => x.id === id);
  if (!confirm(`${s.name}: ${agirUnits} ${s.unit} stoktan düşülsün mü?`)) return;
  stockUse(id, agirUnits, `Ağırlaştırma ${$('a-w1').value} → ${$('a-w2').value} ${dLbl()}`); fillStockSelects(); toast('Stoktan düşüldü');
};
function calcAgir() {
  agirFields();
  const mode = $('a-mode').value || 'target', dm = matPpg(), k = 42 * dm, sack = n('a-sack'), V = n('a-v'), w1 = nd('a-w1'), w2 = nd('a-w2'), N = n('a-n');
  const s = W().stock.find(x => x.id === $('a-stock').value), mat = $('a-mat').selectedOptions[0] ? $('a-mat').selectedOptions[0].textContent.split(' (')[0] : 'Ağırlaştırıcı';
  const stockRow = u => s ? row('Stokta', f(s.qty, 0), s.unit) + (+s.qty < u ? err('Stok yetersiz.') : '') : '';
  const dRow = (lbl, ppg, big) => row(lbl, fd(ppg), dLbl(), big) + row('', isPcf() ? f(ppg, 2) : f(ppg * PCF, 1), isPcf() ? 'ppg' : 'lb/ft³');
  agirUnits = 0; let o = '<h3>Sonuç</h3>';
  if (!(w1 > 0)) return $('r-agir').innerHTML = o + err('Mevcut yoğunluğu gir.');
  if (!(sack > 0)) return $('r-agir').innerHTML = o + err('Ambalaj ağırlığını gir.');
  if (mode === 'target') {
    if (!(w2 > w1)) return $('r-agir').innerHTML = o + err('Hedef yoğunluk mevcut yoğunluktan büyük olmalı.');
    if (w2 >= dm) return $('r-agir').innerHTML = o + err(`Hedef yoğunluk ağırlaştırıcının yoğunluğuna (${fd(dm)} ${dLbl()}) ulaşamaz.`);
    const lb = V * k * (w2 - w1) / (dm - w2), kg = lb * LB_KG, inc = lb / k, bags = kg / sack;
    agirUnits = Math.ceil(bags - 1e-9);
    o += row(`Gereken ${mat.toLocaleLowerCase('tr-TR')}`, f(bags, 2), `adet × ${f(sack, 0)} kg`, true) + row('Yukarı yuvarlanmış', f(agirUnits, 0), 'adet') + stockRow(agirUnits)
      + row('Toplam malzeme', f(kg, 0), 'kg') + row('', f(lb, 0), 'lb')
      + row('Birim ilave', f(lb / V, 1), 'lb/bbl') + row('', f(lb / V * 2.853, 1), 'kg/m³')
      + '<div class="sp"></div>' + row('Hacim artışı', f(inc, 2), 'bbl') + row('Son hacim', f(V + inc, 1), 'bbl');
  } else if (mode === 'bags') {
    if (!(N > 0) || !(V > 0)) return $('r-agir').innerHTML = o + err('Ambalaj adedini ve çamur hacmini gir.');
    const lb = N * sack / LB_KG, nw = (dm * lb + k * w1 * V) / (k * V + lb);
    agirUnits = Math.ceil(N - 1e-9);
    const per100 = (dm * sack / LB_KG + k * w1 * 100) / (k * 100 + sack / LB_KG) - w1;
    o += dRow('Yeni yoğunluk', nw, true) + row('Artış', fd(nw - w1), dLbl()) + stockRow(agirUnits)
      + row('Toplam malzeme', f(N * sack, 0), 'kg') + row('', f(lb, 0), 'lb')
      + '<div class="sp"></div>' + row('Hacim artışı', f(lb / k, 2), 'bbl') + row('Son hacim', f(V + lb / k, 1), 'bbl')
      + `<p class="note" style="color:#93A1AB">Pratik: 1 ambalaj 100 bbl çamuru yaklaşık ${fd(per100)} ${dLbl()} ağırlaştırır.</p>`;
  } else {
    if (!(N > 0)) return $('r-agir').innerHTML = o + err('Ambalaj adedini gir.');
    if (!(w2 > w1)) return $('r-agir').innerHTML = o + err('Hedef yoğunluk mevcut yoğunluktan büyük olmalı.');
    if (w2 >= dm) return $('r-agir').innerHTML = o + err(`Hedef yoğunluk ağırlaştırıcının yoğunluğuna (${fd(dm)} ${dLbl()}) ulaşamaz.`);
    const lb = N * sack / LB_KG, base = lb * (dm - w2) / (k * (w2 - w1));
    agirUnits = Math.ceil(N - 1e-9);
    o += row('Ağırlaştırılabilecek çamur', f(base, 1), 'bbl', true) + row('', f(base * BBL_M3, 1), 'm³')
      + row('Malzeme ilavesinden sonra', f(base + lb / k, 1), 'bbl') + stockRow(agirUnits)
      + row('Kullanılan malzeme', f(N * sack, 0), 'kg')
      + (V > 0 ? `<p class="note" style="color:#93A1AB">${f(V, 0)} bbl çamurun tamamını bu yoğunluğa çıkarmak için ${f(V * k * (w2 - w1) / (dm - w2) * LB_KG / sack, 2)} ambalaj gerekir.</p>` : '');
  }
  $('r-agir').innerHTML = o;
}
$('s-liq').addEventListener('change', () => { const v = $('s-liq').value; if (v) { $('s-dw').value = round(fromPpg(+v), isPcf() ? 2 : 2); W().vals['s-dw'] = $('s-dw').value; save(); calcAll(); } });
function calcSeyr() {
  const V = n('s-v'), w1 = nd('s-w1'), w2 = nd('s-w2'), dw = nd('s-dw'), h = '<h3>Sonuç</h3>';
  if (!(w2 < w1)) return $('r-seyr').innerHTML = h + err('Hedef yoğunluk mevcut yoğunluktan küçük olmalı.');
  if (!(w2 > dw)) return $('r-seyr').innerHTML = h + err('Hedef yoğunluk eklenen sıvının yoğunluğundan büyük olmalı.');
  const vw = V * (w1 - w2) / (w2 - dw), chk = (w1 * V + dw * vw) / (V + vw);
  const liq = Math.abs(dw - 8.33) < 0.05 ? 'Eklenecek su' : Math.abs(dw - 7) < 0.05 ? 'Eklenecek petrol' : 'Eklenecek sıvı';
  $('r-seyr').innerHTML = h + row(liq, f(vw, 1), 'bbl', true) + row('', f(vw * BBL_M3, 2), 'm³')
    + row('Son hacim', f(V + vw, 1), 'bbl') + row('Hacim artışı', f(vw / V * 100, 1), '%') + row('Kontrol: son yoğunluk', fd(chk), dLbl());
}
function calcHid() {
  const mw = nd('p-mw'), tvd = toFt(n('p-tvd')), apl = n('p-apl') || 0, pp = n('p-pp');
  const p = 0.052 * mw * tvd, g = 0.052 * mw, ecd = mw + apl / (0.052 * tvd);
  let o = '<h3>Sonuç</h3>' + row('Hidrostatik basınç', f(p, 0), 'psi', true) + row('', f(p * PSI_BAR, 1), 'bar')
    + row('Basınç gradyanı', f(g, 3), 'psi/ft') + row('', f(g * M_FT * PSI_BAR, 4), 'bar/m')
    + row('ECD', fd(ecd), dLbl()) + row('Dolaşımda dip basıncı', f(p + apl, 0), 'psi');
  if (isFinite(pp) && pp > 0) { const emw = pp / (0.052 * tvd); o += row('Gözenek basıncı EMW', fd(emw), dLbl()) + row('Overbalance', f(p - pp, 0), 'psi') + row('', fd(mw - emw), dLbl()); }
  $('r-hid').innerHTML = o;
}
function calcKill() {
  const omw = nd('w-omw'), tvd = toFt(n('w-tvd')), sidpp = n('w-sidpp'), sicp = n('w-sicp'), pit = n('w-pit'),
    scr = n('w-scr'), kspm = n('w-spm'), sm = nd('w-sm') || 0, shoe = toFt(n('w-shoe')), lot = nd('w-lot');
  const kmw = omw + sidpp / (0.052 * tvd) + sm, icp = sidpp + scr, fcp = scr * kmw / omw;
  const maasp = (lot - omw) * 0.052 * shoe, maaspNew = (lot - kmw) * 0.052 * shoe;
  const out = pumpRes.out, stb = out > 0 ? wellRes.pipe / out : NaN, btu = out > 0 ? wellRes.ann / out : NaN;
  const cap = wellRes.lastAnnCap, kh = cap > 0 ? pit / cap : NaN, kg = 0.052 * omw - (sicp - sidpp) / kh;
  let typ = '—'; if (isFinite(kg)) typ = kg < 0.25 ? 'Gaz' : kg <= 0.4 ? 'Yağ / gaz karışımı' : 'Su (tuzlu su)';
  let o = '<h3>Kill çamuru</h3>' + row('Kill çamuru (KMW)', fd(kmw), dLbl(), true)
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
    toc = toFt(n('c-toc')), st = toFt(n('c-st')), ex = (n('c-ex') || 0) / 100, y = n('c-y'), w = n('c-w'), sk = n('c-sk'), dens = nd('c-dens'), dmw = nd('c-dmw');
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
    + row('Çimentolu kolon', f(fromFt(depth - toc), 0), unit()) + row('Pabuçta son hidrostatik', f(hp, 0), 'psi') + row('Pabuç EMW', fd(hp / (0.052 * depth)), dLbl());
}
/* power-law dizi içi basınç kaybı (rapor / MI el kitabı) */
function pipeLoss(id, L, q, mw, nn, K) {
  if (!(id > 0) || !(L > 0) || !(q > 0)) return { dp: 0, v: 0, re: 0, reg: '—' };
  const v = 24.48 * q / (id * id), mu = 100 * K * Math.pow(1.6 * v / id, nn - 1) * Math.pow((3 * nn + 1) / (4 * nn), nn);
  const re = 15.467 * v * id * mw / mu, rec = 4270 - 1370 * nn, turb = re > rec;
  const fr = turb ? ((Math.log10(nn) + 3.93) / 50) / Math.pow(re, (1.75 - Math.log10(nn)) / 7) : 16 / re;
  return { dp: fr * v * v * mw * L / (92916 * id), v, re, reg: turb ? 'türbülanslı' : 'laminer' };
}
function calcHidr() {
  const t6 = n('r-600'), t3 = n('r-300'), t100 = n('r-100'), th3 = n('r-3'), mw = nd('r-mw'), qIn = n('r-q'), q = isFinite(qIn) && qIn > 0 ? qIn : pumpRes.gpm;
  const spp = n('r-spp'), bit = n('r-bit'), surfL = +$('r-surf').value || 0, dc = n('r-dc') || 0.25, sgc = n('r-sgc') || 2.7;
  const pv = t6 - t3, yp = t3 - pv, av = t6 / 2, nn = 3.32 * Math.log10(t6 / t3), K = 5.11 * t3 / Math.pow(511, nn);
  let tfa = 0;[[n('n1c'), n('n1s')], [n('n2c'), n('n2s')]].forEach(([c, sz]) => { if (c > 0 && sz > 0) tfa += c * Math.PI / 4 * (sz / 32) ** 2; });
  const dpb = tfa > 0 ? mw * q * q / (10858 * tfa * tfa) : NaN, hhp = dpb * q / 1714, vn = tfa > 0 ? q / (3.117 * tfa) : NaN;
  const hsi = bit > 0 ? 1.2732 * hhp / (bit * bit) : NaN, impF = vn * q * mw / 1932, impA = bit > 0 ? 1.2732 * impF / (bit * bit) : NaN;
  // dizi içi + yüzey
  const secs = W().secs || [], okRheo = t6 > 0 && t3 > 0 && t6 > t3 && nn > 0;
  let pipeTot = 0, pipeRows = '';
  const surf = okRheo && surfL > 0 ? pipeLoss(3.826, surfL, q, mw, nn, K).dp : 0;
  if (okRheo) secs.forEach((x, i) => { const r = pipeLoss(+x.id, +x.len, q, mw, nn, K); pipeTot += r.dp; pipeRows += row(`${i + 1}. ${esc(x.name || 'bölüm')} <span class="tag">${r.reg}</span>`, f(r.dp, 0), 'psi'); });
  // anülüs hızları, anülüs basınç kaybı ve kesinti taşıma (θ100 / θ3 ile anülüs n, K)
  const na = t100 > 0 && th3 > 0 ? 0.28518 * Math.log(t100 / th3) : NaN, Ka = t100 / Math.pow(170.3, na);
  const nI = 3.322 * Math.log10((2 * pv + yp) / (pv + yp)), KI = Math.pow(511, 1 - nI) * (pv + yp);
  let annRows = '', avMin = Infinity, teMin = Infinity, annTot = 0;
  secs.forEach((x, i) => {
    const dh = +x.dh, od = +x.od; if (!(dh > od) || !(x.len > 0)) return;
    const va = 24.48 * q / (dh * dh - od * od); avMin = Math.min(avMin, va);
    if (isFinite(na) && na > 0 && q > 0) { // MI: μea, NRe, f → ΔPa
      const gap = dh - od, mue = 100 * Ka * Math.pow(2.4 * va / gap * (2 * na + 1) / (3 * na), na - 1), re = 15.467 * va * gap * mw / mue;
      const fa = re < 3470 - 1370 * na ? 24 / re : ((Math.log10(na) + 3.93) / 50) / Math.pow(re, (1.75 - Math.log10(na)) / 7);
      annTot += fa * va * va * mw * x.len / (92916 * gap);
    }
    let te = NaN;
    if (isFinite(na) && na > 0) { const mua = 200 * Ka * (dh - od) / va * Math.pow((2.4 * va / (dh - od)) * ((2 * na + 1) / (3 * na)), na), vs = 175 * dc * Math.pow(Math.max(0, sgc * 8.34 - mw), 2 / 3) / Math.pow(mw * mua, 1 / 3); te = (1 - vs / va) * 100; teMin = Math.min(teMin, te); }
    annRows += row(`${i + 1}. ${esc(x.name || 'bölüm')}`, `${f(va, 0)}${isFinite(te) ? ` <em>ft/dk</em> · %${f(te, 0)}` : ''}`, isFinite(te) ? 'taşıma' : 'ft/dk');
  });
  const cci = isFinite(avMin) ? KI * avMin * mw / 400000 : NaN;
  let o = '<h3>Reoloji</h3>' + row('PV', f(pv, 0), 'cP', true) + row('YP', f(yp, 0), 'lb/100ft²', true)
    + row('Görünür viskozite', f(av, 1), 'cP') + row('Akış indeksi n', f(nn, 3), '') + row('Tutarlılık K', f(K, 3), '')
    + (isFinite(na) ? row('Anülüs n / K (θ100, θ3)', `${f(na, 3)} / ${f(Ka, 3)}`, '') : '')
    + '<div class="sp"></div><h3>Matkap hidroliği</h3>' + row('Kullanılan debi', f(q, 0), 'gpm') + row('TFA', f(tfa, 4), 'in²')
    + row('Bit basınç kaybı', f(dpb, 0), 'psi', true) + (spp > 0 ? row('', f(dpb / spp * 100, 1), '% sirk. basıncı') : '')
    + row('Nozzle hızı', f(vn, 0), 'ft/s') + row('Bit hidrolik gücü', f(hhp, 0), 'HHP') + row('HSI', f(hsi, 2), 'HHP/in²')
    + row('Darbe gücü', f(impF, 0), 'lbf') + row('', f(impA, 2), 'lbf/in²');
  const depth = wellRes.depth, annOk = isFinite(na) && na > 0 && annTot > 0, ecd = depth > 0 && annOk ? mw + annTot / (0.052 * depth) : NaN;
  const calcTot = surf + pipeTot + (isFinite(dpb) ? dpb : 0) + (annOk ? annTot : 0), rest = spp > 0 ? spp - calcTot : NaN;
  if (okRheo) {
    o += '<div class="sp"></div><h3>Basınç dağılımı</h3>' + (surfL ? row('Yüzey ekipmanı', f(surf, 0), 'psi') : '') + pipeRows + row('Dizi içi toplam', f(pipeTot, 0), 'psi')
      + row('Bit', f(dpb, 0), 'psi') + (annOk ? row('Anülüs', f(annTot, 0), 'psi') : '') + row('Hesaplanan toplam', f(calcTot, 0), 'psi', true);
    if (spp > 0) o += row('Ölçülen sirk. basıncı', f(spp, 0), 'psi') + row('Fark (motor, MWD, hesap dışı)', f(rest, 0), 'psi')
      + (rest < 0 ? err('Hesaplanan kayıplar sirkülasyon basıncından büyük; debiyi, nozzle ve dizi bilgilerini kontrol et.') : '');
    if (annOk && depth > 0) o += '<div class="sp"></div>' + row('ECD', fd(ecd), dLbl(), true) + row('', isPcf() ? f(ecd, 2) : f(ecd * PCF, 1), isPcf() ? 'ppg' : 'lb/ft³')
      + row('Hesaptaki derinlik', f(fromFt(depth), 0), unit() + ' (düşey varsayıldı)');
    else o += '<p class="note" style="color:#93A1AB">ECD için θ100 ve θ3 değerlerini, ayrıca Kuyu Hacmi bölümlerini gir.</p>';
  }
  if (annRows) o += '<div class="sp"></div><h3>Anülüs hızı ve taşıma oranı</h3>' + annRows
    + row('En düşük anülüs hızı', f(avMin, 0), 'ft/dk') + (isFinite(teMin) && teMin < Infinity ? row('En düşük taşıma oranı', f(teMin, 0), '%', true) : '')
    + row('CCI', f(cci, 2), cci >= 1 ? 'iyi temizlik' : 'yetersiz (<1)');
  else o += '<p class="note" style="color:#93A1AB">Anülüs hızları için Kuyu Hacmi bölümlerini gir.</p>';
  $('r-hidr').innerHTML = o;
}
/* =========================================================
   KATI ANALİZİ (tuz düzeltmeli retort)
   ========================================================= */
function calcKati() {
  const mw = nd('k-mw'), vw = n('k-water') || 0, vo = n('k-oil') || 0, vg = n('k-gly') || 0, kclw = n('k-kcl') || 0, cl = n('k-cl') || 0, ca = n('k-ca') || 0, th = n('k-th') || 0,
    mbt = n('k-mbt') || 0, pf = n('k-pf') || 0, pm = n('k-pm'), hgs = n('k-hgs') || 4.2, lgs = n('k-lgs') || 2.6, so = n('k-sgo') || 0.84, sgg = n('k-sgg') || 1.09, bcec = n('k-bcec') || 65, dcec = n('k-dcec') || 0;
  const h = '<h3>Sonuç</h3>';
  if (!(mw > 0) || !(vw > 0)) return $('r-kati').innerHTML = h + err('Çamur ağırlığı ve retort su yüzdesini gir.');
  const kclSG = kclw === 0 ? 1 : kclw <= 5 ? 0.9985 + 6.3 * kclw / 1000 : kclw <= 10 ? 0.997334 + 6.6 * kclw / 1000 : 0.9954 + 6.8 * kclw / 1000;
  const kcl = 10000 * kclw * kclSG, clKcl = 0.47554 * kcl, mg = th > ca ? (th - ca) * 243 / 400 : 0;
  const clCa = 1.769112 * ca, clMg = 2.91734 * mg, clNa = Math.max(0, cl - clKcl - clCa - clMg);
  const check = cl > 0 && (clKcl > cl || clKcl + clCa > cl || clKcl + clCa + clMg > cl);
  const nacl = 1.64846 * clNa, cacl2 = 2.7691 * ca, mgcl2 = 3.91734 * mg;
  const rf = 1 + (6.45 * nacl + 5.845 * kcl + 7.6 * cacl2 + 7.5 * mgcl2) * 1e-7, vif = 1 / (rf - (kcl + nacl + cacl2 + mgcl2) * 1e-6);
  const vwc = vif * vw, vs = 100 - vo - vg - vwc;
  const avgSG = vs > 0 ? (0.12 * mw - rf * vwc / 100 - so * vo / 100 - sgg * vg / 100) / (vs / 100) : NaN;
  const lg = (100 * rf + (hgs - rf) * vs - 12 * mw - (rf - so) * vo - (rf - sgg) * vg) / (hgs - lgs), hg = vs - lg;
  const cecAvg = lg > 0 ? 7.69 * mbt / lg : NaN, bent = lg > 0 && mbt > 0 && bcec > dcec ? Math.max(0, lg * (cecAvg - dcec) / (bcec - dcec)) : NaN, ds = isFinite(bent) ? lg - bent : NaN;
  const lime = isFinite(pm) && pm > 0 ? 0.26 * (pm - vw / 100 * pf) : NaN;
  $('r-kati').innerHTML = h + row('Düzeltilmiş katı', f(vs, 2), '% hacim', true) + row('Ortalama katı SG', f(avgSG, 2), '')
    + row('Hafif katı (LGS)', f(lg, 2), '% hacim') + row('', f(3.5 * lgs * lg, 1), 'ppb')
    + row('Ağır katı (HGS)', f(hg, 2), '% hacim') + row('', f(3.5 * hgs * hg, 1), 'ppb')
    + (isFinite(bent) ? row('Bentonit', f(bent, 2), '% hacim') + row('', f(9.1 * bent, 1), 'ppb') + row('Kesinti katısı', f(ds, 2), '% hacim') + row('', f(3.5 * lgs * ds, 1), 'ppb') : '')
    + (lg < 0 || hg < 0 ? err('Negatif katı çıktı: retort, yoğunluk ve tuz değerlerini kontrol et.') : '')
    + '<div class="sp"></div><h3>Filtrat</h3>' + row('Filtrat yoğunluğu', f(rf, 4), 'g/cm³') + row('Hacim düzeltme (VIF)', f(vif, 4), '') + row('Düzeltilmiş su', f(vwc, 2), '% hacim')
    + row('KCl', f(kcl, 0), 'mg/L') + row('', f(3.5e-4 * kcl, 1), 'ppb') + row('NaCl', f(nacl, 0), 'mg/L') + row('', f(3.5e-4 * nacl, 1), 'ppb')
    + row('Magnezyum', f(mg, 1), 'mg/L') + (isFinite(lime) ? row('Depo kireç', f(lime, 2), 'ppb') : '')
    + (check ? err('Klorür, KCl ve sertlikten gelen klorürü karşılamıyor; değerleri kontrol et.') : '');
}
$('k-fill').onclick = () => {
  const last = sortedReps().slice(-1)[0]; if (!last) { toast('Kayıtlı ölçüm yok.'); return; }
  const map = { 'k-mw': 'mw', 'k-water': 'water', 'k-oil': 'oil', 'k-kcl': 'kcl', 'k-cl': 'cl', 'k-ca': 'ca', 'k-th': 'th', 'k-mbt': 'mbt', 'k-pf': 'pf', 'k-pm': 'pm' };
  let c = 0; Object.entries(map).forEach(([id, k]) => { const v = last.v[k]; if (v != null && isFinite(v)) { $(id).value = k === 'mw' ? round(fromPpg(v), isPcf() ? 1 : 2) : v; W().vals[id] = $(id).value; c++; } });
  save(); calcAll(); toast(c ? `${c} değer ${fmtDate(last.time)} ölçümünden alındı` : 'Son ölçümde bu değerler yok.');
};
/* =========================================================
   GÜNLÜK HACİM DENGESİ
   ========================================================= */
function balNow() {
  const w = W(), d = w.balDraft || {}, t = tankTotals(), hole = wellRes.pipe + wellRes.ann, last = (w.balances || []).slice(-1)[0];
  const v = k => { const x = num(d[k]); return isFinite(x) ? x : 0; };
  const start = d.start !== undefined && d.start !== '' && isFinite(num(d.start)) ? num(d.start) : last ? last.end : NaN;
  const end = t.active + t.reserve + hole, loss = v('surf') + v('dump') + v('dh');
  return { start, startAuto: !(d.start !== undefined && d.start !== '') && !!last, built: v('built'), surf: v('surf'), dump: v('dump'), dh: v('dh'), loss, hole, active: t.active, reserve: t.reserve, end,
    expected: start + v('built') - loss, diff: end - (start + v('built') - loss) };
}
function renderBalance(light) {
  if (!$('balOut')) return;
  const w = W(), d = w.balDraft || {}, b = balNow();
  if (!light) document.querySelectorAll('#balIn input').forEach(i => { if (document.activeElement !== i) i.value = d[i.dataset.bk] ?? (i.dataset.bk === 'start' ? '' : '0'); });
  $('bal-start').placeholder = b.startAuto ? `${f(b.start, 1)} (son kayıt)` : 'ilk gün: elle gir';
  const totDh = (w.balances || []).reduce((a, x) => a + (+x.dh || 0), 0) + b.dh;
  $('balOut').innerHTML = `<div><span>Kuyu içi (dizili)</span><b>${f(b.hole, 1)} bbl</b></div><div><span>Aktif tanklar</span><b>${f(b.active, 1)} bbl</b></div><div><span>Rezerv tanklar</span><b>${f(b.reserve, 1)} bbl</b></div>`
    + `<div><span>Son toplam</span><b>${f(b.end, 1)} bbl</b></div><div><span>Toplam kayıp</span><b>${f(b.loss, 1)} bbl</b></div><div><span>Beklenen</span><b>${f(b.expected, 1)} bbl</b></div>`
    + `<div><span>Fark (ölçülen − beklenen)</span><b>${isFinite(b.diff) ? `<span class="chip ${Math.abs(b.diff) <= 5 ? 'ok' : 'hi'}">${b.diff >= 0 ? '+' : ''}${f(b.diff, 1)}</span>` : '—'}</b></div><div><span>Kümülatif kaçak</span><b>${f(totDh, 1)} bbl</b></div>`;
  const hs = w.balances || [];
  $('balHist').innerHTML = `<tr><th>Tarih</th><th class="n">Başlangıç</th><th class="n">Hazırlanan</th><th class="n">Yüzey</th><th class="n">Atılan</th><th class="n">Kaçak</th><th class="n">Son toplam</th><th class="n">Fark</th><th></th></tr>`
    + (hs.length ? [...hs].map((x, i) => ({ x, i })).reverse().map(({ x, i }) => `<tr><td>${fmtDate(x.t)}</td><td class="n">${f(x.start, 1)}</td><td class="n">${f(x.built, 1)}</td><td class="n">${f(x.surf, 1)}</td><td class="n">${f(x.dump, 1)}</td><td class="n">${f(x.dh, 1)}</td><td class="n">${f(x.end, 1)}</td><td class="n">${f(x.diff, 1)}</td><td><button class="btn ghost" data-delb="${i}">Sil</button></td></tr>`).join('')
      : '<tr><td colspan="9" style="padding:14px;color:var(--muted)">Kayıt yok.</td></tr>');
}
$('balIn').addEventListener('input', e => { const i = e.target; if (!i.dataset.bk) return; const w = W(); w.balDraft = w.balDraft || {}; w.balDraft[i.dataset.bk] = i.value; save(); renderBalance(true); });
$('balSave').onclick = () => {
  const w = W(), b = balNow(); if (!isFinite(b.start)) { toast('Başlangıç toplamını gir.'); return; }
  w.balances = w.balances || [];
  w.balances.push({ t: new Date().toISOString(), start: round(b.start, 1), built: b.built, surf: b.surf, dump: b.dump, dh: b.dh, hole: round(b.hole, 1), active: round(b.active, 1), reserve: round(b.reserve, 1), end: round(b.end, 1), diff: round(b.diff, 1) });
  w.balDraft = {}; save(); renderBalance(); toast('Günlük hacim dengesi kaydedildi');
};
$('balHist').addEventListener('click', e => { const d = e.target.dataset.delb; if (d != null && confirm('Bu kayıt silinsin mi?')) { W().balances.splice(+d, 1); save(); renderBalance(); } });
/* =========================================================
   KİMYASAL ETKİSİ (tahmini)
   ========================================================= */
const EP = [
  { k: 'mw', n: 'Yoğunluk', dens: true }, { k: 'fv', n: 'Huni vis.', u: 'sn/qt', d: 0 }, { k: 'pv', n: 'PV', u: 'cP', d: 0 }, { k: 'yp', n: 'YP', u: 'lb/100ft²', d: 0 },
  { k: 'g10s', n: 'Jel 10 sn', u: 'lb/100ft²', d: 0 }, { k: 'g10m', n: 'Jel 10 dk', u: 'lb/100ft²', d: 0 }, { k: 'fl', n: 'API filtrat', u: 'ml/30dk', d: 1 },
  { k: 'ph', n: 'pH', u: '', d: 1 }, { k: 'pf', n: 'Pf', u: 'ml', d: 2 }, { k: 'mbt', n: 'MBT', u: 'ppb', d: 1 }, { k: 'sol', n: 'Katı', u: '%', d: 1 },
  { k: 'cl', n: 'Klorür', u: 'mg/L', d: 0 }, { k: 'ca', n: 'Kalsiyum', u: 'mg/L', d: 0 }, { k: 'th', n: 'Top. sertlik', u: 'mg/L', d: 0 }, { k: 'kcl', n: 'KCl', u: '% ağ.', d: 2 }
];
const EFK = ['pv', 'yp', 'fv', 'g10s', 'g10m', 'fl', 'ph', 'pf', 'mbt', 'cl', 'ca', 'kcl'];
const EFN = { pv: 'PV', yp: 'YP', fv: 'FV', g10s: 'Jel10s', g10m: 'Jel10d', fl: 'Filtrat', ph: 'pH', pf: 'Pf', mbt: 'MBT', cl: 'Cl', ca: 'Ca', kcl: 'KCl%' };
const EFF_DEFAULT = () => [
  { id: 'barit', n: 'Barit', sg: 4.2, kg: 1500, solid: true, rx: 'barit|barite', e: { pv: 0.1 } },
  { id: 'caco3', n: 'CaCO₃ (ince/orta)', sg: 2.7, kg: 1000, solid: true, rx: 'caco3|kalsiyum karbonat|kalsit', e: { pv: 0.1 } },
  { id: 'bent', n: 'Bentonit', sg: 2.6, kg: 1000, solid: true, rx: 'bentonit', e: { pv: 0.7, yp: 1.5, fv: 2, g10s: 0.4, g10m: 0.8, fl: -0.4, mbt: 1 } },
  { id: 'xcd', n: 'XCD', sg: 1.5, kg: 25, rx: 'xcd|xc polimer|ksantan|xanthan', e: { pv: 3, yp: 14, fv: 35, g10s: 6, g10m: 8 } },
  { id: 'pacr', n: 'PAC R', sg: 1.6, kg: 25, rx: 'pac[ -]?r\\b|pac[ -]?reg', e: { pv: 5, yp: 6, fv: 12, g10s: 1, g10m: 1, fl: -3 } },
  { id: 'paclv', n: 'PAC LV', sg: 1.6, kg: 25, rx: 'pac[ -]?lv', e: { pv: 4, yp: 1, fv: 4, fl: -3 } },
  { id: 'cmc', n: 'CMC LV', sg: 1.6, kg: 25, rx: 'cmc', e: { pv: 3, yp: 0.5, fv: 3, fl: -2.5 } },
  { id: 'nisasta', n: 'Modifiye nişasta', sg: 1.5, kg: 25, rx: 'ni[sş]asta|starch', e: { pv: 1.5, yp: 0.5, fv: 2, fl: -1.5 } },
  { id: 'kostik', n: 'Kostik soda', sg: 2.13, kg: 25, rx: 'kostik|caustic|naoh', e: { ph: 2, pf: 2.5 } },
  { id: 'soda', n: 'Soda külü', sg: 2.5, kg: 25, rx: 'soda k[uü]l|soda ash|na2co3', e: { ca: -1077, ph: 0.3 } },
  { id: 'bikarb', n: 'Sodyum bikarbonat', sg: 2.2, kg: 25, rx: 'bikarbonat|bicarb|nahco3', e: { ca: -1359, ph: -0.2 } },
  { id: 'sitrik', n: 'Sitrik asit', sg: 1.66, kg: 25, rx: 'sitrik|citric', e: { ph: -2, pf: -1.5 } },
  { id: 'kcl', n: 'KCl', sg: 1.98, kg: 1000, rx: '^kcl|potasyum klor', e: { cl: 1357, kcl: 0.28 } },
  { id: 'nacl', n: 'NaCl (tuz)', sg: 2.16, kg: 1000, rx: 'nacl|sodyum klor|^tuz', e: { cl: 1731 } },
  { id: 'lcm', n: 'Kaçak selülozu / mika', sg: 1.5, kg: 25, solid: true, rx: 'sel[uü]loz|mica|mika|lcm', e: { pv: 0.2, fv: 0.5 } }
];
const effLib = () => { if (!Array.isArray(DB.effLib)) DB.effLib = EFF_DEFAULT(); return DB.effLib; };
const effOf = id => effLib().find(c => c.id === id);
function effStock(c) { // kimyasala uyan stok kalemi
  if (!c) return null; let re = null; try { re = new RegExp(c.rx || '^$', 'i'); } catch (e) {}
  const nm = (c.n || '').toLocaleLowerCase('tr-TR');
  return W().stock.find(s => (re && re.test(s.name)) || s.name.toLocaleLowerCase('tr-TR') === nm) || null;
}
const effPkg = c => { const s = effStock(c); return s ? { kg: +s.kg || 1, unit: s.unit, s } : { kg: +c.kg || 25, unit: (+c.kg || 25) >= 500 ? 'big bag' : 'torba', s: null }; };
const effCur = () => { const w = W(); w.effCur = w.effCur || {}; return w.effCur; };
const effLines = () => { const w = W(); if (!Array.isArray(w.effLines)) w.effLines = [{ cid: 'paclv', amt: 4, u: 'pkg' }, { cid: 'xcd', amt: 2, u: 'pkg' }]; return w.effLines; };
const effTgt = () => { const w = W(); w.effTgt = w.effTgt || {}; return w.effTgt; };
const epOut = (p, v) => p.dens ? fromPpg(v) : v, epD = p => p.dens ? (isPcf() ? 1 : 2) : p.d, epU = p => p.dens ? dLbl() : p.u;
/* tahmin modeli: önce kimyasallar (V bbl'ye göre ppb), sonra su ile seyreltme */
function effProject(cur, V, adds, water) {
  const out = { ...cur }, sum = {}; let gal = 42 * V, mass = isFinite(cur.mw) ? cur.mw * gal : NaN, solB = isFinite(cur.sol) ? cur.sol / 100 * V : NaN;
  adds.forEach(({ c, lb }) => {
    if (!c || !(lb > 0)) return; const ppb = lb / V;
    Object.entries(c.e || {}).forEach(([k, fk]) => { if (isFinite(+fk) && +fk) sum[k] = (sum[k] || 0) + (+fk) * ppb; });
    const g = lb / (8.33 * (+c.sg || 2)); gal += g; mass += lb; if (c.solid && isFinite(solB)) solB += g / 42;
  });
  Object.entries(sum).forEach(([k, d]) => {
    if (!isFinite(cur[k])) return;
    if (k === 'fl') out.fl = cur.fl > 0 ? cur.fl * Math.exp(d / cur.fl) : cur.fl;
    else out[k] = cur[k] + d;
  });
  if (isFinite(out.ca)) out.ca = Math.max(0, out.ca);
  if (isFinite(cur.th) && isFinite(cur.ca) && sum.ca) out.th = Math.max(0, cur.th + (out.ca - cur.ca));
  ['cl', 'pf', 'pv', 'yp', 'fv', 'g10s', 'g10m', 'mbt', 'kcl'].forEach(k => { if (isFinite(out[k])) out[k] = Math.max(0, out[k]); });
  if (isFinite(out.ph)) out.ph = Math.min(13.5, Math.max(2, out.ph));
  if (isFinite(out.fv)) out.fv = Math.max(26, out.fv);
  if (isFinite(mass)) out.mw = mass / gal;
  const Vc = gal / 42; if (isFinite(solB)) out.sol = solB / Vc * 100;
  if (water > 0) {
    const r = Vc / (Vc + water), r2 = r * r;
    if (isFinite(out.mw)) out.mw = (out.mw * gal + 8.33 * 42 * water) / (gal + 42 * water);
    ['mbt', 'cl', 'ca', 'th', 'kcl', 'sol', 'pf'].forEach(k => { if (isFinite(out[k])) out[k] *= r; });
    ['yp', 'g10s', 'g10m'].forEach(k => { if (isFinite(out[k])) out[k] *= r2; });
    if (isFinite(out.pv)) out.pv = 1 + (out.pv - 1) * r2;
    if (isFinite(out.fv)) out.fv = 26 + (out.fv - 26) * r2;
    if (isFinite(out.fl)) out.fl = out.fl / r;
    gal += 42 * water;
  }
  return { out, vol: gal / 42 };
}
function effReadCur() {
  const c = effCur(), cur = {};
  EP.forEach(p => { const v = num(c[p.k]); if (isFinite(v)) cur[p.k] = v; }); // mw içeride ppg
  return cur;
}
function renderEtkiInputs() {
  const c = effCur(), t = effTgt(), lib = effLib(), rev = $('e-mode').value === 'rev';
  $('e-fwdBox').hidden = rev; $('e-revBox').hidden = !rev;
  const val = (p, v) => v == null || v === '' || !isFinite(num(v)) ? '' : p.dens ? round(fromPpg(num(v)), isPcf() ? 1 : 2) : v;
  $('e-cur').innerHTML = EP.map(p => `<label>${p.n} <small>${epU(p) ? '(' + epU(p) + ')' : ''}</small><input data-ec="${p.k}" type="text" inputmode="decimal" value="${val(p, c[p.k])}"></label>`).join('');
  $('e-tgt').innerHTML = EP.map(p => `<label>${p.n} <small>${epU(p) ? '(' + epU(p) + ')' : ''}</small><input data-et="${p.k}" type="text" inputmode="decimal" placeholder="${c[p.k] != null && c[p.k] !== '' ? 'şu an ' + val(p, c[p.k]) : ''}" value="${val(p, t[p.k])}"></label>`).join('');
  $('e-lines').innerHTML = effLines().map((l, i) => l.water ? `
    <div class="sec"><div class="sec-h"><b>Su ile seyreltme</b><button class="btn ghost" data-edel="${i}">Sil</button></div>
      <div class="grid"><label>Su <small>(bbl)</small><input data-ei="${i}" data-ek="amt" type="text" inputmode="decimal" value="${l.amt ?? ''}"></label></div></div>` : `
    <div class="sec"><div class="sec-h"><b>${i + 1}. kimyasal</b><button class="btn ghost" data-edel="${i}">Sil</button></div>
      <div class="grid">
        <label>Kimyasal<select data-ei="${i}" data-ek="cid">${lib.map(c => `<option value="${c.id}"${c.id === l.cid ? ' selected' : ''}>${esc(c.n)}</option>`).join('')}</select></label>
        <label>Miktar<input data-ei="${i}" data-ek="amt" type="text" inputmode="decimal" value="${l.amt ?? ''}"></label>
        <label>Birim<select data-ei="${i}" data-ek="u"><option value="pkg"${l.u === 'pkg' ? ' selected' : ''}>${esc(effPkg(effOf(l.cid) || lib[0]).unit)} (${f(effPkg(effOf(l.cid) || lib[0]).kg, 0)} kg)</option><option value="kg"${l.u === 'kg' ? ' selected' : ''}>kg</option><option value="ppb"${l.u === 'ppb' ? ' selected' : ''}>ppb</option></select></label>
      </div></div>`).join('') || '<p class="note">Kimyasal satırı ekle.</p>';
  renderEffLib();
}
function renderEffLib() {
  if (!$('e-libBox').open) return;
  $('e-lib').innerHTML = `<tr><th>Kimyasal</th><th class="n">SG</th><th class="n">Ambalaj kg</th><th>Katı</th>${EFK.map(k => `<th class="n">${EFN[k]}</th>`).join('')}<th></th></tr>`
    + effLib().map((c, i) => `<tr><td><input data-li="${i}" data-lk="n" type="text" value="${esc(c.n)}" style="min-width:130px"></td>
      <td><input data-li="${i}" data-lk="sg" type="text" inputmode="decimal" value="${c.sg ?? ''}" style="min-width:56px;width:60px"></td>
      <td><input data-li="${i}" data-lk="kg" type="text" inputmode="decimal" value="${c.kg ?? ''}" style="min-width:64px;width:70px"></td>
      <td><input data-li="${i}" data-lk="solid" type="checkbox"${c.solid ? ' checked' : ''} style="width:auto;min-width:0"></td>
      ${EFK.map(k => `<td><input data-li="${i}" data-lk="e.${k}" type="text" inputmode="decimal" value="${c.e && c.e[k] != null ? c.e[k] : ''}" style="min-width:58px;width:64px"></td>`).join('')}
      <td><button class="btn ghost" data-ldel="${i}">Sil</button></td></tr>`).join('');
}
$('e-libBox').addEventListener('toggle', renderEffLib);
$('e-lib').addEventListener('change', e => {
  const i = e.target.dataset.li, k = e.target.dataset.lk; if (i == null) return; const c = effLib()[i];
  if (k === 'n') c.n = e.target.value; else if (k === 'solid') c.solid = e.target.checked;
  else if (k.startsWith('e.')) { const v = num(e.target.value); c.e = c.e || {}; if (isFinite(v)) c.e[k.slice(2)] = v; else delete c.e[k.slice(2)]; }
  else { const v = num(e.target.value); if (isFinite(v)) c[k] = v; }
  save(); renderEtkiInputs(); calcEtki();
});
$('e-lib').addEventListener('click', e => { const i = e.target.dataset.ldel; if (i == null) return; const c = effLib()[i]; if (!confirm(`"${c.n}" katsayı listesinden silinsin mi?`)) return; effLib().splice(+i, 1); save(); renderEtkiInputs(); calcEtki(); });
$('e-libAdd').onclick = () => { effLib().push({ id: 'u' + uid(), n: 'Yeni kimyasal', sg: 1.5, kg: 25, rx: '', e: {} }); save(); renderEffLib(); };
$('e-libReset').onclick = () => { if (!confirm('Tüm etki katsayıları varsayılan değerlere dönsün mü?')) return; DB.effLib = EFF_DEFAULT(); save(); renderEtkiInputs(); calcEtki(); };
$('e-cur').addEventListener('input', e => { const k = e.target.dataset.ec; if (!k) return; const p = EP.find(x => x.k === k), v = num(e.target.value); effCur()[k] = isFinite(v) ? (p.dens ? toPpg(v) : v) : ''; save(); calcEtki(); });
$('e-tgt').addEventListener('input', e => { const k = e.target.dataset.et; if (!k) return; const p = EP.find(x => x.k === k), v = num(e.target.value); effTgt()[k] = isFinite(v) ? (p.dens ? toPpg(v) : v) : ''; save(); calcEtki(); });
$('e-lines').addEventListener('input', e => { const d = e.target.dataset; if (d.ei == null) return; const l = effLines()[d.ei]; l[d.ek] = d.ek === 'amt' ? num(e.target.value) : e.target.value; save(); if (d.ek === 'cid') renderEtkiInputs(); calcEtki(); });
$('e-lines').addEventListener('change', e => { const d = e.target.dataset; if (d.ek === 'cid' || d.ek === 'u') { effLines()[d.ei][d.ek] = e.target.value; save(); renderEtkiInputs(); calcEtki(); } });
$('e-lines').addEventListener('click', e => { const i = e.target.dataset.edel; if (i == null) return; effLines().splice(+i, 1); save(); renderEtkiInputs(); calcEtki(); });
$('e-add').onclick = () => { effLines().push({ cid: effLib()[0].id, amt: 1, u: 'pkg' }); save(); renderEtkiInputs(); calcEtki(); };
$('e-water').onclick = () => { if (effLines().some(l => l.water)) { toast('Su satırı zaten var.'); return; } effLines().push({ water: true, amt: 20 }); save(); renderEtkiInputs(); calcEtki(); };
$('e-mode').addEventListener('change', () => { renderEtkiInputs(); });
$('e-vsrc').addEventListener('change', () => {
  const v = $('e-vsrc').value; if (!v) return; const t = tankTotals(), hole = wellRes.pipe + wellRes.ann;
  const vol = v === 'active' ? t.active + hole : v === 'sys' ? t.active + t.reserve + hole : v === 'tanks' ? t.active : custVal();
  if (!(vol > 0)) { toast(v === 'cust' ? 'Özel toplam henüz ayarlanmadı (Tanklar sekmesi).' : 'Bu hacim şu an 0.'); return; }
  $('e-v').value = round(vol, 1); W().vals['e-v'] = $('e-v').value; save(); calcAll();
});
function effFill(quiet) {
  const last = sortedReps().slice(-1)[0]; if (!last) { if (!quiet) toast('Kayıtlı ölçüm yok.'); return; }
  const c = effCur(); let k = 0; EP.forEach(p => { const v = last.v[p.k]; if (v != null && isFinite(v)) { c[p.k] = v; k++; } });
  save(); renderEtkiInputs(); calcEtki(); if (!quiet) toast(k ? `${k} değer ${fmtDate(last.time)} ölçümünden alındı` : 'Son ölçümde bu değerler yok.');
}
$('e-fill').onclick = () => effFill(false);
let effPlan = [];
function effAdds(V) {
  effPlan = []; let water = 0;
  const adds = effLines().map(l => {
    if (l.water) { water += +l.amt > 0 ? +l.amt : 0; return null; }
    const c = effOf(l.cid); if (!c || !(+l.amt > 0)) return null; const pk = effPkg(c);
    const kg = l.u === 'ppb' ? +l.amt * V * LB_KG : l.u === 'kg' ? +l.amt : +l.amt * pk.kg, lb = kg / LB_KG;
    effPlan.push({ c, kg, units: pk.s ? kg / pk.kg : null, pk });
    return { c, lb };
  }).filter(Boolean);
  return { adds, water };
}
const epFmt = (p, v) => isFinite(v) ? f(epOut(p, v), epD(p)) : '—';
function effDiffRows(cur, out, onlyK) {
  return EP.filter(p => isFinite(cur[p.k]) && isFinite(out[p.k]) && p.k !== onlyK).map(p => {
    const d = out[p.k] - cur[p.k], tiny = Math.abs(epOut(p, d)) < Math.pow(10, -epD(p)) / 2;
    return tiny ? null : { p, d };
  }).filter(Boolean);
}
function calcEtki() {
  if (!$('r-etki')) return;
  const V = n('e-v'), cur = effReadCur(), rev = $('e-mode').value === 'rev';
  if (!(V > 0)) return $('r-etki').innerHTML = '<h3>Sonuç</h3>' + err('Çamur hacmini gir.');
  if (!Object.keys(cur).length) return $('r-etki').innerHTML = '<h3>Sonuç</h3>' + err('Mevcut çamur değerlerini gir veya "Son ölçümden doldur"a bas.');
  if (!rev) {
    const { adds, water } = effAdds(V), r = effProject(cur, V, adds, water);
    let o = '<h3>Tahmini yeni çamur</h3>';
    o += EP.filter(p => isFinite(cur[p.k])).map(p => {
      const a = cur[p.k], b = r.out[p.k], d = b - a, show = Math.abs(epOut(p, d)) >= Math.pow(10, -epD(p)) / 2;
      return `<div class="row${show ? ' big' : ''}"><span class="k">${p.n}</span><span class="v">${show ? `<em style="margin:0 6px 0 0">${epFmt(p, a)} →</em>` : ''}${epFmt(p, b)}<em>${epU(p)}${show ? ` · ${d > 0 ? '+' : ''}${f(epOut(p, d), epD(p))}` : ''}</em></span></div>`;
    }).join('');
    o += '<div class="sp"></div><h3>Malzeme</h3>';
    let short = 0;
    o += effPlan.map(x => { const lowS = x.pk.s && +x.pk.s.qty < x.units - 1e-9; if (lowS) short++;
      return row(`${esc(x.c.n)} ${x.pk.s ? `<span class="tag" style="${lowS ? 'color:#F08B73' : ''}">stok ${f(x.pk.s.qty, 0)}</span>` : ''}`, f(x.kg, 0), `kg · ${f(x.kg / LB_KG / V, 2)} ppb${x.pk.s ? ` · ${f(x.units, x.units % 1 ? 1 : 0)} ${esc(x.pk.unit)}` : ` · ${f(x.kg / x.pk.kg, 1)} ${x.pk.unit}`}`); }).join('') || '<p class="note" style="color:#93A1AB">Kimyasal yok.</p>';
    if (water) o += row('Su', f(water, 1), 'bbl');
    o += row('Son hacim', f(r.vol, 1), 'bbl') + (short ? err(`${short} kimyasalda stok yetersiz.`) : '');
    o += `<div class="btns"><button class="btn" id="e-use"${effPlan.some(x => x.pk.s) ? '' : ' disabled'}>Stoktan düş</button></div>
      <p class="note" style="color:#93A1AB">Tahmindir. Ekledikten ve çamur bir devir döndükten sonra ölç; fark çıkarsa katsayıları düzelt.</p>`;
    $('r-etki').innerHTML = o;
    $('e-use').onclick = () => {
      const list = effPlan.filter(x => x.pk.s && x.units > 0); if (!list.length) return;
      if (!confirm('Şu kullanımlar stoktan düşülsün mü?\n' + list.map(x => `• ${x.pk.s.name}: ${round(x.units, 2)} ${x.pk.unit}`).join('\n'))) return;
      list.forEach(x => stockUse(x.pk.s.id, round(x.units, 2), `Kimyasal ilavesi · ${f(V, 0)} bbl`)); fillStockSelects(); toast('Stoktan düşüldü'); calcEtki();
    };
    return;
  }
  // ters hesap: hedef için gereken
  const tg = effTgt(); let o = '<h3>Gereken ilave (tahmini)</h3>', any = false;
  EP.forEach(p => {
    const t = num(tg[p.k]), a = cur[p.k]; if (!isFinite(t)) return;
    any = true;
    if (!isFinite(a)) { o += `<h3 style="margin-top:14px">${p.n}</h3>` + err('Mevcut değeri gir.'); return; }
    const D = t - a; o += `<h3 style="margin-top:14px">${p.n}: ${epFmt(p, a)} → ${epFmt(p, t)} ${epU(p)}</h3>`;
    if (Math.abs(D) < 1e-9) { o += '<p class="note" style="color:#93A1AB">Zaten hedefte.</p>'; return; }
    const cands = [];
    if (p.k === 'mw') {
      if (D > 0) effLib().filter(c => c.solid && +c.sg >= 2.65 && !(+(c.e || {}).mbt) && 8.33 * c.sg > t).forEach(c => { const dm = 8.33 * c.sg, lb = V * 42 * dm * D / (dm - t); cands.push({ c, lb }); });
      else cands.push({ water: V * (a - t) / (t - 8.33) });
    } else {
      effLib().forEach(c => {
        let fk = +(c.e || {})[p.k === 'th' ? 'ca' : p.k]; if (!isFinite(fk) || !fk) return;
        if (p.k === 'fl') { if (fk < 0 && D < 0 && t > 0) cands.push({ c, lb: a * Math.log(t / a) / fk * V }); return; }
        if (Math.sign(fk) === Math.sign(D)) cands.push({ c, lb: D / fk * V });
      });
      if (D < 0) { // su ile seyreltme
        let r = NaN;
        if (['mbt', 'cl', 'ca', 'th', 'kcl', 'sol', 'pf'].includes(p.k)) r = t / a;
        else if (['yp', 'g10s', 'g10m'].includes(p.k)) r = Math.sqrt(t / a);
        else if (p.k === 'pv' && a > 1 && t > 1) r = Math.sqrt((t - 1) / (a - 1));
        else if (p.k === 'fv' && a > 26 && t > 26) r = Math.sqrt((t - 26) / (a - 26));
        if (r > 0 && r < 1) cands.push({ water: V * (1 / r - 1) });
      }
    }
    if (!cands.length) { o += `<p class="note" style="color:#93A1AB">Katsayı listesinde bunu ${D > 0 ? 'artıran' : 'düşüren'} kimyasal yok.${p.k === 'ph' && D < 0 ? ' pH düşürmek için sitrik asit veya bikarbonat satırını kontrol et.' : ''}</p>`; return; }
    cands.sort((x, y) => (x.water != null) - (y.water != null) || x.lb - y.lb);
    const chem = cands.filter(x => x.water == null), minLb = chem.length ? chem[0].lb : 0;
    const shown = [...chem.filter(x => x.lb <= minLb * 4).slice(0, 3), ...cands.filter(x => x.water != null)];
    shown.forEach(x => {
      const r = x.water != null ? effProject(cur, V, [], x.water) : effProject(cur, V, [{ c: x.c, lb: x.lb }], 0);
      const side = effDiffRows(cur, r.out, p.k).map(({ p: q, d }) => `${q.n} ${d > 0 ? '+' : ''}${f(epOut(q, d), epD(q))}`).join(' · ');
      if (x.water != null) { o += row('Su ile seyreltme', f(x.water, 1), 'bbl', true) + (side ? `<p class="note" style="color:#93A1AB;margin:2px 0 6px">Yan etki: ${side}</p>` : ''); return; }
      const kg = x.lb * LB_KG, pk = effPkg(x.c), units = kg / pk.kg;
      o += row(`${esc(x.c.n)}${pk.s ? ` <span class="tag">stok ${f(pk.s.qty, 0)}</span>` : ''}`, f(kg, 0), `kg · ${f(x.lb / V, 2)} ppb`, true)
        + row('', f(units, units < 10 ? 1 : 0), `${esc(pk.unit)} (${f(pk.kg, 0)} kg)`)
        + (side ? `<p class="note" style="color:#93A1AB;margin:2px 0 6px">Yan etki: ${side}</p>` : '');
    });
  });
  if (!any) o += '<p class="note" style="color:#93A1AB">Soldaki "İstenen değerler"e en az bir hedef yaz.</p>';
  else o += '<p class="note" style="color:#93A1AB">Her satır tek başına uygulandığındaki miktardır. Tahmindir; ilaveyi parça parça yapıp ölçerek ilerle.</p>';
  $('r-etki').innerHTML = o;
}
function calcTrip() {
  const od = n('t-od'), id = n('t-id'), cas = n('t-cas'), sl = toFt(n('t-sl')), ns = n('t-n') || 0, mw = nd('t-mw'),
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
    const ev = (p, v) => v == null || v === '' ? '' : p.dens ? +fromPpg(+v).toFixed(pD(p)) : v;
    const XP = ALLPROPS.filter(p => PROPS.includes(p) || reps.some(r => r.v[p.k] != null && r.v[p.k] !== ''));
    add('Çamur ölçümleri', [['Tarih', 'Derinlik (ft)', 'Numune', ...XP.map(p => `${p.n}${pU(p) ? ' (' + pU(p) + ')' : ''}`), 'Not'],
      ['Hedef (alt–üst)', '', '', ...XP.map(p => { const t = w.targets[p.k] || {}; return [ev(p, t.lo), ev(p, t.hi)].join('–'); }), ''],
      ...reps.map(r => [fmtDate(r.time), r.depth ? +(+r.depth).toFixed(0) : '', r.src || '', ...XP.map(p => ev(p, r.v[p.k])), r.note || ''])], [16, 11, 12, ...XP.map(() => 11), 30]);
    add('Stok', [['Kimyasal', 'Mevcut', 'Birim', 'kg/birim', 'Asgari', 'Durum'], ...w.stock.map(s => [s.name, +s.qty, s.unit, +s.kg, +s.min, +s.qty <= +s.min ? 'Sipariş ver' : 'Yeterli'])], [22, 10, 8, 10, 10, 12]);
    add('Stok hareketleri', [['Tarih', 'Kimyasal', 'İşlem', 'Miktar', 'Birim', 'Not'], ...w.stockLog.map(l => [fmtDate(l.t), l.item, l.kind, l.qty, l.unit, l.note])], [16, 20, 10, 10, 8, 30]);
    add('Tanklar', [['Tank', 'Bölme', 'Kullanım', 'Yöntem', 'Katsayılar', 'Seviye (cm)', 'Emiş (cm)', 'Hacim (bbl)', 'Emiş üstü (bbl)', `MW (${dLbl()})`],
      ...w.tanks.flatMap(t => t.comps.map(c => [t.name, c.name, USES[c.use], METHODS[c.method || 'dim'], methodTxt(c), +cmOf(c).toFixed(1), suctCm(c), +compVol(c).toFixed(1), +compUsable(c).toFixed(1), +c.mw ? +fromPpg(+c.mw).toFixed(2) : '']))], [16, 14, 10, 24, 26, 11, 9, 11, 13, 10]);
    const bs = w.balances || [];
    if (bs.length) add('Hacim dengesi', [['Tarih', 'Başlangıç (bbl)', 'Hazırlanan', 'Yüzey kaybı', 'Atılan', 'Kaçak', 'Kuyu içi', 'Aktif', 'Rezerv', 'Son toplam', 'Fark'],
      ...bs.map(x => [fmtDate(x.t), x.start, x.built, x.surf, x.dump, x.dh, x.hole, x.active, x.reserve, x.end, x.diff]), [], ['Toplam kaçak', '', '', '', '', bs.reduce((a, x) => a + (+x.dh || 0), 0)]], [16, 13, 11, 11, 9, 9, 10, 9, 9, 11, 8]);
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
  [calcHacim, calcPompa, calcAgir, calcSeyr, calcHid, calcKill, calcCim, calcHidr, calcTrip, calcHazir, calcKati, calcEtki].forEach(c => { try { c(); } catch (e) { console.error(e); } });
  try { renderHdrTot(); } catch (e) { console.error(e); }
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
    if (t === 'etki') { if (!Object.keys(effCur()).length && W().reports.length) effFill(true); renderEtkiInputs(); calcEtki(); }
    if (t === 'tally') renderTally();
  } catch (e) { console.error(e); }
}

load();
rebuildProps();
loadCalcInputs();
setDUnit(dunit(), false);
renderPropInputs();
setUnit(unit(), false);
showGroup(DB.group || 'kuyu');
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
