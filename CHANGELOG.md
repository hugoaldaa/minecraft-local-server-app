# Changelog

Historial de versiones de **Minecraft Local Server Manager**, reconstruido a partir
de los tags y commits del repositorio. Formato de [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).


## v2.6.0 - Add email settings save button and encrypt SMTP password with safeStorage (2026-11-28)

### Añadido

- Nuevo módulo main/email.js con configuración SMTP, construcción de contenido y envío de correos de notificación/prueba mediante nodemailer.
- Nuevas preferencias globales de correo: activación, host, puerto, SSL/TLS, usuario, contraseña, remitente, destinatario y categorías emailNotifyServer, emailNotifyPlayers, emailNotifyBackups.
- Nueva sección “Notificaciones por correo” en Ajustes con formulario SMTP, toggles por categoría y botón de envío de prueba.
- Nuevo IPC email:test y puente window.api.testEmail() para validar la configuración SMTP desde la UI.
- Caso de smoke test para verificar que shouldEmailNotify respeta las preferencias de correo.
- Botón “Guardar datos” en la sección de notificaciones por correo para guardar explícitamente la configuración SMTP y los toggles de email.
- Cifrado de la contraseña SMTP con safeStorage de Electron al persistir emailPass.
- Migración de arranque para cifrar contraseñas SMTP previamente guardadas en texto plano.

### Corregido

- Se evitó acoplar el envío de correo al historial persistente en español: el email usa el payload localizado generado por el sistema de notificaciones existente.
- Se evita dejar la contraseña SMTP en texto plano cuando Electron safeStorage está disponible.

### Cambios

- main/notifications.js ahora soporta despacho opcional por email además del toast/notificación nativa, reutilizando buildNotification() para el contenido.
- main/index.js amplía PREF_KEYS y la validación de prefs:set para las nuevas opciones de correo.
- preload.js, src/index.html, src/renderer/settings.js y src/i18n.js se actualizaron para exponer, mostrar y traducir la configuración de notificaciones por correo.
- package.json y package-lock.json incluyen la dependencia nodemailer.
- src/renderer/settings.js ahora guarda la configuración de correo mediante una acción explícita y muestra confirmación visual.
- main/stores.js maneja emailPass como secreto cifrado (__safe: v1) con fallback cuando el cifrado no está disponible.
- main/index.js ejecuta migrateEmailPass() tras inicializar la base de datos.
- src/index.html y src/i18n.js incluyen el nuevo botón/textos ES/EN.

### Otros

- Verificación: node --check main/email.js; node --check main/notifications.js; node --check main/index.js; node --check preload.js; node --check src/renderer/settings.js; node --check src/renderer/events.js.
- Verificación: npm.cmd test -- test/smoke.test.js (7 pruebas, 0 fallos).
- Verificación: npm.cmd install --ignore-scripts para actualizar lockfile con nodemailer.
- Nota: la contraseña SMTP queda almacenada en settings/SQLite; considerar safeStorage en una mejora futura.
- Verificación: node --check main/stores.js; node --check main/index.js; node --check src/renderer/settings.js.
- Nota: si safeStorage no está disponible en el entorno, la app usa fallback a texto plano para no impedir el guardado; en entornos normales de Electron debería cifrarse.

## v2.5.3 - Configure per-server maintenance warning minutes (2026-11-27)

### Añadido

- Campo «Minutos de aviso» en la pestaña «Backups» para configurar varios avisos antes del backup o reinicio.
- Acepta minutos separados por comas, por ejemplo 10, 5, 1, con un máximo de 6 avisos y valores entre 1 y 120 minutos.
- Valor por defecto [5, 1] para servidores sin configuración previa o exportaciones antiguas.
- Traducciones en español e inglés para el campo, la pista y el error de validación.
- Pruebas de normalización de minutos y de envío de varios avisos por chat.

### Corregido

- El límite de avisos ya no descarta el aviso más próximo al mantenimiento.
- Los minutos duplicados, fuera de rango o no válidos se ignoran sin romper la programación.

### Cambios

- main/maintenance.js sustituye los avisos fijos de 5 y 1 minuto por una lista configurable de trabajos y conserva elrecordatorio «¡Guardad vuestro progreso!» en el aviso final.
- src/renderer/backups.js carga, valida y guarda maintenanceWarnMinutes junto al resto de ajustes de backup y reinicio.
- src/index.html, src/css/screens.css y src/i18n.js incorporan el nuevo campo en la interfaz.
- Si se introducen más de 6 minutos, se conservan los más cercanos al mantenimiento.

### Otros

- No se amplió la base de datos: settings ya almacena el JSON por servidor y exportAll / importAll ya lo incluyen.
- Linter limpio: npx eslint . sin errores ni advertencias.
- Pruebas pasando: 96 tests correctos con node --test.
- Los cambios siguen pendientes en el árbol de trabajo; no se ha creado el commit.

## v2.5.2 - Add maintenance chat warnings and per-server notification history (2026-11-27)

### Añadido

- Avisos automáticos por chat del servidor de Minecraft 5 minutos y 1 minuto antes del mantenimiento programado, tanto para backup como para reinicio.
- Tabla notificaciones en SQLite con server_id, tipo, mensaje y ts, con índice por servidor y fecha.
- Registro automático de eventos de encendido, apagado, reinicio y backup; cada evento se guarda una sola vez.
- Nueva pestaña «Notificaciones» entre «Backups» y «Ajustes», con historial por servidor, botón de actualizar y botón de limpiar.
- Traducciones completas en español e inglés para la nueva pestaña y sus textos.

### Corregido

- Se eliminaron las entradas duplicadas de apagado, encendido y backup que podían generarse al programar backup y reinicio a la misma hora.
- Los avisos de chat ahora se envían realmente con el comando say del servidor y se reflejan también en la consola de la app.

### Cambios

- main/maintenance.js programa los avisos de chat junto al trabajo de mantenimiento y adapta el mensaje según se vaya a apagar el servidor o solo a crear el backup.
- main/backups.js guarda la notificación de backup en un único punto, incluidos los backups manuales.
- main/servers.js guarda encendido y apagado, y elimina las notificaciones del servidor cuando este se borra.
- main/notificaciones.js expone la lectura, limpieza e inserción de notificaciones mediante IPC.
- main/db.js sube el esquema a la versión 2, mantiene compatibilidad con exportaciones antiguas y evita repetir la migración en cada arranque.
- preload.js, src/index.html, src/renderer/detail.js, src/renderer/servers-ui.js y src/css/screens.css integran la nueva pestaña en la interfaz.

### Otros

- Linter limpio: npx eslint . sin errores ni advertencias.
- Pruebas pasando: 95 tests correctos con node --test.
- Se añadieron pruebas de persistencia, export/import, historial por servidor y avisos de 5 y 1 minuto.

## v2.5.1 - Unify backup and restart scheduling into a single maintenance scheduler v2 (2026-11-27)

### Añadido

- Nuevo programador unificado main/maintenance.js que ejecuta backup automático y reinicio programado en un solo trabajo por servidor con node-schedule, soportando intervalos (1h/6h/12h) y diario.
- Exportación de stopServer y startServer desde main/servers.js.

### Corregido

- Error stopServer is not a function al ejecutar el mantenimiento programado.

### Cambios

- main/backups.js y main/restart.js: se eliminó la programación antigua (se unificó en maintenance.js); backups.js conserva createBackup, restoreBackup, resolveBackupDir e IPC.
- main/index.js usa initMaintenance(), scheduleServerMaintenance() y cancelAllServerMaintenance(); al guardar ajustes y al cambiar la carpeta de backups se reprograma el mantenimiento.
- main/servers.js: ya no cancela el backup al eliminar un servidor (lo hace maintenance desde el evento delete).
- test/smoke.test.js adaptado a la nueva API de mantenimiento.
- scripts/release.mjs: el commit de release empieza ahora con v2.x.x - nombre de la release como primera línea.
- scripts/release.mjs: se eliminó la pregunta interactiva "¿Usar la propuesta de commits como notas? (s/N):" (se usa automáticamente si hay commits pendientes).

### Otros

- Linter limpio y pruebas pasando (91 tests).

## v2.5.0 - Add daily time picker and unified backup+restart scheduling with server-off backup (2026-11-27)

### Añadido

- Selector de hora (<input type="time">) con la etiqueta "A las" para el backup automático y para el reinicio programado; solo se muestra cuando se elige "Una vez al día" en cada uno.
- Ajustes persistentes autoBackupTime y autoRestartTime (HH:MM) por servidor.
- Nuevo programador unificado main/maintenance.js que ejecuta backup y/o reinicio en un solo trabajo por servidor con node-schedule, soportando intervalos (1h/6h/12h) y diario a hora fija.
- Cuando backup y reinicio coinciden a la misma hora: detiene el servidor, hace el backup con el servidor apagado y lo vuelve a encender.

### Corregido

- La falta de espacio entre el texto de "Backup automático" / "Reinicio programado" y sus botones.
- Posibilidad de elegir la hora exacta cuando se selecciona "Una vez al día" en backup y reinicio.
- Prioridad y orden cuando ambas tareas coinciden: el backup se hace primero con el servidor parado, y luego se reinicia (se vuelve a encender).

### Cambios

- Se aumentó el espacio (gap: 16px) entre el texto y los botones/selectores en ambas filas de la pestaña Backups, y se añadieron estilos para el selector de hora y la etiqueta "A las".
- main/backups.js y main/restart.js: se eliminó la programación antigua (se unificó en maintenance.js); backups.js conserva createBackup, restoreBackup, resolveBackupDir e IPC.
- main/index.js usa initMaintenance(), scheduleServerMaintenance() y cancelAllServerMaintenance(); al guardar ajustes y al cambiar la carpeta de backups se reprograma el mantenimiento.
- main/servers.js: ya no cancela el backup al eliminar un servidor (lo hace maintenance desde el evento delete).
- test/smoke.test.js adaptado a la nueva API de mantenimiento.

### Otros

- Se verificó que funcionan ambas opciones (backup y reinicio), incluida la combinada con el servidor apagado → backup → encendido.
- Linter limpio y las 91 pruebas del suite pasan, incluida la de consistencia de claves es/en de las nuevas traducciones.

## v2.4.2 - Fix GitHub release publishing race and release notes path (2026-11-25)

### Añadido

- Añadido el job prepare-release, que crea la release en GitHub antes de que empiecen los builds en paralelo.
- Añadido scripts/upload-release-assets.mjs para subir los ficheros de dist/ con gh release upload --clobber.
- Añadidos los scripts build:win:local y build:linux:ci para compilar sin publicar desde electron-builder.

### Corregido

- Corregida la carrera entre Windows y Linux al crear la misma release, que causaba Unexpected end of JSON input al publicar.
- Corregida la ruta de las notas: release-notes.md → build/release-notes.md. Desaparece el aviso ENOENT y los instaladores vuelven a incluir las notas.
- Corregidos los reintentos cuando la release ya tenía assets parciales: ahora se sobrescriben con --clobber.

### Cambios

- build:ci ya no usa --publish always; la subida la hace gh.
- Los jobs de compilación ya no reciben GH_TOKEN para publicar; solo lo reciben los jobs de subida y notas.
- RELEASE_GUIDE.md documenta el nuevo flujo y releaseInfo.releaseNotesFile.

### Otros

- Verificado en local: lint, 91 tests y build de Windows sin avisos; latest.yml contiene releaseNotes.

## v2.4.1 - Improve backups tab spacing and item layout (2026-11-25)

### Añadido

- Estado :hover en .backup-item (fondo y borde más claros al pasar el mouse).
- Transición suave (background, border-color) en los ítems de backup.
- flex: 1 y min-width: 0 en .backup-info para que los nombres largos se recorten con puntos suspensivos en lugar de desbordarse.

### Corregido

- Ítems de lista de backups muy pegados entre sí y con poco espacio interno.
- Controles de "Backup automático" y "Reinicio programado" demasiado juntos (checkbox, select y botón "Guardar").
- Nombres de archivos de backup largos que se salían del contenedor.

### Cambios

- .backup-item: padding interno 12px 14px → 14px 16px
- .backups-list: padding 14px 20px → 16px 20px y gap entre backups 8px → 12px
- .auto-backup-row: gap entre controles 10px → 14px
- .backup-auto-config: padding inferior 18px → 22px
- .backup-info .bname: fuente 12px → 13px, color de texto y recorte por puntos suspensivos
- .backup-actions: gap entre iconos 8px → 10px
- Ajustes proporcionales en media queries (≤1300px y ≤1100px) para pantallas estrechas.

### Otros

- Solo se modificaron archivos CSS (src/css/screens.css y src/css/responsive.css). No se tocó HTML ni JavaScript.

## v2.4.0 - Add bilingual release notes with free Gemini translation & Improve consent dialog spacing and button layout (2026-11-25)

### Añadido

- Notas de release bilingües en GitHub: cada sección en español se reproduce justo debajo en inglés (Añadido/Added, Corregido/Fixed, Cambios/Changed, Otros/Other) y el aviso de verificación aparece en ambos idiomas.
- Traducción automática de las viñetas con Gemini, en el tier gratuito de Google AI Studio: sin coste mientras el proyecto no tenga facturación vinculada. Si falta GEMINI_API_KEY o la API falla, la release se publica igualmente solo en español y el workflow avisa sin bloquearse.
- Validación de la traducción: se comprueba que el número y el orden de las viñetas se conserven antes de publicar.
- Secreto GEMINI_API_KEY en el workflow y procedimiento de configuración documentado en RELEASE_GUIDE.md.

### Corregido

- El workflow de CI instala el binario de Electron antes de ejecutar los tests en paralelo, evitando el error resources.pak: File exists en GitHub Actions.

### Cambios

- Se sustituye OpenAI por Gemini como proveedor de traducción para que la traducción no tenga coste.
- El cuerpo de la release se genera en build/release-notes-bilingual.md; build/release-notes.md sigue alimentando el banner de actualización de la app en español.
- Ajuste de espaciado y botones del diálogo de consentimiento.

### Otros

- Añadidos 4 tests: formato bilingüe, orden de viñetas, llamada a Gemini simulada y ausencia de clave. npm run lint y npm test (91/91) pasan.
- El banner de actualización de la app continúa en español; la traducción afecta solo al cuerpo de la release de GitHub.

## v2.3.0 - Migrate app data from JSON to SQLite (better-sqlite3 13.2.0) (2026-11-25)

### Añadido

- Migración automática desde los cinco JSON anteriores: se importan en una transacción, se verifica el contenido contra los archivos de origen y solo entonces se eliminan. Se conserva app.db.bak como copia de seguridad en SQLite.
- Exportación e importación global de todos los datos (data:export / data:import), con diálogos de archivo y validación del formato, sin sustituir los formatos CSV/JSON de estadísticas ya existentes.
- Botones para exportar e importar los datos en Ajustes → Privacidad y datos.
- Tests de migración, rollback, exportación e importación de la base de datos, incluido el caso en que la migración falla y debe conservar los JSON.

### Corregido

- logCrash ya no intenta usar la base de datos antes de inicializarla, por lo que no oculta el error real si falla la migración.
- Al eliminar un servidor, saveServerMap() ahora borra también sus filas antiguas; antes INSERT OR REPLACE dejaba registros huérfanos.
- Tema e idioma se migran desde localStorage y la clave antigua se elimina siempre, incluso cuando ya existía la preferencia en la base de datos.
- La importación solo acepta columnas conocidas, evitando que un JSON manipulado pueda construir SQL arbitrario.
- El módulo nativo se recompila para Electron en npm start/npm run dev y para Node en npm test/npm run smoke; antes fallaba por incompatibilidad de ABI.

### Cambios

- Toda la persistencia local pasa de electron-store a SQLite (app.db): servidores, ajustes, estadísticas, analytics y errores. La app ya no escribe datos en JSON salvo exportación explícita del usuario, y electron-store se elimina de las dependencias.
- Las muestras de CPU/RAM y los eventos de jugadores se insertan en lotes y se podan con consultas por rango, en lugar de reescribir un array completo cada 15 segundos.
- better-sqlite3 se actualiza a v13 para soportar la V8 de Electron 45, se desempaqueta del ASAR y se documenta la reconstrucción del nativo.
- PRIVACY.md, README.md, CONTRIBUTING.md y CHANGELOG.md se actualizan para describir app.db, WAL y app.db.bak.

### Otros

- Si no hay prebuild disponible, hace falta un toolchain de C++ (Visual Studio Build Tools en Windows) para compilar better-sqlite3; electron-builder ya hace el rebuild al empaquetar.

## Sin publicar

### Cambios

- Toda la persistencia local pasa de `electron-store` a una base de datos SQLite (`app.db`): servidores, ajustes, estadísticas, analytics y errores. Ya no se escriben datos de la app en JSON; `electron-store` se elimina de las dependencias.
- Las muestras de CPU/RAM y los eventos de jugadores se insertan en transacciones y se podan con consultas por rango, en lugar de reescribir un array completo cada 15 segundos.
- Tema e idioma se guardan en la base de datos; los valores antiguos de `localStorage` se migran una sola vez y se eliminan.
- La configuración de empaquetado desempaqueta `better-sqlite3` del ASAR para asegurar que el módulo nativo funcione en la app instalada. La dependencia se actualiza a v13 para soportar la V8 de Electron 45; `npm start`/`npm run dev` recompilan el módulo para Electron y `npm test`/`npm run smoke` para Node.

### Añadido

- Migración automática desde los cinco JSON anteriores: se importan en una transacción, se verifica el contenido y solo entonces se eliminan. Se conserva `app.db.bak` como copia de seguridad en SQLite.
- Exportación e importación global de todos los datos (`data:export` / `data:import`), sin sustituir los formatos CSV/JSON de estadísticas ya existentes.
- Tests de migración, exportación e importación de la base de datos.

## v2.2.2 - Release fix (2026-11-24)

### Corregido

- Release fix.

## v2.2.1 - Logo background fix (2026-11-24)

### Añadido

- New app icon.

### Corregido

- Old app icon.

### Cambios

- Assets icon for Win & Linux builds.

## v2.2.0 - Upgrade Electron 28 → 45 (2026-11-24)

### Añadido

- Nuevo script npm run build:linux:local para generar AppImage/.deb sin publicar en GitHub (build:linux sigue publicando).
- Entrada de changelog para esta actualización.

### Corregido

- Resueltos los avisos de severidad alta de systeminformation y brace-expansion.
- Eliminado el error de validación de configuración al empaquetar con electron-builder 26.

### Cambios

- Actualización de runtime: Electron 28.3.3 → 45.4.1, electron-builder 24.13.3 → 26.18.1 y electron-updater → 6.8.11.
- Seguridad: systeminformation actualizado a 5.33.26 y brace-expansion fijado a 5.1.0 mediante overrides.
- Build/Linux: la configuración antigua linux.desktop no es válida en electron-builder 26; se sustituye por desktopName + linux.syncDesktopName para mantener la asociación de la ventana con el archivo .desktop.
- CI: Node 20 → 22 en los workflows de lint y release.
- Documentación: se actualizan los requisitos de desarrollo en README.md.

### Otros

- No hay migración de datos ni borrado: los JSON de %APPDATA%\minecraft-local-server-app (servers.json, settings.json, serverStats.json, analytics.json, crashes.json) se leen igual.
- Único cambio para desarrolladores: hace falta Node 22+.
- Quedan 6 avisos moderados en la cadena de dependencias de desarrollo de electron-builder; corregirlos exige bajar a electron-builder 25.1.0, así que se dejaron.

## Sin publicar

### Cambios

- Actualizado Electron de 28.3.3 a 45.4.1, electron-builder de 24.13.3 a 26.18.1 y electron-updater a 6.8.11. La configuración Linux usa `desktopName`/`syncDesktopName` en lugar del antiguo bloque `desktop`, y CI pasa a Node 22.
- Actualizado `systeminformation` a 5.33.26 y fijada `brace-expansion` 5.1.0 mediante `overrides` para resolver avisos de seguridad.
- Añadido `npm run build:linux:local` para builds Linux sin publicación (el script `build:linux` publica en GitHub).

### Otros

- No se borra ni se migra ningún dato del usuario: los JSON de `userData` se leen igual con la nueva versión.

## v2.1.0 - Privacy Features (2026-11-24)

### Añadido

- Selector “Período de jugadores” en Estadísticas → Jugadores (por defecto Todo), independiente del período del gráfico.
- El selector superior ahora se identifica como “Período del gráfico” y solo afecta a Jugadores por día y a su lista de conexiones diarias.
- Política de privacidad en PRIVACY.md, en español e inglés.

### Corregido

- La gráfica de jugadores por día ya no se corta: se eliminó el <svg> anidado y ahora se dibuja directamente en el contenedor con overflow-x, por lo que aparece la barra horizontal.
- El período superior ya no filtra las tarjetas de resumen (horas encendido, picos CPU/RAM) ni los momentos con más jugadores.
- README de privacidad actualizado: faltaban los eventos backup_restored y server_downloaded, y no se avisaba de que los stack traces pueden incluir rutas locales.

### Cambios

- El nuevo período de jugadores afecta solo a tiempo jugado y días activos; Última vez visto sigue siendo absoluto.
- El encabezado de Ajustes admite 여러 líneas para acomodar los nuevos controles.
- La exportación refleja lo que se ve en pantalla: gráfica con su período, jugadores con el suyo y el resto sin filtrar.

### Otros

- No se borra ningún archivo ni dato del usuario.
- Se quitó el <svg> estático que había dentro de .stats-chart-body.
- Se eliminó el comportamiento anterior de un único período global que afectaba a toda la pestaña de estadísticas.

## v2.0.0 - Major release v2.0.0 (2026-11-24)

### Añadido

- ## v2.0.0 - Estabilidad y control total
- ### Añadido
- Selección automática de Java 8/17/21 según la versión de Minecraft del servidor (la versión queda guardada al instalar).
- `SHA256SUMS` publicado en cada release y enlazado desde la web para verificar la descarga.
- ### Corregido
- Aviso antes de arrancar si el puerto del servidor ya está ocupado.
- Los fallos que no se arreglan solos (Java incompatible, EULA sin aceptar, puerto ocupado) ya no se reintentan.
- El temporizador de 10 s para forzar la parada se cancela cuando el proceso sale.- Los botones de descarga de la web apuntaban a nombres de archivo con espacios que no existían.
- ### Cambios
- Versión mayor por el alcance del trabajo: no rompe servidores, ajustes ni backups existentes.
- El renderer se ha dividido en 19 módulos y se han añadido smoke tests del proceso principal (sin cambios visibles).
- Las notas de release mantienen sus secciones desde el tag hasta GitHub y se muestran con markdown seguro dentro de la app.
- CHANGELOG histórico normalizado: cabeceras uniformes y viñetas `- -` corregidas.
- Web de descarga actualizada con las funciones nuevas y compatibilidad corregida (Vanilla, Paper, Fabric y Forge).
- ### Otros
- Licencia MIT añadida al proyecto.
- La firma de Windows con SignPath sigue en trámites; mientras tanto, verifica el instalador con `SHA256SUMS`.

## v1.9.7 - Statistics patch v3 (2026-11-10)

- Statistics patch v3

## v1.9.6 - Statistics patch v2 (2026-11-10)

- Statistics patch v2.

## v1.9.5 - Statistics patch (2026-11-09)

- 1. Columnas siempre rellenas (renderer)
- Antes, si un jugador no tenía tiempo acumulado, las celdas se veían vacías. Ahora renderStatsPlayers siempre muestra:
- Tiempo jugado: 0 min en vez de vacío.
- Días activos: 0 en vez de vacío.
- Última vez visto: fecha/hora si hay eventos, o — si no.
- 2. Nueva columna "Última vez visto" (main + renderer)
- getPlayerList ahora calcula el último evento (join/leave) de cada jugador y lo devuelve como lastSeen. La tabla lo muestra como fecha legible. Así, aunque el tiempo jugado sea 0, se ve cuándo entró por última vez.
- 3. Filtro rápido por período (HTML + renderer)
- Se añadió un selector en la pestaña Estadísticas: Todo / Últimos 7 días / Últimos 30 días. Al elegir uno, se vuelve a cargar filtrando por ese rango. El filtro se envía al IPC estadisticas:jugadores (ya soportado).
- 4. Auto-refresco mientras el servidor está activo (renderer)
- Las estadísticas ahora se recargan solas cada 10 segundos si:
- Estás en la pestaña Estadísticas, y
- El servidor está en marcha.
- Así no hace falta pulsar "Actualizar" para ver los datos mientras juegan. Se detiene al cambiar de pestaña.
- 5. Exportación completa
- CSV y JSON ahora incluyen la columna de última vez visto.

## v1.9.4 - White-list patch (2026-10-18)

- White-list patch

## v1.9.3 - Linux patch (2026-10-18)

- Linux patch.

## v1.9.2 - Nuevo icono Linux (2026-10-17)

- Nuevo icono Linux

## v1.9.1 - Jar patch (2026-10-17)

- Ahora ya puedes seleccionar bien el jar a la hora de añadir un servidor.

## v1.9.0 - Statistics panel (2026-10-17)

- **Estadísticas por servidor completas** (Fases 1–4): historial persistente de muestras CPU/RAM, eventos de jugadores del log (`joined`/`left`) con retención configurable, horas encendido, picos de CPU/RAM, jugadores por día (conexiones incluidas), momentos con más jugadores, tiempo jugado por jugador, y una pestaña «Estadísticas» en el detalle del servidor.
- **Exportación de estadísticas**: a CSV o JSON, elegible en la pestaña «Estadísticas» (`estadisticas:export` devuelve ambos formatos).
- **Filtros por rango** en las consultas de estadísticas (`desde`/`hasta` opcionales en `estadisticas:resumen` y `estadisticas:jugadores`); la interfaz todavía no los usa.
- **Retención configurable** en Ajustes: `retentionSamples` (muestras, 30 días por defecto, máximo 365) y `retentionEvents` (eventos y totales, 730 días por defecto, máximo 3650).
- **Pico destacado y conexiones por día** en la pestaña «Estadísticas»: tarjeta con el máximo de jugadores concurrentes y listado de conexiones por día debajo de la gráfica de jugadores.

## v1.8.1 - Debug creating servers (2026-10-13)

- Now it works when you download and install a server version.

## v1.8.0 - New server/jar implementations (2026-10-12)

- `webContents.send` sobre ventana destruida | `sendToRenderer()` en `main/state.js` (guarda `isDestroyed` en ventana y webContents); usado en servers/crash/updater/window/stats.
- Escritura a stdin de un proceso muerto | `writeStdin()` en `main/state.js` (guarda `writable`/`destroyed`/`writableEnded`) + handler `stdin.on('error')`.
- Argumentos JVM con comillas partidos mal | `splitArgs()` en `main/validate.js` (respeta comillas simples/dobles).
- Backups sin flush de mundo | `quiesce()`/`resume()` en `main/backups.js` (`save-off` + `save-all flush` + `save-on`).
- Servidores iniciados fuera de la app indistinguibles | Detección por PID (`isJarRunning`) expuesta en tarjetas/barra + banner `#servers-banner` y `status.external*`.
- Sin suite de tests | `test/*.test.js` con `node:test` (29 pruebas: validate, properties, servers, i18n, versions, http) y script `npm test`.
- CI solo lint | `.github/workflows/lint.yml` ejecuta `npm test` tras ESLint.
- Sin instalador de servidores | `main/downloader.js`: descarga **Vanilla** (manifest de Mojang) y **Paper** (API v3 `fill.papermc.io`, verificado con SHA-256).
- Riesgo de Java incompatible | `minJavaFor()` (`main/versions.js`) + aviso en vivo del wizard vía `javaCheck`.
- Descargas sin cancelar | `downloads:cancel` con `AbortController`; progreso por evento `downloads:progress`.
- Sin proveedor Fabric | `server/jar` de `meta.fabricmc.net` (loader/installer estables más recientes); nuevo `parseFabricGameVersions()`.
- Sin proveedor Forge | `promotions_slim.json` + instalador Maven `--installServer`; arranque args-based (`@user_jvm_args.txt` + `win_args.txt`/`unix_args.txt`), con `parseForgePromotions()`/`forgeArgsRelPath()`.
- Modal sin semántica ni teclado | `role="dialog"`/`aria-modal`/`aria-labelledby`, `aria-label` traducible (`data-i18n-aria`), `aria-selected` en pestañas, Escape para cerrar y foco al abrir.
- `downloader.js` mezclaba red y lógica | Capa HTTP extraída a `main/http.js` (redirecciones, `fetchText`/`fetchJson`, `sha256File`, `downloadToFile`) con test propio.
- Versiones en `undefined` al elegir (Paper) | `parsePaperProjects` devolvía strings y el renderer leía `v.id`; `normalizeVersions()` unifica el contrato `{id}` en el IPC + renderer defensivo y etiqueta de Forge (`1.20.1 (Forge 47.4.10)`).
- Modal de servidor con estilos incoherentes | `#ms-pick-dir` recibe estilo de botón, selects a ancho completo con foco, `.btn-primary` ya no lo pisa `.modal-actions button`, modal con scroll (`max-height:90vh`) y ancho adaptativo; botón de instalar deshabilitado hasta elegir versión; corrección de la caché de versiones al cambiar de proveedor (`shownProvider`).

## Unreleased

- **Instalador de servidores integrado** en «Añadir servidor» (pestaña *Descargar servidor*): Vanilla (manifest de Mojang), Paper (API v3 `fill.papermc.io`, verificado con SHA-256), Fabric (`server/jar` de `meta.fabricmc.net`) y Forge (`promotions_slim.json` + instalador Maven `--installServer`, 1.17–1.20.1). Progreso y cancelación vía `downloads:progress`/`downloads:cancel`.
- **Robustez**: `sendToRenderer()`/`writeStdin()` protegen el envío al renderer y la escritura al stdin de procesos muertos; `splitArgs()` respeta comillas; los backups hacen `save-all flush` antes de comprimir.
- **Tests y CI**: suite con `node:test` (`test/*.test.js`, `npm test`) y paso de tests en el workflow de lint.
- **Accesibilidad del modal**: `role="dialog"`, `aria-modal`, `aria-label` traducible, `aria-selected` en pestañas, cierre con Escape y gestión de foco.
- **Arquitectura**: capa HTTP extraída a `main/http.js`; helpers de versiones en `main/versions.js`.
- **Correcciones del modal «Añadir servidor»**: Paper mostraba las versiones como `undefined` (contrato `{id}` unificado con `normalizeVersions`), la lista no se refrescaba al cambiar de variante ya cacheada, y se unificó el estilo (botón de carpeta, selects a ancho completo, botón primario correcto, modal con scroll y ancho adaptativo).
- **Estadísticas por servidor completas** (Fases 1–4): historial persistente de muestras CPU/RAM, eventos de jugadores del log (`joined`/`left`) con retención configurable, horas encendido, picos de CPU/RAM, jugadores por día (conexiones incluidas), momentos con más jugadores, tiempo jugado por jugador, y una pestaña «Estadísticas» en el detalle del servidor.
- **Exportación de estadísticas**: a CSV o JSON, elegible en la pestaña «Estadísticas» (`estadisticas:export` devuelve ambos formatos).
- **Filtros por rango** en las consultas de estadísticas (`desde`/`hasta` opcionales en `estadisticas:resumen` y `estadisticas:jugadores`); la interfaz todavía no los usa.
- **Retención configurable** en Ajustes: `retentionSamples` (muestras, 30 días por defecto, máximo 365) y `retentionEvents` (eventos y totales, 730 días por defecto, máximo 3650).
- **Pico destacado y conexiones por día** en la pestaña «Estadísticas»: tarjeta con el máximo de jugadores concurrentes y listado de conexiones por día debajo de la gráfica de jugadores.

## v1.7.1 - Toogle styles (2026-10-09)

- New toogle styles.

## v1.7.0 - New implementations (2026-10-07)

- Fila «Próximamente» de carpeta de servidores, cerrar en bandeja, inicio con el sistema e idioma en un solo sitio | **General**: idioma en su propia fila (segmented ES/EN persistido y usado por el menú de bandeja); `defaultServerDir` como `defaultPath` del diálogo de selección del .jar; `closeToTray` (✕ siempre esconde a la bandeja, se sale desde «Salir») y `startOnBoot` (solo registra app empaquetada) con validación bool estricta; `main/tray.js` nuevo (icono, menú Abrir/Salir, clic restaura, `syncTray`/`updateTrayLang`); `window:close` → `win.hide()` (`main/window.js`, `main/index.js`).
- Fila «Próximamente» de escala de interfaz | **Apariencia**: segmented 100/125/150 % (`uiScale`, `webContents.setZoomFactor` al guardar y en `did-finish-load`), 0 px de overflow a 150 % en ventana mínima.
- Filas «Próximamente» de retención y compresión de copias | **Copias de seguridad**: segmented Sin límite/5/10/20/50 (`backupKeep`) y Rápida/Normal/Máxima (`backupLevel` 1/6/9); `pruneOldBackups` borra solo `^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$` del directorio global al terminar cada copia; nivel aplicado en `archiver('zip', {zlib:{level}})` (`main/backups.js`).
- Filas «Próximamente» de RAM/Java/JVM/EULA por defecto | **Servidores**: `defaultRam` (512-65536), `defaultJava`, `defaultJvmArgs` (≤512 chars) y `autoEula`; `openServerModal` precarga las prefs; `servers:create` usa los fallbacks si el modal no envía valor; `startServer` escribe `eula.txt` directo con `autoEula` (`main/servers.js`, `src/renderer.js`).
- Fila «Próximamente» de borrar eventos + recuentos de analytics como datos sensibles | **Privacidad y datos**: se eliminan los recuentos y el bloque `.set-row-data`; botón **Borrar eventos de uso** (IPC `analytics:clearEvents` → `analyticsStore.delete('events')`, conserva `analyticsEnabled`).
- «Acerca de» con datos de analytics y errores mezclados | **Información**: «Acerca de» → «Información» (es/en); la sección muestra solo Versión, Java y Plataforma (sin Analytics, eventos registrados, ID de instalación ni primer uso); retirados `getAnalyticsStats`/`getAnalyticsEvents` (main + preload + renderer) y las claves i18n huérfanas.

## v1.6.6 - Language fixed (2026-10-07)

- Language moved into general settings.

## v1.6.5 - Analytics styles fixed (2026-10-07)

- .set-row-data → flex-direction: column con gap: 12px: el bloque de analytics queda debajo del título «Analytics anónimos», no a la derecha pegado.
- .set-row-text dentro de esa fila → flex: 0 0 auto (si no, la flex-basis: 240px le daba 240 px de alto en columna y la fila medía 388 px; ahora 185).
- .set-row-counts → width: 100%; max-width: 100%; margin-left: 0, y la caja .diag-rows a todo el ancho del contenedor (1012 px = 1044 − 2×16 de padding de fila), sin desbordes (huecos de 16/14 px iguales al del resto de filas).
- Los eventos pasan a rejilla auto-fill minmax(230px, 1fr) → 3 columnas de 308 px en vez de filas de 974 px con la cifra pegada al borde derecho; con scroll a 200 px.

## v1.6.4 - Styles fixed (2026-10-07)

- Margenes de tanto el botón de descargar actualización como instalarla ajustados.

## v1.6.3 - Navigation fixed (2026-10-07)

- Pestaña de Actualizaciones. Verificación: ESLint 0 errores, `npm run build` (instalador NSIS), paridad i18n (0 claves usadas sin definir, 0 `upd.*` sin usar, es/en idénticos) y smoke por CDP: sin banner, badge ⬇ con punto de 7 px y animación `update-pulse`, estados simulados (available → downloading 42% → ready → latest) con botones/progreso/notas correctos, clic en el badge abre Ajustes → Actualizaciones, sin `<missing:>` ni excepciones; métricas en oscuro y claro sin desbordamiento y con los tokens de color correctos.

## v1.6.2 - Updates fixed (2026-10-07)

- Aviso de actualización en un banner que tapa la pantalla | Icono **⬇** en la titlebar pegado a ⚙ (`#btn-update-notify`) con punto verde pulsante (`.update-btn::after` + `@keyframes update-pulse`, respetando `prefers-reduced-motion`), sin tooltip, visible solo cuando hay versión nueva; el clic abre Ajustes → Actualizaciones; se eliminan `#update-banner` y sus estilos (`src/index.html`, `src/css/screens.css`).
- Sin pestaña de actualizaciones ni dónde ver los detalles | 7.ª sección del raíl **Actualizaciones**: «Versión instalada», «Última comprobación», «Buscar actualizaciones» (movido de Acerca de), fila de Estado con color por fase y tarjeta «Nueva versión» con píldora, barra de progreso, botones y notas (`data-set-panel="updates"`, `renderUpdateState`, `setSettingsSection`).
- Descarga automática sin que el usuario decida | `autoDownload=false`/`autoInstallOnAppQuit=false`: avisar con las notas → botón **Descargar** (nuevo IPC `update:download` + `preload.downloadUpdate`) → progreso → **Instalar y reiniciar**; «Estás en la última versión» cuando no hay novedad; errores solo si había comprobación o descarga en marcha y timeout de 20 s en la comprobación manual (`main/updater.js`, `src/renderer.js`).
- Comprobación opaca y notas de versión en un solo formato | `update:check` devuelve `dev` en desarrollo, listener `update-not-available` → estado `latest`, estado de la app instalada; notas admiten string y `[{version, note}]` de electron-updater; i18n es/en con 24 claves `upd.*` + `settings.updates` y retiro de las claves del banner (`src/i18n.js`).

## v1.6.1 - Re-styling Config (2026-10-07)

- Ajustes como 4 tarjetas sueltas en una rejilla de 2 columnas | Raíl lateral con 6 secciones (General, Apariencia, Copias de seguridad, Servidores, Privacidad y datos, Acerca de) + panel derecho con filas `label` + pista + control (`.settings-layout`, `.set-nav`, `.set-panel`); un solo panel visible por vez (`data-set-section`/`data-set-panel`) (`src/index.html`, `src/renderer.js:initSettings`).
- Control segmentado del tema/idioma a ancho de columna | Compacto al ancho de su contenido y alineado a la derecha de la fila (`.seg-options { width: fit-content }`, `.set-row-control`); carpeta de backups en su propia fila con input + 📁 (`src/css/components.css`, `src/css/screens.css`).
- Sin mapa de ajustes futuros ni sitio para ellos | Filas atenuadas con píldora «Próximamente» (carpeta de servidores, cerrar en bandeja, inicio con el sistema, escala de interfaz, retención/compresión de copias, RAM/Java/JVM/EULA por defecto, borrar eventos); filas reales nuevas: **Buscar actualizaciones** (`update:check`) y **Limpiar errores** movido de la cabecera a Acerca de; recuento de eventos y toggle de analytics en Privacidad.
- Ajustes sin comportamiento responsive propio | ≤1300px: raíl más estrecho y paneles con menos padding; ≤1100px: el raíl pasa a barra horizontal con scroll, filas apiladas e input de carpeta a ancho completo (reglas `.diag-grid` muertas sustituidas en `src/css/responsive.css`).

## v1.6.0 - Config Implementation (2026-10-07)

- Perfiles locales para una sola cuenta (pantalla de selección + `main/auth.js`) | Eliminados: `#screen-profiles`, `main/auth.js` y los canales `users:*`/`auth:*`; arranque directo a consentimiento o servidores; `servers:list`/`servers:create` dejan de recibir `userId`; evento `profile_created` retirado (cierra también el ítem 38, `deleteUser` en cascada, ya sin sujeto).
- Diagnóstico como pantalla aparte con su botón | Integrado como sección de **Ajustes** (información de la app, toggle de analytics, últimos errores + "Limpiar errores"); se retiran `#screen-diagnostics` y `#btn-diagnostics` (`src/index.html`, `src/renderer.js:initSettings`).
- Sin pantalla de Ajustes (no había dónde cambiar preferencias) | Nueva pantalla `#screen-settings` con tarjetas General/Información/Analytics/Errores, accesible desde ⚙ en la titlebar (`initTitlebar` → `showScreen('settings')`, `loadSettings()` al entrar).
- Carpeta de backups distinta por servidor (`server_<id>.autoBackupDir`) | Clave global `backupDir` en `settingsStore` vía IPC `prefs:get`/`prefs:set` con allowlist `['backupDir','theme']`; migración en el arranque (`migrateGlobalBackupDir` adopta la primera `autoBackupDir` y la retira); `resolveBackupDir` = `autoBackupDir` → global → `<jar>/backups` y canal `backup:dir`; la pestaña Copias solo la muestra en solo lectura y al cambiar la global se reprograman los auto-backups (`main/index.js`, `main/backups.js`, `main/validate.js:getBackupDirs`).
- Tema fijo oscuro | Tema claro/oscuro con `:root[data-theme='light']` (paleta pergamino/hierba de la web) + `color-scheme` en `tokens.css`; persistido en `localStorage['app-theme']` y reflejado en el fondo de la ventana (`THEME_BG`/`applyWindowTheme`) al guardar la preferencia (`src/renderer.js:setTheme`, `main/window.js`).
- Selector ES/EN en la titlebar; CSS/i18n/docs huérfanos | Selector movido a Ajustes (segmented control `#lang-options`/`#theme-options`); borrados estilos de perfiles/auth (`profiles-*`, `profile-card`, `auth-tabs`, `avatar-picker`, `user-chip`, `btn-logout`, `#btn-backup-dir`, `#auth-version-label`) y claves muertas (`profiles.*`, `nav.profiles`, `nav.diagnostics`, `servers.titleOf`, `run.*Profile`); `users.json` sobrante eliminado de `%APPDATA%`; README/CONTRIBUTING/CHANGELOG actualizados.

## Sin publicar (2026-10-07)

- Aviso de actualización como banner de pantalla | el banner `#update-banner` se elimina y el aviso pasa a la titlebar: icono **⬇** pegado a ⚙ (`#btn-update-notify`) con punto verde pulsante (`.update-btn::after` + `@keyframes update-pulse`), visible solo cuando hay versión nueva y sin tooltip; el clic abre Ajustes → Actualizaciones (`src/index.html`, `src/renderer.js:initUpdates`).
- Sin sitio donde ver los detalles de la actualización | nueva sección **Actualizaciones** en el raíl de Ajustes (7.ª entrada): versión instalada, última comprobación, "Buscar actualizaciones", fila de Estado con color por fase (sin comprobar/comprobando/última versión/disponible/descargando/lista/error/solo app instalada) y tarjeta «Nueva versión» con versión, píldora, progreso y notas (`data-set-panel="updates"`, `renderUpdateState`).
- Descarga automática sin control del usuario | `autoDownload=false`: al detectar la versión nueva solo se avisa con sus notas → botón **Descargar** (IPC `update:download`) → barra de progreso → **Instalar y reiniciar**; si no hay nada nuevo, "Estás en la última versión" (`main/updater.js`, `src/renderer.js`).
- Comprobaciones opacas (dev / sin novedad / error) | `update:check` devuelve `status:'dev'` en desarrollo, el nuevo listener `update-not-available` envía `latest`, los errores solo se notifican si había una comprobación o descarga en curso, y la comprobación manual tiene timeout de 20 s; las notas admiten string y `[{version, note}]`; i18n es/en con 24 claves `upd.*` nuevas (+ `settings.updates`) y las claves del banner retiradas (`main/updater.js`, `src/i18n.js`).

## Sin publicar (2026-10-07) — Ajustes completos

- **General**: idioma movido a su fila (segmented ES/EN persistido y usado por el menú de bandeja); carpetas de servidores por defecto (`defaultServerDir`, `defaultPath` del diálogo de selección del .jar); cerrar en bandeja (`closeToTray`: ✕ siempre esconde a la bandeja en vez de salir, sin avisos, se sale desde «Salir» del menú); inicio con el sistema (`startOnBoot`, solo registra cuando la app está empaquetada). `main/tray.js` nuevo (icono, menú Abrir/Salir, clic restaura la ventana, `syncTray`/`updateTrayLang`); `window:close` → `win.hide()` (`main/window.js`, `src/index.html`, `src/renderer.js`).
- **Apariencia**: escala de interfaz 100/125/150 % (`uiScale`, `webContents.setZoomFactor` aplicado al guardar y en `did-finish-load`) con segmented `#uiscale-options`.
- **Copias de seguridad**: retención «Sin límite»/5/10/20/50 y compresión Rápida/Normal/Máxima (`backupKeep`/`backupLevel`); `pruneOldBackups` borra solo los `backup-*.zip` globales al terminar cada copia y el nivel va a `archiver('zip', {zlib:{level}})` (`main/backups.js`).
- **Servidores**: RAM por defecto (256-65536 MB) y Java/JVM/EULA por defecto (precargados en el modal de servidor; `servers:create` usa los fallbacks si el modal no envía valor); `autoEula` escribe `eula.txt` directo al arrancar (`main/servers.js`, `main/validate.js`).
- **Privacidad y datos**: se eliminan los recuentos analíticos y el bloque `.set-row-data`; botón **Borrar eventos de uso** (IPC `analytics:clearEvents` → `analyticsStore.delete('events')`, conserva el consentimiento).
- **Información**: «Acerca de» → «Información» (es/en); la sección muestra solo Versión, Java y Plataforma (sin Analytics, eventos registrados, ID de instalación ni primer uso); retirados los IPC/API `getAnalyticsStats`/`getAnalyticsEvents` y las claves i18n huérfanas.

## v1.5.3 - Logo Fixed (2026-10-07)

- New logo fixed.

## v1.5.2 - Logo Fix (2026-10-07)

- Logo fixed.

## v1.5.1 - Nuevo Icono (2026-10-06)

- Nuevo icono para la aplicación.

## v1.5.0 - Mejoras de Errores y Sintáxis (2026-10-06)

- `server.properties` pierde comentarios y orden al guardar | `writeProperties` fusiona con el archivo original: preserva comentarios/orden/claves desconocidas y solo sustituye valores o añade nuevas (`main/properties.js`).
- Doble escritura whitelist/banlist + `uuid: ''` inválidos | `listWrite()`: vía única por estado — servidor en marcha → solo comando de consola (vanilla resuelve UUID y persiste); detenido → solo archivo, con el UUID offline (mismo algoritmo `OfflinePlayer:`) completado por el main (`main/properties.js`, `src/renderer.js:878`).
- Borrado de listas por índice | `removeFromList` identifica por `data-name`/`data-uuid` (identidad de la entrada, nunca índice de render).
- Analytics consentidos por defecto | `analyticsEnabled` default `false`; `app_launch` solo tras consentir; `setConsent(false)` purga los eventos locales (`main/analytics.js`).
- `setInterval` del updater sin limpiar | `stopUpdater()` invocado en `will-quit` (`main/updater.js`).
- Hex hardcodeados fuera de `:root` | 0 hex fuera de tokens; nuevos `--text-inverse`, `--danger-deep`, `--shadow-hover` (`src/css/tokens.css`).
- Cero media queries | Breakpoints 1300px/1100px con modo compacto (`src/css/responsive.css`).
- CSS monolítico de 2.000+ líneas | Dividido en 6 módulos: `tokens/base/layout/components/screens/responsive`; concatenación verifiicada byte-idéntica al original.
- Sin estados hover/focus ni `prefers-reduced-motion` | `:focus-visible` en todos los controles + animaciones reducidas/desactivadas con `prefers-reduced-motion`.
- Sombras/offsets inlineados | Extraídos a tokens reutilizables (`--shadow`, offsets de bloque).
- Landing con Google Fonts CDN y colores propios | `@font-face` local con las mismas fuentes (Silkscreen, IBM Plex Sans/Mono) desde `assets/fonts/`; sin CDN, variables compartidas.
- UI con template strings + `innerHTML` (18 sitios) | 0 `innerHTML` en `src/`; constructor DOM `h()`/`fill()`/`textContent`; `esc()` ya no es necesario.
- Falta `eula.txt` en el primer arranque | `startServer` detecta y devuelve `{ok:false, code:'eula'}`; el renderer confirma al usuario y reintenta con `acceptEula:true` que crea el archivo (`main/servers.js`, `src/renderer.js:679`).
- Sin validación de Java 17+ | `detectJavaVersion` (spawn `java -version`, parsea `version "x.y"`, cache solo resultados válidos); arranque bloqueado si no detecta o <17; canal `java:check`; fila "Java" en Diagnóstico.
- Estadísticas del sistema, no del servidor | `main/stats.js` reescrito: CPU/RAM por proceso (suma de `cpu`/`memRss` de los PIDs activos de servidores) con `scope: 'server'\|'system'`.
- i18n inconsistente | `src/i18n.js` (diccionario es/en de 194 claves con paridad verificada), `T()` en el renderer (107 usos), `data-i18n*` en el HTML (92), selector ES/EN en la titlebar, idioma por navegador/localStorage.
- Borrar perfil deja huérfanos | `deleteUser` en cascada: cancela auto-backups, borra `server_<id>`, elimina backups del directorio por defecto (nunca dirs custom) (`main/auth.js`).`getStatusAll` costoso con varios servidores | `Promise.all` + caché de 3 s; `detectExternalServers` eliminado (`main/servers.js`).
- Build con sintaxis Windows | `cross-env@^7` + `CSC_IDENTITY_AUTO_DISCOVERY=false` por script; portable POSIX/Windows (`package.json`).
- README sin dev/privacidad | Secciones Development, Architecture y Privacy añadidas.
- Higiene de git inconsistente | `.gitignore` coherente (`node_modules/`, `dist/`, `build/`, logs); auto-ignores retirados.
- `installer.nsh` muerto y destructivo | Eliminado: su `customUnInstall` borraba `%APPDATA%\minecraft-local-server-app`.
- Docs con "Sin descripción" y sin `CONTRIBUTING.md` | CHANGELOG reconstruido desde los 34 tags de git, `RELEASE_GUIDE.md` completado, `CONTRIBUTING.md` creado.

## v1.4.0 - Mejoras de Seguridad y Funcionamiento (2026-10-06)

- Auditoría de la aplicación con el listado de mejoras (`MEJORAS.md`).
- ESLint 9 con configuración plana (`eslint.config.js`), Prettier (`.prettierrc`)
- Backups automáticos de verdad: `scheduleAutoBackup`/`initAutoBackups` en
- Validación de IPC en `main/validate.js`: allow-lists de directorios de
- Guardas de navegación: `setWindowOpenHandler` deniega ventanas nuevas y
- Recorte del búfer de consola (`MAX_LINES`) para que no crezca sin límite en
- `onUpdateAvailable`/`onUpdateDownloaded` no existían y provocaban un
- La app seguía viva después de cerrar la ventana con servidores en marcha
- La consola ignoraba las respuestas `{ ok: false }` de los IPC al usar
- La lista de jugadores era global y se mezclaba entre servidores
- XSS por `innerHTML` sin escapar: `esc()`/`safeColor()` en todas las
- CSP con `'unsafe-inline'`: ahora `default-src 'self'` sin scripts ni estilos
- Endpoint de analytics sin validar ni timeout: ahora solo `https:`, timeout de
- `servers:update` extendía ciegamente los datos que manda el renderer
- Handlers de sistema de archivos sin `try/catch` en el proceso principal: ya
- Código roto o muerto eliminado: `auth:login` (bcrypt), `server:takeover`
- `main.js` (572 líneas, 44 canales IPC) dividido en `main/index.js` + 12
- `src/renderer.js` reescrito con delegación de eventos por contenedor
- Mostrar/ocultar elementos pasa de asignaciones `.style.*` a la clase
- Icono de la página web (`web/`).

## v1.3.1 - Nuevo Icono y Estilos (2026-10-05)

- Nuevo icono de la aplicación (`assets/icon.ico` y `assets/icon.png`).
- Ajustes puntuales de estilos de la interfaz y de la página web.

## v1.3.0 - Fresh Styles (2026-10-05)

- Página web informativa en `web/index.html` con su configuración de despliegue
- Rediseño completo de los estilos de la app (`src/styles.css`), alineado con
- README actualizado tras el nuevo diseño.

## v1.2.0 - Descarga en Linux (2026-10-05)

- Builds de Linux: AppImage y paquete `.deb`, con icono PNG y targets en el
- Sección de Linux en el README (AppImage y `apt install` del `.deb`).
- El auto-update solo se activa cuando la app corre como AppImage
- Detección del proceso del servidor con PowerShell/CIM en Windows y `pgrep` en
- Icono de la ventana según plataforma (`icon.ico` en Windows, `icon.png` en el

## v1.1.15 - Changelog + Fix Release (2026-10-05)

- `scripts/release.mjs`, el flujo de release interactivo (`npm run release` y
- Notas de la release dentro del banner de actualización: la lista de cambios
- El workflow de release prepara el nombre y las notas desde el tag
- `releaseInfo.releaseNotesFile` en `package.json`: `release-notes.md` viaja en

## v1.1.14 (2026-04-25)

- Título de la ventana restaurado a "Minecraft Local Server Manager" (se había

## v1.1.13 (2026-04-25)

- Solo actualización de versión en `package.json`/`package-lock.json`; sin

## v1.1.12 (2026-04-25)

- Alineación del campo `version` de `package.json` (1.1.9 → 1.1.11) tras los

## v1.1.11 (2026-04-25)

- Solo actualización de versión. Este tag está en una rama paralela que nunca

## v1.1.10 (2026-04-25)

- Solo actualización de versión. Este tag está en una rama paralela que nunca

## v1.1.9 (2026-04-25)

- Revert del experimento de detección de servidores en ejecución introducido

## v1.1.8 (2026-04-25)

- Detección de servidores que ya estaban en ejecución fuera de la app (PID por

## v1.1.7 (2026-04-24)

- Detección de procesos Java externos que ejecutan el JAR de un servidor

## v1.1.6 (2026-04-23)

- Cambio puntual del título de la ventana (texto de prueba, revertido en

## v1.1.5 (2026-04-22)

- Ajuste de los parámetros de `quitAndInstall` al instalar una actualización

## v1.1.4 (2026-04-22)

- Instalación de actualizaciones: se pasó de `app.quit()` a

## v1.1.3 (2026-04-21)

- Sincronización del estado de ventana maximizada con la UI (evento

## v1.1.2 (2026-04-20)

- El build de CI pasa de portable a instalador NSIS x64 y `publish.releaseType`
- Artefactos con la versión en el nombre (`${productName}-${version}.${ext}`).
- Opciones NSIS: instalación sin privilegios elevados, carpeta elegible por el

## v1.1.1 (2026-04-20)

- El binario de CI vuelve a ser portable: se retira la configuración NSIS y
- La instalación de actualizaciones se hace al cerrar la app

## v1.1.0 (2026-04-20)

- Nueva interfaz: `rework ui styles`, `visual patch v2` y `new ui v1`

## v1.0.14 (2026-04-20)

- Instalador NSIS por usuario (`perMachine: false`), sin elevación, sin acceso

## v1.0.13 (2026-04-20)

- Instalación de actualizaciones con `quitAndInstall(true, true)`.

## v1.0.12 (2026-04-20)

- Actualización automática: la versión descargada se instala al cerrar la app

## v1.0.11 (2026-04-20)

- Botones de la barra de título (minimizar/maximizar/cerrar) con iconos SVG.
- Las actualizaciones se instalan automáticamente al salir de la app.

## v1.0.10 (2026-04-20)

- Confirmación en dos pasos al cerrar la aplicación con servidores en

## v1.0.9 (2026-04-20)

- Al cerrar la ventana, la app sale enseguida si no hay servidores activos y

## v1.0.8 (2026-04-20)

- Las actualizaciones dejan de instalarse solas al cerrar

## v1.0.7 (2026-04-20)

- Rediseño de la barra de título.

## v1.0.6 (2026-04-20)

- El banner de actualización se movió fuera de la barra de título y se

## v1.0.5 (2026-04-20)

- Ajustes visuales de la interfaz (`visuals v2`).

## v1.0.4 (2026-04-20)

- Workflow de GitHub Actions para compilar y publicar la release
- Nuevos estilos (`src/styles.css`) y ajustes en el proceso principal y el

## v1.0.3 (2026-04-19)

- Scripts de publicación por tag en `package.json`
- Los errores del auto-updater dejan de llegarse al banner: solo se registran
- Gran rediseño de estilos e interfaz (HTML/CSS/renderer).
- `author` del paquete cambiado a "FixItNow" y `server/**/*` fuera de los

## v1.0.1 (2026-04-19)

- Primera versión publicada: app Electron completa (proceso principal
- Auto-update con `electron-updater` y publicación de releases en GitHub
- Cambio de nombre del paquete y de la aplicación a "Minecraft Local Server
