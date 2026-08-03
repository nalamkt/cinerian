import { hasSupabaseEnv } from "../lib/supabase";

const milestones = [
  "Autenticacion con Supabase Auth",
  "Perfiles y usernames",
  "Ratings, likes y watchlist",
  "Feed social persistido",
  "Discovery con acciones guardadas"
];

export function ArchitecturePanel() {
  return (
    <aside className="panel architecture-panel">
      <p className="section-eyebrow">Infra</p>
      <h2>Estado de migracion</h2>

      <div className={`status-pill ${hasSupabaseEnv ? "online" : "offline"}`}>
        {hasSupabaseEnv ? "Supabase configurado" : "Supabase pendiente de credenciales"}
      </div>

      <ul className="milestone-list">
        {milestones.map((milestone) => (
          <li key={milestone}>{milestone}</li>
        ))}
      </ul>

      <div className="info-box">
        <strong>Modo actual</strong>
        <p>
          React ya corre con datos demo, TMDB opcional y Auth real listo para probar. Eso nos deja
          iterar producto sin volver a tocar HTML suelto.
        </p>
      </div>
    </aside>
  );
}
