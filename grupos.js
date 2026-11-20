import { sb, q } from './supabase.js';
import { crud, opciones } from './crud.js';
import { esc, abrirModal, nombreCompleto, edad, aviso, cargando, debounce } from './ui.js';

const DIAS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export async function vista(el) {
  const lista = crud(el, {
    tabla: 'grupos', singular: 'grupo', nuevoTexto: 'Nuevo grupo',
    select: '*, categorias!grupos_categoria_id_club_id_fkey(nombre), entrenadores!grupos_entrenador_id_club_id_fkey(nombres, apellidos), horarios(dia_semana, hora_inicio, hora_fin), deportistas!deportistas_grupo_id_club_id_fkey(id, estado)',
    orden: ['nombre', true],
    vacio: 'Aún no hay grupos de entrenamiento.',
    columnas: [
      { l: 'Grupo', v: (g) => `<strong>${esc(g.nombre)}</strong>${g.activo ? '' : ' <small>(inactivo)</small>'}` },
      { l: 'Categoría', v: (g) => esc(g.categorias?.nombre || '—') },
      { l: 'Entrenador', v: (g) => esc(nombreCompleto(g.entrenadores) || '—') },
      { l: 'Lugar', v: (g) => esc(g.lugar || '—') },
      { l: 'Horario', v: (g) => (g.horarios || []).sort((a, b) => a.dia_semana - b.dia_semana).map((h) => `${DIAS[h.dia_semana]} ${h.hora_inicio.slice(0, 5)}–${h.hora_fin.slice(0, 5)}`).join('<br>') || '<a href="#/horarios">Definir</a>' },
      { l: 'Deportistas', v: (g) => (g.deportistas || []).filter((d) => d.estado === 'activo').length },
    ],
    campos: async () => [
      { n: 'nombre', l: 'Nombre del grupo', req: true, ph: 'Ej.: Sub-10 Tarde' },
      { n: 'categoria_id', l: 'Categoría', t: 'select', opts: await opciones('categorias') },
      { n: 'entrenador_id', l: 'Entrenador', t: 'select', opts: await opciones('entrenadores', { texto: (e) => nombreCompleto(e), orden: 'nombres', filtro: (c) => c.eq('estado', 'activo') }) },
      { n: 'lugar', l: 'Sede o lugar de entrenamiento' },
      { n: 'activo', l: 'Grupo activo', t: 'checkbox', def: true },
    ],
    acciones: () => [{ texto: 'Asignar deportistas', fn: (g, recargar) => asignar(g, recargar) }],
  });
  return lista;
}

async function asignar(grupo, recargar) {
  const m = abrirModal({ titulo: `Deportistas del grupo ${grupo.nombre}`, ancho: 'ancho', cuerpo: cargando() });
  const cuerpo = m.querySelector('.modal-cuerpo');
  const [deps, grupos] = await Promise.all([
    q(sb.from('deportistas').select('id, codigo, nombres, apellidos, fecha_nacimiento, categoria_id, grupo_id').eq('estado', 'activo').order('apellidos')),
    q(sb.from('grupos').select('id, nombre')),
  ]);
  const nom = Object.fromEntries(grupos.map((g) => [g.id, g.nombre]));
  const marcados = new Set(deps.filter((d) => d.grupo_id === grupo.id).map((d) => d.id));
  cuerpo.innerHTML = `
    <p class="ayuda">Marque los deportistas que pertenecen a este grupo. Si un deportista estaba en otro grupo, pasará a este.</p>
    <div class="barra"><input type="search" class="filtro" placeholder="Filtrar…">
      ${grupo.categoria_id ? '<label class="campo-check"><input type="checkbox" class="solo-cat" checked> Solo de la categoría del grupo</label>' : ''}
      <span class="espaciador"></span><span class="contador"></span></div>
    <div class="lista-check"></div>`;
  const zona = cuerpo.querySelector('.lista-check');
  const pintar = () => {
    const t = cuerpo.querySelector('.filtro').value.toLowerCase();
    const soloCat = cuerpo.querySelector('.solo-cat')?.checked;
    zona.innerHTML = deps.filter((d) => (!t || nombreCompleto(d).toLowerCase().includes(t)) && (!soloCat || d.categoria_id === grupo.categoria_id || marcados.has(d.id)))
      .map((d) => `<label><input type="checkbox" value="${d.id}" ${marcados.has(d.id) ? 'checked' : ''}> <strong>${esc(nombreCompleto(d))}</strong>
        <small>${edad(d.fecha_nacimiento)} años${d.grupo_id && d.grupo_id !== grupo.id ? ` · hoy en ${esc(nom[d.grupo_id])}` : ''}</small></label>`).join('') || '<p class="ayuda">No hay deportistas activos para mostrar.</p>';
    cuerpo.querySelector('.contador').textContent = `${marcados.size} seleccionado(s)`;
  };
  zona.addEventListener('change', (e) => { e.target.checked ? marcados.add(e.target.value) : marcados.delete(e.target.value); cuerpo.querySelector('.contador').textContent = `${marcados.size} seleccionado(s)`; });
  cuerpo.querySelector('.filtro').addEventListener('input', debounce(pintar, 150));
  cuerpo.querySelector('.solo-cat')?.addEventListener('change', pintar);
  pintar();
  const pie = document.createElement('footer');
  pie.innerHTML = '<button class="btn btn-sec cancelar">Cancelar</button><button class="btn btn-pri guardar">Guardar asignación</button>';
  m.querySelector('.modal').appendChild(pie);
  pie.querySelector('.cancelar').onclick = () => m.cerrar();
  pie.querySelector('.guardar').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const antes = deps.filter((d) => d.grupo_id === grupo.id).map((d) => d.id);
      const quitar = antes.filter((id) => !marcados.has(id));
      const poner = [...marcados].filter((id) => !antes.includes(id));
      if (quitar.length) await q(sb.from('deportistas').update({ grupo_id: null }).in('id', quitar));
      if (poner.length) await q(sb.from('deportistas').update({ grupo_id: grupo.id }).in('id', poner));
      aviso('Asignación guardada'); m.cerrar(); recargar();
    } catch (err) { aviso(err.message, 'error'); e.target.disabled = false; }
  };
}
