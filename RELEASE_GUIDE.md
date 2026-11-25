# Guia de Releases - Minecraft Local Server Manager

Cada release tiene **version** (`v1.1.15`), **nombre** ("Backups automaticos") y
**explicacion** (una linea por cambio). El nombre y las notas se guardan en tres sitios:

| Sitio | Para que sirve |
|-------|----------------|
| `CHANGELOG.md` | historial versionado del repo; si el tag no tiene anotacion, es la fuente del nombre y de las notas |
| Tag anotado (`git tag -a v1.1.15 -F ...`) | lo lee CI para poner titulo y notas en la release |
| `build/release-notes.md` | se incrusta en `latest.yml` y la app lo muestra en el banner de actualizacion |

## Versionamiento (SemVer)

| Tipo | Cuando usar | Ejemplo |
|------|------------|---------|
| `patch` | Bug fixes, cambios menores | `1.1.4` -> `1.1.5` |
| `minor` | Nueva funcionalidad compatible | `1.1.4` -> `1.2.0` |
| `major` | Cambios que rompen compatibilidad | `1.1.4` -> `2.0.0` |

## Publicar una release

```bash
npm run release
```

El script (`scripts/release.mjs`):

1. **Preflight**: se niega a publicar si el working tree tiene cambios, si el
   tag ya existe y avisa si el remoto tiene commits que no tienes.
2. Muestra los commits pendientes desde el ultimo tag y **propone notas**
   agrupadas en Añadido / Corregido / Cambios / Otros segun el mensaje del commit.
3. Pregunta el tipo (`patch`/`minor`/`major`) y el **nombre**. Puedes aceptar la
   propuesta de commits o escribir las notas **por seccion** (una linea por
   cambio, linea vacia para terminar cada seccion).
4. Enseña una vista previa (titulo, bump, notas y como quedara `CHANGELOG.md`)
   y pide confirmacion.
5. Actualiza `CHANGELOG.md`, `package.json` y `package-lock.json`
   (`npm version ... --no-git-tag-version`).
6. Crea el commit `v1.1.15 - <nombre>` y el **tag anotado** con las notas.
7. Sube commit y tag: dispara el workflow, que compila el `.exe` (Windows) y el
   `AppImage` + `.deb` (Linux), publica los `SHA256SUMS` y actualiza la release
   de GitHub con el nombre y las notas por secciones.

La entrada nueva se inserta en `CHANGELOG.md` encima de la anterior, con el
formato `## v1.1.15 - <nombre> (<fecha>)` y las mismas secciones.
`build/release-notes.md` (la que incrusta la app en `latest.yml`) conserva las
notas en espanol y añade un aviso final recordando que la release incluye
`SHA256SUMS`.

### Notas bilingües en GitHub

El cuerpo de la release de GitHub se publica en espanol e ingles. Tras cada
seccion en espanol se inserta su traduccion (`Añadido`/`Added`, `Corregido`/`Fixed`,
`Cambios`/`Changed`, `Otros`/`Other`) y el aviso final tambien aparece en los dos
idiomas. Las viñetas se traducen con Gemini (tier gratuito de Google AI Studio)
desde `scripts/release.mjs`, en el paso `--apply-notes` (una sola llamada por
release, sin coste mientras el proyecto no tenga facturación vinculada).

Configura el secreto del repositorio `GEMINI_API_KEY` en
*Settings → Secrets and variables → Actions*. Consigue la clave gratis en
https://aistudio.google.com/apikey (no pide tarjeta). Opcionalmente
`GEMINI_MODEL` puede definirse como variable (default `gemini-3.5-flash-lite`).
Si el secreto falta o la API falla, la release se publica igualmente solo en
espanol y el workflow avisa; nunca se bloquea por la traduccion.

### Opciones

| Opcion | Efecto |
|--------|--------|
| `patch` / `minor` / `major` | tipo de bump sin preguntar |
| `--name "Titulo"` | nombre de la release |
| `--added "a;b"` / `--fixed "a;b"` / `--changed "a;b"` / `--other "a;b"` | notas por seccion, separadas por `;` |
| `--notes "cambio 1;cambio 2"` | alias de `--changed`, compatible con el flujo anterior |
| `--from-commits` | usa directamente la propuesta de los commits pendientes |
| `--dry-run` | no ejecuta ningun comando de git |
| `--no-push` | deja commit y tag creados solo en local |
| `--yes` | confirma sin preguntar |

Con tipo, nombre y notas (o `--from-commits`) el script no necesita terminal
interactiva, asi que sirve para CI o para preparar una release a mano:

```bash
npm run release -- patch --name "Backups automaticos" \
  --added "Restauracion de backups" --fixed "Puerto ocupado al arrancar" --yes

npm run release -- patch --name "Mantenimiento" --from-commits --yes
```

### Sin descripcion

El script se niega a publicar si no hay al menos un cambio: es mejor una release
sin notas automaticas de GitHub que una entrada vacia en el CHANGELOG. Escribe
siempre al menos una linea en alguna seccion.

Asi se ve `build/release-notes.md` (y el cuerpo de la release en GitHub):

```markdown
## v1.10.0 - Backups automaticos

### Añadido

- Restauracion de backups desde la pestaña Copias de seguridad

### Corregido

- Aviso cuando el puerto ya esta en uso

---

**Verificación:** el fichero `SHA256SUMS` de esta release contiene el SHA-256 de los instaladores.
```

Dentro de la app se pinta el mismo contenido con las secciones, las negritas,
el codigo inline y los enlaces, sin interpretar HTML.

## Modos auxiliares (CI y backfill)

| Comando | Para que sirve |
|---------|----------------|
| `node scripts/release.mjs --prepare-notes <tag>` | escribe `build/release-notes.md` a partir del tag anotado o, si no lo tiene, de la entrada de `CHANGELOG.md`. Lo ejecuta CI antes de compilar. |
| `node scripts/release.mjs --apply-notes <tag>` | actualiza titulo y cuerpo de la release de GitHub con `gh release edit --title ... --notes-file ...`. Lo ejecuta CI al terminar. |
| `npm run release:notes` (`--backfill`) | reconstruye **`CHANGELOG.md` entero** desde los tags: una entrada por tag con los commits de su rango y fechas. Solo para bootstrap o recuperacion: sobrescribe el fichero, no lo ejecutes si ya tienes entradas escritas a mano. |
| `node scripts/release.mjs --clean-changelog` | normaliza el CHANGELOG existente: cabeceras `## vX.Y.Z - nombre (fecha)`, viñetas planas ( arregla los antiguos `- - ...` ) y sin duplicados. No regenera el contenido. |

Si ninguno de los dos tiene notas (`--apply-notes` sin tag anotado y sin
entrada en `CHANGELOG.md`), CI cae al `--generate-notes` de GitHub.

## Como queda en GitHub

El workflow crea la release antes de compilar (`gh release create`), compila sin
publicar desde `electron-builder` y sube los ficheros de `dist/` con
`node scripts/upload-release-assets.mjs <tag>` (`gh release upload --clobber`).
Despues el paso `--apply-notes` ejecuta:

```
gh release edit v1.1.15 --title "v1.1.15 - Backups automaticos" --notes-file build/release-notes-bilingual.md
```

Si Gemini no responde o no hay clave, usa `build/release-notes.md` (solo español).
Si `gh` falla, la release se publica igualmente: solo queda poner el titulo a mano.
Ademas, cada job sube su `SHA256SUMS-<plataforma>.txt` y el job final los une en
un `SHA256SUMS` unico, que es el que enlaza la web de descarga.

## Builds por sistema

`npm run build:win` y `npm run build:linux` siguen compilando con `--publish always`
para publicar a mano si hace falta. En CI se usan `build:ci` y `build:linux:ci`,
que no publican y dejan que `gh` suba los assets. En local solo se puede generar
el `.exe`: `AppImage` necesita `mksquashfs` y el `.deb` necesita `fpm`,
herramientas Linux. Los dos targets de Linux se compilan en GitHub Actions
(`ubuntu-latest`); el `.exe` en `windows-latest`. El job `release-notes` espera
a los dos.

Assets resultantes:

| Sistema | Targets | Autoactualiza |
|---------|---------|---------------|
| Windows | `nsis` (`.exe`) | si (NSIS) |
| Linux | `AppImage` | si (`electron-updater`) |
| Linux | `deb` | no, via gestor de paquetes |

`main/updater.js` solo activa el autoactualizador si la app se esta ejecutando
como AppImage (`canAutoUpdate()`), para que el `.deb` no ofrezca una
actualizacion que no puede aplicar. El `StartupWMClass` del `.desktop` tiene que
coincidir con el nombre del ejecutable (`minecraft-local-server-manager`) o el
icono no aparece en la barra de tareas.

## Notas dentro de la app

`build/release-notes.md` se lee al compilar (`releaseInfo.releaseNotesFile`) y viaja en
`latest.yml` como `releaseNotes`. `main/updater.js` lo reenvia al renderer y el
banner de actualizacion muestra el nombre y la lista de cambios.

## Checklist antes de publicar

1. `npm run lint` y `npm run format:check` en verde.
2. Working tree limpio y rama actualizada (`git pull`).
3. `CHANGELOG.md` revisado: la entrada anterior no debe quedar con
   `Sin descripcion`.
4. `npm run release` (o la version con argumentos de arriba) y confirmar la
   vista previa.
5. Tras el push, vigilar los jobs `build` y `release-notes` en GitHub Actions y
   comprobar el titulo y las notas de la release.

## Problemas frecuentes

**El working tree tiene cambios** — el script se niega a publicar. Haz commit o
`git stash`.

**El tag ya existe** — hay que borrar el tag: `git tag -d v1.1.15` (local) y
`git push --delete origin v1.1.15`.

**`release:patch` ya no existe** — usa `npm run release -- patch`. Los scripts
antiguos no preguntaban nombre ni notas.

**La release se publico sin titulo ni notas** — fallo de `gh` o tag sin
anotacion: `node scripts/release.mjs --apply-notes v1.1.15` (o editarlo a mano
en GitHub).

**Quiero regenerar el `CHANGELOG.md` desde cero** — `npm run release:notes`
(`--backfill`). Sobrescribe el fichero completo; hazlo solo si no tienes entradas
a mano que conservar.

**Build manual para probar**: `npm run build` (usa el `build/release-notes.md` que
dejo el ultimo release; borra `build/` si quieres recompilar sin notas).
