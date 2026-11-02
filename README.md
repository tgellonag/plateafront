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

## Despliegue

Configurar `NEXT_PUBLIC_API_URL` con la URL HTTPS del backend **antes de compilar**
y autorizar el origen del frontend en `CORS_ORIGIN` del backend.
El frontend no necesita credenciales de TMDB ni PostgreSQL.
