import { useEffect, useState } from "react";
import type { AppView, ProductFeature } from "../lib/access";
import { fetchPublicAppConfiguration } from "../lib/admin";

export function usePublicFeatureFlags() {
  const [enabledFeatures, setEnabledFeatures] = useState<ProductFeature[] | null>(null);
  const [defaultView, setDefaultView] = useState<AppView>("feed");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadFlags() {
      try {
        const nextConfiguration = await fetchPublicAppConfiguration();
        if (isMounted) {
          setEnabledFeatures(nextConfiguration.enabledFeatures);
          setDefaultView(nextConfiguration.defaultView);
        }
      } catch {
        if (isMounted) {
          setEnabledFeatures(null);
          setDefaultView("feed");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
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
    defaultView,
    isLoading,
    refreshEnabledFeatures: async () => {
      const nextConfiguration = await fetchPublicAppConfiguration();
      setEnabledFeatures(nextConfiguration.enabledFeatures);
      setDefaultView(nextConfiguration.defaultView);
      return nextConfiguration.enabledFeatures;
    }
  };
}
