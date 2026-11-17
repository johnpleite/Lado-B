import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export type Album = {
  id: string;
  title: string;
  artist: string;
  releaseDate: string;
  genres: string[];
  userScore: number;
  ratingCount: number;
  albumLink: string;
};

function albumDocumentData(album: Album) {
  return {
    title: album.title,
    artist: album.artist,
    releaseDate: album.releaseDate,
    genres: album.genres,
    datasetScore: album.userScore,
    datasetRatingCount: album.ratingCount,
    sourceUrl: album.albumLink,
  };
}

export async function saveAlbumRating(
  userId: string,
  album: Album,
  rating: number,
  comment: string,
) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new RangeError("A avaliação deve ser de 1 a 5 estrelas.");
  }

  const albumRef = doc(db, "albuns", album.id);
  const reviewRef = doc(collection(albumRef, "avaliacoes"), userId);
  const userReviewRef = doc(db, "usuarios", userId, "avaliacoes", album.id);

  await runTransaction(db, async (transaction) => {
    const [albumSnapshot, reviewSnapshot] = await Promise.all([
      transaction.get(albumRef),
      transaction.get(reviewRef),
    ]);
    const previousCreatedAt = reviewSnapshot.data()?.createdAt;
    const review = {
      userId,
      albumId: album.id,
      rating,
      comment: comment.trim(),
      genres: album.genres,
      createdAt: previousCreatedAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (!albumSnapshot.exists()) {
      transaction.set(albumRef, {
        ...albumDocumentData(album),
        createdAt: serverTimestamp(),
      });
    }

    transaction.set(reviewRef, review);
    transaction.set(userReviewRef, review);
  });
}

export async function saveAlbumToPlaylist(
  userId: string,
  playlistId: string,
  album: Album,
) {
  const albumRef = doc(db, "albuns", album.id);
  const playlistRef = doc(db, "usuarios", userId, "playlists", playlistId);

  await runTransaction(db, async (transaction) => {
    const [albumSnapshot, playlistSnapshot] = await Promise.all([
      transaction.get(albumRef),
      transaction.get(playlistRef),
    ]);

    if (!playlistSnapshot.exists()) {
      throw new Error("A playlist selecionada não foi encontrada.");
    }

    if (!albumSnapshot.exists()) {
      transaction.set(albumRef, {
        ...albumDocumentData(album),
        createdAt: serverTimestamp(),
      });
    }

    transaction.update(playlistRef, {
      albumIds: arrayUnion(album.id),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function createPlaylistWithAlbum(
  userId: string,
  name: string,
  album: Album,
) {
  const playlistRef = doc(collection(db, "usuarios", userId, "playlists"));
  const albumRef = doc(db, "albuns", album.id);

  await runTransaction(db, async (transaction) => {
    const albumSnapshot = await transaction.get(albumRef);

    if (!albumSnapshot.exists()) {
      transaction.set(albumRef, {
        ...albumDocumentData(album),
        createdAt: serverTimestamp(),
      });
    }

    transaction.set(playlistRef, {
      name: name.trim(),
      albumIds: [album.id],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return playlistRef.id;
}

export async function createPlaylist(userId: string, name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error("O nome da playlist não pode ficar vazio.");
  }

  const playlistRef = doc(collection(db, "usuarios", userId, "playlists"));
  await setDoc(playlistRef, {
    name: normalizedName,
    albumIds: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return playlistRef.id;
}

export async function updatePlaylist(
  userId: string,
  playlistId: string,
  name: string,
  description: string,
) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error("O nome da playlist não pode ficar vazio.");
  }

  await updateDoc(doc(db, "usuarios", userId, "playlists", playlistId), {
    name: normalizedName,
    description: description.trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function deletePlaylist(userId: string, playlistId: string) {
  await deleteDoc(doc(db, "usuarios", userId, "playlists", playlistId));
}

export async function removeAlbumFromPlaylist(
  userId: string,
  playlistId: string,
  albumId: string,
) {
  await updateDoc(doc(db, "usuarios", userId, "playlists", playlistId), {
    albumIds: arrayRemove(albumId),
    updatedAt: serverTimestamp(),
  });
}
