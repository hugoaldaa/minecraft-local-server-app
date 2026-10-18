# Changelog

Historial de versiones de **Minecraft Local Server Manager**, reconstruido a partir
de los tags y commits del repositorio. Formato de [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

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

### Added

- Auditoría de la aplicación con el listado de mejoras (`MEJORAS.md`).
- ESLint 9 con configuración plana (`eslint.config.js`), Prettier (`.prettierrc`)
  y workflow de CI (`.github/workflows/lint.yml`) que ejecuta `npm run lint`.
- Backups automáticos de verdad: `scheduleAutoBackup`/`initAutoBackups` en
  `main/backups.js` con `node-schedule` (cada 1, 6, 12 o 24 horas); se
  reprograman al cambiar los ajustes del servidor y se cancelan al borrarlo.
- Validación de IPC en `main/validate.js`: allow-lists de directorios de
  servidor y de backup, rechazo de `..` y comparación case-insensitive en
  win32; `server:start` usa únicamente la configuración guardada.
- Guardas de navegación: `setWindowOpenHandler` deniega ventanas nuevas y
  `will-navigate` cancela la navegación.
- Recorte del búfer de consola (`MAX_LINES`) para que no crezca sin límite en
  memoria.

### Fixed

- `onUpdateAvailable`/`onUpdateDownloaded` no existían y provocaban un
  `TypeError` en cada arranque; ambos canales se expusieron en `preload.js`.
- La app seguía viva después de cerrar la ventana con servidores en marcha
  (`quitWhenServersStopped`: espera a que paren, con timeout de 15 s).
- La consola ignoraba las respuestas `{ ok: false }` de los IPC al usar
  servidores externos.
- La lista de jugadores era global y se mezclaba entre servidores
  (`state.playersByServer[serverId]`).
- XSS por `innerHTML` sin escapar: `esc()`/`safeColor()` en todas las
  interpolaciones de `src/renderer.js`.
- CSP con `'unsafe-inline'`: ahora `default-src 'self'` sin scripts ni estilos
  inline; se eliminaron los `onclick` y los `style` inline (delegación de
  eventos por contenedor en el renderer).
- Endpoint de analytics sin validar ni timeout: ahora solo `https:`, timeout de
  5 s y errores silenciados.
- `servers:update` extendía ciegamente los datos que manda el renderer
  (`sanitizeServerFields()`: `id`/`userId`/`createdAt` inmutables).
- Handlers de sistema de archivos sin `try/catch` en el proceso principal: ya
  se registran en el log de crashes.
- Código roto o muerto eliminado: `auth:login` (bcrypt), `server:takeover`
  siempre en error, claves duplicadas en `preload.js` y dependencias sin uso
  (`chokidar`, `adm-zip`, `bcryptjs`).

### Changed

- `main.js` (572 líneas, 44 canales IPC) dividido en `main/index.js` + 12
  módulos: `state`, `stores`, `validate`, `analytics`, `crash`, `servers`,
  `properties`, `backups`, `window`, `updater`, `stats`, `auth`.
- `src/renderer.js` reescrito con delegación de eventos por contenedor
  (`initDelegates()`), helper `esc()` y un wrapper `run()` que captura los
  errores de IPC; sin `cloneNode` para reiniciar listeners.
- Mostrar/ocultar elementos pasa de asignaciones `.style.*` a la clase
  `.hidden` con `classList`.
- Icono de la página web (`web/`).

## v1.3.1 - Nuevo Icono y Estilos (2026-10-05)

### Changed

- Nuevo icono de la aplicación (`assets/icon.ico` y `assets/icon.png`).
- Ajustes puntuales de estilos de la interfaz y de la página web.

## v1.3.0 - Fresh Styles (2026-10-05)

### Added

- Página web informativa en `web/index.html` con su configuración de despliegue
  (`vercel.json`) y varias correcciones (`web fix`, `web fix v2`, `web fix v3`).

### Changed

- Rediseño completo de los estilos de la app (`src/styles.css`), alineado con
  la página web y con el juego; tipografías propias empaquetadas en
  `assets/fonts/`.
- README actualizado tras el nuevo diseño.

## v1.2.0 - Descarga en Linux (2026-10-05)

### Added

- Builds de Linux: AppImage y paquete `.deb`, con icono PNG y targets en el
  workflow de release (se compilan en `ubuntu-latest`).
- Sección de Linux en el README (AppImage y `apt install` del `.deb`).

### Changed

- El auto-update solo se activa cuando la app corre como AppImage
  (`canAutoUpdate()`): el `.deb` se actualiza con el gestor de paquetes.
- Detección del proceso del servidor con PowerShell/CIM en Windows y `pgrep` en
  Linux/macOS, en lugar de `wmic` (eliminado en Windows 11 24H2).
- Icono de la ventana según plataforma (`icon.ico` en Windows, `icon.png` en el
  resto).

## v1.1.15 - Changelog + Fix Release (2026-10-05)

### Added

- `scripts/release.mjs`, el flujo de release interactivo (`npm run release` y
  `npm run release:notes`), y este `CHANGELOG.md` como historial versionado.
- Notas de la release dentro del banner de actualización: la lista de cambios
  se muestra al recibir una actualización.

### Changed

- El workflow de release prepara el nombre y las notas desde el tag
  (`--prepare-notes`) y los aplica a la release de GitHub (`--apply-notes`).
- `releaseInfo.releaseNotesFile` en `package.json`: `release-notes.md` viaja en
  `latest.yml` como `releaseNotes`.

## v1.1.14 (2026-04-25)

### Fixed

- Título de la ventana restaurado a "Minecraft Local Server Manager" (se había
  cambiado a un texto de prueba en v1.1.6).

## v1.1.13 (2026-04-25)

### Changed

- Solo actualización de versión en `package.json`/`package-lock.json`; sin
  cambios de código.

## v1.1.12 (2026-04-25)

### Changed

- Alineación del campo `version` de `package.json` (1.1.9 → 1.1.11) tras los
  tags paralelos; sin cambios de código.

## v1.1.11 (2026-04-25)

### Changed

- Solo actualización de versión. Este tag está en una rama paralela que nunca
  se fusionó con `main`.

## v1.1.10 (2026-04-25)

### Changed

- Solo actualización de versión. Este tag está en una rama paralela que nunca
  se fusionó con `main`.

## v1.1.9 (2026-04-25)

### Removed

- Revert del experimento de detección de servidores en ejecución introducido
  en v1.1.8.

## v1.1.8 (2026-04-25)

### Added

- Detección de servidores que ya estaban en ejecución fuera de la app (PID por
  escaneo de procesos) y su muestra en la interfaz.

## v1.1.7 (2026-04-24)

### Added

- Detección de procesos Java externos que ejecutan el JAR de un servidor
  (`isJarRunning`/`detectExternalServers`), para que el estado en la interfaz
  refleje lo que corre fuera de la app.

## v1.1.6 (2026-04-23)

### Changed

- Cambio puntual del título de la ventana (texto de prueba, revertido en
  v1.1.14).

## v1.1.5 (2026-04-22)

### Changed

- Ajuste de los parámetros de `quitAndInstall` al instalar una actualización
  (`true, true`).

## v1.1.4 (2026-04-22)

### Fixed

- Instalación de actualizaciones: se pasó de `app.quit()` a
  `autoUpdater.quitAndInstall(false, true)`.

## v1.1.3 (2026-04-21)

### Added

- Sincronización del estado de ventana maximizada con la UI (evento
  `window:maximized` al maximizar, restaurar y al terminar de cargar) y icono
  con tooltip en el botón de maximizar.

## v1.1.2 (2026-04-20)

### Changed

- El build de CI pasa de portable a instalador NSIS x64 y `publish.releaseType`
  de `portable` a `release`.
- Artefactos con la versión en el nombre (`${productName}-${version}.${ext}`).
- Opciones NSIS: instalación sin privilegios elevados, carpeta elegible por el
  usuario, acceso directo en el escritorio.

## v1.1.1 (2026-04-20)

### Changed

- El binario de CI vuelve a ser portable: se retira la configuración NSIS y
  `publish.releaseType` pasa a `portable`.
- La instalación de actualizaciones se hace al cerrar la app
  (`autoInstallOnAppQuit` + `app.quit()`).

## v1.1.0 (2026-04-20)

### Changed

- Nueva interfaz: `rework ui styles`, `visual patch v2` y `new ui v1`
  (HTML/CSS/renderer).

## v1.0.14 (2026-04-20)

### Changed

- Instalador NSIS por usuario (`perMachine: false`), sin elevación, sin acceso
  en el menú de inicio y sin `installer.nsh` personalizado.

## v1.0.13 (2026-04-20)

### Fixed

- Instalación de actualizaciones con `quitAndInstall(true, true)`.

## v1.0.12 (2026-04-20)

### Fixed

- Actualización automática: la versión descargada se instala al cerrar la app
  (`autoInstallOnAppQuit` + `app.quit()`).

## v1.0.11 (2026-04-20)

### Changed

- Botones de la barra de título (minimizar/maximizar/cerrar) con iconos SVG.
- Las actualizaciones se instalan automáticamente al salir de la app.

## v1.0.10 (2026-04-20)

### Added

- Confirmación en dos pasos al cerrar la aplicación con servidores en
  ejecución (primero "Continuar", después "Cerrar y detener todo").

## v1.0.9 (2026-04-20)

### Changed

- Al cerrar la ventana, la app sale enseguida si no hay servidores activos y
  espera 2 s si los hay; ajustes de estilos de la ventana.

## v1.0.8 (2026-04-20)

### Changed

- Las actualizaciones dejan de instalarse solas al cerrar
  (`autoInstallOnAppQuit: false`).

## v1.0.7 (2026-04-20)

### Changed

- Rediseño de la barra de título.

## v1.0.6 (2026-04-20)

### Changed

- El banner de actualización se movió fuera de la barra de título y se
  recoloreó con progreso y botones propios.

## v1.0.5 (2026-04-20)

### Changed

- Ajustes visuales de la interfaz (`visuals v2`).

## v1.0.4 (2026-04-20)

### Added

- Workflow de GitHub Actions para compilar y publicar la release
  (`.github/workflows/release.yml`).

### Changed

- Nuevos estilos (`src/styles.css`) y ajustes en el proceso principal y el
  renderer (`release workflow & visuals`).

## v1.0.3 (2026-04-19)

### Added

- Scripts de publicación por tag en `package.json`
  (`release:patch/minor/major`: versionan, hacen push del commit y de los
  tags).

### Changed

- Los errores del auto-updater dejan de llegarse al banner: solo se registran
  por consola.
- Gran rediseño de estilos e interfaz (HTML/CSS/renderer).
- `author` del paquete cambiado a "FixItNow" y `server/**/*` fuera de los
  ficheros empaquetados.

## v1.0.1 (2026-04-19)

### Added

- Primera versión publicada: app Electron completa (proceso principal
  `main.js`, `preload.js` y renderer en `src/`) con perfiles locales,
  inicio/parada de servidores, consola en tiempo real, estadísticas de CPU y
  RAM, gestión de jugadores, whitelist/banlist, editor de `server.properties`
  y backups manuales y automáticos.
- Auto-update con `electron-updater` y publicación de releases en GitHub
  (`publish` + `build:ci`).

### Changed

- Cambio de nombre del paquete y de la aplicación a "Minecraft Local Server
  Manager".
