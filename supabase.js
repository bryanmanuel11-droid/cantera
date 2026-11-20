import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from '../config.js';

export const configurado = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
export const sb = configurado ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;

// Traduce los errores técnicos de la base de datos a mensajes claros
const TRADUCCIONES = [
  [/deportistas_club_id_numero_documento_key/, 'Ya existe un deportista con ese número de documento.'],
  [/acudientes_club_id_numero_documento_key/, 'Ya existe un acudiente con ese número de documento.'],
  [/categorias_club_id_nombre_key/, 'Ya existe una categoría con ese nombre.'],
  [/grupos_club_id_nombre_key/, 'Ya existe un grupo con ese nombre.'],
  [/obligaciones_deportista_id_concepto_periodo_key/, 'Ese deportista ya tiene ese cobro en el período.'],
  [/asistencia_deportista_id_grupo_id_fecha_key/, 'La asistencia de ese día ya estaba registrada.'],
  [/violates foreign key constraint/, 'No se puede completar: el registro está relacionado con otros datos.'],
  [/Invalid login credentials/, 'Correo o contraseña incorrectos.'],
  [/Email not confirmed/, 'Debe confirmar su correo. Revise su bandeja de entrada.'],
  [/User already registered/, 'Ese correo ya tiene una cuenta. Inicie sesión.'],
  [/Password should be at least/, 'La contraseña debe tener al menos 6 caracteres.'],
  [/Failed to fetch|NetworkError/, 'No hay conexión con el servidor. Revise su internet.'],
  [/JWT expired/, 'Su sesión venció. Vuelva a iniciar sesión.'],
];

export function mensajeError(error) {
  const msg = (error && (error.message || error.error_description || String(error))) || 'Error desconocido';
  for (const [re, texto] of TRADUCCIONES) if (re.test(msg)) return texto;
  return msg;
}

// Ejecuta una consulta de Supabase y lanza un Error con mensaje claro si falla
export async function q(promesa) {
  const { data, error, count } = await promesa;
  if (error) throw new Error(mensajeError(error));
  return count !== undefined && count !== null && data === null ? count : data;
}

export async function rpc(nombre, args = {}) {
  return q(sb.rpc(nombre, args));
}
