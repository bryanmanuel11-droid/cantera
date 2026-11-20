import { sb, q } from './supabase.js';
import { crud } from './crud.js';
import { esc, abrirModal, nombreCompleto, edad, chip, vacio } from './ui.js';

export async function vista(el) {
  el.insertAdjacentHTML('beforeend', `<p class="ayuda">Cree las categorías que el club haya definido. El rango de edad es opcional; si lo indica, la plataforma sugerirá la categoría al aprobar cada inscripción.</p><div class="zona"></div>`);
  crud(el.querySelector('.zona'), {
    tabla: 'categorias', singular: 'categoría', nuevoTexto: 'Nueva categoría',
    select: '*, deportistas!deportistas_categoria_id_club_id_fkey(id, estado), grupos!grupos_categoria_id_club_id_fkey(nombre)', orden: ['nombre', true],
    vacio: 'Aún no hay categorías. Créelas cuando el club las defina.',
    columnas: [
      { l: 'Categoría', v: (c) => `<strong>${esc(c.nombre)}</strong>${c.descripcion ? `<br><small>${esc(c.descripcion)}</small>` : ''}` },
      { l: 'Edades', v: (c) => c.edad_min != null || c.edad_max != null ? `${c.edad_min ?? '…'} a ${c.edad_max ?? '…'} años` : 'Sin definir' },
      { l: 'Deportistas activos', v: (c) => (c.deportistas || []).filter((d) => d.estado === 'activo').length },
      { l: 'Grupos', v: (c) => esc((c.grupos || []).map((g) => g.nombre).join(', ') || '—') },
      { l: 'Estado', v: (c) => c.activa ? chip('activo') : chip('inactivo') },
    ],
    campos: [
      { n: 'nombre', l: 'Nombre', req: true, ph: 'Ej.: Sub-10' },
      { n: 'activa', l: 'Categoría activa', t: 'checkbox', def: true },
      { n: 'edad_min', l: 'Edad mínima', t: 'number', min: 0, max: 99 },
      { n: 'edad_max', l: 'Edad máxima', t: 'number', min: 0, max: 99 },
      { n: 'descripcion', l: 'Descripción', t: 'textarea', ancho: 'completo', filas: 2 },
    ],
    antesGuardar: (d) => {
      if (d.edad_min != null && d.edad_max != null && d.edad_min > d.edad_max) throw new Error('La edad mínima no puede ser mayor que la máxima.');
      return d;
    },
    acciones: () => [{ texto: 'Ver deportistas', fn: async (c) => {
      const filas = await q(sb.from('deportistas').select('codigo, nombres, apellidos, fecha_nacimiento, estado').eq('categoria_id', c.id).neq('estado', 'rechazado').order('apellidos'));
      abrirModal({ titulo: `Deportistas · ${c.nombre}`, cuerpo: filas.length ? `<table class="tabla compacta"><tbody>${filas.map((d) => `<tr><td>${esc(d.codigo)}</td><td>${esc(nombreCompleto(d))}</td><td>${edad(d.fecha_nacimiento)} años</td><td>${chip(d.estado)}</td></tr>`).join('')}</tbody></table>` : vacio('Sin deportistas en esta categoría.') });
    } }],
  });
}
