import { sb, q, rpc } from './supabase.js';
import { esc, fecha, edad, pesos, nombreCompleto, chip, aviso, avisoError, abrirModal, campos, leer, cargando, vacio, nombrePeriodo, ETIQUETAS_ESTADO, descargarCSV, copiarTexto } from './ui.js';

export const TIPOS_DOC_DEP = [['RC', 'Registro civil'], ['TI', 'Tarjeta de identidad'], ['CC', 'Cédula de ciudadanía'], ['CE', 'Cédula de extranjería'], ['PPT', 'PPT'], ['PA', 'Pasaporte']];
export const TIPOS_DOC_ADULTO = [['CC', 'Cédula de ciudadanía'], ['CE', 'Cédula de extranjería'], ['PPT', 'PPT'], ['PA', 'Pasaporte']];
export const PARENTESCOS = ['Madre', 'Padre', 'Abuelo(a)', 'Tío(a)', 'Hermano(a)', 'Tutor legal', 'Otro'];

export function camposDeportista(cats, grupos) {
  return [
    { n: 'nombres', l: 'Nombres', req: true },
    { n: 'apellidos', l: 'Apellidos', req: true },
    { n: 'tipo_documento', l: 'Tipo de documento', t: 'select', opts: TIPOS_DOC_DEP, req: true, def: 'TI', vacio: false },
    { n: 'numero_documento', l: 'Número de documento', req: true, inputmode: 'numeric' },
    { n: 'fecha_nacimiento', l: 'Fecha de nacimiento', t: 'date' },
    { n: 'sexo', l: 'Sexo', t: 'select', opts: [['Masculino', 'Masculino'], ['Femenino', 'Femenino']] },
    { n: 'direccion', l: 'Dirección' },
    { n: 'barrio', l: 'Barrio' },
    { n: 'telefono', l: 'Teléfono', t: 'tel' },
    { n: 'eps', l: 'EPS' },
    { n: 'categoria_id', l: 'Categoría', t: 'select', opts: cats.map((c) => [c.id, c.nombre]) },
    { n: 'grupo_id', l: 'Grupo', t: 'select', opts: grupos.map((g) => [g.id, g.nombre]) },
    { n: 'estado', l: 'Estado', t: 'select', vacio: false, def: 'activo', opts: ['activo', 'pendiente', 'inactivo', 'retirado'].map((e) => [e, ETIQUETAS_ESTADO[e]]) },
    { n: 'descuento_porcentaje', l: 'Descuento en mensualidad (%)', t: 'number', min: 0, max: 100, step: 1, def: 0, ayuda: 'Solo si el club otorga descuentos (becas, hermanos…)' },
    { n: 'fecha_inscripcion', l: 'Fecha de inscripción', t: 'date' },
    { n: 'observaciones_salud', l: 'Observaciones de salud', t: 'textarea', ancho: 'completo', filas: 2 },
  ];
}

export const camposAcudiente = (pref = '') => [
  { n: pref + 'nombres', l: 'Nombres', req: true },
  { n: pref + 'apellidos', l: 'Apellidos', req: true },
  { n: pref + 'tipo_documento', l: 'Tipo de documento', t: 'select', opts: TIPOS_DOC_ADULTO, def: 'CC', vacio: false },
  { n: pref + 'numero_documento', l: 'Número de documento', req: true, inputmode: 'numeric' },
  { n: pref + 'parentesco', l: 'Parentesco', dl: PARENTESCOS, req: true },
  { n: pref + 'telefono', l: 'Teléfono / WhatsApp', t: 'tel', req: true },
  { n: pref + 'correo', l: 'Correo electrónico', t: 'email' },
  { n: pref + 'direccion', l: 'Dirección' },
];

const sinPrefijo = (obj, pref) => Object.fromEntries(Object.entries(obj).filter(([k]) => k.startsWith(pref)).map(([k, v]) => [k.slice(pref.length), v]));

async function catalogos() {
  const [cats, grupos] = await Promise.all([
    q(sb.from('categorias').select('id, nombre, edad_min, edad_max').order('nombre')),
    q(sb.from('grupos').select('id, nombre, categoria_id').order('nombre')),
  ]);
  return { cats, grupos };
}

export async function vista(el, ctx) {
  const { cats, grupos } = await catalogos();
  el.innerHTML = `
    <div class="barra">
      <input type="search" class="filtro" placeholder="Buscar por nombre, documento o código…">
      <select class="f-estado"><option value="">Todos (sin rechazados)</option>${['activo', 'pendiente', 'inactivo', 'retirado', 'rechazado'].map((e) => `<option value="${e}" ${e === 'activo' ? 'selected' : ''}>${ETIQUETAS_ESTADO[e]}</option>`).join('')}</select>
      <select class="f-cat"><option value="">Todas las categorías</option>${cats.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select>
      <select class="f-grupo"><option value="">Todos los grupos</option><option value="__sin">Sin grupo</option>${grupos.map((g) => `<option value="${g.id}">${esc(g.nombre)}</option>`).join('')}</select>
      <label class="campo-check"><input type="checkbox" class="f-incompletos"> Solo datos incompletos</label>
      <span class="espaciador"></span>
      <button class="btn btn-sec enlaces-act">Enlaces de actualización</button>
      <button class="btn btn-sec exportar">Exportar</button>
      <button class="btn btn-pri nuevo">+ Nuevo deportista</button>
    </div>
    <div class="resumen-tabla"></div>
    <div class="tabla-zona">${cargando()}</div>`;
  const zona = el.querySelector('.tabla-zona');
  const nomCat = Object.fromEntries(cats.map((c) => [c.id, c.nombre]));
  const nomGrupo = Object.fromEntries(grupos.map((g) => [g.id, g.nombre]));
  let filas = [];

  async function cargar() {
    let c = sb.from('deportistas').select('*, deportista_acudiente(parentesco, acudientes(nombres, apellidos, telefono))').order('apellidos').order('nombres').limit(2000);
    const est = el.querySelector('.f-estado').value, cat = el.querySelector('.f-cat').value, gr = el.querySelector('.f-grupo').value;
    c = est ? c.eq('estado', est) : c.neq('estado', 'rechazado');
    if (cat) c = c.eq('categoria_id', cat);
    if (gr === '__sin') c = c.is('grupo_id', null); else if (gr) c = c.eq('grupo_id', gr);
    try { filas = await q(c); pintar(); } catch (e) { zona.innerHTML = vacio(e.message); }
  }

  function filtradas() {
    const base = el.querySelector('.f-incompletos').checked ? filas.filter(incompleto) : filas;
    const palabras = el.querySelector('.filtro').value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').split(/\s+/).filter(Boolean);
    if (!palabras.length) return base;
    return base.filter((d) => {
      const t = `${d.nombres} ${d.apellidos} ${d.numero_documento} ${d.codigo}`.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      return palabras.every((p) => t.includes(p));
    });
  }

  function pintar() {
    const v = filtradas();
    el.querySelector('.resumen-tabla').textContent = `${v.length} deportista(s)`;
    if (!v.length) { zona.innerHTML = vacio(filas.length ? 'Ningún deportista coincide con la búsqueda.' : 'No hay deportistas con estos filtros.'); return; }
    zona.innerHTML = `<table class="tabla clicable"><thead><tr><th>Código</th><th>Deportista</th><th>Documento</th><th>Edad</th><th>Categoría</th><th>Grupo</th><th>Acudiente</th><th>Estado</th></tr></thead><tbody>
      ${v.map((d) => { const a = d.deportista_acudiente?.[0]; return `<tr data-id="${d.id}">
        <td data-l="Código">${esc(d.codigo)}</td><td data-l="Deportista"><strong>${esc(nombreCompleto(d))}</strong></td>
        <td data-l="Documento">${esc(d.numero_documento)}</td><td data-l="Edad">${edad(d.fecha_nacimiento)}</td>
        <td data-l="Categoría">${esc(nomCat[d.categoria_id] || '—')}</td><td data-l="Grupo">${esc(nomGrupo[d.grupo_id] || '—')}</td>
        <td data-l="Acudiente">${a ? `${esc(nombreCompleto(a.acudientes))}<br><small>${esc(a.acudientes?.telefono || '')}</small>` : '<span class="texto-alerta">Sin acudiente</span>'}</td>
        <td data-l="Estado">${chip(d.estado)}</td></tr>`; }).join('')}</tbody></table>`;
  }

  zona.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) ficha(tr.dataset.id, { cats, grupos, alCambiar: cargar, club: ctx.club }); });
  el.querySelector('.filtro').addEventListener('input', pintar);
  el.querySelectorAll('select').forEach((s) => s.addEventListener('change', cargar));
  el.querySelector('.f-incompletos').addEventListener('change', pintar);
  el.querySelector('.enlaces-act').onclick = () => enlacesMasivos(filtradas(), ctx);
  el.querySelector('.nuevo').onclick = () => nuevoDeportista({ cats, grupos, alCambiar: cargar });
  el.querySelector('.exportar').onclick = () => descargarCSV('deportistas', filtradas(), [
    ['codigo', 'Código'], ['nombres', 'Nombres'], ['apellidos', 'Apellidos'], ['tipo_documento', 'Tipo doc.'], ['numero_documento', 'Documento'],
    [(d) => fecha(d.fecha_nacimiento), 'Nacimiento'], [(d) => edad(d.fecha_nacimiento), 'Edad'], [(d) => nomCat[d.categoria_id] || '', 'Categoría'],
    [(d) => nomGrupo[d.grupo_id] || '', 'Grupo'], [(d) => ETIQUETAS_ESTADO[d.estado], 'Estado'],
    [(d) => nombreCompleto(d.deportista_acudiente?.[0]?.acudientes), 'Acudiente'], [(d) => d.deportista_acudiente?.[0]?.acudientes?.telefono || '', 'Teléfono acudiente'],
  ]);
  await cargar();
  if (ctx.params[0]) ficha(ctx.params[0], { cats, grupos, alCambiar: cargar, club: ctx.club });
}

function nuevoDeportista({ cats, grupos, alCambiar }) {
  abrirModal({
    titulo: 'Nuevo deportista', ancho: 'ancho',
    cuerpo: `${campos(camposDeportista(cats, grupos))}
      <h4 class="form-subtitulo">Acudiente</h4>
      <p class="ayuda">Si el acudiente ya está registrado (por ejemplo, tiene otro hijo en el club), escriba su mismo documento: se relacionará sin duplicar sus datos.</p>
      ${campos(camposAcudiente('a_'))}`,
    botones: [
      { texto: 'Cancelar', clase: 'btn-sec' },
      { texto: 'Guardar', clase: 'btn-pri', accion: async (m) => {
        const datos = leer(m);
        const acu = sinPrefijo(datos, 'a_');
        const dep = Object.fromEntries(Object.entries(datos).filter(([k]) => !k.startsWith('a_')));
        const r = await rpc('registrar_deportista', { p_deportista: dep, p_acudiente: acu });
        aviso(`Deportista registrado con el código ${r.codigo}`);
        alCambiar?.();
      } },
    ],
  });
}

export async function ficha(id, opciones = {}) {
  const { cats, grupos } = opciones.cats ? opciones : await catalogos();
  const m = abrirModal({ titulo: 'Ficha del deportista', ancho: 'ancho', cuerpo: cargando() });
  const cuerpo = m.querySelector('.modal-cuerpo');
  async function pintar() {
    const [[d], vinc, obls, pagos, asis, docs, sol, acts] = await Promise.all([
      q(sb.from('deportistas').select('*').eq('id', id)),
      q(sb.from('deportista_acudiente').select('parentesco, principal, acudientes(*)').eq('deportista_id', id)),
      q(sb.from('v_obligaciones').select('*').eq('deportista_id', id).eq('anulada', false).order('periodo', { ascending: false })),
      q(sb.from('pagos').select('*').eq('deportista_id', id).order('fecha_pago', { ascending: false }).limit(20)),
      q(sb.from('asistencia').select('estado, fecha').eq('deportista_id', id).order('fecha', { ascending: false }).limit(500)),
      q(sb.from('documentos').select('*').eq('deportista_id', id).order('creado_en', { ascending: false })),
      q(sb.from('solicitudes').select('estado, creado_en, revisado_en, motivo_rechazo').eq('deportista_id', id)),
      q(sb.from('actualizaciones').select('creado_en').eq('deportista_id', id).order('creado_en')).catch(() => []),
    ]);
    if (!d) { cuerpo.innerHTML = vacio('Deportista no encontrado.'); return; }
    m.querySelector('h3').textContent = nombreCompleto(d);
    const cat = cats.find((c) => c.id === d.categoria_id), gr = grupos.find((g) => g.id === d.grupo_id);
    const saldo = obls.reduce((s, o) => s + Number(o.saldo), 0);
    const cuenta = (e) => asis.filter((a) => a.estado === e).length;
    const pct = asis.length ? Math.round(((cuenta('presente') + cuenta('tardanza')) / asis.length) * 100) : null;
    const dato = (t, v) => `<div><dt>${esc(t)}</dt><dd>${v ? esc(v) : '—'}</dd></div>`;
    cuerpo.innerHTML = `
      <div class="ficha-cabecera"><span class="codigo">${esc(d.codigo)}</span>${chip(d.estado)}
        <span class="espaciador"></span>
        <button class="btn btn-sec btn-mini editar">Editar datos</button>
        <button class="btn btn-sec btn-mini enlace-act">Enlace de actualización</button>
        <a class="btn btn-pri btn-mini" href="#/pagos/registrar/${d.id}">Registrar pago</a></div>
      <div class="dos-columnas">
        <section><h4>Datos personales</h4><dl class="datos">
          ${dato('Documento', `${d.tipo_documento} ${d.numero_documento}`)}${dato('Nacimiento', d.fecha_nacimiento ? `${fecha(d.fecha_nacimiento)} (${edad(d.fecha_nacimiento)} años)` : '')}
          ${dato('Sexo', d.sexo)}${dato('Dirección', [d.direccion, d.barrio].filter(Boolean).join(', '))}${dato('Teléfono', d.telefono)}${dato('EPS', d.eps)}
          ${dato('Categoría', cat?.nombre)}${dato('Grupo', gr?.nombre)}${dato('Inscripción', fecha(d.fecha_inscripcion))}
          ${Number(d.descuento_porcentaje) ? dato('Descuento', `${d.descuento_porcentaje}%`) : ''}${d.observaciones_salud ? dato('Salud', d.observaciones_salud) : ''}</dl></section>
        <section><h4>Acudientes <button class="btn-mini agregar-acu">+ Agregar</button></h4>
          ${vinc.length ? vinc.map((v) => { const a = v.acudientes; const tel = (a.telefono || '').replace(/\D/g, ''); return `<div class="tarjeta-persona">
            <strong>${esc(nombreCompleto(a))}</strong> <small>${esc(v.parentesco || '')}${v.principal ? ' · principal' : ''}</small><br>
            <small>${esc(a.tipo_documento)} ${esc(a.numero_documento)}${a.correo ? ' · ' + esc(a.correo) : ''}</small><br>
            ${a.telefono ? `${esc(a.telefono)} <a class="enlace-wa" target="_blank" rel="noopener" href="https://wa.me/57${tel.slice(-10)}">WhatsApp</a>` : ''}
            <button class="btn-mini peligro quitar-acu" data-acu="${a.id}">Quitar</button></div>`; }).join('') : '<p class="texto-alerta">Este deportista no tiene acudiente relacionado.</p>'}
        </section>
      </div>
      <div class="dos-columnas">
        <section><h4>Cartera ${obls.length ? `<span class="${saldo > 0 ? 'texto-alerta' : 'texto-ok'}">· Saldo ${pesos(saldo)}</span>` : ''}</h4>
          ${obls.length ? `<table class="tabla compacta"><thead><tr><th>Concepto</th><th>Valor</th><th>Abonado</th><th>Saldo</th><th></th></tr></thead><tbody>
            ${obls.map((o) => `<tr><td>${esc(o.concepto)} ${esc(nombrePeriodo(o.periodo))}</td><td>${pesos(o.valor - o.descuento)}</td><td>${pesos(o.abonado)}</td><td>${pesos(o.saldo)}</td><td>${chip(o.estado_pago)}</td></tr>`).join('')}</tbody></table>`
            : '<p class="ayuda">Sin cobros generados.</p>'}
          <h4>Últimos pagos</h4>
          ${pagos.length ? `<table class="tabla compacta"><tbody>${pagos.map((p) => `<tr><td>${fecha(p.fecha_pago)}</td><td>${esc(p.concepto)} ${esc(nombrePeriodo(p.periodo))}</td><td>${pesos(p.valor)}</td><td>${esc(p.medio || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="ayuda">Sin pagos registrados.</p>'}
        </section>
        <section><h4>Asistencia</h4>
          ${asis.length ? `<div class="mini-tarjetas"><div><b>${pct}%</b>asistencia</div><div><b>${cuenta('presente')}</b>presente</div><div><b>${cuenta('tardanza')}</b>tardanza</div><div><b>${cuenta('ausente')}</b>ausente</div><div><b>${cuenta('excusa')}</b>excusa</div></div>
            <p class="ayuda">Última: ${fecha(asis[0].fecha)} (${esc(ETIQUETAS_ESTADO[asis[0].estado])})</p>` : '<p class="ayuda">Sin registros de asistencia.</p>'}
          <h4>Documentos</h4>
          ${docs.length ? `<ul class="lista-docs">${docs.map((x) => `<li>${esc(x.tipo)} ${chip(x.estado)}</li>`).join('')}</ul>` : '<p class="ayuda">Sin documentos registrados.</p>'}
          <a class="btn-mini" href="#/documentos/${d.id}">Gestionar documentos</a>
          <h4>Historial</h4>
          <ul class="historial">
            <li>Inscripción: ${fecha(d.fecha_inscripcion)}</li>
            ${acts.map((x) => `<li>Datos actualizados por el acudiente el ${fecha(x.creado_en)}</li>`).join('')}
            ${sol.map((s) => `<li>Solicitud recibida ${fecha(s.creado_en)} — ${esc(ETIQUETAS_ESTADO[s.estado])}${s.revisado_en ? ` el ${fecha(s.revisado_en)}` : ''}${s.motivo_rechazo ? ` (${esc(s.motivo_rechazo)})` : ''}</li>`).join('')}
          </ul>
        </section>
      </div>`;

    cuerpo.querySelector('.enlace-act').onclick = () => enlacesMasivos([{ ...d, deportista_acudiente: vinc }], { club: opciones.club }, true);
    cuerpo.querySelector('.editar').onclick = () => abrirModal({
      titulo: `Editar ${nombreCompleto(d)}`, ancho: 'ancho', cuerpo: campos(camposDeportista(cats, grupos), d),
      botones: [{ texto: 'Cancelar', clase: 'btn-sec' }, { texto: 'Guardar', clase: 'btn-pri', accion: async (mm) => {
        const datos = leer(mm);
        if (!datos.fecha_inscripcion) delete datos.fecha_inscripcion;
        datos.descuento_porcentaje = datos.descuento_porcentaje ?? 0;
        await q(sb.from('deportistas').update(datos).eq('id', d.id));
        aviso('Datos actualizados'); pintar(); opciones.alCambiar?.();
      } }],
    });
    cuerpo.querySelector('.agregar-acu').onclick = () => abrirModal({
      titulo: 'Agregar acudiente', ancho: 'ancho',
      cuerpo: `<p class="ayuda">Si el acudiente ya existe en el club, basta con su número de documento, nombres y apellidos: se relaciona sin duplicarlo.</p>${campos(camposAcudiente())}`,
      botones: [{ texto: 'Cancelar', clase: 'btn-sec' }, { texto: 'Guardar', clase: 'btn-pri', accion: async (mm) => {
        await rpc('guardar_acudiente', { p_deportista: d.id, p_acudiente: leer(mm) });
        aviso('Acudiente relacionado'); pintar(); opciones.alCambiar?.();
      } }],
    });
    cuerpo.querySelectorAll('.quitar-acu').forEach((b) => b.onclick = async () => {
      try {
        await q(sb.from('deportista_acudiente').delete().eq('deportista_id', d.id).eq('acudiente_id', b.dataset.acu));
        aviso('Relación eliminada (el acudiente sigue registrado)'); pintar(); opciones.alCambiar?.();
      } catch (e) { avisoError(e); }
    });
    cuerpo.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', () => m.cerrar()));
  }
  try { await pintar(); } catch (e) { cuerpo.innerHTML = vacio(e.message); }
}

// ---------------- Enlaces de actualización de datos ----------------
export const incompleto = (d) => {
  const a = d.deportista_acudiente?.[0]?.acudientes;
  return !d.fecha_nacimiento || !a || !a.telefono;
};
const urlActualizar = (token) => {
  const u = new URL('actualizar.html', location.href.split('#')[0]);
  u.searchParams.set('t', token);
  return u.toString();
};

async function enlacesMasivos(lista, ctx, individual = false) {
  const club = ctx.club?.nombre || document.querySelector('.club-nombre')?.textContent || 'el club';
  if (!lista.length) return aviso('No hay deportistas en la lista actual.', 'error');
  let deps = lista;
  if (!individual) {
    const incompletos = lista.filter(incompleto);
    const elegido = await new Promise((resolve) => {
      const m = abrirModal({
        titulo: 'Enlaces de actualización de datos',
        cuerpo: `<p>Cada familia recibe un enlace personal para revisar y completar los datos de su hijo (fecha de nacimiento, EPS, teléfono, parentesco…). El enlace sirve una vez y vence en 30 días.</p>
          <p>¿Para quiénes quiere generar enlaces?</p>`,
        botones: [
          { texto: `Todos los de la lista (${lista.length})`, clase: 'btn-sec', accion: () => resolve(lista) },
          { texto: `Solo datos incompletos (${incompletos.length})`, clase: 'btn-pri', accion: () => resolve(incompletos) },
        ],
      });
      m.querySelector('.cerrar').addEventListener('click', () => resolve(null));
    });
    if (!elegido) return;
    if (!elegido.length) return aviso('Ningún deportista de la lista tiene datos incompletos.');
    deps = elegido;
  }
  const m = abrirModal({ titulo: individual ? `Enlace de actualización · ${nombreCompleto(deps[0])}` : `Enlaces de actualización (${deps.length})`, ancho: 'ancho', cuerpo: cargando('Generando enlaces…') });
  const cuerpo = m.querySelector('.modal-cuerpo');
  try {
    const enlaces = await rpc('generar_enlaces_actualizacion', { p_deportistas: deps.map((d) => d.id) });
    const token = Object.fromEntries(enlaces.map((e) => [e.deportista_id, e.token]));
    const filas = deps.map((d) => {
      const a = d.deportista_acudiente?.[0]?.acudientes;
      const url = urlActualizar(token[d.id]);
      const saludo = a?.nombres ? `Hola ${a.nombres.split(' ')[0]}. ` : 'Hola. ';
      const texto = `${saludo}Desde ${club} le pedimos actualizar los datos de ${d.nombres} en este enlace (toma 3 minutos):\n${url}`;
      const tel = (a?.telefono || '').replace(/\D/g, '');
      const wa = tel ? `https://wa.me/57${tel.slice(-10)}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
      return { d, a, url, texto, wa };
    });
    cuerpo.innerHTML = `
      <p class="ayuda">Envíe a cada familia su enlace. El botón WhatsApp abre el mensaje listo; si no hay teléfono registrado, WhatsApp le deja elegir el contacto.</p>
      ${individual ? '' : '<div class="atajos" style="margin:0 0 12px"><button class="btn btn-sec copiar-todo">Copiar todos los mensajes</button><button class="btn btn-sec csv">Descargar lista (CSV)</button></div>'}
      <table class="tabla compacta"><thead><tr><th>Deportista</th><th>Acudiente</th><th></th></tr></thead><tbody>
      ${filas.map((f, i) => `<tr data-i="${i}"><td data-l="Deportista"><strong>${esc(nombreCompleto(f.d))}</strong></td>
        <td data-l="Acudiente">${f.a ? esc(nombreCompleto(f.a)) : '<span class="texto-alerta">Sin acudiente</span>'}</td>
        <td class="acciones"><button class="btn-mini copiar">Copiar enlace</button><a class="btn-mini enlace-wa" target="_blank" rel="noopener" href="${esc(f.wa)}">WhatsApp</a></td></tr>`).join('')}
      </tbody></table>`;
    cuerpo.querySelectorAll('.copiar').forEach((b) => b.onclick = () => copiarTexto(filas[Number(b.closest('tr').dataset.i)].url));
    cuerpo.querySelector('.copiar-todo')?.addEventListener('click', () => copiarTexto(filas.map((f) => `${nombreCompleto(f.d)}:\n${f.url}`).join('\n\n')));
    cuerpo.querySelector('.csv')?.addEventListener('click', () => descargarCSV('enlaces-actualizacion', filas, [
      [(f) => f.d.codigo, 'Código'], [(f) => nombreCompleto(f.d), 'Deportista'], [(f) => nombreCompleto(f.a), 'Acudiente'],
      [(f) => f.a?.telefono || '', 'Teléfono'], ['url', 'Enlace'],
    ]));
  } catch (e) {
    cuerpo.innerHTML = vacio(/generar_enlaces_actualizacion|does not exist|schema cache/.test(e.message)
      ? 'Falta instalar la función en Supabase: ejecute el archivo 04_actualizacion_datos.sql.' : e.message);
  }
}
