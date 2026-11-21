// =====================================================================
//  CONFIGURACIÓN — lo único que hay que editar para conectar la plataforma.
//  Los dos valores están en Supabase → Project Settings → API.
//  La "anon public key" es pública por diseño: la seguridad la da la base
//  de datos (RLS). NUNCA pegue aquí la "service_role key".
// =====================================================================
export const CONFIG = {
  SUPABASE_URL: 'https://yelzlapexvgzmexnvndk.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable__1-msB6QMOOmxInEdBHN6w_1-SJKv-9',   // clave publicable (sb_publishable_…)
  NOMBRE_PLATAFORMA: 'SportHub',
};
