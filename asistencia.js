import { sb, q } from './supabase.js';
import { esc, hoy, fecha, nombreCompleto, aviso, avisoError, cargando, vacio, descargarCSV, periodoActual } from './ui.js';

const ESTADOS = [['presente', 'P', 'Presente'], ['ausente', 'A', 'Ausente'], ['tardanza', 'T', 'Tardanza'], ['excusa', 'E', 'Excusa']];

export async function vista(el) {
  const grupos = await q(sb.from('grupos').select('id, nombre, entrenador_id, lugar').eq('activo', true).order('nombre'));
  if (!grupos.length) { el.innerHTML = vacio('Para tomar asistencia primero cree los grupos y asigne los deportistas.', '<a class="btn btn-pri" href="#/grupos">Ir a Grupos</a>'); return; }
  el.innerHTML = `
    <div class="pestañas"><button data-p="tomar" class="activo">Tomar asistencia</button><button data-p="historial">Historial</button></div>
    <div class="contenido-pestaña"></div>`;
  const zona = el.querySelector('.contenido-pestaña');
  const ir = (p) => { el.querySelectorAll('.pestañas button').forEach((b) => b.classList.toggle('activo', b.dataset.p === p)); (p === 'tomar' ? tomar : historial)(zona, grupos); };
  el.querySelectorAll('.pestañas button').forEach((b) => b.onclick = () => ir(b.dataset.p));
  ir('tomar');
}

async function tomar(zona, grupos) {
  const ultimo = localStorageSeguro('asistencia_grupo');
  zona.innerHTML = `
    <div class="barra">
      <label>Grupo <select class="grupo">${grupos.map((g) => `<option value="${g.id}" ${g.id === ultimo ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('')}</select></label>
      <label>Fecha <input type="date" class="fecha" value="${hoy()}" max="${hoy()}"></label>
      <span class="espaciador"></span>
      <button class="btn btn-sec todos">Todos presentes</button>
    </div>
    <div class="lista-asistencia">${cargando()}</div>
    <div class="pie-fijo"><span class="conteo"></span><button class="btn btn-pri btn-grande guardar">Guardar asistencia</button></div>`;
  const $ = (s) => zona.querySelector(s);
  let deps = [], marcas = {}, entrenamiento = null;

  async function cargar() {
    if (!$('.lista-asistencia')) return;   // el usuario cambió de pestaña
    const g = $('.grupo').value, f = $('.fecha').value;
    localStorageSeguro('asistencia_grupo', g);
    $('.lista-asistencia').innerHTML = cargando();
    try {
      const [d, a, e] = await Promise.all([
        q(sb.from('deportistas').select('id, codigo, nombres, apellidos').eq('grupo_id', g).eq('estado', 'activo').order('apellidos').order('nombres')),
        q(sb.from('asistencia').select('deportista_id, estado').eq('grupo_id', g).eq('fecha', f)),
        q(sb.from('entrenamientos').select('id, entrenador_id').eq('grupo_id', g).eq('fecha', f).limit(1)),
      ]);
      if (!$('.lista-asistencia')) return;
      deps = d; entrenamiento = e[0] || null;
      marcas = Object.fromEntries(a.map((x) => [x.deportista_id, x.estado]));
      pintar(a.length > 0);
    } catch (err) { if ($('.lista-asistencia')) $('.lista-asistencia').innerHTML = vacio(err.message); }
  }

  function pintar(yaRegistrada) {
    if (!deps.length) { $('.lista-asistencia').innerHTML = vacio('Este grupo no tiene deportistas activos asignados.', '<a class="btn btn-sec" href="#/grupos">Asignar deportistas</a>'); $('.pie-fijo').hidden = true; return; }
    $('.pie-fijo').hidden = false;
    $('.lista-asistencia').innerHTML = `${yaRegistrada ? '<p class="alerta alerta-info">La asistencia de esta fecha ya estaba registrada. Puede corregirla y guardar de nuevo.</p>' : ''}
      ${deps.map((d) => `<div class="fila-asistencia" data-id="${d.id}"><span class="nombre"><strong>${esc(nombreCompleto(d))}</strong><small>${esc(d.codigo)}</small></span>
        <span class="segmento">${ESTADOS.map(([v, l, t]) => `<button type="button" class="seg seg-${v} ${marcas[d.id] === v ? 'activo' : ''}" data-v="${v}" title="${t}">${l}<span>${t}</span></button>`).join('')}</span></div>`).join('')}`;
    contar();
  }
  function contar() {
    const n = Object.keys(marcas).filter((id) => deps.some((d) => d.id === id)).length;
    const p = Object.values(marcas).filter((v) => v === 'presente' || v === 'tardanza').length;
    $('.conteo').textContent = `${n} de ${deps.length} marcados · ${p} presentes`;
  }
  $('.lista-asistencia').addEventListener('click', (e) => {
    const b = e.target.closest('.seg'); if (!b) return;
    const fila = b.closest('.fila-asistencia');
    marcas[fila.dataset.id] = b.dataset.v;
    fila.querySelectorAll('.seg').forEach((x) => x.classList.toggle('activo', x === b));
    contar();
  });
  $('.todos').onclick = () => { deps.forEach((d) => { if (!marcas[d.id]) marcas[d.id] = 'presente'; }); pintar(false); };
  $('.guardar').onclick = async (e) => {
    const sinMarcar = deps.filter((d) => !marcas[d.id]);
    if (sinMarcar.length === deps.length) return aviso('Marque la asistencia de al menos un deportista.', 'error');
    e.target.disabled = true;
    try {
      const grupo = grupos.find((g) => g.id === $('.grupo').value);
      const filas = deps.filter((d) => marcas[d.id]).map((d) => ({
        deportista_id: d.id, grupo_id: grupo.id, fecha: $('.fecha').value, estado: marcas[d.id],
        entrenador_id: entrenamiento?.entrenador_id || grupo.entrenador_id || null, entrenamiento_id: entrenamiento?.id || null,
      }));
      await q(sb.from('asistencia').upsert(filas, { onConflict: 'deportista_id,grupo_id,fecha' }));
      aviso(`Asistencia guardada${sinMarcar.length ? ` (${sinMarcar.length} sin marcar)` : ''}`);
      cargar();
    } catch (err) { avisoError(err); }
    finally { e.target.disabled = false; }
  };
  $('.grupo').onchange = cargar; $('.fecha').onchange = cargar;
  cargar();
}

async function historial(zona, grupos) {
  zona.innerHTML = `
    <div class="barra">
      <label>Grupo <select class="grupo"><option value="">Todos</option>${grupos.map((g) => `<option value="${g.id}">${esc(g.nombre)}</option>`).join('')}</select></label>
      <label>Desde <input type="date" class="desde" value="${periodoActual()}-01"></label>
      <label>Hasta <input type="date" class="hasta" value="${hoy()}"></label>
      <span class="espaciador"></span><button class="btn btn-sec exportar">Exportar</button>
    </div><div class="tabla-zona">${cargando()}</div>`;
  const $ = (s) => zona.querySelector(s);
  let resumen = [];
  async function cargar() {
    let c = sb.from('asistencia').select('estado, fecha, deportista_id, deportistas!asistencia_deportista_id_club_id_fkey(codigo, nombres, apellidos)')
      .gte('fecha', $('.desde').value).lte('fecha', $('.hasta').value).limit(20000);
    if ($('.grupo').value) c = c.eq('grupo_id', $('.grupo').value);
    try {
      const filas = await q(c);
      const por = {};
      filas.forEach((a) => {
        const r = (por[a.deportista_id] ||= { d: a.deportistas, presente: 0, ausente: 0, tardanza: 0, excusa: 0, total: 0 });
        r[a.estado]++; r.total++;
      });
      resumen = Object.values(por).map((r) => ({ ...r, pct: Math.round(((r.presente + r.tardanza) / r.total) * 100) })).sort((a, b) => a.pct - b.pct);
      const fechas = new Set(filas.map((f) => f.fecha)).size;
      $('.tabla-zona').innerHTML = resumen.length ? `<p class="ayuda">${fechas} sesión(es) registradas en el rango. Ordenado de menor a mayor asistencia.</p>
        <table class="tabla"><thead><tr><th>Deportista</th><th>Presente</th><th>Tardanza</th><th>Ausente</th><th>Excusa</th><th>% asistencia</th></tr></thead><tbody>
        ${resumen.map((r) => `<tr><td data-l="Deportista"><strong>${esc(nombreCompleto(r.d))}</strong><br><small>${esc(r.d?.codigo)}</small></td>
          <td data-l="Presente">${r.presente}</td><td data-l="Tardanza">${r.tardanza}</td><td data-l="Ausente">${r.ausente}</td><td data-l="Excusa">${r.excusa}</td>
          <td data-l="%"><div class="barra-pct"><span style="width:${r.pct}%"></span></div>${r.pct}%</td></tr>`).join('')}</tbody></table>`
        : vacio('No hay asistencia registrada en este rango.');
    } catch (e) { $('.tabla-zona').innerHTML = vacio(e.message); }
  }
  zona.querySelectorAll('select, input').forEach((x) => x.addEventListener('change', cargar));
  $('.exportar').onclick = () => descargarCSV('asistencia', resumen, [[(r) => r.d?.codigo, 'Código'], [(r) => nombreCompleto(r.d), 'Deportista'],
    ['presente', 'Presente'], ['tardanza', 'Tardanza'], ['ausente', 'Ausente'], ['excusa', 'Excusa'], ['pct', '% asistencia']]);
  cargar();
}

function localStorageSeguro(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; }
}
