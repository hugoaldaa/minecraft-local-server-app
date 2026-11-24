# Política de privacidad / Privacy policy

**Minecraft Local Server Manager** funciona principalmente en tu equipo. No hay
cuentas de usuario, contraseñas ni almacenamiento en la nube. Esta política
explica qué datos se guardan localmente, cuáles pueden enviarse y cómo
eliminarlos.

---

## Español

### 1. Responsable del tratamiento

El responsable es el autor del proyecto, publicado en
[github.com/hugoaldaa/minecraft-local-server-app](https://github.com/hugoaldaa/minecraft-local-server-app).
Para consultas o solicitudes, abre un *issue* en ese repositorio.

### 2. Datos que se guardan en tu equipo

La app usa `electron-store` dentro de la carpeta de datos de la aplicación:

| Archivo | Contenido |
| --- | --- |
| `servers.json` | Nombre del servidor, ruta absoluta al `.jar` y a Java, RAM, argumentos JVM, versión de Minecraft, color y fecha de creación. |
| `settings.json` | Preferencias (idioma, tema, escala, notificaciones, carpetas, retención) y ajustes por servidor. |
| `serverStats.json` | Muestras de CPU/RAM, eventos de entrada/salida con **nombre de jugador** y marca de tiempo, horas encendido y tiempos por jugador. |
| `analytics.json` | Solo si aceptas la telemetría: ID aleatorio de instalación, versión de la app, plataforma, arquitectura, versión del SO y hasta 500 eventos técnicos. |
| `crashes.json` | Hasta 100 errores con mensaje y traza de pila. La traza puede incluir rutas locales de archivos. |

Retención por defecto: muestras de CPU/RAM 30 días, eventos y totales de
jugadores 730 días, y errores 100 entradas. Los dos primeros periodos se pueden
cambiar en Ajustes.

Las copias de seguridad y los archivos de configuración de Minecraft
(`server.properties`, whitelist, banlist, etc.) viven en la carpeta que tú
elijas; la app no los sube a ningún servidor.

### 3. Datos que se envían

**Por defecto no se envía nada.** La app no incluye ningún endpoint de
analytics ni de errores.

Solo se produce una salida de datos en estos casos:

- Si se configura manualmente `analyticsEndpoint`, se envían por HTTPS los
  eventos técnicos aceptados: `app_launch`, `server_created`,
  `server_started`, `server_stopped`, `backup_created`, `backup_restored`,
  `server_downloaded` y `analytics_enabled`, con valores pequeños como tiempo
  de arranque, tiempo encendido, tamaño de copia, proveedor/versión o nombre de
  archivo de la copia.
- Si se configura manualmente `crashEndpoint`, se envían los informes de error.
  No hay interfaz en la app para configurarlo.
- La app contacta con GitHub para comprobar actualizaciones y con Mojang,
  Paper, Fabric o Forge para descargar servidores. Esos servicios pueden ver tu
  dirección IP, pero no reciben datos de tus servidores ni de tus jugadores.

Nunca se envían nombres de jugadores, IPs, contraseñas ni datos del servidor a
los endpoints de analytics/errores.

### 4. Base y finalidad

- El funcionamiento local (guardar servidores, ajustes y estadísticas) es
  necesario para prestar el servicio.
- La telemetría opcional se basa en tu **consentimiento** y solo se activa si
  lo aceptas expresamente. Rechazarla borra los eventos locales guardados.
- Los informes de error se guardan siempre en local para diagnóstico; solo se
  envían si existe un endpoint configurado.

### 5. Tus controles

En **Ajustes → Privacidad y datos** puedes activar o desactivar la telemetría,
borrar los eventos de uso y limpiar los errores guardados. Al eliminar un
servidor se borran también sus estadísticas.

### 6. Cambios

Esta política puede actualizarse cuando cambien las funciones de la app. La
versión publicada en el repositorio es la vigente.

---

## English

### 1. Data controller

The controller is the project author, published at
[github.com/hugoaldaa/minecraft-local-server-app](https://github.com/hugoaldaa/minecraft-local-server-app).
For questions or requests, open an issue in that repository.

### 2. Data stored on your device

The app uses `electron-store` inside its application data folder:

| File | Contents |
| --- | --- |
| `servers.json` | Server name, absolute paths to the JAR and Java, RAM, JVM args, Minecraft version, color and creation date. |
| `settings.json` | Preferences (language, theme, scale, notifications, folders, retention) and per-server settings. |
| `serverStats.json` | CPU/RAM samples, join/leave events with **player name** and timestamp, uptime and time played per player. |
| `analytics.json` | Only if you opt in: random install ID, app version, platform, architecture, OS release and up to 500 technical events. |
| `crashes.json` | Up to 100 errors with message and stack trace. Stack traces may include local file paths. |

Default retention: CPU/RAM samples 30 days, player events and totals 730 days,
and errors 100 entries. The first two periods can be changed in Settings.

Backups and Minecraft configuration files (`server.properties`, whitelist,
banlist, etc.) live in the folder you choose; the app does not upload them.

### 3. Data sent anywhere

**By default nothing is sent.** The app ships with no analytics or crash
endpoint.

Data leaves your device only in these cases:

- If `analyticsEndpoint` is configured manually, accepted technical events are
  sent over HTTPS: `app_launch`, `server_created`, `server_started`,
  `server_stopped`, `backup_created`, `backup_restored`, `server_downloaded`
  and `analytics_enabled`, with small values such as startup time, uptime,
  backup size, provider/version or backup filename.
- If `crashEndpoint` is configured manually, crash reports are sent. There is
  no UI in the app to configure it.
- The app contacts GitHub for update checks and Mojang, Paper, Fabric or Forge
  to download servers. Those services may see your IP address, but they do not
  receive your server or player data.

Player names, IPs, passwords and server data are never sent to the
analytics/crash endpoints.

### 4. Basis and purpose

- Local operation (saving servers, settings and statistics) is necessary to
  provide the app.
- Optional telemetry is based on your **consent** and only becomes active if
  you explicitly accept it. Declining deletes locally stored events.
- Crash reports are always stored locally for diagnosis; they are only sent if
  an endpoint is configured.

### 5. Your controls

In **Settings → Privacy & data** you can enable or disable telemetry, clear
usage events and clear stored errors. Deleting a server also deletes its
statistics.

### 6. Changes

This policy may be updated when app features change. The version published in
the repository is the current one.
