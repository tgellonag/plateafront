# Platea · Web

Interfaz de Platea para elegir una película en grupo: crear una sala, invitar,
filtrar servicios de streaming y votar para ver un ranking en vivo.
Sin cuentas; los resultados son privados para los participantes.
Next.js + TypeScript, interfaz en español y disponibilidad de Chile.

## Desarrollo

1. `npm ci`.
2. Copiar `.env.example` a `.env.local` y configurar
   `NEXT_PUBLIC_API_URL=http://localhost:8080`.
3. Iniciar el [backend](https://github.com/tgellonag/PlateaBack) con PostgreSQL y
   catálogo TMDB siguiendo su README.
4. `npm run dev`; abrir `http://localhost:3000`.

El acceso a cada sala se guarda en la pestaña: recargar lo conserva, cerrar la
pestaña puede perderlo. Solo se comparte la invitación, nunca el token de acceso.

## Validación

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

El [contrato de API](https://github.com/tgellonag/PlateaBack/blob/main/openapi.yaml)
y la [estrategia de pruebas](https://github.com/tgellonag/PlateaBack/blob/main/docs/testing-strategy.md)
viven en el backend.

## Lighthouse CI

El workflow `CI · Lighthouse` corre en cada pull request y en cada push a `main`: compila la
app, la levanta con `next start` y ejecuta [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
tres veces sobre `/`, la pantalla de entrada. No necesita el backend ni secretos, y no sube nada a
servicios externos.

- **Resumen:** en la pestaña _Summary_ del run de GitHub Actions aparece una tabla con la mediana
  de las tres corridas (performance, LCP, CLS, TBT y FCP) y los umbrales superados.
- **Reporte completo:** en la misma pestaña, sección _Artifacts_, se descarga `lighthouse-report`
  (se conserva 14 días): un `.html` y un `.json` por ejecución.
- **Umbrales:** `lighthouserc.js` avisa (`warn`) si el puntaje de performance baja de 0,8, si el
  LCP supera 2,5 s, el CLS 0,1 o el TBT 300 ms. Por ahora no bloquea el PR; para que lo haga,
  cambiar `warn` por `error` en ese archivo.
- **Local:** `npm run build && npm run lhci` deja los reportes en `.lighthouseci/` (ignorada por
  git) y `node scripts/lighthouse-summary.mjs` imprime el resumen. Requiere Chrome; si no lo
  encuentra, definir `CHROME_PATH`.

Lighthouse es una **prueba de laboratorio**: una sola carga simulada, con dispositivo y red
fijos, que sirve para detectar regresiones entre cambios. No mide INP (necesita interacciones
reales) y usa TBT como aproximación. Los datos de [`/vitals`](https://plateafront.vercel.app/vitals)
son de **campo**: el p75 de usuarios reales, con sus dispositivos y redes. Son complementarios y
sus números no tienen por qué coincidir.

## Monitoreo de Core Web Vitals

La página [`/vitals`](https://plateafront.vercel.app/vitals) muestra el p75 de usuarios reales. El
workflow `Monitoreo · Core Web Vitals` hace lo mismo sin abrirla:

- **Cuándo corre:** todos los días a las 12:00 UTC y a mano desde la pestaña _Actions_ ("Run
  workflow"), donde se puede indicar una versión para ver solo esa. Los workflows programados solo
  corren desde la rama por defecto.
- **Qué hace:** lee `GET /api/v1/vitals/summary` del backend y deja la tabla en la pestaña
  _Summary_ del run. La URL del backend se puede cambiar con la variable de repositorio `API_URL`.
- **Issue:** si el p75 de LCP, INP o CLS de una fila con las muestras mínimas (20) queda fuera de
  «bueno» (LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1), abre un issue con la etiqueta `web-vitals`; los
  días siguientes lo actualiza en vez de abrir otro, y lo cierra solo cuando todo vuelve a «bueno».
  Con filas sin muestras suficientes no hace nada, y con una versión filtrada no toca el issue.
- **Local:** `API_URL=https://… node scripts/vitals-report.mjs` imprime la tabla y escribe
  `vitals-issue.md`.

## Despliegue

Configurar `NEXT_PUBLIC_API_URL` con la URL HTTPS del backend **antes de compilar**
y autorizar el origen del frontend en `CORS_ORIGIN` del backend.
El frontend no necesita credenciales de TMDB ni PostgreSQL.
