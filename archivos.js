// Subida y consulta de archivos en Supabase Storage (bucket "archivos")
import { sb } from '../supabase.js';

const PREFIJO = 'storage:';

export async function subirArchivo(clubId, carpeta, archivo) {
  if (archivo.size > 5 * 1024 * 1024) throw new Error('El archivo supera 5 MB. Reduzca su tamaño o use un enlace de Google Drive.');
  const limpio = archivo.name.normalize('NFD').replace(/[^\w.-]+/g, '_');
  const ruta = `${clubId}/${carpeta}/${Date.now()}-${limpio}`;
  const { error } = await sb.storage.from('archivos').upload(ruta, archivo, { upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error('El almacenamiento de archivos no está activado. Ejecute 02_almacenamiento.sql en Supabase o use un enlace.');
    throw new Error(error.message);
  }
  return PREFIJO + ruta;
}

export async function enlaceArchivo(valor) {
  if (!valor.startsWith(PREFIJO)) return valor;
  const { data, error } = await sb.storage.from('archivos').createSignedUrl(valor.slice(PREFIJO.length), 600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export const campoArchivo = () => `<div class="campo completo"><label>Subir archivo (opcional, máx. 5 MB)</label>
  <input type="file" class="subir-archivo" accept="image/*,.pdf"><small>Si sube un archivo, reemplaza el enlace escrito arriba.</small></div>`;
