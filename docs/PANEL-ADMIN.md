# Panel de administración de usuarios

Versión `20261105-admin`.

## Qué permite

El enlace **Administración** aparece en el menú para cuentas activas con rol `coordinator` o `admin`.

- Agregar cuentas conectadas a Supabase Auth con nombre, correo y contraseña inicial de 12 a 128 caracteres.
- Editar nombre, rol (`coordinator`, `admin`, `viewer`, `requester`), sedes, permiso financiero, compras y recepción de transferencias.
- Desactivar accesos y reactivarlos. La baja conserva la cuenta y su historial; no borra usuarios de Auth.
- Ver actividad por usuario: fecha de Buenos Aires, módulo, registro, campos modificados y valores anteriores/posteriores disponibles.

La cuenta principal `mllanso@northfield.edu.ar` está protegida. No se permite desactivar la propia cuenta ni cambiar el propio rol. Los permisos se comprueban en Supabase, además de la interfaz.

## Instalar: tres pasos

Esta guía parte de la instalación actual de Nexo con los módulos de negocio, planificación, herramientas y ciclos anuales ya instalados. No reinstalar los scripts antiguos. Conservar un respaldo antes de actualizar.

### 1. Instalar el SQL

Abrir el proyecto existente en Supabase → **SQL Editor** → nueva consulta. Copiar todo `supabase/admin-panel.sql` y ejecutar con **Run**.

El script es transaccional y repetible. Conserva usuarios, recursos y permisos existentes. Crea el directorio de usuarios de Nexo, las funciones del panel y la bitácora protegida.

### 2. Publicar la función para crear cuentas

En ese mismo proyecto de Supabase:

1. Abrir **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Usar el nombre exacto **`nexo-admin-users`**.
3. Reemplazar el código de ejemplo por todo el contenido de `supabase/nexo-admin-users-dashboard.ts`. Es la entrega de un solo archivo: no copiar solo `functions/nexo-admin-users/index.ts`, porque esa variante importa otro archivo.
4. Mantener habilitada la verificación de JWT (`verify_jwt = true`). El código verifica también la sesión mediante Auth y el rol actual mediante SQL.
5. Pulsar **Deploy function** y esperar la confirmación de publicación.

La función lee las credenciales de las variables del servidor Supabase. No hay que copiarlas a `js/config.js` ni enviarlas por chat. El origen permitido predeterminado es `https://mllanso.github.io`, que corresponde a GitHub Pages. Si se usa un dominio distinto, configurar `NEXO_APP_ORIGIN` con el origen exacto, sin ruta ni barra final.

Para un despliegue mediante CLI, el paquete conserva también `supabase/functions/nexo-admin-users/index.ts`, `handler.js` y `supabase/config.toml`.

La publicación desde el editor y la verificación de usuarios siguen las guías oficiales de [Edge Functions en el Dashboard](https://supabase.com/docs/guides/functions/quickstart-dashboard) y [autenticación de funciones](https://supabase.com/docs/guides/functions/auth). La administración de cuentas se ejecuta en el servidor, como exige la documentación de [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

### 3. Actualizar GitHub Pages

Descomprimir `actualizacion-panel-admin.zip` y subir directamente a la raíz del repositorio:

- `index.html`
- Carpetas completas `css`, `js`, `assets`

Confirmar con **Commit changes**, esperar el despliegue y recargar con **Ctrl + F5**. Entrar con una cuenta coordinator o admin y abrir **Administración**.

Subir el SQL o el archivo de la función a GitHub no los instala en Supabase. Los tres pasos son necesarios para disponer del alta de usuarios desde el panel.

## Uso y límites del historial

**Agregar usuario** crea la cuenta y habilita sus permisos. Si el correo ya existe en Auth pero no tiene acceso a Nexo, conserva su contraseña anterior. Una cuenta activa se modifica desde **Editar**, evitando duplicados.

**Desactivar** retira la membresía y los permisos de Nexo. Las siguientes consultas de datos se rechazan, aunque la persona conserve una sesión Auth abierta. Puede volver a habilitarse desde **Reactivar**, definiendo nuevamente sus sedes y permisos. No se modifica ni elimina su contraseña.

**Ver actividad** filtra el historial por autor. **Ver toda la actividad** elimina ese filtro. Los registros empiezan al instalar esta migración; no se inventan eventos anteriores. Una edición realizada directamente mediante SQL sin sesión de usuario figura como Administración SQL.

La bitácora registra inventario, colegios, categorías, agrupaciones, planificación, herramientas, solicitudes, transferencias, contratos, metadatos y accesos. Se registran los campos financieros o imágenes que cambiaron, pero no se guardan sus importes ni archivos en la bitácora. No contiene contraseñas o tokens. La consulta está paginada y la tabla no se puede editar ni borrar desde la web.

Si falta SQL, el panel indica qué instalar. Si falta la función, el listado y las ediciones pueden funcionar, pero el alta informa que debe publicarse `nexo-admin-users`. Si Auth crea la cuenta pero falla la asignación de acceso, se informa el estado y se permite reintentar sin reemplazar la contraseña existente.

## Validación y estado de entrega

38 pruebas aprobadas en el conjunto del proyecto. Las pruebas de administración verifican permisos, roles, baja/reactivación, conflictos, cuenta protegida, auditoría, ocultamiento de importes, JWT, orígenes, contraseñas fuera del perfil y cuentas existentes. Se verificó además el rechazo de nombres vacíos. El servidor Auth está simulado en esas pruebas: no se crearon cuentas reales.

Revisión en navegador con PostgreSQL aislado y usuarios ficticios: listado, historial, formulario de alta y ausencia de errores de consola. Captura: `docs/panel-admin-usuarios.png`.

El código y el paquete están preparados localmente. No se ejecutó SQL en el Supabase real ni se publicó la función o la actualización en GitHub desde esta sesión. El funcionamiento del alta en producción debe verificarse después del despliegue.
