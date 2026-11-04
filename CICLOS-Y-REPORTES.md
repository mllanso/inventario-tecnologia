# Ciclos anuales, valoración, software y observaciones

## Instalar esta actualización

La entrega se prepara en esta carpeta para GitHub Pages. No se ejecutó SQL en el Supabase real ni se publicaron archivos en GitHub desde esta sesión.

1. Descargar un respaldo actual desde la aplicación y conservar un respaldo de Supabase si se necesita recuperar la operación completa.
2. Con los módulos anteriores ya instalados (`business.sql`, `planning-2027-v2.sql` y `school-tools.sql`), ejecutar TODO **`supabase/annual-cycles.sql`** en SQL Editor. No reinstalar los scripts anteriores para aplicar esta actualización.
3. Descomprimir `actualizacion-ciclos-reportes.zip`. Subir `index.html` y las carpetas completas `css/`, `js/` y `assets/` a GitHub, reemplazando sus versiones anteriores. El archivo SQL se ejecuta en Supabase; subirlo al repositorio no lo ejecuta.
4. Esperar la publicación de Pages y recargar con **Ctrl + F5**.

La migración conserva colegios, inventario, usuarios, herramientas, planificación y permisos. Se puede repetir sin borrar cierres anteriores. No requiere otra clave pública ni un bucket de imágenes nuevo.

## Ciclo de planificación

La cabecera incorpora **Ciclo de planificación** y **Colegio activo**. El cambio de año carga un estado anual consistente para inventario, categorías, herramientas, planificación, solicitudes, decisiones, contratos y movimientos. El colegio activo se comparte entre Dashboard, detalle, software, solicitudes y reportes. Los filtros adicionales del inventario conservan su función.

El corte es el 31/12, en **America/Argentina/Buenos_Aires**. Los datos son acumulados hasta ese corte; no se elimina el stock el 1 de enero. El último estado del año queda archivado y se consulta sin edición al cerrar el ciclo. Los presupuestos asignados se identifican por año y colegio, por lo que no se atribuye automáticamente el presupuesto del año anterior al nuevo.

**Límite histórico:** el archivo completo comienza al instalar esta migración. Si no hay un cierre verificado de 2024 o 2025, la plataforma indica que no existe archivo y no calcula una valoración histórica ficticia. El año de adquisición no se usa como sustituto de la fecha de registro. Los movimientos antiguos pueden conservar información parcial; eso no permite reconstruir todos los nombres, precios, herramientas o decisiones de un cierre anterior.

El ciclo abierto muestra la información conocida hasta la última operación, con su fecha de captura. Elegir un año futuro consulta la información disponible hasta hoy; no predice adquisiciones ni habilita registrar operaciones futuras. El archivo anual compartido necesita Supabase; el modo LocalStorage conserva el funcionamiento local del inventario y el autoguardado, pero no crea un archivo histórico completo.

## Valoración financiera

**Reportes financieros** incorpora el valor del inventario: suma de cantidad × precio unitario en USD. Si faltan costos, se muestra **total parcial** y el número de lotes sin precio.

El formulario de recursos agrega dos clasificaciones independientes del estado físico:

- Categoría patrimonial: Hardware, Licencias, Mobiliario o Sin clasificar.
- Estado patrimonial: En uso, Depósito, Amortizado o Sin clasificar.

Los registros antiguos quedan Sin clasificar hasta declarar estos datos. El estado físico Activo no demuestra por sí solo que un equipo esté en uso o depositado. Amortizado es una clasificación declarada; no se calcula depreciación contable automáticamente.

La tarjeta de valoración sigue el ciclo y el colegio activo. Tiene exportación propia y el reporte financiero completo también incorpora el desglose patrimonial. La imputación contractual conserva la distribución proporcional y asigna los centavos restantes de forma determinista. Un corte anterior al comienzo verificable de la bitácora se rechaza, en lugar de mostrar un saldo histórico inventado.

## Dashboard y ficha de colegio

La botonera institucional muestra selección activa e incluye **Ver Todos**. Elegir un colegio filtra el Dashboard y abre un cuadro de detalle con:

- Cantidad de lotes y unidades.
- Presupuesto asignado al año y compras ejecutadas en ese año.
- Tabla completa de recursos con búsqueda por nombre, código, categoría o estado.
- Solicitudes aprobadas, pendientes y rechazadas, con su historial visible.
- Exportaciones XLSX y PDF del reporte completo del colegio y ciclo.

El presupuesto asignado se carga desde esta ficha, con permiso financiero. Si falta, se informa Sin registrar. El ejecutado se obtiene de los contratos originados por recepciones/activaciones del año, sin contar dos veces un mismo contrato. No es el valor total del stock ni la estimación de solicitudes aprobadas.

## Aplicaciones y licencias

**Gestión de recursos → Explorador de software** reutiliza las fichas y logos de herramientas por sede. Permite seleccionar hasta dos tarjetas para verlas en paralelo, volver a todas y consultar una **Ficha técnica**.

Las fichas agregan proveedor, número de licencias y costo por usuario en USD. Los valores desconocidos permanecen Sin registrar. Los colegios asignados se muestran en cada ficha; una misma aplicación puede tener datos distintos en cada sede. Se mantiene la carga de imagen PNG/JPG/WebP y la edición del catálogo. Estos campos describen las licencias; no crean unidades físicas ni contratos de compra automáticamente.

## Aprobaciones y auditoría

**Solicitudes y compras** muestra solicitudes aceptadas y rechazadas, unidades solicitadas, porcentaje y costo evitado estimado. Se consideran aceptadas las solicitudes Aprobada, En compra, Entrega parcial y Completada. Pendientes y canceladas no integran el denominador del porcentaje de aprobación.

El gráfico muestra el porcentaje por colegio. La auditoría proviene de los eventos reales de aprobación/rechazo e incluye fecha, solicitante, autorizador y motivo. La estimación de costos se registra con permiso financiero y control de revisión. Los rechazos sin importe estimado se cuentan explícitamente; no se les atribuye un ahorro supuesto. Los totales de estimaciones y de ejecución se suman en centavos enteros.

## Autoguardado de observaciones

Se aplica a las observaciones de las filas existentes del plan y a la información específica de sede de herramientas ya creadas.

- Cada entrada reinicia un temporizador de **5.000 ms desde la última escritura**.
- El indicador pasa por Escribiendo, Esperando para guardar, Guardando cambios y Guardado automáticamente a las HH:MM.
- Perder el foco ejecuta el guardado inmediatamente. Cambiar de pantalla o de ciclo espera a que termine antes de continuar.
- Las escrituras se serializan y conservan la revisión del servidor; una respuesta tardía no marca como guardado un texto más reciente.
- Si hay un error, se muestra junto al campo y se conserva el borrador. Los borradores de sesión se separan por usuario, año y campo.
- Recargar/cerrar inicia el guardado y solicita confirmación si quedan cambios; el navegador puede interrumpir la red al cerrarse, por lo que se conserva recuperación del borrador en la misma pestaña.

La programación es de 5.000 ms; la red y la planificación de tareas del navegador pueden agregar demora. No se presenta como una garantía de tiempo real físico.

Las fichas nuevas se crean primero. En filas nuevas del plan, el campo de observaciones de la tabla se habilita después de guardar su estructura. El formulario de creación permite incluir notas iniciales. **Guardar estructura y cantidades** mantiene su función para altas, bajas y cantidades del plan; las observaciones de filas existentes no dependen de ese botón. Los motivos de aprobación/rechazo siguen formando parte de la transacción explícita de la decisión.

## Componentes y conexión

| Componente | Función |
| --- | --- |
| `js/app.js` | Coordina año, colegio, carga de datos, navegación y cola de escrituras. |
| `js/cloud.js` | Detecta la API anual, carga el corte seleccionado y bloquea escrituras de cierres. Conserva compatibilidad de lectura con la instalación anterior. |
| `js/annual-domain.js` | Cálculos puros de valoración, aprobaciones, ejecución y reparto contractual con redondeo de centavos. |
| `js/annual-view.js` | Tarjeta financiera, panel de colegio, mosaico de software, gráfico de decisiones y exportación XLSX/PDF. |
| `js/autosave.js` | Temporizadores independientes por campo, estado visual, guardado inmediato y recuperación de borradores. |
| `js/planning.js` | Integra el autoguardado de observaciones sin guardar automáticamente cambios de cantidades pendientes. |
| `js/school-tools.js` | Reutiliza las imágenes, añade datos de licencia y ofrece ficha técnica y observaciones automáticas. |
| `js/business.js` / `business-domain.js` | Enlazan los reportes y las aprobaciones con el ciclo y agregan valoración a las exportaciones. |
| `supabase/annual-cycles.sql` | Agrega archivo anual, metadatos patrimoniales, presupuestos, estimaciones, notas y permisos. |

Flujo principal: selector → `CloudInventory.load()` → `nexo_cycle_load(año)` → datos del archivo → módulos de vista. Un guardado válido actualiza la revisión del inventario; un trigger diferido captura el estado final de la transacción. Se conserva una última foto por año y se evita capturar varias veces la misma revisión. Los eventos de decisiones y los movimientos mantienen su bitácora detallada independiente.

La nueva API utiliza `nexo_cycle_load`, `nexo_cycle_action`, `nexo_cycle_save_inventory` y `nexo_restore_with_cycles`. Los archivos están protegidos con RLS y sin acceso directo para usuarios web. Los docentes reciben solo sus sedes, con precios y datos financieros restringidos. Presupuestos y estimaciones requieren permiso financiero. Los respaldos JSON incluyen el inventario del ciclo consultado; el archivo completo, bitácoras y contratos requieren respaldo de Supabase.

## Verificación

`npm test` ejecuta dominio, PostgreSQL embebido, permisos, cierres históricos, notas, presupuestos, centavos, XLSX real y pruebas anteriores. Se limita la concurrencia de pruebas a dos procesos para evitar picos de memoria del PostgreSQL embebido en Windows. La vista QA de `tests/support/business-preview.mjs` usa cuentas y datos ficticios; no se conecta al Supabase real.
