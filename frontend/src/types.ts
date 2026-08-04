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
  creators: Array<{
    id: number;
    name: string;
    roleLabel: string | null;
    profileUrl: string | null;
  }>;
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

export type FeedComment = {
  id: string;
  postId: string;
  userId: string;
  author: string;
  username?: string;
  body: string;
  createdAtLabel: string;
  createdAt?: string;
};

export type UserTaste = {
  likes: number;
  watched: number;
  ratings: number;
};

export type RecommendationMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  readAt?: string | null;
  replies?: RecommendationReply[];
  senderProfile: {
    id: string;
    username: string;
    display_name: string;
  } | null;
  recipientProfile: {
    id: string;
    username: string;
    display_name: string;
  } | null;
  note: string;
  createdAt: string;
  createdAtLabel: string;
  item: DiscoveryItem;
};

export type RecommendationReply = {
  id: string;
  messageId: string;
  senderId: string;
  senderProfile: {
    id: string;
    username: string;
    display_name: string;
  } | null;
  body: string;
  createdAt: string;
  createdAtLabel: string;
};

export type CommentInboxNotification = {
  id: string;
  commentId: string;
  postId: string;
  actorId: string;
  recipientId: string;
  actorProfile: {
    id: string;
    username: string;
    display_name: string;
  } | null;
  body: string;
  createdAt: string;
  createdAtLabel: string;
  readAt?: string | null;
  postBody: string;
  postType: FeedEntry["type"];
  item: DiscoveryItem | null;
};

export type TalentSearchItem = {
  id: number;
  name: string;
  knownForDepartment: string;
  profileUrl: string | null;
  knownForTitles: string[];
};

export type TalentCredit = {
  id: number;
  title: string;
  year: string;
  mediaType: MediaType;
  posterUrl: string;
  roleLabel: string;
};

export type TalentDetails = {
  id: number;
  name: string;
  profileUrl: string | null;
  biography: string;
  knownForDepartment: string;
  birthday: string | null;
  placeOfBirth: string | null;
  actingCredits: TalentCredit[];
  directingCredits: TalentCredit[];
};
