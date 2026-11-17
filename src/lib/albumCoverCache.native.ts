import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { CachedAlbumCover } from "./albumCoverCache.types";

type CacheEntry = {
  albumId: string;
  coverArtUrl: string | null;
  uri?: string;
  size: number;
  accessedAt: number;
  negativeExpiresAt?: number;
};

const CACHE_KEY = "lado-b.album-cover-cache.v1";
const MAX_CACHE_ENTRIES = 50;
const MAX_CACHE_BYTES = 20 * 1024 * 1024;
const NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cacheDirectory = new Directory(Paths.cache, "album-covers");
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
      "size" in entry &&
      typeof entry.size === "number" &&
      "accessedAt" in entry &&
      typeof entry.accessedAt === "number" &&
      (!("negativeExpiresAt" in entry) || typeof entry.negativeExpiresAt === "number") &&
      (!("uri" in entry) || typeof entry.uri === "string"),
    );
  } catch (error) {
    console.warn("Ignoring invalid album cover cache metadata.", error);
    return [];
  }
}

async function writeEntries(entries: CacheEntry[]) {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entries));
}

function cacheFileName(albumId: string) {
  const safeId = albumId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeId}.jpg`;
}

async function evictUnneededFiles(entries: CacheEntry[], keptEntries: CacheEntry[]) {
  const keptUris = new Set(keptEntries.map((entry) => entry.uri).filter(Boolean));
  const cacheRoot = `${cacheDirectory.uri.replace(/\/$/, "")}/`;

  for (const entry of entries) {
    if (!entry.uri || keptUris.has(entry.uri) || !entry.uri.startsWith(cacheRoot)) continue;

    const file = new File(entry.uri);
    if (file.exists) file.delete();
  }

  if (cacheDirectory.exists) {
    for (const file of cacheDirectory.list()) {
      if (file instanceof File && !keptUris.has(file.uri)) file.delete();
    }
  }
}

async function storeEntries(entries: CacheEntry[]) {
  const newestFirst = [...entries].sort((first, second) => second.accessedAt - first.accessedAt);
  const retained: CacheEntry[] = [];
  let retainedBytes = 0;

  for (const entry of newestFirst) {
    if (retained.length >= MAX_CACHE_ENTRIES) continue;
    if (entry.size > 0 && retainedBytes + entry.size > MAX_CACHE_BYTES) continue;

    retained.push(entry);
    retainedBytes += entry.size;
  }

  await evictUnneededFiles(entries, retained);
  await writeEntries(retained);
}

export function getCachedAlbumCover(albumId: string): Promise<CachedAlbumCover | undefined> {
  return withCacheLock(async () => {
    const entries = await readEntries();
    const entry = entries.find((candidate) => candidate.albumId === albumId);
    if (!entry) return undefined;

    const negativeExpiresAt = entry.negativeExpiresAt ?? entry.accessedAt + NEGATIVE_CACHE_TTL_MS;
    if (!entry.coverArtUrl && Date.now() >= negativeExpiresAt) {
      await storeEntries(entries.filter((candidate) => candidate.albumId !== albumId));
      return undefined;
    }

    let uri = entry.uri;
    if (uri && !new File(uri).exists) uri = undefined;

    const touchedEntry: CacheEntry = {
      ...entry,
      uri,
      accessedAt: Date.now(),
      ...(!entry.coverArtUrl ? { negativeExpiresAt } : {}),
    };
    await storeEntries([
      touchedEntry,
      ...entries.filter((candidate) => candidate.albumId !== albumId),
    ]);

    return {
      coverArtUrl: entry.coverArtUrl,
      ...(uri ? { uri } : {}),
    };
  });
}

export function cacheAlbumCover(
  albumId: string,
  coverArtUrl: string | null,
  negativeCacheTtlMs = NEGATIVE_CACHE_TTL_MS,
): Promise<string | null> {
  return withCacheLock(async () => {
    const entries = await readEntries();
    const existingEntries = entries.filter((entry) => entry.albumId !== albumId);

    if (!coverArtUrl) {
      await storeEntries([
        {
          albumId,
          coverArtUrl: null,
          size: 0,
          accessedAt: Date.now(),
          negativeExpiresAt: Date.now() + negativeCacheTtlMs,
        },
        ...existingEntries,
      ]);
      return null;
    }

    let uri: string | undefined;
    let size = 0;
    const destinationFile = new File(cacheDirectory, cacheFileName(albumId));

    try {
      cacheDirectory.create({ idempotent: true, intermediates: true });
      const file = await File.downloadFileAsync(
        coverArtUrl,
        destinationFile,
        { idempotent: true },
      );
      size = file.size ?? 0;
      if (size > 0 && size <= MAX_CACHE_BYTES) {
        uri = file.uri;
      } else if (file.exists) {
        file.delete();
        size = 0;
      }
    } catch (error) {
      console.warn(`Could not cache cover art for album ${albumId}.`, error);
      if (destinationFile.exists) destinationFile.delete();
    }

    await storeEntries([
      { albumId, coverArtUrl, ...(uri ? { uri } : {}), size, accessedAt: Date.now() },
      ...existingEntries,
    ]);
    return uri ?? coverArtUrl;
  });
}
