import { sb, q, rpc, configurado, mensajeError } from './supabase.js';
import { CONFIG } from '../config.js';
import { esc, aviso, avisoError, abrirModal, campos, leer, cargando } from './ui.js';

const MODULOS = [
  { id: 'inicio', t: 'Inicio', i: '◧', m: () => import('./modulos/dashboard.js') },
  { id: 'inscripciones', t: 'Inscripciones', i: '✎', m: () => import('./modulos/inscripciones.js') },
  { id: 'deportistas', t: 'Deportistas', i: '⚽', m: () => import('./modulos/deportistas.js') },
  { id: 'acudientes', t: 'Acudientes', i: '☺', m: () => import('./modulos/acudientes.js') },
  { id: 'pagos', t: 'Pagos y cartera', i: '$', m: () => import('./modulos/pagos.js') },
  { id: 'asistencia', t: 'Asistencia', i: '✓', m: () => import('./modulos/asistencia.js') },
  { sep: 'Organización' },
  { id: 'grupos', t: 'Grupos', i: '▦', m: () => import('./modulos/grupos.js') },
  { id: 'categorias', t: 'Categorías', i: '▤', m: () => import('./modulos/categorias.js') },
  { id: 'entrenadores', t: 'Entrenadores', i: '♟', m: () => import('./modulos/entrenadores.js') },
  { id: 'horarios', t: 'Horarios', i: '◷', m: () => import('./modulos/horarios.js') },
  { sep: 'Administración' },
  { id: 'documentos', t: 'Documentos', i: '▭', m: () => import('./modulos/documentos.js') },
  { id: 'gastos', t: 'Gastos', i: '↧', m: () => import('./modulos/gastos.js') },
  { id: 'informes', t: 'Informes', i: '▥', m: () => import('./modulos/informes.js') },
  { id: 'configuracion', t: 'Configuración', i: '⚙', m: () => import('./modulos/configuracion.js') },
];

const raiz = document.getElementById('app');
const ctx = { club: null, usuario: null, ir: (h) => { location.hash = h; } };
document.title = CONFIG.NOMBRE_PLATAFORMA;

// ---------------- Pantallas de acceso ----------------
function pantallaAcceso(modo = 'entrar') {
  const textos = {
    entrar: ['Iniciar sesión', 'Entrar'],
    registro: ['Crear cuenta de administrador', 'Crear cuenta'],
    recuperar: ['Recuperar contraseña', 'Enviar enlace'],
  }[modo];
  raiz.innerHTML = `
    <div class="acceso">
      <div class="acceso-caja">
        <div class="marca grande"><span class="logo">${esc(CONFIG.NOMBRE_PLATAFORMA[0])}</span>${esc(CONFIG.NOMBRE_PLATAFORMA)}</div>
        <p class="sub">Gestión deportiva para clubes y escuelas</p>
        <h2>${textos[0]}</h2>
        <form class="pila">
          <div class="campo"><label>Correo electrónico</label><input name="correo" type="email" required autocomplete="email"></div>
          ${modo !== 'recuperar' ? `<div class="campo"><label>Contraseña</label><input name="clave" type="password" required minlength="6" autocomplete="${modo === 'registro' ? 'new-password' : 'current-password'}"></div>` : ''}
          <button class="btn btn-pri btn-bloque">${textos[1]}</button>
        </form>
        <div class="acceso-enlaces">
          ${modo !== 'entrar' ? '<a href="#" data-modo="entrar">Ya tengo cuenta</a>' : '<a href="#" data-modo="registro">Crear cuenta</a><a href="#" data-modo="recuperar">Olvidé mi contraseña</a>'}
        </div>
      </div>
    </div>`;
  raiz.querySelectorAll('[data-modo]').forEach((a) => a.onclick = (e) => { e.preventDefault(); pantallaAcceso(a.dataset.modo); });
  const form = raiz.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button'); btn.disabled = true;
    const correo = form.correo.value.trim(), clave = form.clave?.value;
    try {
      if (modo === 'entrar') {
        const { error } = await sb.auth.signInWithPassword({ email: correo, password: clave });
        if (error) throw error;
      } else if (modo === 'registro') {
        const { data, error } = await sb.auth.signUp({ email: correo, password: clave, options: { emailRedirectTo: location.href.split('#')[0] } });
        if (error) throw error;
        if (!data.session) { aviso('Cuenta creada. Revise su correo y confirme la cuenta para poder entrar.'); pantallaAcceso('entrar'); }
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(correo, { redirectTo: location.href.split('#')[0] });
        if (error) throw error;
        aviso('Le enviamos un correo con el enlace para cambiar la contraseña.');
        pantallaAcceso('entrar');
      }
    } catch (err) { aviso(mensajeError(err), 'error'); }
    finally { btn.disabled = false; }
  };
}

function pantallaCrearClub() {
  raiz.innerHTML = `
    <div class="acceso"><div class="acceso-caja">
      <div class="marca grande"><span class="logo">${esc(CONFIG.NOMBRE_PLATAFORMA[0])}</span>${esc(CONFIG.NOMBRE_PLATAFORMA)}</div>
      <h2>Registre su club</h2>
      <p class="sub">Este paso se hace una sola vez. Usted quedará como administrador.</p>
      <form class="pila">
        <div class="campo"><label>Nombre del club o escuela</label><input name="nombre" required></div>
        <div class="campo"><label>Ciudad</label><input name="ciudad"></div>
        <button class="btn btn-pri btn-bloque">Crear club</button>
      </form>
      <div class="acceso-enlaces"><a href="#" class="salir">Cerrar sesión</a></div>
    </div></div>`;
  raiz.querySelector('.salir').onclick = (e) => { e.preventDefault(); sb.auth.signOut(); };
  const form = raiz.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    try { await rpc('crear_club', { p_nombre: form.nombre.value, p_ciudad: form.ciudad.value || null }); iniciar(); }
    catch (err) { avisoError(err); }
  };
}

// ---------------- Estructura principal ----------------
function pintarMarco() {
  raiz.innerHTML = `
    <div class="marco">
      <aside class="menu">
        <div class="marca"><span class="logo">${esc(CONFIG.NOMBRE_PLATAFORMA[0])}</span>${esc(CONFIG.NOMBRE_PLATAFORMA)}</div>
        <div class="club-nombre">${esc(ctx.club.nombre)}</div>
        <nav>${MODULOS.map((m) => m.sep ? `<div class="menu-sep">${esc(m.sep)}</div>` :
          `<a href="#/${m.id}" data-id="${m.id}"><span class="ico">${m.i}</span>${esc(m.t)}<span class="insignia" hidden></span></a>`).join('')}</nav>
        <div class="menu-pie"><span title="${esc(ctx.usuario.email)}">${esc(ctx.usuario.email)}</span><button class="btn-mini salir">Salir</button></div>
      </aside>
      <div class="menu-velo"></div>
      <main>
        <header class="cabecera"><button class="btn-icono abrir-menu" aria-label="Menú">☰</button><h1 class="titulo-vista"></h1><div class="cabecera-acciones"></div></header>
        <section id="vista"></section>
      </main>
    </div>`;
  raiz.querySelector('.salir').onclick = () => sb.auth.signOut();
  const marco = raiz.querySelector('.marco');
  raiz.querySelector('.abrir-menu').onclick = () => marco.classList.toggle('menu-abierto');
  raiz.querySelector('.menu-velo').onclick = () => marco.classList.remove('menu-abierto');
  raiz.querySelector('nav').onclick = (e) => {
    marco.classList.remove('menu-abierto');
    const a = e.target.closest('a[href]');
    if (a && a.getAttribute('href') === location.hash) enrutar();   // volver a cargar el módulo actual
  };
}

export async function actualizarInsignias() {
  try {
    const n = await q(sb.from('solicitudes').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'));
    const el = raiz.querySelector('a[data-id="inscripciones"] .insignia');
    if (el) { el.hidden = !n; el.textContent = n; }
  } catch { /* sin importancia */ }
}
ctx.actualizarInsignias = actualizarInsignias;

let vistaActual = 0;
async function enrutar() {
  if (!ctx.club) return;
  const [, id = 'inicio', ...resto] = location.hash.split('/');
  const mod = MODULOS.find((m) => m.id === id) || MODULOS[0];
  raiz.querySelectorAll('nav a').forEach((a) => a.classList.toggle('activo', a.dataset.id === mod.id));
  raiz.querySelector('.titulo-vista').textContent = mod.t;
  raiz.querySelector('.cabecera-acciones').innerHTML = '';
  const vista = document.getElementById('vista');
  vista.innerHTML = cargando();
  const yo = ++vistaActual;
  try {
    const m = await mod.m();
    if (yo !== vistaActual) return;
    vista.innerHTML = '';
    await m.vista(vista, { ...ctx, params: resto, acciones: raiz.querySelector('.cabecera-acciones') });
  } catch (e) {
    console.error(e);
    vista.innerHTML = `<div class="vacio"><p>No se pudo cargar este módulo: ${esc(e.message)}</p></div>`;
  }
  actualizarInsignias();
}

// ---------------- Arranque ----------------
async function iniciar() {
  if (!configurado) {
    raiz.innerHTML = `<div class="acceso"><div class="acceso-caja"><h2>Falta la configuración</h2>
      <p>Abra el archivo <code>config.js</code> y pegue la URL y la clave pública (anon key) de su proyecto de Supabase. La guía de instalación explica cómo obtenerlas.</p></div></div>`;
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { ctx.club = null; return pantallaAcceso(); }
  ctx.usuario = session.user;
  raiz.innerHTML = cargando('Cargando su club…');
  try {
    const miembro = await q(sb.from('miembros').select('rol, clubes(*)').eq('user_id', session.user.id).limit(1));
    if (!miembro.length) return pantallaCrearClub();
    ctx.club = miembro[0].clubes;
    ctx.rol = miembro[0].rol;
    pintarMarco();
    enrutar();
  } catch (e) {
    raiz.innerHTML = `<div class="acceso"><div class="acceso-caja"><h2>No se pudo conectar</h2><p>${esc(e.message)}</p>
      <p>Si acaba de crear el proyecto, verifique que ejecutó el archivo <code>01_esquema.sql</code> en Supabase.</p>
      <button class="btn btn-pri" onclick="location.reload()">Reintentar</button></div></div>`;
  }
}

window.addEventListener('hashchange', enrutar);
if (sb) {
  let ultimoUsuario;
  sb.auth.onAuthStateChange((evento, session) => {
    if (evento === 'PASSWORD_RECOVERY') {
      abrirModal({
        titulo: 'Nueva contraseña', cuerpo: campos([{ n: 'clave', l: 'Nueva contraseña', t: 'password', req: true, min: 6 }]),
        botones: [{ texto: 'Guardar', clase: 'btn-pri', accion: async (m) => {
          const { error } = await sb.auth.updateUser({ password: leer(m).clave });
          if (error) throw new Error(mensajeError(error));
          aviso('Contraseña actualizada');
        } }],
      });
    }
    const uid = session?.user?.id || null;
    if (uid !== ultimoUsuario) { ultimoUsuario = uid; setTimeout(iniciar, 0); }
  });
} else iniciar();

export { ctx };
