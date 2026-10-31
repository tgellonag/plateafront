# Platea · Web

Next.js + TypeScript. Interfaz móvil y oscura desde 360 px: portada sin registro, configuración, invitación con código/QR/cuenta regresiva, participantes en vivo, votación, votos ajenos, match, ranking, segunda ronda, confirmación y resultado privado del grupo. Los nombres de películas se muestran en inglés, manteniendo la interfaz en español y la disponibilidad de Chile.

## Ejecutar

1. `npm ci`.
2. Copiar `.env.example` a `.env.local`; `NEXT_PUBLIC_API_URL=http://localhost:8080`.
3. Iniciar `../PlateaBack` con PostgreSQL y precargar TMDB siguiendo su README.
4. `npm run dev`; abrir `http://localhost:3000`.

Rutas: `/`, `/join/CODIGO`, `/room/ID`, `/room/ID/manage` y `/metrics` (panel de administración). No hay enlaces públicos de resultados; solo se comparte la invitación.

## Estructura

- `app/platea.tsx`: componente cliente único para `/`, `/join` y `/room`; muestra avisos, encabezado y la pantalla activa. La navegación entre vistas usa `history.pushState` para conservar el estado y el WebSocket.
- `app/use-room.ts`: ciclo de vida de la sesión (reanudar, sincronizar, acciones, salir).
- `app/vote-queue.ts`: cola local de votos.
- `app/use-providers.ts`: servicios de streaming.
- `app/screens/`: `welcome`, `lobby`, `filters-form`, `voting`, `management`, `poster`.
- `lib/api.ts`: `request`, `API_URL` y tipos de la API.

Antes de iniciar la primera ronda, «Sala» contiene los filtros e «Iniciar votación». «Sesión» solo se habilita al comenzar la primera ronda; acceder a su URL antes redirige a Sala. Durante la votación contiene la gestión de rondas, el ranking provisional y «Salir». «Volver» regresa a la votación sin abandonar la participación. La tarjeta de votación muestra el afiche a todo el ancho con título y datos superpuestos sobre un degradado inferior; el ranking final permanece en la vista de resultado.

El selector de servicios consulta `GET /api/v1/providers` del backend, que obtiene la lista de TMDB para Chile. No hay servicios hardcodeados. Incluye búsqueda, carga, reintento y aviso de caché desactualizada. Las películas se filtran por disponibilidad de suscripción; no incluye alquileres ni compras.

El token se guarda por sala en sessionStorage, limitado a la pestaña y conservado al recargar; al cerrar la pestaña se pierde el acceso guardado. No se recuperan tokens anteriores de localStorage. Una pestaña nueva e independiente obtiene otra identidad; duplicar una pestaña puede copiar inicialmente su sessionStorage según el navegador. El token no se envía en enlaces, QR ni URL del WebSocket. La conexión se autentica con su primer mensaje; se consulta el estado al entrar, cambiar de vista, reenfocar la ventana y reconectarse. Reconexión exponencial hasta 30 s. Sin afiche se muestra el título.

Votar avanza la tarjeta inmediatamente y precarga los próximos dos afiches. Una cola secuencial conserva los votos pendientes en sessionStorage por sala/participante/ronda; confirma cada voto mediante la respuesta HTTP canónica, sin mensajes de guardado ni consultas de sala por votos en la vista Votación. Reintenta fallos transitorios hasta tres veces y reconcilia resultados ambiguos. Si hay problemas de envío, muestra solo un pequeño icono de conexión junto al botón superior derecho; pulsarlo reintenta los votos pendientes, sin avisos individuales ni botón de descarte. Cambiar de ronda no borra los pendientes. Se advierte antes de salir con votos sin confirmar. «Sesión» consulta snapshots autoritativos al abrir y ante avisos de votos; ambas vistas reconcilian cambios de ronda, cierre y permisos. El ranking, match y progreso siempre los calcula el servidor.

El anfitrión debe guardar filtros antes de iniciar. El código rota automáticamente antes de vencer y puede renovarse manualmente. La segunda ronda no repite títulos y conserva el ranking anterior. El cierre es manual y la elección se confirma por separado. «Salir» actualiza la lista activa en el servidor y libera el cupo del participante, pero conserva sus votos e identidad. Al salir el administrador, el rol pasa al participante activo que entró primero. Si todos salen, lo recibe la próxima persona que ingrese o reanude. Volver tras salir cuenta como una nueva entrada para el orden de administración, pero recargar o navegar no cambia ese orden. Ingresar otra vez por código reutiliza la identidad guardada, sin duplicarla; si la reanudación automática falla, «Reintentar» en el aviso de error vuelve a la última sala con el mismo token. Una desconexión temporal no elimina participantes.

Para excluir una demostración de la tasa de decisión, marcarla en la portada **antes de crearla**. El panel `/metrics` pide `ADMIN_TOKEN`, no lo persiste ni lo incluye en enlaces.

## Compilación y despliegue

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`.

`npm test` cubre la cola de votos (`app/vote-queue.test.ts`): confirmación, recuperación tras recargar y reconciliación de envíos ambiguos. La validación funcional de la interfaz sigue siendo manual.

Si se usa Docker, los cambios Go no se recargan automáticamente: ejecutar en `../PlateaBack` `docker compose -f compose.yaml -f compose.local.yaml up -d --build --no-deps api`. No reiniciar ni borrar la base. Si falla el envío después de actualizar el frontend, comprobar que el backend en ejecución también fue reconstruido; conservar los votos pendientes y pulsar el icono de conexión junto al botón superior derecho para reintentar.

Vercel debe tener `NEXT_PUBLIC_API_URL` con la URL HTTPS de Render **antes de compilar**. En Render configurar `CORS_ORIGIN` con el origen de Vercel. El frontend no necesita claves de TMDB, Neon ni administración. El backend mantiene las reglas y PostgreSQL es la fuente de verdad; el cliente no decide ranking ni match.

La atribución TMDB y el aviso de servicio gratuito de mejor esfuerzo son permanentes. Los servicios externos requieren credenciales y el catálogo local debe estar precargado para funcionar durante una caída de TMDB. La validación real de usabilidad, carga y despliegue no se sustituye por una compilación.
