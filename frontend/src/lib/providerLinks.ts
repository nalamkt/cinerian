function buildQuery(title: string) {
  return encodeURIComponent(title);
}

export function getProviderSearchUrl(provider: string, title: string) {
  const query = buildQuery(title);

  const mappings: Array<{ match: RegExp; build: () => string }> = [
    {
      match: /disney\+/i,
      build: () => `https://www.disneyplus.com/search?q=${query}`
    },
    {
      match: /netflix/i,
      build: () => `https://www.netflix.com/search?q=${query}`
    },
    {
      match: /prime video|amazon prime video|prime/i,
      build: () => `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${query}`
    },
    {
      match: /\bmax\b|hbo max/i,
      build: () => `https://play.max.com/search?q=${query}`
    },
    {
      match: /mubi/i,
      build: () => `https://mubi.com/es/search?query=${query}`
    },
    {
      match: /apple tv/i,
      build: () => `https://tv.apple.com/search?term=${query}`
    },
    {
      match: /paramount\+/i,
      build: () => `https://www.paramountplus.com/search/?term=${query}`
    },
    {
      match: /hulu/i,
      build: () => `https://www.hulu.com/search?q=${query}`
    }
  ];

  const match = mappings.find((mapping) => mapping.match.test(provider));
  if (match) {
    return match.build();
  }

  return `https://www.google.com/search?q=${encodeURIComponent(`${provider} ${title}`)}`;
}
