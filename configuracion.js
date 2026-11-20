import { sb, q } from '../supabase.js';
import { esc, campos, leer, aviso, avisoError, descargar, hoy } from '../ui.js';

const TABLAS_RESPALDO = ['clubes', 'categorias', 'entrenadores', 'grupos', 'horarios', 'entrenamientos', 'deportistas', 'acudientes',
  'deportista_acudiente', 'enlaces_inscripcion', 'solicitudes', 'tarifas', 'obligaciones', 'pagos', 'asistencia', 'documentos', 'gastos'];

export async function vista(el, ctx) {
  const club = ctx.club;
  el.innerHTML = `
    <div class="panel"><h3>Datos del club</h3>
      <div class="f-club">${campos([
        { n: 'nombre', l: 'Nombre del club', req: true }, { n: 'ciudad', l: 'Ciudad' },
        { n: 'telefono', l: 'Teléfono', t: 'tel' }, { n: 'correo', l: 'Correo', t: 'email' },
      ], club)}</div>
      <button class="btn btn-pri guardar-club">Guardar</button></div>

    <div class="panel"><h3>Documentos requeridos</h3>
      <p class="ayuda">Escriba los documentos que el club exige, uno por línea. Déjelo vacío si aún no están definidos. Sirve para ver qué le falta a cada deportista en el módulo Documentos.</p>
      <textarea class="docs" rows="5" placeholder="Ej.:&#10;Registro civil&#10;Certificado de EPS">${esc((club.documentos_requeridos || []).join('\n'))}</textarea>
      <button class="btn btn-pri guardar-docs">Guardar</button></div>

    <div class="panel"><h3>Copia de seguridad</h3>
      <p class="ayuda">El plan gratuito de Supabase no guarda copias automáticas. Descargue una copia al menos una vez por semana y guárdela en su Google Drive.</p>
      <button class="btn btn-sec respaldo">Descargar copia completa (JSON)</button></div>

    <div class="panel"><h3>Su cuenta</h3>
      <p>Conectado como <strong>${esc(ctx.usuario.email)}</strong> · Rol: ${esc(ctx.rol || 'admin')}</p>
      <button class="btn btn-sec cambiar-clave">Cambiar contraseña</button></div>`;

  el.querySelector('.guardar-club').onclick = async () => {
    try {
      const d = leer(el.querySelector('.f-club'));
      await q(sb.from('clubes').update(d).eq('id', club.id));
      Object.assign(club, d);
      document.querySelector('.club-nombre').textContent = d.nombre;
      aviso('Datos del club guardados');
    } catch (e) { avisoError(e); }
  };
  el.querySelector('.guardar-docs').onclick = async () => {
    try {
      const lista = [...new Set(el.querySelector('.docs').value.split('\n').map((s) => s.trim()).filter(Boolean))];
      await q(sb.from('clubes').update({ documentos_requeridos: lista }).eq('id', club.id));
      club.documentos_requeridos = lista;
      aviso('Documentos requeridos guardados');
    } catch (e) { avisoError(e); }
  };
  el.querySelector('.respaldo').onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = 'Preparando copia…';
    try {
      const copia = { generado: new Date().toISOString(), club: club.nombre, tablas: {} };
      for (const t of TABLAS_RESPALDO) {
        const filas = [];
        for (let desde = 0; ; desde += 1000) {
          const parte = await q(sb.from(t).select('*').range(desde, desde + 999));
          filas.push(...parte);
          if (parte.length < 1000) break;
        }
        copia.tablas[t] = filas;
      }
      descargar(`copia-${club.nombre.replace(/\W+/g, '_')}-${hoy()}.json`, JSON.stringify(copia, null, 1));
      aviso('Copia descargada');
    } catch (err) { avisoError(err); }
    finally { e.target.disabled = false; e.target.textContent = 'Descargar copia completa (JSON)'; }
  };
  el.querySelector('.cambiar-clave').onclick = async () => {
    const { error } = await sb.auth.resetPasswordForEmail(ctx.usuario.email, { redirectTo: location.href.split('#')[0] });
    error ? avisoError(error) : aviso('Le enviamos un correo para cambiar la contraseña.');
  };
}
