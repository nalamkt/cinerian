import type { DiscoveryItem, FeedEntry } from "../types";

export const demoDiscovery: DiscoveryItem[] = [
  {
    id: 157336,
    title: "Interstellar",
    year: "2014",
    mediaType: "movie",
    overview:
      "Un viaje espacial enorme, emocional y visualmente brutal que mezcla ciencia, familia y supervivencia.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    genres: ["Sci-fi", "Drama"],
    providers: ["Max", "Prime Video"],
    score: 8.7
  },
  {
    id: 1399,
    title: "Game of Thrones",
    year: "2011",
    mediaType: "tv",
    overview:
      "Poder, alianzas, traiciones y fantasia epica en una serie que sigue siendo referencia cultural.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg",
    genres: ["Fantasia", "Drama"],
    providers: ["Max"],
    score: 8.4
  },
  {
    id: 136315,
    title: "The Bear",
    year: "2022",
    mediaType: "tv",
    overview:
      "Caos de cocina, ansiedad hermosa y personajes con muchisima humanidad.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/5TZnk9ryzfcNlsCOghURfZsBong.jpg",
    genres: ["Drama", "Comedia"],
    providers: ["Disney+"],
    score: 8.3
  },
  {
    id: 496243,
    title: "Parasite",
    year: "2019",
    mediaType: "movie",
    overview:
      "Thriller social filoso con humor negro, tension perfecta y un comentario de clase demoledor.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
    genres: ["Thriller", "Drama"],
    providers: ["Netflix"],
    score: 8.5
  }
];

export const demoFeed: FeedEntry[] = [
  {
    id: "feed-1",
    author: "Mica",
    body: "Le puso 5/5 a Interstellar y dijo que sigue siendo un golpe emocional cada vez que la ve.",
    createdAtLabel: "Hace 12 min",
    type: "rating"
  },
  {
    id: "feed-2",
    author: "Joaco",
    body: "Recomendo The Bear para quienes aman series tensas pero humanas.",
    createdAtLabel: "Hace 34 min",
    type: "recommendation"
  },
  {
    id: "feed-3",
    author: "Vos",
    body: "Todavia no registraste actividad en la nueva app. El proximo paso es conectar esto con Supabase.",
    createdAtLabel: "Ahora",
    type: "watchlist"
  }
];
