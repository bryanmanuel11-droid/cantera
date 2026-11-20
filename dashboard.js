import { sb, q, rpc } from '../supabase.js';
import { esc, pesos, numero, fecha, nombreCompleto, cargando } from '../ui.js';

export async function vista(el, ctx) {
  el.innerHTML = cargando();
  const [r, recientes] = await Promise.all([
    rpc('resumen_dashboard'),
    q(sb.from('solicitudes').select('id, creado_en, deportistas(nombres, apellidos, codigo)').eq('estado', 'pendiente').order('creado_en', { ascending: false }).limit(5)),
  ]);
  const pctAsis = r.asistencia_registros_30d ? Math.round((r.asistencia_presentes_30d / r.asistencia_registros_30d) * 100) : null;
  const tarjeta = (t, v, sub = '', enlace = '', clase = '') =>
    `<a class="tarjeta ${clase}" ${enlace ? `href="#/${enlace}"` : ''}><span class="tarjeta-t">${esc(t)}</span><span class="tarjeta-v">${v}</span>${sub ? `<span class="tarjeta-s">${sub}</span>` : ''}</a>`;

  el.innerHTML = `
    ${r.solicitudes_pendientes ? `<a class="alerta alerta-info" href="#/inscripciones">Tiene <strong>${r.solicitudes_pendientes}</strong> solicitud(es) de inscripción por revisar →</a>` : ''}
    <h2 class="seccion">Deportistas</h2>
    <div class="tarjetas">
      ${tarjeta('Total de deportistas', numero(r.total_deportistas), '', 'deportistas')}
      ${tarjeta('Activos', numero(r.activos), '', 'deportistas')}
      ${tarjeta('Pendientes de aprobación', numero(r.pendientes), '', 'inscripciones', r.pendientes ? 'resaltada' : '')}
      ${tarjeta('Solicitudes pendientes', numero(r.solicitudes_pendientes), `${numero(r.solicitudes_aprobadas)} aprobadas en total`, 'inscripciones')}
    </div>
    <h2 class="seccion">Finanzas</h2>
    <div class="tarjetas">
      ${tarjeta('Recaudo del mes', pesos(r.recaudo_mes), `Total histórico: ${pesos(r.recaudo_total)}`, 'pagos')}
      ${r.tarifas_configuradas
        ? tarjeta('Cartera pendiente', pesos(r.cartera_pendiente), 'Saldos por cobrar', 'pagos/cartera')
        : tarjeta('Cartera pendiente', '<span class="pendiente-config">Pendiente de configuración</span>', 'Aún no hay tarifas definidas', 'pagos/tarifas')}
      ${tarjeta('Gastos del mes', pesos(r.gastos_mes), `Total histórico: ${pesos(r.gastos_total)}`, 'gastos')}
      ${tarjeta('Balance del mes', pesos(r.recaudo_mes - r.gastos_mes), 'Recaudo menos gastos', 'informes')}
    </div>
    <h2 class="seccion">Asistencia (últimos 30 días)</h2>
    <div class="tarjetas">
      ${tarjeta('Asistencia', pctAsis === null ? '—' : `${pctAsis}%`, pctAsis === null ? 'Sin registros todavía' : `${numero(r.asistencia_presentes_30d)} de ${numero(r.asistencia_registros_30d)} registros`, 'asistencia')}
    </div>
    ${recientes.length ? `<h2 class="seccion">Últimas solicitudes recibidas</h2>
      <div class="lista-simple">${recientes.map((s) => `<a href="#/inscripciones"><strong>${esc(nombreCompleto(s.deportistas))}</strong><span>${fecha(s.creado_en)}</span></a>`).join('')}</div>` : ''}
    <div class="atajos">
      <a class="btn btn-pri" href="#/inscripciones">+ Generar enlace de inscripción</a>
      <a class="btn btn-sec" href="#/pagos">Registrar pago</a>
      <a class="btn btn-sec" href="#/asistencia">Tomar asistencia</a>
    </div>`;
}
