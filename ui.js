import { sb, q } from './supabase.js';

// ---------- Formato ----------
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const pesos = (n) => fmtCOP.format(Number(n || 0));
export const numero = (n) => new Intl.NumberFormat('es-CO').format(Number(n || 0));
export const hoy = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
export const periodoActual = () => hoy().slice(0, 7);
export function fecha(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function edad(fechaNac) {
  if (!fechaNac) return '';
  const n = new Date(fechaNac + 'T00:00:00'), h = new Date();
  let e = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--;
  return e;
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function nombrePeriodo(p) {
  if (!p || p === 'UNICO') return p === 'UNICO' ? 'Único' : '';
  const [y, m] = p.split('-');
  return `${MESES[Number(m) - 1]} ${y}`;
}
export const nombreCompleto = (p) => p ? `${p.nombres || ''} ${p.apellidos || ''}`.trim() : '';
export const sinTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export const ETIQUETAS_ESTADO = {
  pendiente: 'Pendiente', activo: 'Activo', inactivo: 'Inactivo', retirado: 'Retirado', rechazado: 'Rechazado',
  aprobada: 'Aprobada', rechazada: 'Rechazada', pagada: 'Pagada', abonada: 'Abonada', vencida: 'Vencida', anulada: 'Anulada',
  presente: 'Presente', ausente: 'Ausente', tardanza: 'Tardanza', excusa: 'Excusa', recibido: 'Recibido', aprobado: 'Aprobado',
};
export const chip = (estado) => `<span class="chip chip-${esc(estado)}">${esc(ETIQUETAS_ESTADO[estado] || estado)}</span>`;

// ---------- Avisos ----------
export function aviso(texto, tipo = 'ok') {
  let zona = document.getElementById('avisos');
  if (!zona) { zona = document.createElement('div'); zona.id = 'avisos'; document.body.appendChild(zona); }
  const el = document.createElement('div');
  el.className = `aviso aviso-${tipo}`;
  el.textContent = texto;
  zona.appendChild(el);
  setTimeout(() => el.classList.add('salir'), tipo === 'error' ? 6000 : 3500);
  setTimeout(() => el.remove(), tipo === 'error' ? 6500 : 4000);
}
export const avisoError = (e) => aviso(e?.message || String(e), 'error');

// ---------- Ventanas modales ----------
export function abrirModal({ titulo, cuerpo = '', botones = [], ancho = '' }) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal ${ancho}" role="dialog" aria-modal="true">
      <header><h3>${esc(titulo)}</h3><button class="btn-icono cerrar" aria-label="Cerrar">✕</button></header>
      <div class="modal-cuerpo">${cuerpo}</div>
      ${botones.length ? '<footer></footer>' : ''}
    </div>`;
  const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', esc_); };
  const esc_ = (e) => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', esc_);
  fondo.querySelector('.cerrar').onclick = cerrar;
  fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(); });
  const pie = fondo.querySelector('footer');
  for (const b of botones) {
    const btn = document.createElement('button');
    btn.className = `btn ${b.clase || ''}`;
    btn.textContent = b.texto;
    btn.onclick = async () => {
      if (!b.accion) return cerrar();
      btn.disabled = true;
      try { const r = await b.accion(fondo); if (r !== false) cerrar(); }
      catch (e) { avisoError(e); }
      finally { btn.disabled = false; }
    };
    pie.appendChild(btn);
  }
  document.body.appendChild(fondo);
  fondo.cerrar = cerrar;
  setTimeout(() => fondo.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 30);
  return fondo;
}

export function confirmar(texto, { titulo = 'Confirmar', si = 'Sí, continuar', peligro = false } = {}) {
  return new Promise((resolve) => {
    const m = abrirModal({
      titulo, cuerpo: `<p>${esc(texto)}</p>`,
      botones: [
        { texto: 'Cancelar', clase: 'btn-sec', accion: () => resolve(false) },
        { texto: si, clase: peligro ? 'btn-peligro' : 'btn-pri', accion: () => resolve(true) },
      ],
    });
    m.querySelector('.cerrar').addEventListener('click', () => resolve(false));
  });
}

// ---------- Formularios ----------
// Campo: { n: nombre, l: etiqueta, t: tipo, req, opts: [[valor, texto]], ph, ancho: 'completo', dl: [...], ayuda, min, max, step }
export function campos(lista, valores = {}) {
  return `<div class="rejilla-form">${lista.map((c) => campo(c, valores[c.n])).join('')}</div>`;
}

function campo(c, v) {
  const id = `f_${c.n}_${Math.random().toString(36).slice(2, 7)}`;
  const req = c.req ? 'required' : '';
  const val = v ?? c.def ?? '';
  let input;
  if (c.t === 'select') {
    const opts = (c.opts || []).map(([ov, ot]) => `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ot)}</option>`).join('');
    input = `<select id="${id}" name="${c.n}" ${req}>${c.vacio !== false ? `<option value="">${esc(c.vacio || '— Seleccione —')}</option>` : ''}${opts}</select>`;
  } else if (c.t === 'textarea') {
    input = `<textarea id="${id}" name="${c.n}" rows="${c.filas || 3}" ${req} placeholder="${esc(c.ph || '')}">${esc(val)}</textarea>`;
  } else if (c.t === 'checkbox') {
    return `<label class="campo campo-check ${c.ancho === 'completo' ? 'completo' : ''}"><input type="checkbox" name="${c.n}" ${val === true || val === 'true' ? 'checked' : ''}> ${esc(c.l)}</label>`;
  } else if (c.t === 'titulo') {
    return `<h4 class="form-subtitulo">${esc(c.l)}</h4>`;
  } else {
    const dl = c.dl ? `<datalist id="${id}_dl">${c.dl.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : '';
    const extra = ['min', 'max', 'step', 'inputmode', 'autocomplete', 'pattern'].filter((k) => c[k] !== undefined).map((k) => `${k}="${esc(c[k])}"`).join(' ');
    const valor = c.t === 'time' && val ? String(val).slice(0, 5) : val;
    input = `<input id="${id}" name="${c.n}" type="${c.t || 'text'}" value="${esc(valor)}" ${req} ${extra} placeholder="${esc(c.ph || '')}" ${c.dl ? `list="${id}_dl"` : ''}>${dl}`;
  }
  return `<div class="campo ${c.ancho === 'completo' ? 'completo' : ''}">
    <label for="${id}">${esc(c.l)}${c.req ? ' <span class="req">*</span>' : ''}</label>${input}
    ${c.ayuda ? `<small>${esc(c.ayuda)}</small>` : ''}</div>`;
}

// Lee un contenedor de formulario: textos vacíos → null; números → Number; checkbox → boolean
export function leer(contenedor, { validar = true } = {}) {
  const datos = {};
  for (const el of contenedor.querySelectorAll('input[name],select[name],textarea[name]')) {
    if (validar && !el.checkValidity()) {
      el.reportValidity();
      throw new Error(`Revise el campo "${el.closest('.campo')?.querySelector('label')?.textContent?.replace('*', '').trim() || el.name}".`);
    }
    let v = el.type === 'checkbox' ? el.checked : el.value.trim();
    if (v === '') v = null;
    else if (el.type === 'number' && v !== null) v = Number(v);
    datos[el.name] = v;
  }
  return datos;
}

// ---------- Buscador de deportistas (por nombre, documento o código) ----------
export async function buscarDeportistas(texto, { estados = null, limite = 12 } = {}) {
  const palabras = sinTildes(texto).trim().split(/\s+/).filter(Boolean).slice(0, 4);
  let consulta = sb.from('deportistas')
    .select('id, codigo, nombres, apellidos, numero_documento, fecha_nacimiento, estado, categoria_id, grupo_id, descuento_porcentaje')
    .order('apellidos').limit(limite);
  if (estados) consulta = consulta.in('estado', estados);
  for (const p of palabras) consulta = consulta.ilike('busqueda', `%${p.replace(/[,%()*.]/g, '')}%`);
  return q(consulta);
}

export function buscadorDeportista(contenedor, { alElegir, estados = null, ph = 'Escriba nombre, apellido o documento…' }) {
  contenedor.classList.add('buscador');
  contenedor.innerHTML = `<input type="search" class="buscador-input" placeholder="${esc(ph)}" autocomplete="off"><div class="buscador-lista" hidden></div>`;
  const input = contenedor.querySelector('input'), lista = contenedor.querySelector('.buscador-lista');
  let resultados = [], activo = -1;
  const pintar = () => {
    lista.hidden = !resultados.length && !input.value.trim();
    lista.innerHTML = resultados.length
      ? resultados.map((d, i) => `<button type="button" class="buscador-item ${i === activo ? 'activo' : ''}" data-i="${i}">
          <strong>${esc(nombreCompleto(d))}</strong><span>${esc(d.codigo)} · Doc. ${esc(d.numero_documento)}${d.fecha_nacimiento ? ` · ${edad(d.fecha_nacimiento)} años` : ''} ${chip(d.estado)}</span></button>`).join('')
      : `<div class="buscador-vacio">Sin resultados</div>`;
  };
  const elegir = (d) => { input.value = nombreCompleto(d); lista.hidden = true; alElegir(d); };
  const buscar = debounce(async () => {
    if (input.value.trim().length < 2) { resultados = []; lista.hidden = true; return; }
    try { resultados = await buscarDeportistas(input.value, { estados }); activo = 0; pintar(); } catch (e) { avisoError(e); }
  });
  input.addEventListener('input', buscar);
  input.addEventListener('keydown', (e) => {
    if (lista.hidden) return;
    if (e.key === 'ArrowDown') { activo = Math.min(activo + 1, resultados.length - 1); pintar(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { activo = Math.max(activo - 1, 0); pintar(); e.preventDefault(); }
    if (e.key === 'Enter' && resultados[activo]) { elegir(resultados[activo]); e.preventDefault(); }
  });
  lista.addEventListener('mousedown', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) { e.preventDefault(); elegir(resultados[Number(b.dataset.i)]); }
  });
  input.addEventListener('blur', () => setTimeout(() => (lista.hidden = true), 150));
  return { input, limpiar: () => { input.value = ''; resultados = []; lista.hidden = true; } };
}

// ---------- Exportar ----------
export function descargarCSV(nombre, filas, columnas) {
  const cols = columnas || Object.keys(filas[0] || {}).map((k) => [k, k]);
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.map(([, t]) => celda(t)).join(';'), ...filas.map((f) => cols.map(([k]) => celda(typeof k === 'function' ? k(f) : f[k])).join(';'))].join('\r\n');
  descargar(`${nombre}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}
export function descargar(nombre, contenido, tipo = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function copiarTexto(texto) {
  try { await navigator.clipboard.writeText(texto); }
  catch {
    const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t);
    t.select(); document.execCommand('copy'); t.remove();
  }
  aviso('Enlace copiado');
}

export const cargando = (texto = 'Cargando…') => `<div class="cargando"><span class="spinner"></span>${esc(texto)}</div>`;
export const vacio = (texto, accion = '') => `<div class="vacio"><p>${esc(texto)}</p>${accion}</div>`;
