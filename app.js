'use strict';
/* ===== Utilidades ===== */
const KEY = 'serviciosCasas.v1';
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const FIELDS = [['agua','Agua'],['gas','Gas'],['luz','Luz'],['basura','Basura (incluida en luz)']];
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf = new Intl.NumberFormat('es-CO', {style:'currency', currency:'COP', maximumFractionDigits:0});
const fmt = n => nf.format(n || 0);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const label = k => { const [y, m] = k.split('-'); return MESES[m - 1] + ' ' + y; };
const sum = a => a.reduce((x, y) => x + y, 0);
const parseMoney = s => { const d = String(s).replace(/\D/g, ''); return d === '' ? null : parseInt(d, 10); };
const monthKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

/* ===== Cálculo ===== */
// Reparte un total entero según pesos; el residuo se asigna por mayor fracción (desempate: orden) => suma exacta.
function distribute(total, w) {
  const S = sum(w);
  if (!S) return w.map(() => 0);
  const base = w.map(x => Math.floor(total * x / S));
  let rem = total - sum(base);
  const order = w.map((x, i) => ({i, f: (total * x) % S})).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; rem > 0 && k < order.length; k++) if (w[order[k].i] > 0) { base[order[k].i]++; rem--; }
  return base;
}
function calcHouse(h) {
  const people = h.apts.map(a => a.people), P = sum(people), v = k => h.bills[k] || 0;
  const pending = FIELDS.filter(([k]) => h.bills[k] == null).map(f => f[1].split(' ')[0]);
  const billTotal = v('agua') + v('gas') + v('luz') + v('basura');
  if (!P) return {P:0, rows:[], billTotal, pending};
  const ag = distribute(v('agua'), people), ga = distribute(v('gas'), people);
  const lu = distribute(v('luz'), people), ba = distribute(v('basura'), people);
  const rows = h.apts.map((a, i) => ({a, agua:ag[i], gas:ga[i], luz:lu[i], bas:ba[i], luzb:lu[i] + ba[i], total:ag[i] + ga[i] + lu[i] + ba[i]}));
  const tot = k => sum(rows.map(r => r[k]));
  const totals = {agua:tot('agua'), gas:tot('gas'), luzb:tot('luzb'), total:tot('total')};
  const ok = totals.agua === v('agua') && totals.gas === v('gas') && totals.luzb === v('luz') + v('basura');
  return {P, rows, totals, billTotal, pending, ok, pp:{agua:v('agua')/P, gas:v('gas')/P, luzb:(v('luz')+v('basura'))/P}};
}

/* ===== Estado y persistencia ===== */
let state, corrupt = false, saveTimer, section = 'summary', warnedClosed = false;
const newHouses = () => [1, 2, 3].map(n => ({id:uid(), name:'Casa ' + n, apts:[], bills:{agua:null, gas:null, luz:null, basura:null}}));
const defaultState = () => { const k = monthKey(new Date()); return {version:1, current:k, periods:{[k]:{closed:false, savedAt:null, houses:newHouses()}}}; };
const cur = () => state.periods[state.current];

function validate(o) {
  if (!o || typeof o !== 'object' || !o.periods || typeof o.periods !== 'object') return 'Falta el objeto "periods".';
  const keys = Object.keys(o.periods);
  if (!keys.length) return 'El respaldo no contiene períodos.';
  if (typeof o.current !== 'string' || !o.periods[o.current]) return 'El período activo no existe en el respaldo.';
  for (const k of keys) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(k)) return `Período con formato inválido: ${k}.`;
    const p = o.periods[k];
    if (!p || !Array.isArray(p.houses)) return `El período ${k} no tiene casas.`;
    for (const h of p.houses) {
      if (!h || typeof h.id !== 'string' || typeof h.name !== 'string' || !Array.isArray(h.apts) || !h.bills) return `Casa inválida en ${k}.`;
      for (const a of h.apts) if (typeof a.id !== 'string' || !Number.isInteger(a.people) || a.people < 0) return `Apartamento inválido en ${h.name} (${k}).`;
      for (const [f] of FIELDS) { const x = h.bills[f]; if (x != null && (!Number.isInteger(x) || x < 0)) return `Importe inválido (${f}) en ${h.name} (${k}).`; }
    }
  }
  return null;
}
function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) { state = defaultState(); return; }
  try {
    const o = JSON.parse(raw), e = validate(o);
    if (e) throw new Error(e);
    state = o;
  } catch (err) {
    corrupt = true; state = defaultState();
    try { localStorage.setItem(KEY + '.corrupto', raw); } catch (_) {}
    showBanner('Los datos guardados están dañados (' + err.message + '). No se sobrescribirán hasta que importes un respaldo o restablezcas los datos. Copia de los datos dañados guardada aparte.');
  }
}
function setStatus(t) { $('#saveStatus').textContent = t; }
function save(now) {
  if (corrupt) return;
  setStatus('Guardando…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); setStatus('Guardado'); }
    catch (e) { setStatus('Error al guardar'); showBanner('No se pudo guardar en el navegador: ' + e.message); }
  }, now ? 0 : 300);
}
function showBanner(t) { $('#banner').innerHTML = t ? `<p class="warn" role="alert">${esc(t)}</p>` : ''; }

/* ===== Render ===== */
function renderPeriodSelect() {
  const ks = Object.keys(state.periods).sort().reverse();
  $('#periodSelect').innerHTML = ks.map(k => `<option value="${k}" ${k === state.current ? 'selected' : ''}>${label(k)}${state.periods[k].closed ? ' (cerrado)' : ''}</option>`).join('');
}
function renderSummary() {
  const hs = cur().houses, t = k => sum(hs.map(h => h.bills[k] || 0));
  const apts = sum(hs.map(h => h.apts.length)), ppl = sum(hs.map(h => sum(h.apts.map(a => a.people))));
  const st = (l, v) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`;
  $('#summary').innerHTML = `<p class="note">Período: <b>${label(state.current)}</b></p><div class="cards">
    ${st('Total de las casas', fmt(t('agua') + t('gas') + t('luz') + t('basura')))}${st('Total agua', fmt(t('agua')))}${st('Total gas', fmt(t('gas')))}
    ${st('Total luz (incluye basura)', fmt(t('luz') + t('basura')))}${st('Basura (informativo, ya en luz)', fmt(t('basura')))}
    ${st('Apartamentos', apts)}${st('Residentes', ppl)}</div>
    <div class="card"><h3>Total por casa</h3><div class="tablewrap"><table><thead><tr><th>Casa</th><th>Personas</th><th>Total recibos</th><th>Estado</th></tr></thead><tbody>
    ${hs.map(h => { const c = calcHouse(h); return `<tr><td>${esc(h.name)}</td><td>${c.P}</td><td class="tot">${fmt(c.billTotal)}</td><td>${!c.P ? 'Sin residentes' : c.pending.length ? 'Faltan: ' + c.pending.join(', ') : 'Completo'}</td></tr>`; }).join('')}
    </tbody></table></div></div>`;
}
function houseLive(h) {
  const c = calcHouse(h), v = k => h.bills[k] || 0;
  let out = `<div class="sumline"><span>Recibos (agua+gas+luz): <b>${fmt(v('agua') + v('gas') + v('luz'))}</b></span><span>Luz + basura: <b>${fmt(v('luz') + v('basura'))}</b></span><span>Total casa: <b>${fmt(c.billTotal)}</b></span></div>`;
  if (c.pending.length) out += `<p class="note">Pendientes: ${c.pending.join(', ')}</p>`;
  if (!c.P) return out + `<p class="warn">Esta casa no tiene residentes: el cálculo queda pendiente. Agrega personas en “Casas y apartamentos”.</p>`;
  out += `<div class="tablewrap"><table><thead><tr><th>Apartamento</th><th>Personas</th><th>Agua</th><th>Gas</th><th>Luz + basura</th><th>Total a pagar</th></tr></thead><tbody>
  ${c.rows.map(r => `<tr><td>${esc(r.a.name)}${r.a.people === 0 ? ' <span class="badge warn">Vacío</span>' : ''}</td><td>${r.a.people}</td><td>${fmt(r.agua)}</td><td>${fmt(r.gas)}</td><td>${fmt(r.luzb)}</td><td class="tot">${fmt(r.total)}</td></tr>`).join('')}
  </tbody><tfoot><tr><td>Total</td><td>${c.P}</td><td>${fmt(c.totals.agua)}</td><td>${fmt(c.totals.gas)}</td><td>${fmt(c.totals.luzb)}</td><td>${fmt(c.totals.total)}</td></tr></tfoot></table></div>
  <p class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✔ La suma distribuida coincide con los recibos.' : '✖ La suma distribuida no coincide con los recibos.'}</p>
  <details><summary>Ver detalle del cálculo</summary><div class="tablewrap"><table><thead><tr><th>Servicio</th><th>Valor a repartir</th><th>Personas</th><th>Costo por persona</th></tr></thead><tbody>
  <tr><td>Agua</td><td>${fmt(v('agua'))}</td><td>${c.P}</td><td>${fmt(Math.round(c.pp.agua))}</td></tr>
  <tr><td>Gas</td><td>${fmt(v('gas'))}</td><td>${c.P}</td><td>${fmt(Math.round(c.pp.gas))}</td></tr>
  <tr><td>Luz + basura</td><td>${fmt(v('luz') + v('basura'))}</td><td>${c.P}</td><td>${fmt(Math.round(c.pp.luzb))}</td></tr></tbody></table></div>
  <p class="note">Costo por persona = valor del servicio ÷ total de personas de la casa. Valor del apartamento = costo por persona × sus personas; el residuo de redondeo se asigna para que la suma sea exacta.</p></details>`;
  return out;
}
function renderBills() {
  $('#bills').innerHTML = cur().houses.map(h => `<article class="card"><div class="ph"><h3>${esc(h.name)}</h3><span class="badge">${label(state.current)}</span></div>
    <div class="fields">${FIELDS.map(([k, l]) => `<label class="fld ${h.bills[k] != null ? 'filled' : ''}"><span>${l}</span>
    <input class="money" inputmode="numeric" autocomplete="off" data-h="${h.id}" data-k="${k}" placeholder="$ 0" value="${h.bills[k] == null ? '' : fmt(h.bills[k])}"></label>`).join('')}</div>
    <p class="hint">Basura se suma a luz y se distribuye junto con ella; no se cobra dos veces.</p>
    <div data-live="${h.id}"></div></article>`).join('');
  renderLive();
}
function renderGrand() {
  const hs = cur().houses, v = k => sum(hs.map(h => h.bills[k] || 0));
  $('#grand').innerHTML = `<span>Período<br><b>${label(state.current)}</b></span><span>Total tres casas<br><b>${fmt(v('agua') + v('gas') + v('luz') + v('basura'))}</b></span>${state.periods[state.current].closed ? '<span>Período cerrado</span>' : ''}`;
}
function renderHouses() {
  const p = cur();
  $('#houses').innerHTML = (p.closed ? `<p class="warn">Este período está cerrado. Si cambias personas o apartamentos, se actualizará el cálculo de este período.</p>` : '') +
  p.houses.map(h => `<article class="card"><div class="ph"><div class="row" style="margin:0;flex:1"><label><span>Nombre de la casa</span><input type="text" data-hname="${h.id}" value="${esc(h.name)}"></label></div>
    <button class="danger" data-act="del-house" data-h="${h.id}">Eliminar casa</button></div>
    <p class="note">Residentes en la casa: <b data-pc="${h.id}">${sum(h.apts.map(a => a.people))}</b></p>
    ${h.apts.length ? '' : '<p class="note">Aún no hay apartamentos. Agrega el primero.</p>'}
    ${h.apts.map(a => `<div class="apt"><label><span>Apartamento</span><input type="text" data-h="${h.id}" data-a="${a.id}" data-f="name" value="${esc(a.name)}"></label>
      <label><span>Personas</span><input type="number" min="0" step="1" data-h="${h.id}" data-a="${a.id}" data-f="people" value="${a.people}"></label>
      <label class="full"><span>Nota (opcional)</span><input type="text" data-h="${h.id}" data-a="${a.id}" data-f="note" value="${esc(a.note || '')}"></label>
      <button class="danger" data-act="del-apt" data-h="${h.id}" data-a="${a.id}">Eliminar</button></div>`).join('')}
    <div class="actions"><button class="primary" data-act="add-apt" data-h="${h.id}">+ Agregar apartamento</button></div></article>`).join('');
}
function settleText(h, r) {
  const L = [`Liquidación de servicios — ${label(state.current)}`, `Casa: ${h.name}`, `Apartamento: ${r.a.name}`, `Personas: ${r.a.people}`, '',
    `Agua: ${fmt(r.agua)}`, `Gas: ${fmt(r.gas)}`, `Luz + basura: ${fmt(r.luzb)}`, `  (Luz: ${fmt(r.luz)} / Basura incluida: ${fmt(r.bas)})`, '', `TOTAL A PAGAR: ${fmt(r.total)}`];
  return L.join('\n');
}
function renderSettle() {
  const hs = cur().houses, el = $('#settle');
  if (!hs.length) { el.innerHTML = '<p class="warn">No hay casas.</p>'; return; }
  const hid = ($('#sh') && hs.some(h => h.id === $('#sh').value)) ? $('#sh').value : hs[0].id;
  const h = hs.find(x => x.id === hid), c = calcHouse(h);
  const aid = ($('#sa') && h.apts.some(a => a.id === $('#sa').value)) ? $('#sa').value : (h.apts[0] || {}).id;
  const r = c.rows.find(x => x.a.id === aid);
  el.innerHTML = `<div class="row controls"><label><span>Casa</span><select id="sh">${hs.map(x => `<option value="${x.id}" ${x.id === hid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <label><span>Apartamento</span><select id="sa">${h.apts.map(a => `<option value="${a.id}" ${a.id === aid ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label></div>` +
    (!r ? '<p class="warn">Selecciona una casa con apartamentos y personas para ver la liquidación.</p>' :
    `<div class="ticket" id="ticket"><h3>${esc(h.name)} — ${esc(r.a.name)}</h3>
    <div class="l"><span>Período</span><span>${label(state.current)}</span></div><div class="l"><span>Personas</span><span>${r.a.people}</span></div>
    <div class="l"><span>Agua</span><span>${fmt(r.agua)}</span></div><div class="l"><span>Gas</span><span>${fmt(r.gas)}</span></div>
    <div class="l"><span>Luz</span><span>${fmt(r.luz)}</span></div><div class="l sub"><span>Basura (desglose, incluida en luz)</span><span>${fmt(r.bas)}</span></div>
    <div class="l"><span>Luz + basura</span><span>${fmt(r.luzb)}</span></div>
    <div class="l total"><span>Total a pagar</span><span>${fmt(r.total)}</span></div></div>
    <div class="actions controls"><button class="primary" data-act="copy">Copiar liquidación</button><button data-act="print">Imprimir liquidación</button></div>`);
}
function renderHistory() {
  const ks = Object.keys(state.periods).sort().reverse(), next = new Date(); next.setMonth(next.getMonth() + 1);
  $('#history').innerHTML = `<div class="card"><h3>Nuevo período</h3><div class="row"><label><span>Mes</span><input type="month" id="npMonth" value="${monthKey(next)}"></label></div>
    <label><input type="checkbox" id="npStruct" checked> Copiar casas y apartamentos del período activo (${label(state.current)})</label><br>
    <label><input type="checkbox" id="npAmounts"> Copiar también los importes de los recibos</label>
    <div class="actions"><button class="primary" data-act="new-period">Crear período</button>
    <button data-act="toggle-close">${cur().closed ? 'Reabrir' : 'Cerrar'} período activo</button></div>
    <p class="note">Cada período guarda por separado recibos, personas y cálculos. Cerrar un período lo marca como confirmado.</p></div>
    <div class="card"><h3>Historial</h3><div class="tablewrap"><table><thead><tr><th>Período</th><th>Agua</th><th>Gas</th><th>Luz + basura</th><th>Total</th><th>Total por casa</th><th></th></tr></thead><tbody>
    ${ks.map(k => { const hs = state.periods[k].houses, t = f => sum(hs.map(h => h.bills[f] || 0));
      return `<tr><td>${label(k)}${state.periods[k].closed ? ' 🔒' : ''}</td><td>${fmt(t('agua'))}</td><td>${fmt(t('gas'))}</td><td>${fmt(t('luz') + t('basura'))}</td><td class="tot">${fmt(t('agua') + t('gas') + t('luz') + t('basura'))}</td>
      <td style="white-space:normal;text-align:left">${hs.map(h => esc(h.name) + ': ' + fmt(calcHouse(h).billTotal)).join('<br>')}</td>
      <td><button data-act="open-period" data-k="${k}">Abrir</button> <button class="danger" data-act="del-period" data-k="${k}">Eliminar</button></td></tr>`; }).join('')}
    </tbody></table></div></div>
    <div class="card"><h3>Respaldos</h3><div class="actions"><button class="primary" data-act="export">Exportar datos (JSON)</button>
    <label class="note" style="align-self:center">Importar respaldo: <input type="file" id="importFile" accept=".json,application/json"></label>
    <button class="danger" data-act="reset">Restablecer datos</button></div><div id="backupMsg"></div></div>`;
}
function renderLive() {
  renderSummary(); renderGrand();
  cur().houses.forEach(h => { const el = $(`[data-live="${h.id}"]`); if (el) el.innerHTML = houseLive(h); const pc = $(`[data-pc="${h.id}"]`); if (pc) pc.textContent = sum(h.apts.map(a => a.people)); });
  if (section === 'settle') renderSettle();
}
function renderAll() { renderPeriodSelect(); renderBills(); renderHouses(); renderSettle(); renderHistory(); renderSummary(); renderGrand(); go(section); }
function go(s) {
  section = s;
  $$('main > section').forEach(x => x.classList.toggle('on', x.id === 'sec-' + s));
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === s));
  if (s === 'settle') renderSettle();
  if (s === 'history') renderHistory();
  if (s === 'summary') renderSummary();
}

/* ===== Acciones ===== */
const findH = id => cur().houses.find(h => h.id === id);
function msg(t, bad) { const m = $('#backupMsg'); if (m) m.innerHTML = `<p class="${bad ? 'warn' : 'ok'}" role="alert">${esc(t)}</p>`; }
function copyText(t) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
  return new Promise((res, rej) => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); } ta.remove(); });
}
const actions = {
  'save-period'() { cur().savedAt = new Date().toISOString(); save(true); setStatus('Guardado ✓ ' + new Date().toLocaleTimeString('es-CO')); },
  'add-apt'(d) { const h = findH(d.h); h.apts.push({id:uid(), name:'Apto ' + (h.apts.length + 1), people:1, note:''}); save(); renderHouses(); renderLive(); },
  'del-apt'(d) { const h = findH(d.h), a = h.apts.find(x => x.id === d.a);
    if (!confirm(`¿Eliminar "${a.name}" (${a.people} personas) de ${h.name}? Se recalcularán los valores.`)) return;
    h.apts = h.apts.filter(x => x.id !== d.a); save(); renderHouses(); renderLive(); },
  'del-house'(d) { const h = findH(d.h);
    if (!confirm(`¿Eliminar "${h.name}" con ${h.apts.length} apartamento(s) y sus recibos en este período?`)) return;
    cur().houses = cur().houses.filter(x => x.id !== d.h); save(); renderAll(); },
  copy() { const h = findH($('#sh').value), r = calcHouse(h).rows.find(x => x.a.id === $('#sa').value); if (!r) return;
    copyText(settleText(h, r)).then(() => setStatus('Liquidación copiada'), () => alert('No se pudo copiar automáticamente.')); },
  print() { window.print(); },
  'new-period'() {
    const m = $('#npMonth').value; if (!/^\d{4}-\d{2}$/.test(m)) return alert('Elige un mes válido.');
    if (state.periods[m]) return alert('Ese período ya existe. Selecciónalo en la lista.');
    const struct = $('#npStruct').checked, amounts = $('#npAmounts').checked;
    const houses = struct ? cur().houses.map(h => ({id:uid(), name:h.name, apts:h.apts.map(a => ({...a, id:uid()})), bills: amounts ? {...h.bills} : {agua:null, gas:null, luz:null, basura:null}})) : newHouses();
    state.periods[m] = {closed:false, savedAt:null, houses}; state.current = m; save(); renderAll(); go('bills'); },
  'toggle-close'() { cur().closed = !cur().closed; save(); renderAll(); },
  'open-period'(d) { state.current = d.k; save(); renderAll(); },
  'del-period'(d) { if (Object.keys(state.periods).length < 2) return alert('Debe existir al menos un período.');
    if (!confirm(`¿Eliminar el período ${label(d.k)} con todos sus datos?`)) return;
    delete state.periods[d.k]; if (state.current === d.k) state.current = Object.keys(state.periods).sort().pop(); save(); renderAll(); },
  export() { const b = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'}), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'respaldo-servicios-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); URL.revokeObjectURL(a.href); msg('Respaldo exportado.'); },
  reset() { if (!confirm('Se borrarán todos los datos de este navegador. ¿Continuar?')) return;
    corrupt = false; showBanner(''); state = defaultState(); save(true); renderAll(); },
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-go]'); if (!t) return;
  if (t.dataset.go) return go(t.dataset.go);
  actions[t.dataset.act]?.(t.dataset);
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.classList.contains('money')) {
    const h = findH(t.dataset.h), v = parseMoney(t.value);
    h.bills[t.dataset.k] = v; t.value = v == null ? '' : String(v);
    t.closest('.fld').classList.toggle('filled', v != null); save(); renderLive();
  } else if (t.dataset.hname) {
    findH(t.dataset.hname).name = t.value.trim() || 'Casa'; save(); renderLive();
    $$('.ph h3').forEach(() => {}); // los títulos se refrescan al cambiar de sección
  } else if (t.dataset.f) {
    const a = findH(t.dataset.h).apts.find(x => x.id === t.dataset.a), f = t.dataset.f;
    if (f === 'people') {
      const n = Number(t.value);
      if (t.value === '' || !Number.isInteger(n) || n < 0) { t.classList.add('err'); return; }
      t.classList.remove('err');
      if (cur().closed && !warnedClosed) { if (!confirm('Este período está cerrado. Cambiar las personas actualizará el cálculo de este período. ¿Continuar?')) { t.value = a.people; return; } warnedClosed = true; }
      a.people = n;
    } else a[f] = t.value;
    save(); renderLive();
  }
});
document.addEventListener('focusin', e => { if (e.target.classList.contains('money')) { const v = parseMoney(e.target.value); e.target.value = v == null ? '' : String(v); e.target.select(); } });
document.addEventListener('focusout', e => { const t = e.target; if (t.classList.contains('money')) { const v = parseMoney(t.value); t.value = v == null ? '' : fmt(v); }
  if (t.dataset && t.dataset.hname) { renderBills(); } });
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'periodSelect') { state.current = t.value; warnedClosed = false; save(); renderAll(); }
  else if (t.id === 'sh') { $('#sa').innerHTML = ''; renderSettle(); }
  else if (t.id === 'sa') renderSettle();
  else if (t.dataset && t.dataset.f === 'people' && t.value === '') { renderHouses(); }
  else if (t.id === 'importFile') {
    const f = t.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { const o = JSON.parse(rd.result), err = validate(o); if (err) throw new Error(err);
        if (!confirm('Se reemplazarán los datos actuales por los del respaldo. ¿Continuar?')) return;
        state = o; corrupt = false; showBanner(''); save(true); renderAll(); msg('Respaldo importado correctamente.');
      } catch (er) { msg('No se pudo importar: ' + er.message, true); } };
    rd.onerror = () => msg('No se pudo leer el archivo.', true);
    rd.readAsText(f);
  }
});
window.addEventListener('beforeunload', () => { if (!corrupt) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} } });

load(); renderAll();
