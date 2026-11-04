# Tarjetas con logos y base editable de Planificación 2027

Versión `20261104-cards`.

## Cambios

- Recursos por producto usa una grilla de tarjetas con logo grande dentro de un círculo, nombre, colegios y cantidades. Al seleccionar una tarjeta se abre debajo su distribución por sede, con las acciones de edición, transferencia, historial y solicitud.
- El logo se obtiene de las imágenes del lote o de una aplicación del catálogo con el mismo nombre y una sede de la selección. Si falta una imagen se muestran iniciales y “Sin imagen cargada”. No se descargan ni inventan logos de marcas.
- En Planificación 2027 → Editar se puede modificar “Cantidad actual / Base 2026 del plan”. El ajuste solo afecta la base de comparación del plan, sus métricas, diferencias y unidades a solicitar. El inventario conserva el stock original.
- Las bases editadas se identifican con “Base ajustada solo en el plan”. Para volver a usar el inventario, editar la base y cargar la cantidad actual del lote. Las filas nuevas y duplicadas comienzan con base cero.
- Aplicar al plan prepara el cambio. Después se debe pulsar “Guardar estructura y cantidades” para conservarlo. Las observaciones mantienen su autoguardado y las cantidades 2027 siguen habilitadas solo en Confirmado.

## Publicación

Descomprimir `actualizacion-tarjetas-planificacion.zip`. Subir directamente `index.html`, `css`, `js` y `assets` a la raíz del repositorio y confirmar con Commit changes. Esperar GitHub Pages y recargar con Ctrl + F5.

Estos dos cambios no requieren SQL nuevo. Se conserva `nexo_planning_save` y su control de revisión, permisos y validación de cantidades; se guardan `baselineQuantity` y el indicador `baselineOverride` dentro de la fila del plan existente. No se escribe el inventario al guardar el plan.

El paquete también conserva las imágenes multisede de la entrega anterior. Solo si esa actualización todavía no está instalada, ejecutar `supabase/distribution-images.sql` después de `supabase/annual-cycles.sql`, respetando sus dependencias ya instaladas. No reinstalar los scripts antiguos.

Esta entrega es local: no se publicó en GitHub ni se ejecutaron migraciones sobre el Supabase real.

## Verificación

35 pruebas aprobadas. La cobertura incluye selección de logos por recurso y sede, edición y persistencia SQL de la base, aislamiento respecto del stock y duplicación con base cero. En navegador con datos ficticios: tarjeta con logo grande, detalle por sede y plan guardado con base 12, cantidad 2027 de 20 y diferencia +8; el inventario mantiene 18 unidades. El ajuste persiste al recargar. Capturas: `docs/recursos-tarjetas-logos.png` y `docs/planificacion-base-editable.png`.
