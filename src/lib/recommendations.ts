import { Album } from "./albums";

export type AlbumRating = {
  albumId: string;
  rating: number;
  genres: string[];
};

function shuffleAlbums(albums: Album[]) {
  const shuffled = [...albums];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function getAlbumRecommendations(
  catalog: Album[],
  ratings: AlbumRating[],
  excludedAlbumIds: Set<string>,
  limit = 6,
) {
  const eligibleRatings = ratings.filter(
    (review) => Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5,
  );
  const candidates = catalog.filter((album) => !excludedAlbumIds.has(album.id));

  if (eligibleRatings.length === 0) {
    return shuffleAlbums(candidates).slice(0, limit);
  }

  const genreRatings = new Map<string, { total: number; count: number }>();

  for (const review of eligibleRatings) {
    for (const genre of review.genres) {
      const current = genreRatings.get(genre) ?? { total: 0, count: 0 };
      current.total += review.rating;
      current.count += 1;
      genreRatings.set(genre, current);
    }
  }

  return candidates
    .map((album) => {
      const matchingPreferences = album.genres
        .map((genre) => genreRatings.get(genre))
        .filter((preference): preference is { total: number; count: number } => !!preference);
      const genrePreference = matchingPreferences.length
        ? matchingPreferences.reduce(
          (total, preference) => total + preference.total / preference.count,
          0,
        ) / matchingPreferences.length
        : 3;
      const score = album.userScore + (genrePreference - 3) * 2.5;

      return { album, score };
    })
    .sort((first, second) =>
      second.score - first.score || second.album.ratingCount - first.album.ratingCount,
    )
    .slice(0, limit)
    .map(({ album }) => album);
}
