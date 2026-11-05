# Reporte interactivo y presentación ejecutiva

Versión `20261105-insights`.

## Arquitectura y código entregado

Se integra al stack actual: HTML/CSS, JavaScript modular, Supabase, Chart.js y jsPDF. No requiere React ni nuevas dependencias externas.

| Archivo | Responsabilidad |
|---|---|
| `js/insights.js` | Formulario de filtros, estado aplicado, recursos dependientes de sedes, KPIs, gráficos y tabla |
| `js/insights-domain.js` | Validación de fechas, zona de Buenos Aires, filtrado combinado y agregaciones |
| `js/chart-formats.js` | Selector y renderizado de formatos de Chart.js |
| `js/insights-export.js` | Exportación jsPDF en diapositivas horizontales de 297 × 167 mm |
| `js/app.js` | Ruta `#insights`, contexto de usuario/ciclo y conexión al estado autorizado |
| `tests/insights.test.mjs` | Filtros, fechas, meses vacíos y paginación de la presentación |

La fuente es `nexo_cycle_load(p_year)`, ya existente en Supabase. El reporte consume `business.movements` de la captura anual autorizada. No utiliza la lectura antigua limitada a los últimos movimientos. Los solicitantes no acceden a la bitácora: ven un aviso de falta de datos autorizados. No se agrega ninguna clave privada ni se amplían permisos.

## Flujo y estado

Menú **Reporte interactivo** → seleccionar instituciones, recursos y fechas → **Aplicar filtros** → resumen → **Exportar a presentación PDF**.

Las instituciones admiten selección múltiple; sin selección se consultan todas las autorizadas. Los recursos son productos/agrupaciones o lotes históricos con movimientos asociados a las instituciones elegidas. Cambiar sedes actualiza las opciones y elimina selecciones incompatibles.

El formulario y el reporte aplicado son estados distintos. Modificar inputs no modifica silenciosamente una presentación ya preparada: el mensaje solicita aplicar los nuevos filtros. Si las fechas son inválidas, el resultado anterior se conserva con su alcance explícito. Ocultar filtros conserva las selecciones. Restablecer vuelve al ciclo y colegio activos. Cambiar ciclo, colegio activo o usuario reinicia el contexto del reporte.

Ejemplo de estado:

```js
const filters = {
  schools: ['s1', 's2'],
  resources: ['group:identificador-real'],
  from: '2026-01-01',
  to: '2026-11-05',
  distribution: 'schools' // o 'resources'
};
```

Las funciones puras pueden reutilizarse:

```js
import {buildInsights} from './insights-domain.js';
const report = buildInsights(inventory, business, filters, cycleYear, snapshotDay);
```

La validación rechaza fechas inexistentes, inicio posterior al fin, períodos fuera del ciclo y fechas posteriores a la captura disponible. Los días se interpretan en Buenos Aires. Los registros borrados del inventario siguen siendo identificables mediante sus referencias históricas, sin unirlos por similitud de nombre.

## Métricas y gráficos

- Entradas registradas: suma de incrementos positivos.
- Salidas registradas: valor absoluto de disminuciones.
- Variación neta: entradas menos salidas.
- Movimientos: número de registros filtrados.
- Evolución mensual: entradas y salidas, con selector de líneas y barras.
- Distribución: suma de unidades movilizadas (valores absolutos), por institución o recurso, con anillo, circular o barras.

Los meses sin registros aparecen en cero dentro del período, pero no prueban que la bitácora tuviera cobertura completa. La métrica representa actividad documentada, no stock, adquisiciones netas ni gasto. La instalación inicial puede generar saldos de apertura; un traslado puede producir una salida y una entrada. Estos criterios aparecen en la pantalla y en el PDF.

## Presentación PDF

Se eligió jsPDF porque ya está incluido en Nexo y permite textos, métricas y tablas vectoriales. Se evita una captura completa de HTML que podría cortar filas. Los gráficos se incluyen desde los canvas de Chart.js, con la apariencia seleccionada y sin animación al exportar.

La presentación contiene resumen ejecutivo, filtros completos (con páginas adicionales cuando son extensos), evolución temporal, distribución y todas las filas del detalle paginadas. Incluye período, ciclo, zona horaria, cobertura y numeración de diapositivas. El archivo es PDF; no es un PPTX editable.

```js
import {exportInsightsPDF} from './insights-export.js';
exportInsightsPDF(report, [
  ['Evolución mensual', document.querySelector('#insights-time')],
  ['Distribución de actividad', document.querySelector('#insights-distribution')]
]);
```

## Publicación

Descomprimir `actualizacion-reporte-interactivo.zip`. Subir directamente `index.html`, `css`, `js` y `assets` a la raíz de GitHub, confirmar y esperar el despliegue. Recargar con Ctrl + F5.

Esta funcionalidad no requiere SQL nuevo; necesita la API de ciclos anuales instalada. Conserva los módulos anteriores, incluido Administración. El SQL y la función del panel administrativo se incluyen por continuidad y solo deben instalarse si esa actualización sigue pendiente.

## Validación

41 pruebas aprobadas en el proyecto. La cobertura nueva incluye filtros combinados, fecha UTC que corresponde al día anterior en Buenos Aires, límites de ciclo/captura, fechas imposibles, recursos archivados, estados vacíos y paginación de cien filas y filtros extensos.

En navegador con datos ficticios se filtraron dos instituciones y Minecraft Education: 30 entradas y dos registros. Se descargó correctamente un PDF de cinco diapositivas y se comprobó su estructura. Sin errores de consola. Las pruebas no modificaron Supabase real.

La entrega es local. No se publicó en GitHub ni se modificó producción.
