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

export type FeedEntry = {
  id: string;
  author: string;
  body: string;
  createdAtLabel: string;
  type: "rating" | "recommendation" | "watchlist";
};

export type UserTaste = {
  likes: number;
  watched: number;
  ratings: number;
};
