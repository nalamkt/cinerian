import { useEffect, useState } from "react";
import { listProfiles, type Profile } from "../lib/auth";
import { fetchFollowingUserIds } from "../lib/follows";
import { MutualDiscovery } from "./MutualDiscovery";

type MutualPanelProps = {
  userId: string;
  active: boolean;
  onCompare: (profile: { userId: string; username: string }) => void;
};

export function MutualPanel({ userId, active, onCompare }: MutualPanelProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [followingUserIds, setFollowingUserIds] = useState<string[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || hasLoaded) return;
    let isCurrent = true;

    void Promise.allSettled([listProfiles(), fetchFollowingUserIds(userId)]).then(([people, following]) => {
      if (!isCurrent) return;
      if (people.status === "fulfilled") {
        setProfiles(people.value);
        setError(null);
      } else {
        setError("No pudimos cargar las personas para comparar. Probá de nuevo.");
      }
      if (following.status === "fulfilled") setFollowingUserIds(following.value);
      setHasLoaded(true);
    });

    return () => { isCurrent = false; };
  }, [active, hasLoaded, userId]);

  return (
    <div className="mutual-panel">
      {!hasLoaded ? <p className="inline-status" role="status">Cargando personas...</p> : null}
      {error ? <div className="app-alert" role="alert">{error} <button type="button" onClick={() => setHasLoaded(false)}>Reintentar</button></div> : null}
      {hasLoaded && !error ? (
        <MutualDiscovery userId={userId} profiles={profiles} followingUserIds={followingUserIds} onCompare={onCompare} alwaysOpen />
      ) : null}
    </div>
  );
}
