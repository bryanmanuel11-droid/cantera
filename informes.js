import { sb, q } from '../supabase.js';
import { esc, pesos, fecha, hoy, edad, nombreCompleto, nombrePeriodo, cargando, vacio, descargarCSV, ETIQUETAS_ESTADO, chip } from '../ui.js';

const INFORMES = [
  ['activos', 'Deportistas activos'],
  ['por_categoria', 'Deportistas por categoría'],
  ['por_grupo', 'Deportistas por grupo'],
  ['inscripciones', 'Inscripciones recibidas y aprobadas'],
  ['recaudo', 'Recaudo por período'],
  ['cartera', 'Cartera pendiente por deportista'],
  ['pagos', 'Historial de pagos'],
  ['gastos', 'Gastos por categoría'],
  ['balance', 'Balance mensual (recaudo vs. gastos)'],
  ['asis_grupo', 'Asistencia por grupo'],
  ['asis_entrenador', 'Asistencia por entrenador'],
];

const inicioAño = () => `${hoy().slice(0, 4)}-01-01`;

export async function vista(el) {
  el.innerHTML = `
    <div class="barra no-imprimir">
      <label>Informe <select class="tipo">${INFORMES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      <label class="rango">Desde <input type="date" class="desde" value="${inicioAño()}"></label>
      <label class="rango">Hasta <input type="date" class="hasta" value="${hoy()}"></label>
      <span class="espaciador"></span>
      <button class="btn btn-sec exportar">Exportar CSV</button>
      <button class="btn btn-sec imprimir">Imprimir / PDF</button>
    </div>
    <div class="informe">${cargando()}</div>`;
  const $ = (s) => el.querySelector(s);
  let actual = { filas: [], cols: [] };

  async function generar() {
    const tipo = $('.tipo').value, desde = $('.desde').value, hasta = $('.hasta').value;
    const usaRango = ['inscripciones', 'recaudo', 'pagos', 'gastos', 'balance', 'asis_grupo', 'asis_entrenador'].includes(tipo);
    el.querySelectorAll('.rango').forEach((r) => (r.hidden = !usaRango));
    $('.informe').innerHTML = cargando('Generando informe…');
    try {
      actual = await CONSTRUCTORES[tipo]({ desde, hasta });
      const titulo = INFORMES.find(([v]) => v === tipo)[1];
      $('.informe').innerHTML = `<h2 class="seccion">${esc(titulo)}</h2>${usaRango ? `<p class="ayuda">Del ${fecha(desde)} al ${fecha(hasta)}</p>` : ''}
        ${actual.resumen || ''}
        ${actual.filas.length ? `<table class="tabla"><thead><tr>${actual.cols.map(([, t]) => `<th>${esc(t)}</th>`).join('')}</tr></thead><tbody>
          ${actual.filas.map((f) => `<tr>${actual.cols.map(([k, t, fmt]) => { const v = typeof k === 'function' ? k(f) : f[k]; return `<td data-l="${esc(t)}">${fmt ? fmt(v, f) : esc(v)}</td>`; }).join('')}</tr>`).join('')}
          </tbody></table>` : vacio('No hay datos para este informe.')}`;
    } catch (e) { $('.informe').innerHTML = vacio(e.message); }
  }
  el.querySelectorAll('select, input').forEach((x) => x.addEventListener('change', generar));
  $('.exportar').onclick = () => descargarCSV($('.tipo').value, actual.filas, actual.cols.map(([k, t]) => [k, t]));
  $('.imprimir').onclick = () => window.print();
  generar();
}

const contarPor = (filas, clave) => filas.reduce((m, f) => { const k = clave(f); m[k] = (m[k] || 0) + 1; return m; }, {});
const mes = (iso) => String(iso).slice(0, 7);
const money = (v) => pesos(v);

const CONSTRUCTORES = {
  async activos() {
    const filas = await q(sb.from('deportistas').select('codigo, nombres, apellidos, numero_documento, fecha_nacimiento, categorias!deportistas_categoria_id_club_id_fkey(nombre), grupos!deportistas_grupo_id_club_id_fkey(nombre)').eq('estado', 'activo').order('apellidos'));
    return {
      resumen: `<div class="mini-tarjetas"><div><b>${filas.length}</b>deportistas activos</div></div>`,
      filas, cols: [['codigo', 'Código'], [(f) => nombreCompleto(f), 'Deportista'], ['numero_documento', 'Documento'], [(f) => edad(f.fecha_nacimiento), 'Edad'], [(f) => f.categorias?.nombre || '', 'Categoría'], [(f) => f.grupos?.nombre || '', 'Grupo']],
    };
  },
  async por_categoria() {
    const [deps, cats] = await Promise.all([q(sb.from('deportistas').select('estado, categoria_id').neq('estado', 'rechazado')), q(sb.from('categorias').select('id, nombre').order('nombre'))]);
    const filas = [...cats, { id: null, nombre: 'Sin categoría' }].map((c) => {
      const d = deps.filter((x) => (x.categoria_id || null) === c.id);
      return { nombre: c.nombre, activos: d.filter((x) => x.estado === 'activo').length, pendientes: d.filter((x) => x.estado === 'pendiente').length, otros: d.filter((x) => !['activo', 'pendiente'].includes(x.estado)).length, total: d.length };
    }).filter((f) => f.total);
    return { filas, cols: [['nombre', 'Categoría'], ['activos', 'Activos'], ['pendientes', 'Pendientes'], ['otros', 'Inactivos/retirados'], ['total', 'Total']] };
  },
  async por_grupo() {
    const [deps, grupos] = await Promise.all([
      q(sb.from('deportistas').select('grupo_id').eq('estado', 'activo')),
      q(sb.from('grupos').select('id, nombre, lugar, categorias!grupos_categoria_id_club_id_fkey(nombre), entrenadores!grupos_entrenador_id_club_id_fkey(nombres, apellidos)').order('nombre')),
    ]);
    const n = contarPor(deps, (d) => d.grupo_id || '');
    const filas = grupos.map((g) => ({ ...g, n: n[g.id] || 0 }));
    if (n['']) filas.push({ nombre: 'Sin grupo asignado', n: n[''] });
    return { filas, cols: [['nombre', 'Grupo'], [(g) => g.categorias?.nombre || '', 'Categoría'], [(g) => nombreCompleto(g.entrenadores), 'Entrenador'], [(g) => g.lugar || '', 'Lugar'], ['n', 'Deportistas activos']] };
  },
  async inscripciones({ desde, hasta }) {
    const filas = await q(sb.from('solicitudes').select('estado, creado_en, revisado_en, motivo_rechazo, deportistas(codigo, nombres, apellidos, fecha_nacimiento), acudientes(nombres, apellidos, telefono)')
      .gte('creado_en', desde).lte('creado_en', hasta + 'T23:59:59').order('creado_en', { ascending: false }));
    const c = contarPor(filas, (f) => f.estado);
    return {
      resumen: `<div class="mini-tarjetas"><div><b>${filas.length}</b>recibidas</div><div><b>${c.aprobada || 0}</b>aprobadas</div><div><b>${c.pendiente || 0}</b>pendientes</div><div><b>${c.rechazada || 0}</b>rechazadas</div></div>`,
      filas, cols: [[(f) => fecha(f.creado_en), 'Recibida'], [(f) => nombreCompleto(f.deportistas), 'Deportista'], [(f) => edad(f.deportistas?.fecha_nacimiento), 'Edad'],
        [(f) => nombreCompleto(f.acudientes), 'Acudiente'], [(f) => f.acudientes?.telefono || '', 'Teléfono'], [(f) => ETIQUETAS_ESTADO[f.estado], 'Estado'], [(f) => fecha(f.revisado_en), 'Revisada']],
    };
  },
  async recaudo({ desde, hasta }) {
    const pagos = await q(sb.from('pagos').select('valor, fecha_pago, medio, concepto').gte('fecha_pago', desde).lte('fecha_pago', hasta).limit(20000));
    const por = {};
    pagos.forEach((p) => { const k = mes(p.fecha_pago); (por[k] ||= { mes: k, pagos: 0, total: 0 }); por[k].pagos++; por[k].total += Number(p.valor); });
    const filas = Object.values(por).sort((a, b) => b.mes.localeCompare(a.mes));
    return {
      resumen: `<div class="mini-tarjetas"><div><b>${pesos(pagos.reduce((s, p) => s + Number(p.valor), 0))}</b>recaudo total</div><div><b>${pagos.length}</b>pagos</div></div>`,
      filas, cols: [[(f) => nombrePeriodo(f.mes), 'Mes'], ['pagos', 'N.º de pagos'], ['total', 'Recaudo', money]],
    };
  },
  async cartera() {
    const obls = await q(sb.from('v_obligaciones').select('deportista_id, concepto, periodo, saldo').eq('anulada', false).gt('saldo', 0).limit(20000));
    const ids = [...new Set(obls.map((o) => o.deportista_id))];
    const deps = ids.length ? await q(sb.from('deportistas').select('id, codigo, nombres, apellidos, deportista_acudiente(acudientes(nombres, apellidos, telefono))').in('id', ids.slice(0, 1000))) : [];
    const mapa = Object.fromEntries(deps.map((d) => [d.id, d]));
    const por = {};
    obls.forEach((o) => { (por[o.deportista_id] ||= { d: mapa[o.deportista_id], n: 0, saldo: 0, detalle: [] }); por[o.deportista_id].n++; por[o.deportista_id].saldo += Number(o.saldo); por[o.deportista_id].detalle.push(`${o.concepto} ${nombrePeriodo(o.periodo)}`); });
    const filas = Object.values(por).sort((a, b) => b.saldo - a.saldo);
    return {
      resumen: `<div class="mini-tarjetas"><div><b class="texto-alerta">${pesos(filas.reduce((s, f) => s + f.saldo, 0))}</b>cartera pendiente</div><div><b>${filas.length}</b>deportistas con saldo</div></div>`,
      filas, cols: [[(f) => f.d?.codigo, 'Código'], [(f) => nombreCompleto(f.d), 'Deportista'], [(f) => nombreCompleto(f.d?.deportista_acudiente?.[0]?.acudientes), 'Acudiente'],
        [(f) => f.d?.deportista_acudiente?.[0]?.acudientes?.telefono || '', 'Teléfono'], [(f) => f.detalle.join(', '), 'Cobros pendientes'], ['saldo', 'Saldo', money]],
    };
  },
  async pagos({ desde, hasta }) {
    const filas = await q(sb.from('pagos').select('*, deportistas!pagos_deportista_id_club_id_fkey(codigo, nombres, apellidos)').gte('fecha_pago', desde).lte('fecha_pago', hasta).order('fecha_pago', { ascending: false }).limit(20000));
    return {
      resumen: `<div class="mini-tarjetas"><div><b>${pesos(filas.reduce((s, p) => s + Number(p.valor), 0))}</b>total</div><div><b>${filas.length}</b>pagos</div></div>`,
      filas, cols: [[(p) => fecha(p.fecha_pago), 'Fecha'], [(p) => p.deportistas?.codigo, 'Código'], [(p) => nombreCompleto(p.deportistas), 'Deportista'], [(p) => `${p.concepto} ${nombrePeriodo(p.periodo)}`, 'Concepto'], ['medio', 'Medio'], ['valor', 'Valor', money]],
    };
  },
  async gastos({ desde, hasta }) {
    const g = await q(sb.from('gastos').select('valor, categoria').gte('fecha', desde).lte('fecha', hasta).limit(20000));
    const por = {};
    g.forEach((x) => { const k = x.categoria || 'Sin categoría'; (por[k] ||= { categoria: k, n: 0, total: 0 }); por[k].n++; por[k].total += Number(x.valor); });
    const filas = Object.values(por).sort((a, b) => b.total - a.total);
    return {
      resumen: `<div class="mini-tarjetas"><div><b>${pesos(g.reduce((s, x) => s + Number(x.valor), 0))}</b>total gastos</div></div>`,
      filas, cols: [['categoria', 'Categoría'], ['n', 'N.º de gastos'], ['total', 'Total', money]],
    };
  },
  async balance({ desde, hasta }) {
    const [p, g] = await Promise.all([
      q(sb.from('pagos').select('valor, fecha_pago').gte('fecha_pago', desde).lte('fecha_pago', hasta).limit(20000)),
      q(sb.from('gastos').select('valor, fecha').gte('fecha', desde).lte('fecha', hasta).limit(20000)),
    ]);
    const por = {};
    p.forEach((x) => { (por[mes(x.fecha_pago)] ||= { mes: mes(x.fecha_pago), ing: 0, gas: 0 }).ing += Number(x.valor); });
    g.forEach((x) => { (por[mes(x.fecha)] ||= { mes: mes(x.fecha), ing: 0, gas: 0 }).gas += Number(x.valor); });
    const filas = Object.values(por).map((f) => ({ ...f, bal: f.ing - f.gas })).sort((a, b) => b.mes.localeCompare(a.mes));
    const t = filas.reduce((s, f) => ({ ing: s.ing + f.ing, gas: s.gas + f.gas }), { ing: 0, gas: 0 });
    return {
      resumen: `<div class="mini-tarjetas"><div><b>${pesos(t.ing)}</b>recaudo</div><div><b>${pesos(t.gas)}</b>gastos</div><div><b class="${t.ing - t.gas < 0 ? 'texto-alerta' : 'texto-ok'}">${pesos(t.ing - t.gas)}</b>balance</div></div>`,
      filas, cols: [[(f) => nombrePeriodo(f.mes), 'Mes'], ['ing', 'Recaudo', money], ['gas', 'Gastos', money], ['bal', 'Balance', money]],
    };
  },
  async asis_grupo({ desde, hasta }) { return asistenciaPor('grupo', desde, hasta); },
  async asis_entrenador({ desde, hasta }) { return asistenciaPor('entrenador', desde, hasta); },
};

async function asistenciaPor(tipo, desde, hasta) {
  const [a, grupos, entrenadores] = await Promise.all([
    q(sb.from('asistencia').select('estado, fecha, grupo_id, entrenador_id').gte('fecha', desde).lte('fecha', hasta).limit(50000)),
    q(sb.from('grupos').select('id, nombre')),
    q(sb.from('entrenadores').select('id, nombres, apellidos')),
  ]);
  const nombre = tipo === 'grupo' ? Object.fromEntries(grupos.map((g) => [g.id, g.nombre])) : Object.fromEntries(entrenadores.map((e) => [e.id, nombreCompleto(e)]));
  const por = {};
  a.forEach((x) => {
    const k = (tipo === 'grupo' ? x.grupo_id : x.entrenador_id) || '';
    const r = (por[k] ||= { nombre: nombre[k] || 'Sin entrenador asignado', sesiones: new Set(), presente: 0, tardanza: 0, ausente: 0, excusa: 0, total: 0 });
    r.sesiones.add(`${x.grupo_id}|${x.fecha}`); r[x.estado]++; r.total++;
  });
  const filas = Object.values(por).map((r) => ({ ...r, sesiones: r.sesiones.size, pct: Math.round(((r.presente + r.tardanza) / r.total) * 100) }));
  return {
    filas, cols: [['nombre', tipo === 'grupo' ? 'Grupo' : 'Entrenador'], ['sesiones', 'Sesiones'], ['presente', 'Presentes'], ['tardanza', 'Tardanzas'], ['ausente', 'Ausencias'], ['excusa', 'Excusas'], ['pct', '% asistencia', (v) => `${v}%`]],
  };
}
