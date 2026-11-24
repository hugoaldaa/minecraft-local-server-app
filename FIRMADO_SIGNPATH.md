# Firmar el .exe de Windows con SignPath Foundation (gratis)

> Documento interno con los pasos que **tú** debes hacer para completar la firma del instalador Windows.
> La fase previa (LICENSE + `"license": "MIT"` en `package.json`) ya está hecha.

---

## 1. Paso previo común (ya hecho)

- [x] `LICENSE` añadida al repo (MIT, licencia OSI).
- [x] `"license": "MIT"` añadido en `package.json`.

---

## 2. Pasos que te faltan por hacer

### 2.1 Activar autenticación en dos pasos (MFA) en GitHub
Obligatorio para usar secrets en GitHub Actions.

- Ve a tu cuenta de GitHub → **Settings** → **Password and authentication** → activa 2FA.

### 2.2 Solicitar admisión en SignPath Foundation
- Entra en **signpath.org** y rellena el formulario del programa **open source**.
- La decisión es discrecional de ellos; suele tardar unos días.
- Requisitos que cumples: repo público, README, releases desde el código, licencia OSI.

### 2.3 Configurar el proyecto en SignPath
Una vez aceptado:

1. Crea un **proyecto** para esta app.
2. Crea una **signing policy** llamada `release-signing` con **aprobación manual**.
3. Configura el **artefacto** (el instalador `.exe` de Windows).
4. Añade el **trusted build system** de GitHub Actions.

### 2.4 Añadir secrets en GitHub
En tu repo de GitHub → **Settings** → **Secrets and variables** → **Actions**:

| Nombre | Tipo | Valor |
|---|---|---|
| `SIGNPATH_ORGANIZATION_ID` | Variable | ID de tu organización en SignPath |
| `SIGNPATH_API_TOKEN` | Secreto | Token de API de SignPath |

### 2.5 Modificar el job de Windows en `.github/workflows/release.yml`
Hoy el job de Windows construye y publica directamente, lo que subiría un `.exe` **sin firmar** encima del firmado.

Cambia el job de Windows para que:

1. Construya con `--publish never` (no publique automáticamente).
2. Suba el instalador como **artifact** (`actions/upload-artifact`).
3. Lo envíe a `signpath/github-action-submit-signing-request` para firmarlo en CI.

### 2.6 Recalcular `latest.yml` después de firmar
**Importante:** `latest.yml` contiene el SHA-512 y el tamaño del instalador. Como firmas **después** de que electron-builder genere `latest.yml`, el hash deja de coincidir y el auto-update falla.

Tras la firma, debes:

1. Recalcular `sha512` y `size` del `.exe` **firmado**.
2. Actualizar ese `latest.yml` (y el `.blockmap`, o desactivar la descarga diferencial).
3. Subir ese `latest.yml` corregido a la release de GitHub.

### 2.7 Añadir la atribución exigida por SignPath en el README
El programa open source exige esta atribución:

> Free code signing provided by SignPath.io, certificate by SignPath Foundation.

Añádela en el README (cerca de la sección de descargas).

### 2.8 Quitar el job de Windows de CI mientras tanto (opcional pero recomendado)
Hasta que tengas la firma funcionando, deja el job de Windows solo para **Linux** o desactívalo para evitar publicar `.exe` sin firmar.

---

## 3. Qué NO arregla la firma por sí sola

- Un certificado normal (no EV) **no elimina SmartScreen al instante**: la reputación se construye con las descargas. Al principio puede seguir apareciendo un aviso suave, pero ya con tu nombre (o "SignPath Foundation") como editor y sin "desconocido".
- Firma **instalador y exe interno** (electron-builder lo hace con la configuración adecuada).
- Linux (AppImage/.deb) no necesita este tipo de firma.
- ✅ Mientras tanto, el **SHA256** se publica automáticamente en cada release (`SHA256SUMS`, generado por `scripts/checksums.mjs` en CI) y se enlaza desde la web.

---

## 4. Estado del plan de mejoras

| Fase | Ítem | Estado |
|------|------|--------|
| 1 | 1.1 Java por versión de Minecraft | ✅ Hecho |
| 1 | 1.2 Actualizar Electron + smoke tests | ⏸ Pospuesto (salto 28→45 muy arriesgado sin tests) |
| 1 | 1.3 Instancia única | ✅ Hecho |
| 1 | 1.4 Restaurar backups | ✅ Hecho |
| 1 | 1.5 Verificar descargas Vanilla/Fabric/Forge | ✅ Hecho |
| 2 | 2.1 Auto-reinicio (límite 3 reintentos) | ✅ Hecho |
| 2 | 2.4 Diagnóstico de crashes (Java, puerto, memoria, EULA) | ✅ Hecho |
| 2 | 2.2 Reinicio programado (6/12/24 h por servidor) | ✅ Hecho |
| 2 | 2.3 Notificaciones (servidores, jugadores, backups) | ✅ Hecho |
| 2 | 2.5 Smoke tests (`npm run smoke`, flujo crear→arrancar→parar) | ✅ Hecho |
| 2 | 2.6 Comprobar el puerto antes de arrancar | ✅ Hecho |
| 2 | 2.7 Trocear renderer.js en `src/renderer/` (19 módulos) | ✅ Hecho |
| 3 | Gestor de mods, jugar con amigos, importar/clonar, webhook Discord, editor server.properties | ⏳ Pendiente |
| 4 | Licencia, SHA256SUMS, notas de release, higiene repo, web promocional | ✅ Hecho |
| 5 | Firmar .exe (SignPath) | 🔧 En curso (depende de pasos externos) |

---

## 5. Siguiente recomendado

Ya implementados: 1.1, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7 y la Fase 4 completa (SHA256SUMS generado por CI y publicado en cada release, notas de release, limpieza del repo y web actualizada). Las opciones que quedan son:

- **3.1 Gestor de mods con Modrinth** — la gran función nueva (alto esfuerzo).
- **3.2 Ayuda para jugar con amigos** — IP local, firewall y port forwarding.

La firma (Fase 5) sigue pendiente de los trámites externos indicados arriba.
