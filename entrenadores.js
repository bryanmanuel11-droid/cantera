import { crud } from './crud.js';
import { esc, chip, nombreCompleto } from './ui.js';

export async function vista(el) {
  crud(el, {
    tabla: 'entrenadores', singular: 'entrenador', nuevoTexto: 'Nuevo entrenador',
    select: '*, grupos!grupos_entrenador_id_club_id_fkey(nombre)', orden: ['nombres', true],
    columnas: [
      { l: 'Entrenador', v: (e) => `<strong>${esc(nombreCompleto(e))}</strong>${e.especialidad ? `<br><small>${esc(e.especialidad)}</small>` : ''}` },
      { l: 'Documento', v: (e) => esc(e.numero_documento) },
      { l: 'Teléfono', v: (e) => esc(e.telefono) },
      { l: 'Correo', v: (e) => esc(e.correo) },
      { l: 'Grupos a cargo', v: (e) => esc((e.grupos || []).map((g) => g.nombre).join(', ') || '—') },
      { l: 'Estado', v: (e) => chip(e.estado) },
    ],
    campos: [
      { n: 'nombres', l: 'Nombres', req: true }, { n: 'apellidos', l: 'Apellidos' },
      { n: 'tipo_documento', l: 'Tipo de documento', t: 'select', opts: [['CC', 'Cédula'], ['CE', 'Cédula de extranjería'], ['PPT', 'PPT'], ['PA', 'Pasaporte']] },
      { n: 'numero_documento', l: 'Número de documento' },
      { n: 'telefono', l: 'Teléfono', t: 'tel' }, { n: 'correo', l: 'Correo', t: 'email' },
      { n: 'especialidad', l: 'Especialidad', ph: 'Ej.: Porteros, preparación física' },
      { n: 'estado', l: 'Estado', t: 'select', vacio: false, opts: [['activo', 'Activo'], ['inactivo', 'Inactivo']] },
    ],
    antesGuardar: (d) => { delete d.grupos; return d; },
  });
}
