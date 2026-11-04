# Valoración financiera e imágenes multisede

Versión: `20261104-images`.

## Cambios

- Se eliminó la tarjeta de valor de inventario del Dashboard. La valoración permanece en Reportes financieros y conserva el ciclo y colegio activo, desglose, precios faltantes y exportaciones.
- Gestión de recursos → Distribuir en varias sedes permite seleccionar hasta cinco imágenes PNG/JPG/WebP de hasta 5 MB por archivo, previsualizarlas y quitarlas antes de confirmar. Se normalizan a PNG de hasta 320 píxeles y 160.000 caracteres por imagen.
- La misma galería se vincula a cada lote creado para las sedes elegidas. Las miniaturas aparecen en el desglose del producto. No se reemplazan imágenes de distribuciones anteriores.
- Se corrigió la habilitación del botón de distribución al terminar la carga inicial de datos.

## Instalar

1. Descargar un respaldo actualizado del inventario.
2. Si la actualización anual todavía no fue instalada, ejecutar primero `supabase/annual-cycles.sql`, con sus módulos anteriores ya instalados. No reinstalar los scripts antiguos.
3. Ejecutar todo `supabase/distribution-images.sql` en el SQL Editor del proyecto Supabase. Es transaccional, repetible y conserva los datos.
4. Descomprimir `actualizacion-imagenes-multisede.zip`. En GitHub subir directamente `index.html` y las carpetas completas `css`, `js`, `assets` a la raíz del repositorio. No subir solamente el ZIP ni una carpeta contenedora. Confirmar con Commit changes.
5. Esperar el despliegue de GitHub Pages y recargar con Ctrl + F5.
6. Verificar la ausencia de la tarjeta en Dashboard, su presencia en Reportes financieros y una distribución de prueba con imagen en dos sedes. Recargar para comprobar persistencia.

Los SQL se ejecutan en Supabase: subirlos al repositorio no los instala. Esta entrega no modifica el Supabase real ni publica en GitHub.

## Operación y persistencia

La UI utiliza la nueva RPC `nexo_distribute_resources(p_payload jsonb, p_key uuid)`. El payload conserva `groupId`, `name`, `categoryId`, `capacity`, `totalCents`, fechas, `allocations` y `reason`, y agrega `images: string[]` con PNG normalizados como data URLs. No se requiere bucket ni clave privada; se usa el mismo almacenamiento de imágenes embebidas del catálogo de herramientas.

La RPC reutiliza `nexo_business_action('distribute', ...)` con sus permisos, auditoría y claves de reintento. Agrega la galería a `nexo_workspace.cycle_details.resourceMeta[idDelLote].images` dentro de la misma transacción. `nexo_cycle_load` devuelve las imágenes en `inventory.resources[].images`; se conservan en los archivos anuales, guardados y respaldos/restauraciones. Las validaciones se aplican tanto en la UI como en SQL. Si falta la migración, el formulario informa cuál instalar y no confirma una distribución sin guardar sus imágenes.

## Validación

`npm test`: 33 pruebas aprobadas. Incluyen persistencia en dos sedes, reintentos sin duplicación, formatos y límites, rollback, permisos, restauración y archivo anual. Prueba de navegador con base de datos aislada y usuarios ficticios: selección de imagen, miniatura previa y distribución confirmada en dos sedes, sin errores de consola. Captura: `docs/distribucion-imagenes-preview.png`.
