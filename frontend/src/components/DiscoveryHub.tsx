import { useState } from "react";
import { DiscoverySurface } from "./DiscoverySurface";
import { RecommendationPanel } from "./RecommendationPanel";
import { SearchPanel } from "./SearchPanel";

type DiscoveryHubProps = {
  userId: string;
  canSearch: boolean;
  canDiscover: boolean;
  onOpenUserProfile: (profile: { userId: string; username?: string }) => void;
};

export function DiscoveryHub({ userId, canSearch, canDiscover, onOpenUserProfile }: DiscoveryHubProps) {
  const [query, setQuery] = useState("");
  const [isBrowsing, setIsBrowsing] = useState(false);
  const showingSearch = Boolean(query.trim()) || isBrowsing || !canDiscover;

  return (
    <DiscoverySurface
      search={canSearch ? (
        <SearchPanel
          userId={userId}
          query={query}
          onQueryChange={(value) => {
            setQuery(value);
            if (value.trim()) setIsBrowsing(false);
          }}
          isBrowsing={isBrowsing || !canDiscover}
          canDiscover={canDiscover}
          onToggleBrowse={() => setIsBrowsing((current) => !current)}
          onOpenUserProfile={onOpenUserProfile}
        />
      ) : null}
      deck={canDiscover ? (
        <RecommendationPanel userId={userId} onOpenUserProfile={onOpenUserProfile} />
      ) : null}
      showDeck={!showingSearch}
    />
  );
}
