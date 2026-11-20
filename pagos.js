import { sb, q, rpc } from '../supabase.js';
import { crud, opciones } from '../crud.js';
import {
  esc, pesos, fecha, hoy, periodoActual, nombrePeriodo, nombreCompleto, chip, aviso, avisoError, abrirModal,
  campos, leer, buscadorDeportista, cargando, vacio, confirmar, descargarCSV, debounce,
} from '../ui.js';

const MEDIOS = ['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Tarjeta', 'Otro'];
const CONCEPTOS_SUELTOS = ['Mensualidad', 'Inscripción', 'Uniforme', 'Torneo', 'Transporte', 'Otro'];

export async function vista(el, ctx) {
  const [pest = 'registrar', param] = ctx.params;
  el.innerHTML = `
    <div class="pestañas">
      <button data-p="registrar">Registrar pago</button>
      <button data-p="cartera">Cartera</button>
      <button data-p="historial">Historial de pagos</button>
      <button data-p="tarifas">Tarifas</button>
    </div>
    <div class="contenido-pestaña"></div>`;
  const zona = el.querySelector('.contenido-pestaña');
  const ir = async (p, extra) => {
    el.querySelectorAll('.pestañas button').forEach((b) => b.classList.toggle('activo', b.dataset.p === p));
    history.replaceState(null, '', `#/pagos/${p}${extra ? '/' + extra : ''}`);
    zona.innerHTML = cargando();
    try {
      const tarifasActivas = await q(sb.from('tarifas').select('id', { count: 'exact', head: true }).eq('activa', true));
      zona.innerHTML = '';
      await ({ registrar, cartera, historial, tarifas })[p](zona, { ...ctx, tarifasActivas, ir }, extra);
    } catch (e) { zona.innerHTML = vacio(e.message); }
  };
  el.querySelectorAll('.pestañas button').forEach((b) => b.onclick = () => ir(b.dataset.p));
  ir(['registrar', 'cartera', 'historial', 'tarifas'].includes(pest) ? pest : 'registrar', param);
}

const bannerSinTarifa = (ctx) => ctx.tarifasActivas ? '' :
  `<div class="alerta alerta-aviso"><strong>Cobro pendiente de configuración.</strong> Aún no se ha definido el valor de la mensualidad, por eso no se genera cartera.
   Puede registrar pagos como "Otro concepto" y se contarán como recaudo. <a href="#/pagos/tarifas">Configurar tarifas →</a></div>`;

// ------------------------------------------------------------------ REGISTRAR
async function registrar(zona, ctx, deportistaId) {
  zona.innerHTML = `${bannerSinTarifa(ctx)}
    <div class="panel registro-pago">
      <div class="paso"><span class="num">1</span><div class="paso-cuerpo"><label>Busque al deportista</label><div class="buscador-dep"></div></div></div>
      <div class="detalle-pago"></div>
    </div>`;
  const detalle = zona.querySelector('.detalle-pago');
  const bus = buscadorDeportista(zona.querySelector('.buscador-dep'), {
    estados: ['activo', 'pendiente', 'inactivo', 'retirado'],
    alElegir: (d) => mostrar(d),
  });
  setTimeout(() => bus.input.focus(), 50);

  async function mostrar(d) {
    detalle.innerHTML = cargando();
    const [obls, ultimos, vinc] = await Promise.all([
      q(sb.from('v_obligaciones').select('*').eq('deportista_id', d.id).eq('anulada', false).gt('saldo', 0).order('periodo')),
      q(sb.from('pagos').select('*').eq('deportista_id', d.id).order('fecha_pago', { ascending: false }).order('creado_en', { ascending: false }).limit(5)),
      q(sb.from('deportista_acudiente').select('acudientes(nombres, apellidos, telefono)').eq('deportista_id', d.id).limit(1)),
    ]);
    const acudiente = vinc[0]?.acudientes;
    const totalSaldo = obls.reduce((s, o) => s + Number(o.saldo), 0);
    detalle.innerHTML = `
      <div class="tarjeta-persona destacada">
        <strong>${esc(nombreCompleto(d))}</strong> ${chip(d.estado)}<br>
        <small>${esc(d.codigo)} · Doc. ${esc(d.numero_documento)}${acudiente ? ` · Acudiente: ${esc(nombreCompleto(acudiente))}` : ''}</small>
        ${obls.length ? `<div class="saldo-total">Saldo pendiente: <b>${pesos(totalSaldo)}</b></div>` : ''}
      </div>
      <div class="paso"><span class="num">2</span><div class="paso-cuerpo"><label>¿Qué está pagando?</label>
        <div class="opciones-pago">
          ${obls.map((o, i) => `<label class="opcion"><input type="radio" name="obligacion" value="${o.id}" ${i === 0 ? 'checked' : ''} data-saldo="${o.saldo}">
            <span><strong>${esc(o.concepto)} ${esc(nombrePeriodo(o.periodo))}</strong>
            <small>Valor ${pesos(o.valor - o.descuento)}${Number(o.abonado) ? ` · abonado ${pesos(o.abonado)}` : ''} · vence ${fecha(o.fecha_vencimiento)}</small></span>
            <b>${pesos(o.saldo)}</b> ${chip(o.estado_pago)}</label>`).join('')}
          <label class="opcion"><input type="radio" name="obligacion" value="" ${obls.length ? '' : 'checked'}><span><strong>Otro concepto</strong><small>Pago que no corresponde a un cobro generado</small></span></label>
        </div>
        <div class="concepto-libre" ${obls.length ? 'hidden' : ''}>${campos([
          { n: 'concepto', l: 'Concepto', dl: CONCEPTOS_SUELTOS, def: 'Mensualidad' },
          { n: 'periodo', l: 'Mes al que corresponde', t: 'month', def: periodoActual() },
        ])}</div></div></div>
      <div class="paso paso-datos"><span class="num">3</span><div class="paso-cuerpo"><label>Datos del pago</label>
        ${campos([
          { n: 'valor', l: 'Valor recibido', t: 'number', req: true, min: 1, step: 1, inputmode: 'numeric', def: obls[0]?.saldo || '' },
          { n: 'fecha_pago', l: 'Fecha de pago', t: 'date', req: true, def: hoy() },
          { n: 'medio', l: 'Medio de pago', t: 'select', vacio: false, opts: MEDIOS.map((m) => [m, m]) },
          { n: 'referencia', l: 'Referencia / N.º de comprobante' },
          { n: 'observaciones', l: 'Observaciones', ancho: 'completo' },
        ])}
        <p class="ayuda texto-saldo"></p>
        <button class="btn btn-pri btn-grande guardar">Guardar pago</button></div></div>
      ${ultimos.length ? `<h4>Últimos pagos de ${esc(d.nombres)}</h4><table class="tabla compacta"><tbody>${ultimos.map((p) => `<tr><td>${fecha(p.fecha_pago)}</td><td>${esc(p.concepto)} ${esc(nombrePeriodo(p.periodo))}</td><td>${pesos(p.valor)}</td><td>${esc(p.medio || '')}</td></tr>`).join('')}</tbody></table>` : ''}`;

    const valorInput = detalle.querySelector('[name=valor]');
    const textoSaldo = detalle.querySelector('.texto-saldo');
    const actualizarTexto = () => {
      const sel = detalle.querySelector('[name=obligacion]:checked');
      const saldo = Number(sel?.dataset.saldo || 0), v = Number(valorInput.value || 0);
      if (!sel?.value) { textoSaldo.textContent = ''; return; }
      textoSaldo.textContent = v > saldo ? `El valor supera el saldo (${pesos(saldo)}).` : v < saldo && v > 0 ? `Abono parcial: quedará un saldo de ${pesos(saldo - v)}.` : v === saldo ? 'Pago completo: la obligación quedará al día.' : '';
      textoSaldo.classList.toggle('texto-alerta', v > saldo);
    };
    detalle.querySelectorAll('[name=obligacion]').forEach((r) => r.onchange = () => {
      detalle.querySelector('.concepto-libre').hidden = Boolean(r.value);
      if (r.value) valorInput.value = r.dataset.saldo;
      actualizarTexto();
    });
    valorInput.addEventListener('input', actualizarTexto);
    actualizarTexto();

    detalle.querySelector('.guardar').onclick = async (e) => {
      const btn = e.target; btn.disabled = true;
      try {
        const sel = detalle.querySelector('[name=obligacion]:checked');
        const datos = leer(detalle.querySelector('.paso-datos'));
        const fila = { deportista_id: d.id, valor: datos.valor, fecha_pago: datos.fecha_pago, medio: datos.medio, referencia: datos.referencia, observaciones: datos.observaciones };
        if (sel?.value) fila.obligacion_id = sel.value;
        else {
          const libre = leer(detalle.querySelector('.concepto-libre'));
          if (!libre.concepto) throw new Error('Indique el concepto del pago.');
          fila.concepto = libre.concepto; fila.periodo = libre.periodo;
        }
        const [pago] = await q(sb.from('pagos').insert(fila).select('*'));
        aviso('Pago registrado');
        comprobanteListo(pago, d, acudiente, ctx);
        bus.limpiar();
        setTimeout(() => bus.input.focus(), 50);
      } catch (err) { avisoError(err); }
      finally { btn.disabled = false; }
    };
  }

  if (deportistaId) {
    const [d] = await q(sb.from('deportistas').select('*').eq('id', deportistaId));
    if (d) { bus.input.value = nombreCompleto(d); mostrar(d); }
  }
}

function comprobanteListo(pago, d, acudiente, ctx) {
  const tel = (acudiente?.telefono || '').replace(/\D/g, '');
  const texto = `${ctx.club.nombre}\nComprobante de pago N.º ${pago.id.slice(0, 8).toUpperCase()}\n` +
    `Deportista: ${nombreCompleto(d)} (${d.codigo})\nConcepto: ${pago.concepto} ${nombrePeriodo(pago.periodo)}\n` +
    `Valor: ${pesos(pago.valor)}\nFecha: ${fecha(pago.fecha_pago)}\nMedio: ${pago.medio || ''}\n¡Gracias!`;
  abrirModal({
    titulo: 'Pago registrado',
    cuerpo: `<p><strong>${pesos(pago.valor)}</strong> de ${esc(nombreCompleto(d))} · ${esc(pago.concepto)} ${esc(nombrePeriodo(pago.periodo))}</p>
      <div class="atajos">
        <button class="btn btn-sec imprimir">Imprimir comprobante</button>
        ${tel ? `<a class="btn btn-whatsapp" target="_blank" rel="noopener" href="https://wa.me/57${tel.slice(-10)}?text=${encodeURIComponent(texto)}">Enviar al acudiente por WhatsApp</a>` : ''}
      </div>`,
    botones: [{ texto: 'Listo', clase: 'btn-pri' }],
  }).querySelector('.imprimir').onclick = () => imprimirComprobante(pago, d, ctx);
}

export function imprimirComprobante(pago, d, ctx) {
  const w = window.open('', '_blank', 'width=420,height=600');
  if (!w) return aviso('Permita las ventanas emergentes para imprimir.', 'error');
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante</title>
    <style>body{font-family:system-ui,sans-serif;padding:24px;max-width:360px;margin:auto;color:#111}h1{font-size:18px;margin:0}
    .n{color:#555;font-size:13px}table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:6px 0;border-bottom:1px solid #ddd;font-size:14px}
    td:last-child{text-align:right;font-weight:600}.total{font-size:22px;text-align:center;margin:12px 0}.pie{font-size:12px;color:#666;text-align:center}</style></head>
    <body><h1>${esc(ctx.club.nombre)}</h1><div class="n">Comprobante de pago N.º ${esc(pago.id.slice(0, 8).toUpperCase())}</div>
    <table><tr><td>Deportista</td><td>${esc(nombreCompleto(d))}</td></tr><tr><td>Código</td><td>${esc(d.codigo)}</td></tr>
    <tr><td>Concepto</td><td>${esc(pago.concepto)} ${esc(nombrePeriodo(pago.periodo))}</td></tr><tr><td>Fecha</td><td>${fecha(pago.fecha_pago)}</td></tr>
    <tr><td>Medio</td><td>${esc(pago.medio || '')}</td></tr>${pago.referencia ? `<tr><td>Referencia</td><td>${esc(pago.referencia)}</td></tr>` : ''}</table>
    <div class="total">${pesos(pago.valor)}</div><p class="pie">Gracias por su pago.</p>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ------------------------------------------------------------------ CARTERA
async function cartera(zona, ctx) {
  zona.innerHTML = `${bannerSinTarifa(ctx)}
    <div class="barra">
      <select class="vista-cartera"><option value="periodo">Por período</option><option value="deportista">Por deportista (todos los períodos)</option></select>
      <input type="month" class="periodo" value="${periodoActual()}">
      <select class="estado"><option value="saldo">Con saldo pendiente</option><option value="todas">Todas</option></select>
      <input type="search" class="filtro" placeholder="Buscar deportista…">
      <span class="espaciador"></span>
      <button class="btn btn-sec exportar">Exportar</button>
      ${ctx.tarifasActivas ? '<button class="btn btn-pri generar">Generar cobros del período</button>' : ''}
    </div>
    <div class="resumen-tabla"></div><div class="tabla-zona">${cargando()}</div>`;
  const $ = (s) => zona.querySelector(s);
  let filas = [], deps = {};

  async function cargar() {
    if (!$('.tabla-zona')) return;
    $('.tabla-zona').innerHTML = cargando();
    const porPeriodo = $('.vista-cartera').value === 'periodo';
    $('.periodo').hidden = !porPeriodo;
    let c = sb.from('v_obligaciones').select('*').eq('anulada', false).order('periodo', { ascending: false }).limit(5000);
    if (porPeriodo) c = c.in('periodo', [$('.periodo').value, 'UNICO']);
    if ($('.estado').value === 'saldo') c = c.gt('saldo', 0);
    try {
      filas = await q(c);
      const ids = [...new Set(filas.map((f) => f.deportista_id))];
      deps = {};
      for (let i = 0; i < ids.length; i += 150) {
        const parte = await q(sb.from('deportistas').select('id, codigo, nombres, apellidos, deportista_acudiente(acudientes(telefono, nombres))').in('id', ids.slice(i, i + 150)));
        parte.forEach((d) => (deps[d.id] = d));
      }
      pintar();
    } catch (e) { if ($('.tabla-zona')) $('.tabla-zona').innerHTML = vacio(e.message); }
  }

  function visibles() {
    const t = $('.filtro').value.trim().toLowerCase();
    return t ? filas.filter((f) => nombreCompleto(deps[f.deportista_id]).toLowerCase().includes(t) || deps[f.deportista_id]?.codigo.toLowerCase().includes(t)) : filas;
  }

  function pintar() {
    if (!$('.tabla-zona')) return;
    const v = visibles();
    const suma = (k) => v.reduce((s, f) => s + Number(f[k]), 0);
    $('.resumen-tabla').innerHTML = `<div class="mini-tarjetas"><div><b>${pesos(suma('valor') - suma('descuento'))}</b>cobrado</div><div><b>${pesos(suma('abonado'))}</b>abonado</div><div><b class="texto-alerta">${pesos(suma('saldo'))}</b>saldo pendiente</div></div>`;
    if (!v.length) {
      $('.tabla-zona').innerHTML = vacio(ctx.tarifasActivas ? (filas.length ? 'Sin resultados.' : 'No hay cobros con saldo en este período. Use "Generar cobros del período" para crear las mensualidades.') : 'Sin cartera: el cobro está pendiente de configuración.');
      return;
    }
    if ($('.vista-cartera').value === 'deportista') {
      const grupos = {};
      v.forEach((f) => { (grupos[f.deportista_id] ||= { saldo: 0, n: 0, conceptos: [] }); grupos[f.deportista_id].saldo += Number(f.saldo); grupos[f.deportista_id].n++; grupos[f.deportista_id].conceptos.push(`${f.concepto} ${nombrePeriodo(f.periodo)}`); });
      const orden = Object.entries(grupos).sort((a, b) => b[1].saldo - a[1].saldo);
      $('.tabla-zona').innerHTML = `<table class="tabla"><thead><tr><th>Deportista</th><th>Cobros pendientes</th><th>Saldo total</th><th></th></tr></thead><tbody>
        ${orden.map(([id, g]) => { const d = deps[id] || {}; return `<tr data-dep="${id}"><td data-l="Deportista"><strong>${esc(nombreCompleto(d))}</strong><br><small>${esc(d.codigo)}</small></td>
          <td data-l="Pendientes">${esc(g.conceptos.join(', '))}</td><td data-l="Saldo"><b>${pesos(g.saldo)}</b></td>
          <td class="acciones">${botonRecordar(d, g.saldo, ctx)}<button class="btn-mini pri cobrar">Cobrar</button></td></tr>`; }).join('')}</tbody></table>`;
    } else {
      $('.tabla-zona').innerHTML = `<table class="tabla"><thead><tr><th>Deportista</th><th>Concepto</th><th>Valor</th><th>Abonado</th><th>Saldo</th><th>Vence</th><th>Estado</th><th></th></tr></thead><tbody>
        ${v.map((f) => { const d = deps[f.deportista_id] || {}; return `<tr data-dep="${f.deportista_id}" data-id="${f.id}">
          <td data-l="Deportista"><strong>${esc(nombreCompleto(d))}</strong><br><small>${esc(d.codigo)}</small></td>
          <td data-l="Concepto">${esc(f.concepto)} ${esc(nombrePeriodo(f.periodo))}</td>
          <td data-l="Valor">${pesos(f.valor - f.descuento)}${Number(f.descuento) ? `<br><small>desc. ${pesos(f.descuento)}</small>` : ''}</td>
          <td data-l="Abonado">${pesos(f.abonado)}</td><td data-l="Saldo"><b>${pesos(f.saldo)}</b></td>
          <td data-l="Vence">${fecha(f.fecha_vencimiento)}</td><td data-l="Estado">${chip(f.estado_pago)}</td>
          <td class="acciones">${Number(f.saldo) > 0 ? `${botonRecordar(d, f.saldo, ctx, `${f.concepto} ${nombrePeriodo(f.periodo)}`)}<button class="btn-mini pri cobrar">Cobrar</button>` : ''}
          ${Number(f.abonado) === 0 ? '<button class="btn-mini peligro anular">Anular</button>' : ''}</td></tr>`; }).join('')}</tbody></table>`;
    }
  }

  $('.tabla-zona').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    if (e.target.closest('.cobrar')) return ctx.ir('registrar', tr.dataset.dep);
    if (e.target.closest('.anular')) {
      if (!(await confirmar('¿Anular este cobro? Dejará de contar en la cartera.', { si: 'Anular', peligro: true }))) return;
      try { await q(sb.from('obligaciones').update({ anulada: true }).eq('id', tr.dataset.id)); aviso('Cobro anulado'); cargar(); } catch (err) { avisoError(err); }
    }
  });
  $('.generar')?.addEventListener('click', async () => {
    const p = $('.periodo').value || periodoActual();
    if (!(await confirmar(`Se crearán los cobros mensuales de ${nombrePeriodo(p)} para todos los deportistas activos según las tarifas configuradas. Si ya existen, no se duplican.`, { si: 'Generar cobros' }))) return;
    try { const r = await rpc('generar_obligaciones', { p_periodo: p }); aviso(r.mensaje); $('.vista-cartera').value = 'periodo'; cargar(); } catch (err) { avisoError(err); }
  });
  ['.vista-cartera', '.periodo', '.estado'].forEach((s) => $(s).addEventListener('change', cargar));
  $('.filtro').addEventListener('input', debounce(pintar, 150));
  $('.exportar').onclick = () => descargarCSV(`cartera-${$('.periodo').value}`, visibles(), [
    [(f) => deps[f.deportista_id]?.codigo, 'Código'], [(f) => nombreCompleto(deps[f.deportista_id]), 'Deportista'],
    ['concepto', 'Concepto'], [(f) => nombrePeriodo(f.periodo), 'Período'], [(f) => f.valor - f.descuento, 'Valor'],
    ['abonado', 'Abonado'], ['saldo', 'Saldo'], [(f) => fecha(f.fecha_vencimiento), 'Vence'], ['estado_pago', 'Estado'],
  ]);
  cargar();
}

function botonRecordar(d, saldo, ctx, concepto = '') {
  const a = d.deportista_acudiente?.[0]?.acudientes;
  const tel = (a?.telefono || '').replace(/\D/g, '');
  if (!tel) return '';
  const txt = `Hola${a.nombres ? ' ' + a.nombres.split(' ')[0] : ''}. Le recordamos desde ${ctx.club.nombre} que ${d.nombres} tiene un saldo pendiente de ${pesos(saldo)}${concepto ? ` por ${concepto}` : ''}. ¡Gracias!`;
  return `<a class="btn-mini enlace-wa" target="_blank" rel="noopener" href="https://wa.me/57${tel.slice(-10)}?text=${encodeURIComponent(txt)}">Recordar</a>`;
}

// ------------------------------------------------------------------ HISTORIAL
async function historial(zona, ctx) {
  const ini = periodoActual() + '-01';
  zona.innerHTML = `
    <div class="barra">
      <label>Desde <input type="date" class="desde" value="${ini}"></label>
      <label>Hasta <input type="date" class="hasta" value="${hoy()}"></label>
      <input type="search" class="filtro" placeholder="Buscar deportista o concepto…">
      <span class="espaciador"></span><button class="btn btn-sec exportar">Exportar</button>
    </div>
    <div class="resumen-tabla"></div><div class="tabla-zona">${cargando()}</div>`;
  const $ = (s) => zona.querySelector(s);
  let filas = [];
  async function cargar() {
    try {
      filas = await q(sb.from('pagos').select('*, deportistas!pagos_deportista_id_club_id_fkey(id, codigo, nombres, apellidos)')
        .gte('fecha_pago', $('.desde').value).lte('fecha_pago', $('.hasta').value)
        .order('fecha_pago', { ascending: false }).order('creado_en', { ascending: false }).limit(5000));
      pintar();
    } catch (e) { if ($('.tabla-zona')) $('.tabla-zona').innerHTML = vacio(e.message); }
  }
  const visibles = () => {
    const t = $('.filtro').value.trim().toLowerCase();
    return t ? filas.filter((p) => `${nombreCompleto(p.deportistas)} ${p.deportistas?.codigo} ${p.concepto}`.toLowerCase().includes(t)) : filas;
  };
  function pintar() {
    if (!$('.tabla-zona')) return;
    const v = visibles();
    const porMedio = {};
    v.forEach((p) => (porMedio[p.medio || 'Sin medio'] = (porMedio[p.medio || 'Sin medio'] || 0) + Number(p.valor)));
    $('.resumen-tabla').innerHTML = `<div class="mini-tarjetas"><div><b>${pesos(v.reduce((s, p) => s + Number(p.valor), 0))}</b>recaudo (${v.length} pagos)</div>
      ${Object.entries(porMedio).map(([m, t]) => `<div><b>${pesos(t)}</b>${esc(m)}</div>`).join('')}</div>`;
    if (!v.length) { $('.tabla-zona').innerHTML = vacio('No hay pagos en este rango de fechas.'); return; }
    $('.tabla-zona').innerHTML = `<table class="tabla"><thead><tr><th>Fecha</th><th>Deportista</th><th>Concepto</th><th>Valor</th><th>Medio</th><th>Referencia</th><th></th></tr></thead><tbody>
      ${v.map((p) => `<tr data-id="${p.id}"><td data-l="Fecha">${fecha(p.fecha_pago)}</td>
        <td data-l="Deportista"><strong>${esc(nombreCompleto(p.deportistas))}</strong><br><small>${esc(p.deportistas?.codigo)}</small></td>
        <td data-l="Concepto">${esc(p.concepto)} ${esc(nombrePeriodo(p.periodo))}</td><td data-l="Valor"><b>${pesos(p.valor)}</b></td>
        <td data-l="Medio">${esc(p.medio || '')}</td><td data-l="Referencia">${esc(p.referencia || '')}</td>
        <td class="acciones"><button class="btn-mini comprobante">Comprobante</button><button class="btn-mini peligro eliminar">Eliminar</button></td></tr>`).join('')}</tbody></table>`;
  }
  $('.tabla-zona').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const p = filas.find((x) => x.id === tr.dataset.id);
    if (e.target.closest('.comprobante')) imprimirComprobante(p, p.deportistas, ctx);
    if (e.target.closest('.eliminar')) {
      if (!(await confirmar(`¿Eliminar el pago de ${pesos(p.valor)} de ${nombreCompleto(p.deportistas)}? Úselo solo para corregir errores de digitación; el saldo del cobro se restablecerá.`, { si: 'Eliminar pago', peligro: true }))) return;
      try { await q(sb.from('pagos').delete().eq('id', p.id)); aviso('Pago eliminado'); cargar(); } catch (err) { avisoError(err); }
    }
  });
  ['.desde', '.hasta'].forEach((s) => $(s).addEventListener('change', cargar));
  $('.filtro').addEventListener('input', debounce(pintar, 150));
  $('.exportar').onclick = () => descargarCSV('pagos', visibles(), [
    [(p) => fecha(p.fecha_pago), 'Fecha'], [(p) => p.deportistas?.codigo, 'Código'], [(p) => nombreCompleto(p.deportistas), 'Deportista'],
    ['concepto', 'Concepto'], [(p) => nombrePeriodo(p.periodo), 'Período'], ['valor', 'Valor'], ['medio', 'Medio'], ['referencia', 'Referencia'], ['observaciones', 'Observaciones'],
  ]);
  cargar();
}

// ------------------------------------------------------------------ TARIFAS
async function tarifas(zona, ctx) {
  zona.innerHTML = `<div class="alerta alerta-info">Defina aquí el valor de la mensualidad cuando el área deportiva lo confirme. Mientras no exista una tarifa activa, la plataforma no genera deudas.
    Si define una tarifa para una categoría, esa reemplaza a la tarifa general para los deportistas de esa categoría.</div><div class="zona"></div>`;
  crud(zona.querySelector('.zona'), {
    tabla: 'tarifas', singular: 'tarifa', nuevoTexto: 'Nueva tarifa',
    select: '*, categorias(nombre)', orden: ['concepto', true],
    vacio: 'Sin tarifas: el cobro está pendiente de configuración.',
    columnas: [
      { l: 'Concepto', v: (t) => `<strong>${esc(t.concepto)}</strong>` },
      { l: 'Aplica a', v: (t) => esc(t.categorias?.nombre || 'Todas las categorías') },
      { l: 'Valor', v: (t) => pesos(t.valor) },
      { l: 'Periodicidad', v: (t) => t.periodicidad === 'mensual' ? `Mensual · vence el día ${t.dia_vencimiento}` : 'Cobro único' },
      { l: 'Desde', v: (t) => fecha(t.fecha_inicio) },
      { l: 'Estado', v: (t) => chip(t.activa ? 'activo' : 'inactivo') },
    ],
    campos: async () => [
      { n: 'concepto', l: 'Concepto', req: true, def: 'Mensualidad', dl: ['Mensualidad', 'Inscripción anual', 'Uniforme', 'Torneo'] },
      { n: 'categoria_id', l: 'Categoría', t: 'select', vacio: 'Todas las categorías', opts: await opciones('categorias') },
      { n: 'valor', l: 'Valor', t: 'number', req: true, min: 1, step: 1 },
      { n: 'periodicidad', l: 'Periodicidad', t: 'select', vacio: false, opts: [['mensual', 'Mensual'], ['unico', 'Cobro único']] },
      { n: 'dia_vencimiento', l: 'Día de vencimiento (mensual)', t: 'number', min: 1, max: 28, def: 5 },
      { n: 'fecha_inicio', l: 'Fecha de inicio de cobro', t: 'date', req: true, def: hoy() },
      { n: 'activa', l: 'Tarifa activa', t: 'checkbox', def: true },
    ],
    antesGuardar: (d) => { d.dia_vencimiento = d.dia_vencimiento || 5; return d; },
    despuesGuardar: () => ctx.ir('tarifas'),
    acciones: (t) => t.periodicidad === 'unico' && t.activa ? [{ texto: 'Cobrar a deportistas activos', fn: async () => {
      if (!(await confirmar(`Se creará el cobro "${t.concepto}" por ${pesos(t.valor)} a cada deportista activo${t.categorias ? ' de ' + t.categorias.nombre : ''} que aún no lo tenga.`, { si: 'Crear cobros' }))) return;
      try { const r = await rpc('generar_cobro_unico', { p_tarifa: t.id }); aviso(r.mensaje); } catch (e) { avisoError(e); }
    } }] : [],
  });
}
