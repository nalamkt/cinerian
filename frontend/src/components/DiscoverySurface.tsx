import type { ReactNode } from "react";

type DiscoverySurfaceProps = {
  search: ReactNode;
  deck?: ReactNode;
  showDeck: boolean;
};

export function DiscoverySurface({ search, deck, showDeck }: DiscoverySurfaceProps) {
  return (
    <div className="discover-hub">
      {search}
      {deck != null ? <div className="discover-hub__deck" hidden={!showDeck}>{deck}</div> : null}
    </div>
  );
}
