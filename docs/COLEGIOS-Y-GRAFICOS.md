# Colegios, categorías y formatos de gráficos

Versión `20261105-layout`.

El menú **Colegios y categorías** reúne las dos gestiones mediante pestañas. Se conservan la creación, edición, eliminación, permisos y relaciones con los recursos. Los enlaces anteriores a categorías siguen funcionando.

Los gráficos del Dashboard y de aprobaciones incorporan un selector por gráfico:

- Comparativas por colegio, antigüedad y aprobaciones: barras verticales, barras horizontales y líneas.
- Frecuencia de uso: anillo, circular y barras.

La elección se guarda en el navegador para cada gráfico y se conserva al actualizar filtros o cambiar de pantalla. Los filtros de colegio/ciclo y los datos son los mismos en todos los formatos. Los porcentajes de aprobación conservan la escala de 0 a 100. Las líneas conectan categorías para facilitar la comparación; no representan una serie temporal.

## Publicar

Descomprimir `actualizacion-colegios-graficos.zip` y subir directamente `index.html`, `css`, `js` y `assets` a la raíz de GitHub. Confirmar los cambios, esperar el despliegue y recargar con Ctrl + F5.

Este cambio no requiere SQL nuevo. Los archivos del panel administrativo anterior se incluyen por continuidad, para quienes todavía tengan pendiente instalarlo; no es necesario reinstalarlos.

Se probaron los cambios de formato en navegador con datos ficticios, la navegación entre pestañas y la conservación de datos/escalas mediante pruebas automatizadas. No se publicaron archivos ni se modificó Supabase real.
