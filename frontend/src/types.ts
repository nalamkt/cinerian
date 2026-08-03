export type MediaType = "movie" | "tv";

export type DiscoveryItem = {
  id: number;
  title: string;
  year: string;
  mediaType: MediaType;
  overview: string;
  posterUrl: string;
  genres: string[];
  providers: string[];
  score: number;
};

export type MediaDetails = {
  id: number;
  title: string;
  mediaType: MediaType;
  year: string;
  overview: string;
  posterUrl: string;
  backdropUrl: string | null;
  genres: string[];
  providers: string[];
  score: number;
  runtimeLabel: string | null;
  releaseLabel: string | null;
  countryLabel: string | null;
  languageLabel: string | null;
  certification: string | null;
  directorLabel: string | null;
  budgetLabel: string | null;
  trailerUrl: string | null;
  cast: Array<{
    id: number;
    name: string;
    character: string | null;
    profileUrl: string | null;
  }>;
};

export type FeedEntry = {
  id: string;
  author: string;
  username?: string;
  userId?: string;
  body: string;
  createdAtLabel: string;
  createdAt?: string;
  type: "rating" | "recommendation" | "watchlist";
  tmdbId?: number;
  mediaType?: MediaType;
};

export type UserTaste = {
  likes: number;
  watched: number;
  ratings: number;
};
