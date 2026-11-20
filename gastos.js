import { crud } from '../crud.js';
import { esc, fecha, hoy, pesos, periodoActual, avisoError, descargarCSV } from '../ui.js';
import { subirArchivo, enlaceArchivo, campoArchivo } from './archivos.js';

const CATEGORIAS = ['Arbitraje', 'Implementación deportiva', 'Uniformes', 'Alquiler de cancha', 'Transporte', 'Hidratación', 'Honorarios entrenadores', 'Torneos e inscripciones', 'Papelería', 'Servicios', 'Otros'];

export async function vista(el, ctx) {
  let ultimas = [];
  el.innerHTML = '<p class="ayuda">Los gastos se registran por separado de los pagos y recaudos.</p><div class="zona"></div>';
  crud(el.querySelector('.zona'), {
    tabla: 'gastos', singular: 'gasto', nuevoTexto: 'Registrar gasto',
    orden: ['fecha', false],
    filtrosHtml: `<label>Mes <input type="month" class="filtro-extra f-mes" value="${periodoActual()}"></label>`,
    filtro: (c, cont) => {
      const m = cont.querySelector('.f-mes')?.value;
      if (!m) return c;
      const [y, mm] = m.split('-').map(Number);
      const fin = mm === 12 ? `${y + 1}-01-01` : `${y}-${String(mm + 1).padStart(2, '0')}-01`;
      return c.gte('fecha', `${m}-01`).lt('fecha', fin);
    },
    resumen: (filas) => {
      ultimas = filas;
      const porCat = {};
      filas.forEach((g) => (porCat[g.categoria || 'Sin categoría'] = (porCat[g.categoria || 'Sin categoría'] || 0) + Number(g.valor)));
      return `<div class="mini-tarjetas"><div><b>${pesos(filas.reduce((s, g) => s + Number(g.valor), 0))}</b>total (${filas.length})</div>
        ${Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, v]) => `<div><b>${pesos(v)}</b>${esc(c)}</div>`).join('')}
        <div><button class="btn-mini exportar-gastos">Exportar</button></div></div>`;
    },
    vacio: 'No hay gastos registrados en este mes.',
    columnas: [
      { l: 'Fecha', v: (g) => fecha(g.fecha) },
      { l: 'Concepto', v: (g) => `<strong>${esc(g.concepto)}</strong>${g.observaciones ? `<br><small>${esc(g.observaciones)}</small>` : ''}` },
      { l: 'Categoría', v: (g) => esc(g.categoria || '—') },
      { l: 'Valor', v: (g) => `<b>${pesos(g.valor)}</b>` },
      { l: 'Responsable', v: (g) => esc(g.responsable || '') },
      { l: 'Soporte', v: (g) => g.soporte ? `<button class="btn-mini ver-soporte" data-archivo="${esc(g.soporte)}">Ver</button>` : '—' },
    ],
    campos: [
      { n: 'fecha', l: 'Fecha', t: 'date', req: true, def: hoy() },
      { n: 'valor', l: 'Valor', t: 'number', req: true, min: 1, step: 1, inputmode: 'numeric' },
      { n: 'concepto', l: 'Concepto', req: true, ancho: 'completo', ph: 'Ej.: Pago de árbitros torneo intercolegiado' },
      { n: 'categoria', l: 'Categoría del gasto', dl: CATEGORIAS },
      { n: 'responsable', l: 'Responsable' },
      { n: 'soporte', l: 'Enlace al soporte (opcional)', ancho: 'completo' },
      { n: 'observaciones', l: 'Observaciones', t: 'textarea', ancho: 'completo', filas: 2 },
    ],
    extraForm: campoArchivo(),
    antesGuardar: async (d, r, modal) => {
      const f = modal.querySelector('.subir-archivo')?.files?.[0];
      if (f) d.soporte = await subirArchivo(ctx.club.id, 'gastos', f);
      return d;
    },
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('.ver-soporte');
    if (b) { try { window.open(await enlaceArchivo(b.dataset.archivo), '_blank', 'noopener'); } catch (err) { avisoError(err); } }
    if (e.target.closest('.exportar-gastos')) descargarCSV('gastos', ultimas, [[(g) => fecha(g.fecha), 'Fecha'], ['concepto', 'Concepto'], ['categoria', 'Categoría'], ['valor', 'Valor'], ['responsable', 'Responsable'], ['observaciones', 'Observaciones']]);
  });
}
