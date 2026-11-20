// Componente genérico de listado + formulario (crear, editar, eliminar) para tablas sencillas
import { sb, q } from './supabase.js';
import { esc, abrirModal, campos, leer, aviso, avisoError, confirmar, cargando, vacio } from './ui.js';

export function crud(contenedor, cfg) {
  let filas = [];
  contenedor.innerHTML = `
    <div class="barra">
      <input type="search" class="filtro" placeholder="Buscar…">
      ${cfg.filtrosHtml || ''}
      <span class="espaciador"></span>
      ${cfg.soloLectura || cfg.sinNuevo ? '' : `<button class="btn btn-pri nuevo">+ ${esc(cfg.nuevoTexto || 'Nuevo')}</button>`}
    </div>
    <div class="resumen-tabla"></div>
    <div class="tabla-zona">${cargando()}</div>`;
  const zona = contenedor.querySelector('.tabla-zona');
  const filtro = contenedor.querySelector('.filtro');

  async function recargar() {
    try {
      let consulta = sb.from(cfg.tabla).select(cfg.select || '*');
      if (cfg.filtro) consulta = cfg.filtro(consulta, contenedor);
      const [col, asc] = cfg.orden || ['creado_en', false];
      filas = await q(consulta.order(col, { ascending: asc }).limit(cfg.limite || 1000));
      pintar();
    } catch (e) { zona.innerHTML = vacio(e.message); }
  }

  function pintar() {
    const t = filtro.value.trim().toLowerCase();
    const visibles = t ? filas.filter((f) => JSON.stringify(f).toLowerCase().includes(t)) : filas;
    if (cfg.resumen) contenedor.querySelector('.resumen-tabla').innerHTML = cfg.resumen(visibles);
    if (!visibles.length) { zona.innerHTML = vacio(filas.length ? 'No hay resultados para la búsqueda.' : (cfg.vacio || 'Todavía no hay registros.')); return; }
    zona.innerHTML = `<table class="tabla"><thead><tr>${cfg.columnas.map((c) => `<th class="${c.clase || ''}">${esc(c.l)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${visibles.map((f) => `<tr data-id="${esc(f.id)}">${cfg.columnas.map((c) => `<td class="${c.clase || ''}" data-l="${esc(c.l)}">${c.v(f) ?? ''}</td>`).join('')}
        <td class="acciones">${(cfg.acciones ? cfg.acciones(f) : []).map((a, i) => `<button class="btn-mini" data-accion="${i}">${esc(a.texto)}</button>`).join('')}
        ${cfg.soloLectura ? '' : `<button class="btn-mini editar">Editar</button>`}
        ${cfg.puedeBorrar === false || cfg.soloLectura ? '' : `<button class="btn-mini peligro borrar" title="Eliminar">Eliminar</button>`}</td></tr>`).join('')}</tbody></table>`;
  }

  async function formulario(registro = null) {
    const lista = typeof cfg.campos === 'function' ? await cfg.campos(registro) : cfg.campos;
    abrirModal({
      titulo: registro ? `Editar ${cfg.singular}` : `Nuevo ${cfg.singular}`,
      cuerpo: campos(lista, registro || {}) + (cfg.extraForm || ''),
      ancho: cfg.anchoModal || '',
      botones: [
        { texto: 'Cancelar', clase: 'btn-sec' },
        {
          texto: 'Guardar', clase: 'btn-pri', accion: async (m) => {
            let datos = leer(m);
            if (cfg.antesGuardar) datos = await cfg.antesGuardar(datos, registro, m);
            if (registro) await q(sb.from(cfg.tabla).update(datos).eq('id', registro.id));
            else await q(sb.from(cfg.tabla).insert(datos));
            aviso(registro ? 'Cambios guardados' : 'Registro guardado');
            await recargar();
            cfg.despuesGuardar?.();
          },
        },
      ],
    });
  }

  zona.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const f = filas.find((x) => String(x.id) === tr.dataset.id);
    if (e.target.closest('.editar')) return formulario(f);
    if (e.target.closest('.borrar')) {
      if (!(await confirmar(`¿Eliminar este registro? Esta acción no se puede deshacer.`, { si: 'Eliminar', peligro: true }))) return;
      try { await q(sb.from(cfg.tabla).delete().eq('id', f.id)); aviso('Registro eliminado'); recargar(); } catch (err) { avisoError(err); }
      return;
    }
    const a = e.target.closest('[data-accion]');
    if (a) return cfg.acciones(f)[Number(a.dataset.accion)].fn(f, recargar);
  });
  filtro.addEventListener('input', pintar);
  contenedor.querySelector('.nuevo')?.addEventListener('click', () => formulario());
  contenedor.querySelectorAll('.filtro-extra').forEach((el) => el.addEventListener('change', recargar));
  recargar();
  return { recargar, nuevo: () => formulario() };
}

// Opciones para <select> a partir de una tabla
export async function opciones(tabla, { texto = 'nombre', filtro, orden } = {}) {
  let c = sb.from(tabla).select('*');
  if (filtro) c = filtro(c);
  const filas = await q(c.order(orden || (typeof texto === 'string' ? texto : 'creado_en')));
  return filas.map((f) => [f.id, typeof texto === 'function' ? texto(f) : f[texto]]);
}
