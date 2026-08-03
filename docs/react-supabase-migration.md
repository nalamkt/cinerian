# React + Supabase migration

Fecha: 2026-08-03

## Que se creo

- Nueva app en `frontend/`
- Base React + Vite + TypeScript
- Cliente Supabase preparado en `frontend/src/lib/supabase.ts`
- Busqueda con TMDB opcional por `VITE_TMDB_API_KEY`
- Modo demo para seguir trabajando aunque todavia no haya backend configurado
- Schema inicial de Supabase en `supabase/schema.sql`

## Por que este enfoque

La app original sigue viva como referencia visual y funcional, pero la nueva arquitectura ya concentra:

- buscador,
- feed,
- recomendaciones,
- estado compartido,
- variables de entorno,
- integraciones desacopladas.

## Como correr la nueva app

1. Ir a `frontend/`
2. Copiar `.env.example` a `.env`
3. Completar:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_TMDB_API_KEY`
4. Instalar dependencias
5. Levantar con `pnpm dev`

## Proximo paso recomendado

El paso 2 ideal es conectar Auth y perfiles de Supabase, porque eso desbloquea despues:

- ratings reales,
- feed persistido,
- watchlist,
- follow system,
- onboarding de gustos.
