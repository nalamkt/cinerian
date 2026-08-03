# Cinerian relaunch audit

Fecha: 2026-07-27

## Estado actual

La app actual es un frontend estatico en HTML/CSS/JS sin backend, sin autenticacion y sin persistencia real de usuarios, feed o recomendaciones sociales.

Hoy existen estas piezas reutilizables:

- Busqueda de peliculas y series con TMDB.
- Vista de detalle individual para una pelicula o serie.
- Integracion embebida con JustWatch widget para mostrar plataformas.
- Identidad visual inicial, nombre y algunos assets.

## Hallazgos tecnicos

1. No hay arquitectura de producto social
- No existe base de datos.
- No hay perfiles, seguidores, publicaciones, likes ni comentarios.
- No hay sesiones de usuario.

2. Las claves estan expuestas en frontend
- TMDB API key en `legacy/classic-web/app/tmdb.js`, `legacy/classic-web/search.html`, `legacy/classic-web/prox.html` y `legacy/classic-web/top.html`.
- Bearer token de TMDB tambien expuesto en frontend.
- Esto puede usarse para abuso de cuota y obliga a mover integraciones sensibles a backend antes de produccion.

3. El proyecto no tiene stack moderno ni tooling
- No hay `package.json`, bundler, tests ni pipeline.
- El codigo esta duplicado entre paginas.
- La logica de negocio vive embebida en HTML y scripts globales.

4. La experiencia actual es limitada
- La busqueda existe, pero no hay flujo de perfil.
- No hay onboarding sobre gustos.
- No hay sistema de recomendacion, solo consumo de catalogo externo.

## Viabilidad

La idea es totalmente viable.

De hecho, el concepto tiene buen encaje porque mezcla tres cosas que la gente ya hace por separado:

- buscar donde ver algo,
- registrar lo que vio,
- compartir gustos y descubrir desde amigos o afinidades.

Lo que hoy falta no es validacion conceptual sino una base tecnica y de producto mas ordenada.

## Recomendacion de relanzamiento

Conviene relanzarlo como MVP en 3 capas:

1. Capa catalogo
- TMDB para metadata.
- JustWatch u otra fuente para disponibilidad por plataforma.

2. Capa social
- usuarios,
- actividad/feed,
- ratings,
- watchlist,
- likes y comentarios.

3. Capa recomendacion
- primero reglas simples,
- despues personalizacion real con eventos y afinidad.

## MVP recomendado

### Version 1

- Registro/login.
- Perfil basico.
- Buscador de peliculas y series.
- Ficha de detalle.
- Marcar `me gusto`, `no me gusto`, `ya la vi`.
- Puntuar si ya la viste.
- Feed con publicaciones automaticas al puntuar o recomendar.
- Watchlist y vistas en el perfil.

### Version 2

- Seguir amigos.
- Feed filtrado por amigos.
- Comentarios y likes.
- Recomendaciones segun historial, generos y ratings.

### Version 3

- Swipe estilo Tinder para discovery.
- Afinidad entre usuarios.
- Rankings semanales.
- Resumen de actividad y notificaciones.

## Stack sugerido

Si quieren hacerlo bien y con velocidad:

- Frontend: React + Vite + TypeScript.
- Backend: Supabase o Firebase para arrancar rapido.
- Base de datos: Postgres si usan Supabase.
- Auth: Supabase Auth.
- Deploy: Vercel o Netlify para frontend, Supabase para backend.

## Decision importante

No recomiendo seguir construyendo el producto social sobre la base actual de multiples HTML sueltos.

Si, en cambio, recomiendo usar este repo para:

- preservar assets e identidad,
- sacar ideas reutilizables,
- construir un MVP nuevo y ordenado,
- migrar de a poco lo que valga la pena.

## Lo que deje en esta iteracion

- Este documento de auditoria.
- Un prototipo nuevo en `legacy/classic-web/mvp.html`.
- Logica nueva en `legacy/classic-web/app/mvp.js`.
- Estilos nuevos en `legacy/classic-web/mvp.css`.

El prototipo no reemplaza la app final, pero si aterriza la vision de producto y nos da una base concreta para iterar.
