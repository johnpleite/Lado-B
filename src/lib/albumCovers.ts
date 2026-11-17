import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { Platform } from "react-native";
import { cacheAlbumCover, getCachedAlbumCover } from "./albumCoverCache";
import { Album } from "./albums";
import { db } from "./firebase";

type MusicBrainzRelease = {
  id?: unknown;
  title?: unknown;
  "artist-credit"?: unknown;
  score?: unknown;
};

type MusicBrainzSearch = { releases?: MusicBrainzRelease[] };
type CoverArtImage = {
  front?: unknown;
  image?: unknown;
  thumbnails?: Record<string, unknown>;
};
type CoverArtResponse = { images?: CoverArtImage[] };

const inFlightLookups = new Map<string, Promise<string | null>>();
const userAgent = "LadoB/1.0 (https://github.com/johnpleite/Lado-B)";
const TRANSIENT_LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
let musicBrainzQueue: Promise<void> = Promise.resolve();
let lastMusicBrainzRequestAt = 0;

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function getRetryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get("Retry-After");
  const parsedSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  const parsedDate = retryAfter ? Date.parse(retryAfter) : Number.NaN;
  const retryAfterMs = Number.isFinite(parsedSeconds)
    ? parsedSeconds * 1000
    : Number.isFinite(parsedDate)
      ? Math.max(0, parsedDate - Date.now())
      : 0;

  return Math.min(15000, Math.max(retryAfterMs, 1000 * 2 ** attempt));
}

async function fetchMusicBrainz(url: string, headers: Record<string, string>) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await runMusicBrainzRequest(() => fetchWithTimeout(url, { headers }));
    const shouldRetry = response.status === 429 || response.status >= 500;
    if (!shouldRetry || attempt >= 2) return response;

    await new Promise((resolve) => setTimeout(resolve, getRetryDelay(response, attempt)));
  }
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isValidCoverArtUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "coverartarchive.org" || url.hostname === "archive.org");
  } catch {
    return false;
  }
}

function getArtistCredit(credit: unknown) {
  if (!Array.isArray(credit)) return "";

  return credit.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    if ("name" in item && typeof item.name === "string") return [item.name];
    if ("artist" in item && item.artist && typeof item.artist === "object" && "name" in item.artist) {
      return typeof item.artist.name === "string" ? [item.artist.name] : [];
    }
    return [];
  }).join(" ");
}

function runMusicBrainzRequest<T>(request: () => Promise<T>) {
  const result = musicBrainzQueue.then(async () => {
    const delay = Math.max(0, 1000 - (Date.now() - lastMusicBrainzRequestAt));
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

    lastMusicBrainzRequestAt = Date.now();
    return request();
  });

  musicBrainzQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function findMusicBrainzRelease(album: Album) {
  const release = album.title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const artist = album.artist.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const query = `release:"${release}" AND artist:"${artist}"`;
  const url = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json&limit=10`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (Platform.OS !== "web") headers["User-Agent"] = userAgent;

  const response = await fetchMusicBrainz(url, headers);
  if (!response.ok) {
    throw new Error(`MusicBrainz returned HTTP ${response.status}.`);
  }

  const result = await response.json() as MusicBrainzSearch;
  const normalizedTitle = normalizeText(album.title);
  const normalizedArtist = normalizeText(album.artist);
  const matches = (result.releases ?? []).filter((candidate) =>
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    normalizeText(candidate.title) === normalizedTitle &&
    normalizeText(getArtistCredit(candidate["artist-credit"])) === normalizedArtist,
  );

  matches.sort((first, second) =>
    (typeof second.score === "number" ? second.score : 0) -
    (typeof first.score === "number" ? first.score : 0),
  );

  return typeof matches[0]?.id === "string" ? matches[0].id : null;
}

async function findCoverArt(releaseId: string) {
  const response = await fetchWithTimeout(
    `https://coverartarchive.org/release/${encodeURIComponent(releaseId)}`,
    { headers: { Accept: "application/json" } },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Cover Art Archive returned HTTP ${response.status}.`);
  }

  const result = await response.json() as CoverArtResponse;
  const frontImage = result.images?.find((image) => image.front === true) ?? result.images?.[0];
  const imageUrl = frontImage?.thumbnails?.["500"] ?? frontImage?.thumbnails?.["250"] ?? frontImage?.image;
  if (typeof imageUrl !== "string") return null;

  const secureImageUrl = imageUrl.replace(/^http:\/\//i, "https://");
  return isValidCoverArtUrl(secureImageUrl) ? secureImageUrl : null;
}

async function searchCoverArt(album: Album) {
  const releaseId = await findMusicBrainzRelease(album);
  return releaseId ? findCoverArt(releaseId) : null;
}

async function persistCoverArtUrl(album: Album, coverArtUrl: string) {
  const albumRef = doc(db, "albuns", album.id);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(albumRef);
    const existingUrl = snapshot.data()?.coverArtUrl;
    if (isValidCoverArtUrl(existingUrl)) return existingUrl;

    if (snapshot.exists()) {
      transaction.update(albumRef, { coverArtUrl });
    } else {
      transaction.set(albumRef, {
        title: album.title,
        artist: album.artist,
        releaseDate: album.releaseDate,
        genres: album.genres,
        datasetScore: album.userScore,
        datasetRatingCount: album.ratingCount,
        sourceUrl: album.albumLink,
        coverArtUrl,
        createdAt: serverTimestamp(),
      });
    }

    return coverArtUrl;
  });
}

async function resolveAlbumCover(album: Album): Promise<string | null> {
  const cachedCover = await getCachedAlbumCover(album.id);
  if (cachedCover !== undefined) {
    if (Platform.OS !== "web" && cachedCover.coverArtUrl && !cachedCover.uri) {
      return cacheAlbumCover(album.id, cachedCover.coverArtUrl);
    }
    return cachedCover.uri ?? cachedCover.coverArtUrl;
  }

  let coverArtUrl: string | null = null;
  let albumSnapshot;
  try {
    albumSnapshot = await getDoc(doc(db, "albuns", album.id));
    const storedUrl = albumSnapshot.data()?.coverArtUrl;
    if (isValidCoverArtUrl(storedUrl)) coverArtUrl = storedUrl;
  } catch (error) {
    console.warn(`Could not read cached cover art from Firestore for album ${album.id}.`, error);
  }

  if (!coverArtUrl) {
    try {
      coverArtUrl = await searchCoverArt(album);
    } catch (error) {
      console.warn(`Album cover lookup is temporarily unavailable for ${album.id}.`, error);
      return cacheAlbumCover(album.id, null, TRANSIENT_LOOKUP_CACHE_TTL_MS);
    }

    if (coverArtUrl) {
      try {
        coverArtUrl = await persistCoverArtUrl(album, coverArtUrl);
      } catch (error) {
        console.warn(`Could not save cover art URL to Firestore for album ${album.id}.`, error);
      }
    }
  }

  return cacheAlbumCover(album.id, coverArtUrl);
}

export function getAlbumCover(album: Album) {
  const existingLookup = inFlightLookups.get(album.id);
  if (existingLookup) return existingLookup;

  const lookup = resolveAlbumCover(album).finally(() => {
    inFlightLookups.delete(album.id);
  });
  inFlightLookups.set(album.id, lookup);
  return lookup;
}
