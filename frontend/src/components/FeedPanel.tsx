import { demoFeed } from "../data/demoData";
import { SectionHeader } from "./SectionHeader";

export function FeedPanel() {
  return (
    <section className="panel">
      <SectionHeader
        eyebrow="Feed"
        title="Actividad social lista para persistir"
        description="Todavia esta en modo demo, pero la estructura ya refleja rating, recomendacion y watchlist."
      />

      <div className="feed-list">
        {demoFeed.map((entry) => (
          <article className="feed-card" key={entry.id}>
            <div className="feed-topline">
              <strong>{entry.author}</strong>
              <span>{entry.createdAtLabel}</span>
            </div>
            <p>{entry.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
