// Formulario público de inscripción: lo diligencia el padre o acudiente desde el enlace recibido
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

async function iniciar() {
  if (!configurado) return mensaje('Formulario no disponible', 'La plataforma aún no está configurada.');
  if (!token) return mensaje('Enlace incompleto', 'Abra el enlace completo que le envió el club.');
  const { data, error } = await sb.rpc('info_enlace', { p_token: token });
  if (error) return mensaje('No se pudo cargar', esc(mensajeError(error)));
  if (!data.valido) return mensaje(data.club || 'Enlace no válido', esc(data.mensaje));
  pintar(data.club);
}

function pintar(club) {
  document.title = `Inscripción · ${club}`;
  raiz.innerHTML = `
    <header class="form-cabecera"><span class="logo">${esc(club[0])}</span><div><h1>${esc(club)}</h1><p>Formulario de inscripción</p></div></header>
    <form novalidate>
      <section class="panel">
        <h2><span class="num">1</span> Datos del deportista</h2>
        ${campos([
          { n: 'd_nombres', l: 'Nombres', req: true, autocomplete: 'off' },
          { n: 'd_apellidos', l: 'Apellidos', req: true, autocomplete: 'off' },
          { n: 'd_tipo_documento', l: 'Tipo de documento', t: 'select', req: true, opts: TIPOS_DEP, def: 'TI', vacio: false },
          { n: 'd_numero_documento', l: 'Número de documento', req: true, inputmode: 'numeric', autocomplete: 'off' },
          { n: 'd_fecha_nacimiento', l: 'Fecha de nacimiento', t: 'date', req: true, max: hoyISO },
          { n: 'd_sexo', l: 'Sexo', t: 'select', opts: [['Masculino', 'Masculino'], ['Femenino', 'Femenino']] },
          { n: 'd_direccion', l: 'Dirección' },
          { n: 'd_barrio', l: 'Barrio' },
          { n: 'd_eps', l: 'EPS' },
          { n: 'd_telefono', l: 'Teléfono del deportista (si tiene)', t: 'tel' },
          { n: 'd_observaciones_salud', l: 'Alergias, enfermedades o cuidados especiales', t: 'textarea', ancho: 'completo', filas: 2, ph: 'Escriba "Ninguna" si no aplica' },
        ])}
      </section>
      <section class="panel">
        <h2><span class="num">2</span> Datos del acudiente</h2>
        <p class="ayuda">Persona responsable del deportista ante el club.</p>
        ${campos([
          { n: 'a_nombres', l: 'Nombres', req: true, autocomplete: 'given-name' },
          { n: 'a_apellidos', l: 'Apellidos', req: true, autocomplete: 'family-name' },
          { n: 'a_parentesco', l: 'Parentesco', t: 'select', req: true, opts: PARENTESCOS.map((p) => [p, p]) },
          { n: 'a_tipo_documento', l: 'Tipo de documento', t: 'select', req: true, opts: TIPOS_ADULTO, def: 'CC', vacio: false },
          { n: 'a_numero_documento', l: 'Número de documento', req: true, inputmode: 'numeric' },
          { n: 'a_telefono', l: 'Celular / WhatsApp', t: 'tel', req: true, autocomplete: 'tel', inputmode: 'tel' },
          { n: 'a_correo', l: 'Correo electrónico', t: 'email', autocomplete: 'email' },
          { n: 'a_direccion', l: 'Dirección', autocomplete: 'street-address' },
        ])}
      </section>
      <section class="panel">
        <label class="campo-check autorizacion"><input type="checkbox" name="autoriza">
          <span>Autorizo a <strong>${esc(club)}</strong> para el tratamiento de mis datos personales y los del deportista, con fines de gestión deportiva y administrativa, conforme a la Ley 1581 de 2012. Declaro que la información suministrada es verdadera.</span></label>
        <button class="btn btn-pri btn-grande btn-bloque enviar">Enviar inscripción</button>
      </section>
    </form>`;
  const form = raiz.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('.enviar');
    let datos;
    try { datos = leer(form); } catch (err) { return aviso(err.message, 'error'); }
    if (!datos.autoriza) return aviso('Debe aceptar la autorización de tratamiento de datos.', 'error');
    const tel = (datos.a_telefono || '').replace(/\D/g, '');
    if (tel.length < 7) return aviso('Revise el número de celular del acudiente.', 'error');
    const separar = (pref) => Object.fromEntries(Object.entries(datos).filter(([k]) => k.startsWith(pref)).map(([k, v]) => [k.slice(pref.length), v]));
    btn.disabled = true; btn.textContent = 'Enviando…';
    const { data, error } = await sb.rpc('enviar_inscripcion', { p_token: token, p_deportista: separar('d_'), p_acudiente: separar('a_') });
    if (error) {
      btn.disabled = false; btn.textContent = 'Enviar inscripción';
      return aviso(mensajeError(error), 'error');
    }
    window.scrollTo(0, 0);
    const tc = (t) => t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
    mensaje('¡Inscripción enviada!', `Recibimos los datos de <strong>${esc(tc(datos.d_nombres + ' ' + datos.d_apellidos))}</strong> (código ${esc(data.codigo)}). El club revisará la solicitud y se comunicará con usted.`, 'exito');
  };
}

iniciar().catch((e) => mensaje('No se pudo cargar', esc(mensajeError(e))));
