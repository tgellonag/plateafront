# Platea · Web

Next.js + TypeScript. Interfaz móvil y oscura desde 360 px: portada sin registro, configuración, invitación con código/QR/cuenta regresiva, participantes en vivo, votación, votos ajenos, match, ranking, perfil IA, segunda ronda, confirmación y resultado privado del grupo. Los nombres de películas se muestran en inglés, manteniendo la interfaz en español y la disponibilidad de Chile.

## Ejecutar

1. `npm ci`.
2. Copiar `.env.example` a `.env.local`; `NEXT_PUBLIC_API_URL=http://localhost:8080`.
3. Iniciar `../PlateaBack` con PostgreSQL y precargar TMDB siguiendo su README.
4. `npm run dev`; abrir `http://localhost:3000`.

Rutas: `/`, `/join/CODIGO`, `/room/ID`, `/room/ID/manage` y `/metrics` (panel de administración). No hay enlaces públicos de resultados; solo se comparte la invitación.

Antes de iniciar la primera ronda, «Sala» contiene los filtros, el perfil con IA y «Iniciar votación». «Sesión» solo se habilita al comenzar la primera ronda; acceder a su URL antes redirige a Sala. Durante la votación contiene la gestión de rondas, el perfil con IA, el ranking provisional y «Salir». «Volver» regresa a la votación sin abandonar la participación. La tarjeta de votación muestra el afiche a todo el ancho con título y datos superpuestos sobre un degradado inferior; el ranking final permanece en la vista de resultado.

El selector de servicios consulta `GET /api/v1/providers` del backend, que obtiene la lista de TMDB para Chile. No hay servicios hardcodeados. Incluye búsqueda, carga, reintento y aviso de caché desactualizada. Las películas se filtran por disponibilidad de suscripción; no incluye alquileres ni compras.

El token se guarda por sala en sessionStorage, limitado a la pestaña y conservado al recargar; al cerrar la pestaña se pierde el acceso guardado. No se recuperan tokens anteriores de localStorage. Una pestaña nueva e independiente obtiene otra identidad; duplicar una pestaña puede copiar inicialmente su sessionStorage según el navegador. El token no se envía en enlaces, QR ni URL del WebSocket. La conexión se autentica con su primer mensaje; los cambios se consultan por HTTP al conectarse, recibir avisos, reenfocar la ventana y reconectarse. Reconexión exponencial hasta 30 s. Una respuesta fallida no se presenta como voto exitoso; se vuelve a consultar el estado. Sin afiche se muestra el título. Los errores de IA conservan el resto del flujo.

El anfitrión debe guardar filtros antes de iniciar. El código rota automáticamente antes de vencer y puede renovarse manualmente. La segunda ronda no repite títulos y conserva el ranking anterior. El cierre es manual y la elección se confirma por separado. «Salir» actualiza la lista activa en el servidor y libera el cupo del participante, pero conserva sus votos e identidad. Al salir el administrador, el rol pasa al participante activo que entró primero. Si todos salen, lo recibe la próxima persona que ingrese o reanude. Volver tras salir cuenta como una nueva entrada para el orden de administración, pero recargar o navegar no cambia ese orden. «Volver a mi sala anterior» reanuda la participación con el mismo token; ingresar otra vez por código también reutiliza la identidad guardada, sin duplicarla. Una desconexión temporal no elimina participantes.

Para excluir una demostración de la tasa de decisión, marcarla en la portada **antes de crearla**. El panel `/metrics` pide `ADMIN_TOKEN`, no lo persiste ni lo incluye en enlaces.

## Compilación y despliegue

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`.

No se agregaron ni ejecutaron pruebas por instrucción del usuario. Se mantienen las herramientas y workflows preexistentes.

Vercel debe tener `NEXT_PUBLIC_API_URL` con la URL HTTPS de Render **antes de compilar**. En Render configurar `CORS_ORIGIN` con el origen de Vercel. El frontend no necesita claves de TMDB, Gemini, Neon ni administración. El backend mantiene las reglas y PostgreSQL es la fuente de verdad; el cliente no decide ranking ni match.

La atribución TMDB y el aviso de servicio gratuito de mejor esfuerzo son permanentes. Los servicios externos requieren credenciales y el catálogo local debe estar precargado para funcionar durante una caída de TMDB. La validación real de usabilidad, carga y despliegue no se sustituye por una compilación.
