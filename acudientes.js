import { crud } from '../crud.js';
import { esc, nombreCompleto, chip } from '../ui.js';
import { TIPOS_DOC_ADULTO } from './deportistas.js';

export async function vista(el) {
  el.insertAdjacentHTML('beforeend', `<p class="ayuda">Los acudientes se registran automáticamente con cada inscripción. Para relacionar un acudiente con otro deportista, hágalo desde la ficha del deportista.</p><div class="zona"></div>`);
  crud(el.querySelector('.zona'), {
    tabla: 'acudientes', singular: 'acudiente', sinNuevo: true, puedeBorrar: false,
    select: '*, deportista_acudiente(parentesco, deportistas(id, codigo, nombres, apellidos, estado))',
    orden: ['apellidos', true],
    columnas: [
      { l: 'Acudiente', v: (a) => `<strong>${esc(nombreCompleto(a))}</strong>` },
      { l: 'Documento', v: (a) => `${esc(a.tipo_documento)} ${esc(a.numero_documento)}` },
      { l: 'Teléfono', v: (a) => esc(a.telefono) },
      { l: 'Correo', v: (a) => esc(a.correo) },
      { l: 'Deportistas', v: (a) => (a.deportista_acudiente || []).map((r) =>
          `<a href="#/deportistas/${r.deportistas.id}">${esc(nombreCompleto(r.deportistas))}</a> <small>(${esc(r.parentesco || '')})</small>${r.deportistas.estado !== 'activo' ? ' ' + chip(r.deportistas.estado) : ''}`).join('<br>') || '<span class="texto-alerta">Ninguno</span>' },
    ],
    campos: [
      { n: 'nombres', l: 'Nombres', req: true }, { n: 'apellidos', l: 'Apellidos', req: true },
      { n: 'tipo_documento', l: 'Tipo de documento', t: 'select', opts: TIPOS_DOC_ADULTO, vacio: false },
      { n: 'numero_documento', l: 'Número de documento', req: true },
      { n: 'telefono', l: 'Teléfono', t: 'tel' }, { n: 'correo', l: 'Correo', t: 'email' },
      { n: 'direccion', l: 'Dirección', ancho: 'completo' },
    ],
    antesGuardar: (d) => { delete d.deportista_acudiente; return d; },
  });
}
