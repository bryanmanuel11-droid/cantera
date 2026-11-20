import { crud, opciones } from '../crud.js';
import { esc, fecha, nombreCompleto, hoy } from '../ui.js';

const DIAS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [7, 'Domingo']];
const hora = (h) => (h ? h.slice(0, 5) : '');

export async function vista(el) {
  el.innerHTML = `
    <h2 class="seccion">Horario semanal de los grupos</h2>
    <p class="ayuda">El horario fijo de cada grupo (por ejemplo, martes y jueves de 4:00 a 6:00 p. m.).</p>
    <div class="z-horarios"></div>
    <h2 class="seccion">Entrenamientos programados</h2>
    <p class="ayuda">Sesiones en fechas concretas: partidos, entrenamientos especiales o cambios de horario.</p>
    <div class="z-entrenos"></div>`;
  const grupos = () => opciones('grupos', { filtro: (c) => c.eq('activo', true) });
  crud(el.querySelector('.z-horarios'), {
    tabla: 'horarios', singular: 'horario', nuevoTexto: 'Agregar horario',
    select: '*, grupos(nombre, lugar, categorias!grupos_categoria_id_club_id_fkey(nombre), entrenadores!grupos_entrenador_id_club_id_fkey(nombres, apellidos))', orden: ['dia_semana', true],
    vacio: 'Aún no hay horarios definidos.',
    columnas: [
      { l: 'Día', v: (h) => DIAS[h.dia_semana - 1][1] },
      { l: 'Hora', v: (h) => `${hora(h.hora_inicio)} – ${hora(h.hora_fin)}` },
      { l: 'Grupo', v: (h) => `<strong>${esc(h.grupos?.nombre)}</strong>` },
      { l: 'Categoría', v: (h) => esc(h.grupos?.categorias?.nombre || '—') },
      { l: 'Entrenador', v: (h) => esc(nombreCompleto(h.grupos?.entrenadores) || '—') },
      { l: 'Lugar', v: (h) => esc(h.lugar || h.grupos?.lugar || '—') },
    ],
    campos: async () => [
      { n: 'grupo_id', l: 'Grupo', t: 'select', req: true, opts: await grupos() },
      { n: 'dia_semana', l: 'Día', t: 'select', req: true, opts: DIAS },
      { n: 'hora_inicio', l: 'Hora de inicio', t: 'time', req: true },
      { n: 'hora_fin', l: 'Hora de finalización', t: 'time', req: true },
      { n: 'lugar', l: 'Lugar', ayuda: 'Déjelo vacío para usar el lugar del grupo' },
    ],
    antesGuardar: (d) => { if (d.hora_fin <= d.hora_inicio) throw new Error('La hora de finalización debe ser posterior a la de inicio.'); return d; },
  });
  crud(el.querySelector('.z-entrenos'), {
    tabla: 'entrenamientos', singular: 'entrenamiento', nuevoTexto: 'Programar entrenamiento',
    select: '*, grupos!entrenamientos_grupo_id_club_id_fkey(nombre, categorias!grupos_categoria_id_club_id_fkey(nombre)), entrenadores!entrenamientos_entrenador_id_club_id_fkey(nombres, apellidos)', orden: ['fecha', false],
    filtrosHtml: `<label class="campo-check"><input type="checkbox" class="filtro-extra solo-prox" checked> Solo próximos</label>`,
    filtro: (c, cont) => cont.querySelector('.solo-prox')?.checked ? c.gte('fecha', hoy()) : c,
    vacio: 'No hay entrenamientos programados.',
    columnas: [
      { l: 'Fecha', v: (e) => fecha(e.fecha) },
      { l: 'Hora', v: (e) => e.hora_inicio ? `${hora(e.hora_inicio)} – ${hora(e.hora_fin)}` : '—' },
      { l: 'Grupo', v: (e) => `<strong>${esc(e.grupos?.nombre)}</strong>` },
      { l: 'Categoría', v: (e) => esc(e.grupos?.categorias?.nombre || '—') },
      { l: 'Entrenador', v: (e) => esc(nombreCompleto(e.entrenadores) || '—') },
      { l: 'Lugar', v: (e) => esc(e.lugar || '—') },
      { l: 'Notas', v: (e) => esc(e.notas || '') },
    ],
    campos: async () => [
      { n: 'grupo_id', l: 'Grupo', t: 'select', req: true, opts: await grupos() },
      { n: 'entrenador_id', l: 'Entrenador', t: 'select', opts: await opciones('entrenadores', { texto: (e) => nombreCompleto(e), orden: 'nombres' }) },
      { n: 'fecha', l: 'Fecha', t: 'date', req: true, def: hoy() },
      { n: 'lugar', l: 'Lugar' },
      { n: 'hora_inicio', l: 'Hora de inicio', t: 'time' },
      { n: 'hora_fin', l: 'Hora de finalización', t: 'time' },
      { n: 'notas', l: 'Notas', t: 'textarea', ancho: 'completo', filas: 2 },
    ],
  });
}
