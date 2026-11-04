# Menú lateral plegable

Versión `20261104-sidebar`.

El botón **Ocultar menú** está arriba a la izquierda, en la cabecera del contenido. Oculta la navegación y permite que la pantalla aproveche el ancho disponible. El mismo botón cambia a **Mostrar menú** para restaurar la barra y el ancho anterior.

La elección se conserva en este navegador al recargar o cambiar de pantalla. En pantallas pequeñas se muestra el icono, con el nombre accesible y la ayuda del botón. La navegación oculta queda fuera del recorrido del teclado.

## Actualizar

1. Descomprimir `actualizacion-menu-lateral.zip`.
2. Subir directamente `index.html` y las carpetas completas `css`, `js`, `assets` a la raíz del repositorio y confirmar con Commit changes.
3. Esperar GitHub Pages y recargar con Ctrl + F5.

El cambio de la barra no requiere SQL. Los SQL de actualizaciones anteriores se incluyen por continuidad; no hace falta volver a ejecutarlos si ya están instalados. Esta entrega conserva los cambios previos del proyecto.

## Comprobación

Se verificó en navegador con datos ficticios: al ocultar la barra, el contenido pasó de 1017 a 1265 píxeles de ancho; al mostrarla recuperó el margen de 248 píxeles. Se comprobó la persistencia al recargar y la ausencia de errores de consola. Se verificó también la sintaxis de los módulos modificados.

Los archivos están preparados localmente. No se publicaron en GitHub ni se modificó el Supabase real.
