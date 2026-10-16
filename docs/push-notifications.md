# Notificaciones push

La integración usa OneSignal para entregar Web Push y Vercel Functions como
backend privado. Las claves de OneSignal y el service role de Supabase nunca
viajan al navegador.

## Qué avisa

- Una recomendación nueva o respuesta en Inbox se entrega en el momento.
- Una serie en `Viendo` avisa cuando TMDB cambia su estado o próximo episodio.
- `Mi Ranking` resume la primera variación concreta del día y cuenta cambios extra.
- Después de cinco días sin abrir Cinerian, se envía una sola invitación si el
  círculo marcó títulos mientras la persona estuvo ausente.

Las sincronizaciones diarias toman un snapshot inicial sin enviar alertas. Así
no se notifica el historial previo al activar la función.

## Supabase

Ejecutar una vez [push_notifications.sql](../supabase/push_notifications.sql)
en el SQL Editor. Crea los estados de comparación, registro de entregas y la
última actividad de cada usuario.

## Variables de Vercel

El proyecto ya reutiliza las variables de Supabase y TMDB existentes. Según la
configuración actual de Cinerian, solo hay que agregar estas dos variables en
`Production`:

```text
ONESIGNAL_REST_API_KEY=<onesignal-app-api-key>
CRON_SECRET=<random-string-of-at-least-16-characters>
```

Ya están cubiertas: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` y `VITE_TMDB_API_KEY`. El App ID de OneSignal usa
el valor integrado de Cinerian. `PUBLIC_APP_URL` también tiene como valor por
defecto `https://www.cinerian.app`.

`ONESIGNAL_REST_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` son
secretos de servidor: nunca deben llevar el prefijo `VITE_` ni guardarse en
`.env` versionado. El App API Key de OneSignal se obtiene en `Settings > Keys &
IDs`. Para generar `CRON_SECRET`, usar `openssl rand -base64 32`. Para un
Preview, usar otro proyecto de OneSignal y Supabase o no cargar estas variables:
así una prueba no envía pushes reales.

## Cron diario

[frontend/vercel.json](../frontend/vercel.json) ejecuta `GET /api/push/cron`
todos los días a las `13:00 UTC` (10:00 en Argentina). Vercel protege la
invocación con `Authorization: Bearer $CRON_SECRET`.

En Vercel Hobby el cron es diario y puede ejecutarse durante la hora elegida;
los avisos de series, ranking e inactividad son deliberadamente resúmenes
diarios. Los mensajes de Inbox no esperan al cron.

## Prueba de punta a punta

1. Activar las notificaciones desde el perfil en un dispositivo suscripto a
   OneSignal.
2. Enviar una recomendación o respuesta desde otra cuenta: el receptor debe
   recibir el push y abrir `/?view=inbox`.
3. Después del primer cron, modificar una reacción de una cuenta seguida o
   esperar una actualización de TMDB para probar el resumen diario.
4. Revisar `Settings > Cron Jobs` y los Function Logs en Vercel si una corrida
   devuelve error.
