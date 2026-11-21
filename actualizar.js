// Formulario público para que la familia complete o corrija los datos de un deportista ya inscrito
import { sb, configurado, mensajeError } from './supabase.js';
import { esc, campos, leer, aviso } from './ui.js';

const TIPOS_DEP = [['RC', 'Registro civil'], ['TI', 'Tarjeta de identidad'], ['CC', 'Cédula de ciudadanía'], ['CE', 'Cédula de extranjería'], ['PPT', 'PPT'], ['PA', 'Pasaporte']];
const TIPOS_ADULTO = [['CC', 'Cédula de ciudadanía'], ['CE', 'Cédula de extranjería'], ['PPT', 'PPT'], ['PA', 'Pasaporte']];
const PARENTESCOS = ['Madre', 'Padre', 'Abuelo(a)', 'Tío(a)', 'Hermano(a)', 'Tutor legal', 'Otro'];
const raiz = document.getElementById('formulario');
const token = new URLSearchParams(location.search).get('t');
const hoyISO = new Date().toISOString().slice(0, 10);

const mensaje = (titulo, texto, clase = '') => {
  raiz.innerHTML = `<div class="tarjeta-mensaje ${clase}"><h1>${esc(titulo)}</h1><p>${texto}</p></div>`;
};
const conPrefijo = (obj, pref) => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [pref + k, v]));

async function iniciar() {
  if (!configurado) return mensaje('Formulario no disponible', 'La plataforma aún no está configurada.');
  if (!token) return mensaje('Enlace incompleto', 'Abra el enlace completo que le envió el club.');
  const { data, error } = await sb.rpc('info_actualizacion', { p_token: token });
  if (error) return mensaje('No se pudo cargar', esc(mensajeError(error)));
  if (!data.valido) return mensaje(data.club || 'Enlace no válido', esc(data.mensaje));
  pintar(data);
}

function pintar({ club, deportista: d, acudiente: a }) {
  document.title = `Actualización de datos · ${club}`;
  const parentescoOpts = PARENTESCOS.map((p) => [p, p]);
  if (a?.parentesco && !PARENTESCOS.includes(a.parentesco)) parentescoOpts.push([a.parentesco, a.parentesco]);
  raiz.innerHTML = `
    <header class="form-cabecera"><span class="logo">${esc(club[0])}</span><div><h1>${esc(club)}</h1><p>Actualización de datos</p></div></header>
    <div class="panel"><p style="margin:0">Por favor revise los datos de <strong>${esc(d.nombres)} ${esc(d.apellidos)}</strong>, corrija lo que esté mal y complete lo que falte. Toma menos de 3 minutos.</p></div>
    <form novalidate>
      <section class="panel">
        <h2><span class="num">1</span> Datos del deportista</h2>
        <p class="ayuda">Documento: <strong>${esc(d.tipo_documento)} ${esc(d.numero_documento)}</strong>. Si el número está mal, avise directamente al club.</p>
        ${campos([
          { n: 'd_nombres', l: 'Nombres', req: true },
          { n: 'd_apellidos', l: 'Apellidos', req: true },
          { n: 'd_tipo_documento', l: 'Tipo de documento', t: 'select', opts: TIPOS_DEP, vacio: false },
          { n: 'd_fecha_nacimiento', l: 'Fecha de nacimiento', t: 'date', req: true, max: hoyISO },
          { n: 'd_sexo', l: 'Sexo', t: 'select', opts: [['Masculino', 'Masculino'], ['Femenino', 'Femenino']] },
          { n: 'd_eps', l: 'EPS' },
          { n: 'd_direccion', l: 'Dirección' },
          { n: 'd_barrio', l: 'Barrio' },
          { n: 'd_telefono', l: 'Teléfono del deportista (si tiene)', t: 'tel' },
          { n: 'd_observaciones_salud', l: 'Alergias, enfermedades o cuidados especiales', t: 'textarea', ancho: 'completo', filas: 2, ph: 'Escriba "Ninguna" si no aplica' },
        ], conPrefijo(d, 'd_'))}
      </section>
      <section class="panel">
        <h2><span class="num">2</span> Datos del acudiente</h2>
        <p class="ayuda">Persona responsable del deportista ante el club.</p>
        ${campos([
          { n: 'a_nombres', l: 'Nombres', req: true, autocomplete: 'given-name' },
          { n: 'a_apellidos', l: 'Apellidos', req: true, autocomplete: 'family-name' },
          { n: 'a_parentesco', l: 'Parentesco', t: 'select', req: true, opts: parentescoOpts },
          { n: 'a_tipo_documento', l: 'Tipo de documento', t: 'select', req: true, opts: TIPOS_ADULTO, def: 'CC', vacio: false },
          { n: 'a_numero_documento', l: 'Número de cédula', req: true, inputmode: 'numeric' },
          { n: 'a_telefono', l: 'Celular / WhatsApp', t: 'tel', req: true, autocomplete: 'tel', inputmode: 'tel' },
          { n: 'a_correo', l: 'Correo electrónico', t: 'email', autocomplete: 'email' },
          { n: 'a_direccion', l: 'Dirección', autocomplete: 'street-address' },
        ], conPrefijo(a, 'a_'))}
      </section>
      <section class="panel">
        <label class="campo-check autorizacion"><input type="checkbox" name="autoriza">
          <span>Autorizo a <strong>${esc(club)}</strong> para el tratamiento de mis datos personales y los del deportista, con fines de gestión deportiva y administrativa, conforme a la Ley 1581 de 2012. Declaro que la información suministrada es verdadera.</span></label>
        <button class="btn btn-pri btn-grande btn-bloque enviar">Guardar datos</button>
      </section>
    </form>
    <footer class="pie-marca"><img src="icono.png" alt=""> Plataforma <strong>Sport<b>Hub</b></strong></footer>`;
  const form = raiz.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('.enviar');
    let datos;
    try { datos = leer(form); } catch (err) { return aviso(err.message, 'error'); }
    if (!datos.autoriza) return aviso('Debe aceptar la autorización de tratamiento de datos.', 'error');
    if ((datos.a_telefono || '').replace(/\D/g, '').length < 7) return aviso('Revise el número de celular del acudiente.', 'error');
    const separar = (pref) => Object.fromEntries(Object.entries(datos).filter(([k]) => k.startsWith(pref)).map(([k, v]) => [k.slice(pref.length), v]));
    btn.disabled = true; btn.textContent = 'Guardando…';
    const { error } = await sb.rpc('enviar_actualizacion', { p_token: token, p_deportista: separar('d_'), p_acudiente: separar('a_') });
    if (error) { btn.disabled = false; btn.textContent = 'Guardar datos'; return aviso(mensajeError(error), 'error'); }
    window.scrollTo(0, 0);
    mensaje('¡Datos actualizados!', `Gracias. Los datos de <strong>${esc(datos.d_nombres)}</strong> quedaron guardados en ${esc(club)}.`, 'exito');
  };
}

iniciar().catch((e) => mensaje('No se pudo cargar', esc(mensajeError(e))));
