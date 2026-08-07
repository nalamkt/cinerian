# React + Supabase migration

Fecha: 2026-08-03

## Que se creo

- Nueva app en `frontend/`
- Base React + Vite + TypeScript
- Cliente Supabase preparado en `frontend/src/lib/supabase.ts`
- Auth real con Supabase en `frontend/src/lib/auth.ts`
- Hook de sesion en `frontend/src/hooks/useAuth.ts`
- Busqueda con TMDB opcional por `VITE_TMDB_API_KEY`
- Modo demo para seguir trabajando aunque todavia no haya backend configurado
- Schema inicial de Supabase en `supabase/schema.sql`

## Por que este enfoque

La app original sigue viva como referencia visual y funcional, pero la nueva arquitectura ya concentra:

- buscador,
- feed,
- recomendaciones,
- autenticacion,
- estado compartido,
- variables de entorno,
- integraciones desacopladas.

## Legacy

La app HTML/CSS/JS original fue movida a `legacy/classic-web/` para limpiar la raiz del repo sin perder referencia historica.

## Como correr la nueva app

1. Ir a `frontend/`
2. Copiar `.env.example` a `.env`
3. Completar:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_TMDB_API_KEY`
4. Instalar dependencias
5. Levantar con `pnpm dev`

### Setup rapido para quien clona el repo

```bash
cd frontend
cp .env.example .env
pnpm install
pnpm dev
```

Despues de copiar el archivo, hay que pedirle al equipo estos valores:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_TMDB_API_KEY`

Importante:

- `frontend/.env` queda local y no se sube al repo
- `frontend/.env.example` si se versiona para que cualquiera vea que variables necesita

## Proximo paso recomendado

El paso 3 ideal es conectar el feed y las reacciones reales, porque Auth y perfiles ya quedan listos con esta base:

- ratings reales,
- feed persistido,
- watchlist,
- follow system,
- onboarding de gustos.
