import { sb, q, rpc } from './supabase.js';
import { esc, fecha, edad, nombreCompleto, chip, aviso, avisoError, abrirModal, campos, leer, copiarTexto, cargando, vacio, confirmar } from './ui.js';

export const urlEnlace = (token) => {
  const u = new URL('inscripcion.html', location.href.split('#')[0]);
  u.searchParams.set('t', token);
  return u.toString();
};
const mensajeWhatsApp = (club, url) =>
  `Hola. Este es el enlace para inscribir a su deportista en ${club}:\n${url}\n\nPor favor complete los datos del deportista y del acudiente.`;

export async function vista(el, ctx) {
  let pestaña = ctx.params[0] || 'pendiente';
  el.innerHTML = `
    <div class="panel">
      <h3>Generar enlace de inscripción</h3>
      <p class="ayuda">Comparta el enlace por WhatsApp. El padre o acudiente llena el formulario sin entrar a la plataforma.</p>
      <div class="fila-form">
        <div class="campo"><label>¿Para quién es? (opcional)</label><input name="descripcion" placeholder="Ej.: Familia Pérez"></div>
        <div class="campo"><label>Inscripciones permitidas</label><select name="max_usos">
          <option value="1">1 deportista</option><option value="2">Hasta 2 (hermanos)</option><option value="3">Hasta 3 (hermanos)</option><option value="">Sin límite (convocatoria abierta)</option></select></div>
        <div class="campo"><label>Vence en</label><select name="dias"><option value="7">7 días</option><option value="30" selected>30 días</option><option value="">No vence</option></select></div>
        <button class="btn btn-pri generar">Generar enlace</button>
      </div>
      <div class="enlace-generado" hidden></div>
    </div>
    <div class="pestañas">
      <button data-p="pendiente">Pendientes <span class="insignia n-pendiente"></span></button>
      <button data-p="aprobada">Aprobadas</button>
      <button data-p="rechazada">Rechazadas</button>
      <button data-p="enlaces">Enlaces generados</button>
    </div>
    <div class="contenido-pestaña"></div>`;

  const panel = el.querySelector('.panel');
  const caja = el.querySelector('.enlace-generado');
  const zona = el.querySelector('.contenido-pestaña');

  function mostrarEnlace(token) {
    const url = urlEnlace(token);
    const wa = `https://wa.me/?text=${encodeURIComponent(mensajeWhatsApp(ctx.club.nombre, url))}`;
    caja.hidden = false;
    caja.innerHTML = `<label>Enlace listo para compartir</label>
      <div class="enlace-fila"><input readonly value="${esc(url)}" class="enlace-url">
        <button class="btn btn-sec copiar">Copiar</button>
        <a class="btn btn-whatsapp" target="_blank" rel="noopener" href="${esc(wa)}">WhatsApp</a>
        ${navigator.share ? '<button class="btn btn-sec compartir">Compartir…</button>' : ''}</div>`;
    caja.querySelector('.copiar').onclick = () => copiarTexto(url);
    caja.querySelector('.enlace-url').onclick = (e) => e.target.select();
    caja.querySelector('.compartir')?.addEventListener('click', () =>
      navigator.share({ title: `Inscripción ${ctx.club.nombre}`, text: mensajeWhatsApp(ctx.club.nombre, url) }).catch(() => {}));
  }

  panel.querySelector('.generar').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const d = leer(panel);
      const fila = { descripcion: d.descripcion, max_usos: d.max_usos ?? null };
      if (d.dias) fila.expira_en = new Date(Date.now() + d.dias * 86400000).toISOString();
      const [nuevo] = await q(sb.from('enlaces_inscripcion').insert(fila).select('token'));
      mostrarEnlace(nuevo.token);
      aviso('Enlace generado');
      if (pestaña === 'enlaces') cargar();
    } catch (err) { avisoError(err); }
    finally { e.target.disabled = false; }
  };

  async function contarPendientes() {
    const n = await q(sb.from('solicitudes').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'));
    const insignia = el.querySelector('.n-pendiente');
    if (insignia) insignia.textContent = n || '';
    ctx.actualizarInsignias?.();
  }

  async function cargar() {
    el.querySelectorAll('.pestañas button').forEach((b) => b.classList.toggle('activo', b.dataset.p === pestaña));
    zona.innerHTML = cargando();
    try {
      if (pestaña === 'enlaces') return await pintarEnlaces();
      const filas = await q(sb.from('solicitudes')
        .select('*, deportistas(*), acudientes(*)')
        .eq('estado', pestaña).order('creado_en', { ascending: pestaña === 'pendiente' }).limit(300));
      if (!filas.length) {
        zona.innerHTML = vacio(pestaña === 'pendiente' ? 'No hay solicitudes pendientes. Cuando un acudiente envíe el formulario, aparecerá aquí.' : 'No hay solicitudes en este estado.');
        return;
      }
      zona.innerHTML = `<table class="tabla"><thead><tr><th>Deportista</th><th>Edad</th><th>Documento</th><th>Acudiente</th><th>Teléfono</th><th>Recibida</th><th>Estado</th><th></th></tr></thead><tbody>
        ${filas.map((s) => `<tr data-id="${s.id}">
          <td data-l="Deportista"><strong>${esc(nombreCompleto(s.deportistas))}</strong><br><small>${esc(s.deportistas?.codigo)}</small></td>
          <td data-l="Edad">${edad(s.deportistas?.fecha_nacimiento)}</td>
          <td data-l="Documento">${esc(s.deportistas?.tipo_documento)} ${esc(s.deportistas?.numero_documento)}</td>
          <td data-l="Acudiente">${esc(nombreCompleto(s.acudientes))}</td>
          <td data-l="Teléfono">${esc(s.acudientes?.telefono)}</td>
          <td data-l="Recibida">${fecha(s.creado_en)}</td>
          <td data-l="Estado">${chip(s.estado)}</td>
          <td class="acciones"><button class="btn-mini ${s.estado === 'pendiente' ? 'pri' : ''} revisar">${s.estado === 'pendiente' ? 'Revisar' : 'Ver'}</button></td></tr>`).join('')}
        </tbody></table>`;
      zona.querySelectorAll('.revisar').forEach((b) => b.onclick = () => revisar(filas.find((f) => f.id === b.closest('tr').dataset.id)));
    } catch (e) { zona.innerHTML = vacio(e.message); }
  }

  async function revisar(s) {
    const d = s.deportistas || {}, a = s.acudientes || {};
    const [cats, grupos] = await Promise.all([
      q(sb.from('categorias').select('*').eq('activa', true).order('nombre')),
      q(sb.from('grupos').select('*').eq('activo', true).order('nombre')),
    ]);
    const e = edad(d.fecha_nacimiento);
    const sugerida = cats.find((c) => c.edad_min != null && c.edad_max != null && e >= c.edad_min && e <= c.edad_max);
    const par = s.datos_enviados?.acudiente?.parentesco || '';
    const dato = (t, v) => v ? `<div><dt>${esc(t)}</dt><dd>${esc(v)}</dd></div>` : '';
    const tel = (a.telefono || '').replace(/\D/g, '');
    const pendiente = s.estado === 'pendiente';
    const m = abrirModal({
      titulo: `Solicitud de ${nombreCompleto(d)}`, ancho: 'ancho',
      cuerpo: `
        <div class="dos-columnas">
          <section><h4>Deportista</h4><dl class="datos">
            ${dato('Código', d.codigo)}${dato('Nombre', nombreCompleto(d))}${dato('Documento', `${d.tipo_documento} ${d.numero_documento}`)}
            ${dato('Nacimiento', `${fecha(d.fecha_nacimiento)} (${e} años)`)}${dato('Sexo', d.sexo)}${dato('Dirección', d.direccion)}${dato('Barrio', d.barrio)}
            ${dato('Teléfono', d.telefono)}${dato('EPS', d.eps)}${dato('Salud', d.observaciones_salud)}</dl></section>
          <section><h4>Acudiente</h4><dl class="datos">
            ${dato('Nombre', nombreCompleto(a))}${dato('Parentesco', par)}${dato('Documento', `${a.tipo_documento || ''} ${a.numero_documento || ''}`)}
            ${dato('Teléfono', a.telefono)}${dato('Correo', a.correo)}${dato('Dirección', a.direccion)}</dl>
            ${s.datos_enviados?.acudiente_ya_registrado ? '<p class="nota">Este acudiente ya estaba registrado en el club; se relacionó sin duplicar sus datos.</p>' : ''}
            ${tel ? `<a class="btn btn-whatsapp btn-mini" target="_blank" rel="noopener" href="https://wa.me/57${tel.slice(-10)}">Escribir por WhatsApp</a>` : ''}</section>
        </div>
        ${pendiente ? `<h4>Asignación (opcional)</h4>${campos([
          { n: 'categoria', l: 'Categoría', t: 'select', opts: cats.map((c) => [c.id, c.nombre]), def: sugerida?.id, ayuda: sugerida ? `Sugerida por edad: ${sugerida.nombre}` : (cats.length ? '' : 'Aún no hay categorías creadas') },
          { n: 'grupo', l: 'Grupo', t: 'select', opts: grupos.map((g) => [g.id, g.nombre]) },
          { n: 'motivo', l: 'Motivo (solo si rechaza)', t: 'textarea', ancho: 'completo', filas: 2 },
        ])}` : (s.motivo_rechazo ? `<p><strong>Motivo del rechazo:</strong> ${esc(s.motivo_rechazo)}</p>` : '')}`,
      botones: pendiente ? [
        { texto: 'Rechazar', clase: 'btn-peligro', accion: async (mm) => {
          const v = leer(mm, { validar: false });
          if (!(await confirmar(`¿Rechazar la solicitud de ${nombreCompleto(d)}?`, { si: 'Rechazar', peligro: true }))) return false;
          await rpc('rechazar_solicitud', { p_id: s.id, p_motivo: v.motivo });
          aviso('Solicitud rechazada'); cargar(); contarPendientes();
        } },
        { texto: 'Aprobar inscripción', clase: 'btn-pri', accion: async (mm) => {
          const v = leer(mm, { validar: false });
          await rpc('aprobar_solicitud', { p_id: s.id, p_categoria: v.categoria, p_grupo: v.grupo });
          aviso(`${nombreCompleto(d)} quedó inscrito y activo`); cargar(); contarPendientes();
        } },
      ] : [{ texto: 'Cerrar', clase: 'btn-sec' }],
    });
    return m;
  }

  async function pintarEnlaces() {
    const filas = await q(sb.from('enlaces_inscripcion').select('*').order('creado_en', { ascending: false }).limit(200));
    if (!filas.length) { zona.innerHTML = vacio('Aún no ha generado enlaces.'); return; }
    const vigente = (f) => f.activo && (!f.expira_en || new Date(f.expira_en) > new Date()) && (f.max_usos == null || f.usos < f.max_usos);
    zona.innerHTML = `<table class="tabla"><thead><tr><th>Para</th><th>Usos</th><th>Vence</th><th>Creado</th><th>Estado</th><th></th></tr></thead><tbody>
      ${filas.map((f) => `<tr data-id="${f.id}">
        <td data-l="Para">${esc(f.descripcion || '—')}</td>
        <td data-l="Usos">${f.usos} / ${f.max_usos ?? '∞'}</td>
        <td data-l="Vence">${f.expira_en ? fecha(f.expira_en) : 'No vence'}</td>
        <td data-l="Creado">${fecha(f.creado_en)}</td>
        <td data-l="Estado">${vigente(f) ? '<span class="chip chip-activo">Vigente</span>' : '<span class="chip chip-inactivo">Cerrado</span>'}</td>
        <td class="acciones">${vigente(f) ? '<button class="btn-mini copiar">Copiar</button><button class="btn-mini peligro cerrar-enlace">Desactivar</button>' : ''}</td></tr>`).join('')}
      </tbody></table>`;
    zona.querySelectorAll('.copiar').forEach((b) => b.onclick = () => {
      const f = filas.find((x) => x.id === b.closest('tr').dataset.id);
      mostrarEnlace(f.token); copiarTexto(urlEnlace(f.token)); window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    zona.querySelectorAll('.cerrar-enlace').forEach((b) => b.onclick = async () => {
      try { await q(sb.from('enlaces_inscripcion').update({ activo: false }).eq('id', b.closest('tr').dataset.id)); aviso('Enlace desactivado'); cargar(); }
      catch (e) { avisoError(e); }
    });
  }

  el.querySelectorAll('.pestañas button').forEach((b) => b.onclick = () => { pestaña = b.dataset.p; cargar(); });
  cargar();
  contarPendientes();
}
