export type ContentCategory = 'Movies' | 'Series' | 'Anime' | 'Animation' | 'Asian Drama' | 'Asian' | 'Indian';

export interface QualityVersion {
  id: string;
  name: string;
  link: string;
  size?: string;
  sub?: boolean;
}

export interface QualityConfig {
  enabled: boolean;
  versions: QualityVersion[];
}

export interface SeasonInfo {
  id: string;
  seasonNumber: number;
  name: string;
  qualities: Record<string, QualityConfig>;
}

export interface ActorInfo {
  name: string;
  photoUrl?: string;
}

export interface StudioInfo {
  name: string;
  logoUrl?: string;
}

export interface ContentItem {
  id: string;
  title: string;
  originalTitle?: string;
  year: number;
  releaseDate?: string;
  status?: string;
  rating: number;
  duration?: string;
  episodes?: number;
  seasons?: number;
  seasonData?: SeasonInfo[];
  category: ContentCategory;
  genres: string[];
  keywords?: string[];
  franchise?: string;
  franchiseName?: string;
  franchiseDescription?: string;
  network?: string;
  studio?: string;
  networks?: any[];
  name?: string;
  description: string;
  posterUrl: string;
  backdropUrl: string;
  director?: string;
  directorPhotoUrl?: string;
  maleActors?: string[];
  femaleActors?: string[];
  cast?: string;
  actorsData?: ActorInfo[];
  studiosData?: StudioInfo[];
  language?: string;
  format?: 'movie' | 'series';
  votes?: string;
  awardsWon?: number;
  nominations?: number;
  qualities?: Record<string, QualityConfig>;
  links?: Record<string, string>; // Legacy mappings
  trailerUrl?: string;
}
