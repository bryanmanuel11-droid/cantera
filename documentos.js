import { sb, q } from './supabase.js';
import { crud } from './crud.js';
import { esc, fecha, hoy, chip, nombreCompleto, cargando, vacio, avisoError, ETIQUETAS_ESTADO } from './ui.js';
import { subirArchivo, enlaceArchivo, campoArchivo } from './archivos.js';

const TIPOS_SUGERIDOS = ['Documento de identidad', 'Registro civil', 'Certificado de EPS', 'Certificado médico', 'Foto', 'Autorización del acudiente', 'Consentimiento informado'];

export async function vista(el, ctx) {
  const filtroDep = ctx.params[0] || '';
  const deps = await q(sb.from('deportistas').select('id, codigo, nombres, apellidos').neq('estado', 'rechazado').order('apellidos'));
  const requeridos = ctx.club.documentos_requeridos || [];
  el.innerHTML = `
    <div class="pestañas"><button data-p="registros" class="activo">Documentos recibidos</button><button data-p="estado">Estado por deportista</button></div>
    <div class="contenido-pestaña"></div>`;
  const zona = el.querySelector('.contenido-pestaña');
  const ir = (p) => {
    el.querySelectorAll('.pestañas button').forEach((b) => b.classList.toggle('activo', b.dataset.p === p));
    p === 'registros' ? registros() : estado();
  };
  el.querySelectorAll('.pestañas button').forEach((b) => b.onclick = () => ir(b.dataset.p));

  function registros() {
    crud(zona, {
      tabla: 'documentos', singular: 'documento', nuevoTexto: 'Registrar documento',
      select: '*, deportistas!documentos_deportista_id_club_id_fkey(codigo, nombres, apellidos)', orden: ['creado_en', false],
      filtrosHtml: `<select class="filtro-extra f-dep"><option value="">Todos los deportistas</option>${deps.map((d) => `<option value="${d.id}" ${d.id === filtroDep ? 'selected' : ''}>${esc(nombreCompleto(d))}</option>`).join('')}</select>`,
      filtro: (c, cont) => { const v = cont.querySelector('.f-dep')?.value; return v ? c.eq('deportista_id', v) : c; },
      columnas: [
        { l: 'Deportista', v: (x) => `<strong>${esc(nombreCompleto(x.deportistas))}</strong><br><small>${esc(x.deportistas?.codigo)}</small>` },
        { l: 'Documento', v: (x) => esc(x.tipo) },
        { l: 'Recibido', v: (x) => fecha(x.fecha_recepcion) },
        { l: 'Estado', v: (x) => chip(x.estado) },
        { l: 'Observaciones', v: (x) => esc(x.observaciones || '') },
        { l: 'Archivo', v: (x) => x.archivo ? `<button class="btn-mini ver-archivo" data-archivo="${esc(x.archivo)}">Ver</button>` : '—' },
      ],
      campos: (r) => [
        { n: 'deportista_id', l: 'Deportista', t: 'select', req: true, def: r?.deportista_id || zona.querySelector('.f-dep')?.value, opts: deps.map((d) => [d.id, `${nombreCompleto(d)} (${d.codigo})`]) },
        { n: 'tipo', l: 'Tipo de documento', req: true, dl: [...new Set([...requeridos, ...TIPOS_SUGERIDOS])] },
        { n: 'fecha_recepcion', l: 'Fecha de recepción', t: 'date', def: hoy() },
        { n: 'estado', l: 'Estado de revisión', t: 'select', vacio: false, def: 'recibido', opts: ['pendiente', 'recibido', 'aprobado', 'rechazado'].map((e) => [e, ETIQUETAS_ESTADO[e]]) },
        { n: 'archivo', l: 'Enlace al archivo (opcional)', ph: 'Pegue un enlace de Google Drive, o suba el archivo abajo', ancho: 'completo' },
        { n: 'observaciones', l: 'Observaciones', t: 'textarea', ancho: 'completo', filas: 2 },
      ],
      anchoModal: 'ancho',
      extraForm: campoArchivo(),
      antesGuardar: async (d, r, modal) => {
        const archivo = modal.querySelector('.subir-archivo')?.files?.[0];
        if (archivo) d.archivo = await subirArchivo(ctx.club.id, `documentos/${d.deportista_id}`, archivo);
        return d;
      },
    });
  }

  async function estado() {
    if (!requeridos.length) {
      zona.innerHTML = vacio('El club aún no ha definido qué documentos son obligatorios. Cuando los defina, aquí verá qué le falta a cada deportista.', '<a class="btn btn-pri" href="#/configuracion">Definir documentos requeridos</a>');
      return;
    }
    zona.innerHTML = cargando();
    const [activos, docs] = await Promise.all([
      q(sb.from('deportistas').select('id, codigo, nombres, apellidos').eq('estado', 'activo').order('apellidos')),
      q(sb.from('documentos').select('deportista_id, tipo, estado').in('estado', ['recibido', 'aprobado'])),
    ]);
    const tiene = new Set(docs.map((d) => `${d.deportista_id}|${d.tipo.trim().toLowerCase()}`));
    const filas = activos.map((d) => ({ d, faltan: requeridos.filter((t) => !tiene.has(`${d.id}|${t.trim().toLowerCase()}`)) }));
    const completos = filas.filter((f) => !f.faltan.length).length;
    zona.innerHTML = `<div class="mini-tarjetas"><div><b>${completos}</b>con documentación completa</div><div><b class="texto-alerta">${filas.length - completos}</b>con documentos pendientes</div></div>
      <table class="tabla"><thead><tr><th>Deportista</th>${requeridos.map((t) => `<th>${esc(t)}</th>`).join('')}</tr></thead><tbody>
      ${filas.sort((a, b) => b.faltan.length - a.faltan.length).map(({ d, faltan }) => `<tr><td data-l="Deportista"><strong>${esc(nombreCompleto(d))}</strong><br><small>${esc(d.codigo)}</small></td>
        ${requeridos.map((t) => `<td data-l="${esc(t)}">${faltan.includes(t) ? '<span class="texto-alerta">Falta</span>' : '<span class="texto-ok">✓</span>'}</td>`).join('')}</tr>`).join('')}
      </tbody></table>`;
  }

  zona.addEventListener('click', async (e) => {
    const b = e.target.closest('.ver-archivo'); if (!b) return;
    try { window.open(await enlaceArchivo(b.dataset.archivo), '_blank', 'noopener'); } catch (err) { avisoError(err); }
  });
  ir('registros');
}
