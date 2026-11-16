import type { WatchOptions } from "../lib/tmdb";

export function DiscoverWatchOptions({ options }: { options: WatchOptions }) {
  if (!options.flatrate.length && !options.hasRentOrBuy) return null;
  return <div className="discover-watch">
    <p className="discover-watch__label">
      <span className="discover-watch__label-inline">Ver en</span>
      <span className="discover-watch__label-stacked">Dónde verla</span>
    </p>
    <div className="discover-watch__row">
      {options.flatrate.map((provider) => <a key={provider.id} className="discover-platform"
        href={provider.url} target="_blank" rel="noreferrer" title={`Buscar en ${provider.name}`}>
        {provider.logoUrl ? <img src={provider.logoUrl} alt="" className="discover-platform__logo" /> : null}
        <span className="discover-platform__name">{provider.name}</span>
      </a>)}
      {options.hasRentOrBuy && options.link ? <a className="discover-platform discover-platform--rent"
        href={options.link} target="_blank" rel="noreferrer">Alquilar</a> : null}
    </div>
  </div>;
}
