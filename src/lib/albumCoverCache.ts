import AsyncStorage from "@react-native-async-storage/async-storage";
import { CachedAlbumCover } from "./albumCoverCache.types";

type CacheEntry = {
  albumId: string;
  coverArtUrl: string | null;
  accessedAt: number;
  negativeExpiresAt?: number;
};

const CACHE_KEY = "lado-b.album-cover-cache.v1";
const MAX_CACHE_ENTRIES = 50;
const NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cacheQueue: Promise<void> = Promise.resolve();

function withCacheLock<T>(operation: () => Promise<T>) {
  const result = cacheQueue.then(operation, operation);
  cacheQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function readEntries(): Promise<CacheEntry[]> {
  const savedEntries = await AsyncStorage.getItem(CACHE_KEY);
  if (!savedEntries) return [];

  try {
    const parsed: unknown = JSON.parse(savedEntries);
    if (!Array.isArray(parsed)) throw new TypeError("Album cover cache must be an array.");

    return parsed.filter((entry): entry is CacheEntry =>
      !!entry &&
      typeof entry === "object" &&
      "albumId" in entry &&
      typeof entry.albumId === "string" &&
      "coverArtUrl" in entry &&
      (typeof entry.coverArtUrl === "string" || entry.coverArtUrl === null) &&
      "accessedAt" in entry &&
      typeof entry.accessedAt === "number" &&
      (!("negativeExpiresAt" in entry) || typeof entry.negativeExpiresAt === "number"),
    );
  } catch (error) {
    console.warn("Ignoring invalid album cover cache metadata.", error);
    return [];
  }
}

async function writeEntries(entries: CacheEntry[]) {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entries.slice(0, MAX_CACHE_ENTRIES)));
}

export function getCachedAlbumCover(albumId: string): Promise<CachedAlbumCover | undefined> {
  return withCacheLock(async () => {
    const entries = await readEntries();
    const entry = entries.find((candidate) => candidate.albumId === albumId);
    if (!entry) return undefined;

    const negativeExpiresAt = entry.negativeExpiresAt ?? entry.accessedAt + NEGATIVE_CACHE_TTL_MS;
    if (!entry.coverArtUrl && Date.now() >= negativeExpiresAt) {
      await writeEntries(entries.filter((candidate) => candidate.albumId !== albumId));
      return undefined;
    }

    await writeEntries([
      {
        ...entry,
        accessedAt: Date.now(),
        ...(!entry.coverArtUrl ? { negativeExpiresAt } : {}),
      },
      ...entries.filter((candidate) => candidate.albumId !== albumId),
    ]);

    return { coverArtUrl: entry.coverArtUrl };
  });
}

export function cacheAlbumCover(
  albumId: string,
  coverArtUrl: string | null,
  negativeCacheTtlMs = NEGATIVE_CACHE_TTL_MS,
): Promise<string | null> {
  return withCacheLock(async () => {
    const entries = await readEntries();
    const accessedAt = Date.now();
    await writeEntries([
      {
        albumId,
        coverArtUrl,
        accessedAt,
        ...(!coverArtUrl ? { negativeExpiresAt: accessedAt + negativeCacheTtlMs } : {}),
      },
      ...entries.filter((entry) => entry.albumId !== albumId),
    ]);
    return coverArtUrl;
  });
}
