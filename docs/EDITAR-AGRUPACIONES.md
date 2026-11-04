# Edición de agrupaciones consolidadas

Versión `20261104-groups`.

## Uso

1. En Gestión de recursos → Recursos por producto, seleccionar una tarjeta.
2. En el detalle inferior, pulsar **Editar agrupación**.
3. Cambiar el nombre y/o seleccionar una imagen PNG, JPG o WebP de hasta 5 MB. La miniatura se muestra antes de guardar. **Quitar imagen** permite volver a las iniciales.
4. Completar el motivo y pulsar **Guardar agrupación**.

El logo representa a la agrupación en todas sus sedes. Conserva las fotos específicas de los lotes, cantidades, contratos, reservas y planificación. Cambiar el nombre modifica el título de la agrupación; los nombres individuales de los lotes se editan desde su propia fila.

Solo pueden editar usuarios con permiso de inventario y en el ciclo abierto. Los lotes sin agrupación conservan su edición individual; primero deben vincularse a una agrupación para disponer de este editor.

## Instalación

1. Conservar un respaldo actualizado.
2. Si todavía no se instaló, ejecutar `supabase/distribution-images.sql` sobre la actualización anual existente.
3. Ejecutar todo `supabase/group-editor.sql` en el SQL Editor de Supabase. Es transaccional y repetible. No reinstalar los scripts antiguos.
4. Descomprimir `actualizacion-editor-agrupaciones.zip` y subir directamente `index.html` y las carpetas completas `css`, `js`, `assets` a la raíz de GitHub. Confirmar con Commit changes.
5. Esperar el despliegue y recargar con Ctrl + F5.

Los archivos SQL incluidos se ejecutan en Supabase; subirlos a GitHub no los instala. La entrega conserva los cambios anteriores de tarjetas, imágenes multisede y base editable del plan. No se publicó ni se modificó el Supabase real desde esta sesión.

## Guardado y validación

Nueva RPC: `nexo_group_update(p_payload, p_key, p_expected_revision)`, con `id`, `name`, `reason` y `image` opcional. La imagen se normaliza al formato PNG existente, hasta 320 píxeles y 160.000 caracteres. Un texto vacío quita el logo; omitir `image` conserva la imagen anterior.

El guardado utiliza los permisos y el registro de operaciones de `nexo_business_action('group_update', ...)`, controla conflictos de revisión y conserva reintentos sin repetir cambios. El logo representativo se carga como `groupImage` en los metadatos de los lotes de la agrupación y se devuelve mediante la API anual. Los archivos anuales y las restauraciones conservan el logo.

36 pruebas aprobadas: incluyen guardado por sede, cambio de nombre, eliminación del logo, reintentos antiguos, conflictos, permisos, restauración, validación de imágenes y conservación de inventario/contratos/movimientos. En navegador se verificó la apertura del editor y la miniatura antes de guardar, sin errores de consola; las pruebas de persistencia se hicieron con PostgreSQL aislado y datos ficticios.
