# Versionado

Este proyecto usa [Semantic Versioning](https://semver.org/lang/es/) (`vMAJOR.MINOR.PATCH`) con
un esquema **semi-automático**: una persona decide qué tan grande es el cambio (vía un label en
el PR), y un workflow de GitHub Actions se encarga de crear el tag, actualizar el `CHANGELOG.md`,
sincronizar el campo `"version"` de `package.json` y publicar el GitHub Release.

## Cómo indicar la versión en un PR

Antes de mergear un PR a `main`, asignale uno de estos labels (panel "Labels" del PR en GitHub):

| Label             | Cuándo usarlo                                                        |
|--------------------|-----------------------------------------------------------------------|
| `release:major`   | Cambio incompatible / breaking change (rompe contratos existentes)   |
| `release:minor`   | Nueva funcionalidad compatible con lo anterior                       |
| `release:patch`   | Fix, chore, refactor o mejora menor sin impacto de API                |

**Un PR sin ninguno de estos labels no corta release.** Esto permite agrupar varios PRs chicos
(docs, tests, CI) bajo un solo release posterior.

## Qué pasa al mergear

El workflow `.github/workflows/release.yml` corre cuando un PR se mergea a `main`:

1. Lee el label del PR y determina el tipo de bump.
2. Calcula la próxima versión a partir del último tag (`git describe --tags --abbrev=0`). Si el
   repo todavía no tiene ningún tag, la primera versión es `v0.1.0` sin importar el label.
3. Agrega una entrada a `CHANGELOG.md` con la versión, la fecha, el título y el número del PR.
4. Actualiza el campo `"version"` de `package.json` (y `package-lock.json`) con `npm version`.
5. Commitea ese cambio directo a `main`.
6. Crea y pushea el tag `vX.Y.Z` — esto dispara el workflow `main.yml` (que ya está preparado
   para reaccionar a tags `v*`).
7. Publica un GitHub Release sobre ese tag, con notas generadas automáticamente.

## Consultar la versión actual

- `package.json` → campo `"version"`
- Último tag: `git describe --tags --abbrev=0`
- Historial legible: `CHANGELOG.md` o la pestaña [Releases](../../releases) del repo en GitHub.

## Setup (una sola vez por repo)

Los labels `release:major` / `release:minor` / `release:patch` deben crearse manualmente en el
repo (Settings → Labels, o `gh label create release:patch -c 1f883d --repo <owner>/<repo>` y
análogos para `minor`/`major`). No se pueden definir desde código.
