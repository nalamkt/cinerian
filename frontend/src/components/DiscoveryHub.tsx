import { DiscoverySurface } from "./DiscoverySurface";
import { RecommendationPanel } from "./RecommendationPanel";
import { SearchPanel } from "./SearchPanel";

type DiscoveryHubProps = {
  userId: string;
  canSearch: boolean;
  canDiscover: boolean;
  active: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  isBrowsing: boolean;
  onToggleBrowse: () => void;
  isGlobalSearchOpen: boolean;
  onOpenUserProfile: (profile: { userId: string; username?: string }) => void;
};

export function DiscoveryHub({ userId, canSearch, canDiscover, active, query, onQueryChange, isBrowsing, onToggleBrowse, isGlobalSearchOpen, onOpenUserProfile }: DiscoveryHubProps) {
  const showingSearch = Boolean(query.trim()) || isBrowsing || isGlobalSearchOpen || !canDiscover;

  return (
    <DiscoverySurface
      search={canSearch ? (
        <SearchPanel
          userId={userId}
          query={query}
          onQueryChange={onQueryChange}
          isBrowsing={isBrowsing || !canDiscover}
          canDiscover={canDiscover}
          onToggleBrowse={onToggleBrowse}
          showInput={false}
          showEmptyPrompt={isGlobalSearchOpen}
          showBrowseToggle={isGlobalSearchOpen || isBrowsing}
          onOpenUserProfile={onOpenUserProfile}
        />
      ) : null}
      deck={canDiscover ? (
        <RecommendationPanel key={userId} userId={userId} active={active && !showingSearch} onOpenUserProfile={onOpenUserProfile} />
      ) : null}
      showDeck={!showingSearch}
    />
  );
}
