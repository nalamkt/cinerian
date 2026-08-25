import { useEffect, useState } from "react";
import type { ProductFeature } from "../lib/access";
import { fetchPublicFeatureFlags } from "../lib/admin";

export function usePublicFeatureFlags() {
  const [enabledFeatures, setEnabledFeatures] = useState<ProductFeature[] | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadFlags() {
      try {
        const nextFlags = await fetchPublicFeatureFlags();
        if (isMounted) {
          setEnabledFeatures(nextFlags);
        }
      } catch {
        if (isMounted) {
          setEnabledFeatures(null);
        }
      }
    }

    void loadFlags();
    return () => {
      isMounted = false;
    };
  }, []);

  return {
    enabledFeatures,
    refreshEnabledFeatures: async () => {
      const nextFlags = await fetchPublicFeatureFlags();
      setEnabledFeatures(nextFlags);
      return nextFlags;
    }
  };
}
