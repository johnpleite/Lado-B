import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { StatusBar } from "expo-status-bar";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlbumCover } from "../../components/AlbumCover";
import albumCatalogData from "../../data/albums.json";
import {
  Album,
  createPlaylistWithAlbum,
  saveAlbumRating,
  saveAlbumToPlaylist,
} from "../../lib/albums";
import { auth, db } from "../../lib/firebase";
import { ColorPalette } from "../../theme/colors";
import { useTheme } from "../../theme/theme";

const albumCatalog = albumCatalogData as Album[];

type PlaylistOption = { id: string; name: string };

export default function AlbumDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const album = albumCatalog.find((item) => item.id === id);
  const [userId, setUserId] = useState("");
  const [description, setDescription] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSavingRating, setIsSavingRating] = useState(false);
  const [hasPendingRatingSave, setHasPendingRatingSave] = useState(false);
  const [ratingSaveStatus, setRatingSaveStatus] = useState("");
  const [isPlaylistPickerOpen, setIsPlaylistPickerOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [isSavingToPlaylist, setIsSavingToPlaylist] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const ratingSaveVersion = useRef(0);
  const ratingSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const { colors, mode } = useTheme();
  const styles = createStyles(colors);

  useEffect(() => {
    let isActive = true;
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (!nextUser) {
        router.replace("/");
        return;
      }

      if (!album) return;

      const authenticatedUser = nextUser;
      const selectedAlbum = album;
      setUserId(authenticatedUser.uid);

      async function loadAlbumDetails() {
        try {
          const [albumSnapshot, reviewSnapshot] = await Promise.all([
            getDoc(doc(db, "albuns", selectedAlbum.id)),
            getDoc(doc(db, "albuns", selectedAlbum.id, "avaliacoes", authenticatedUser.uid)),
          ]);
          if (!isActive) return;

          const albumData = albumSnapshot.data();
          setDescription(typeof albumData?.description === "string" ? albumData.description : "");

          const review = reviewSnapshot.data();
          if (typeof review?.rating === "number") setRating(review.rating);
          if (typeof review?.comment === "string") setComment(review.comment);
        } catch (loadError) {
          console.error("Failed to load album details.", loadError);
          if (isActive) setError("Não foi possível carregar os detalhes salvos do álbum.");
        }
      }

      void loadAlbumDetails();
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [album, router]);

  useEffect(() => {
    if (!hasPendingRatingSave || rating < 1 || !userId || !album) return;

    const saveVersion = ratingSaveVersion.current;
    const timeout = setTimeout(() => {
      setIsSavingRating(true);
      setRatingSaveStatus("Salvando avaliação...");
      setError("");

      const saveOperation = ratingSaveQueue.current.then(() =>
        saveAlbumRating(userId, album, rating, comment),
      );
      ratingSaveQueue.current = saveOperation.catch(() => undefined);

      void saveOperation.then(() => {
        if (ratingSaveVersion.current !== saveVersion) return;
        setHasPendingRatingSave(false);
        setRatingSaveStatus("Avaliação salva.");
      }).catch((saveError: unknown) => {
        console.error("Failed to save album rating.", saveError);
        if (ratingSaveVersion.current !== saveVersion) return;
        setRatingSaveStatus("Não foi possível salvar a avaliação. Tente novamente.");
        setError("Não foi possível salvar sua avaliação. Verifique a conexão e tente novamente.");
      }).finally(() => {
        if (ratingSaveVersion.current === saveVersion) setIsSavingRating(false);
      });
    }, 650);

    return () => clearTimeout(timeout);
  }, [album, comment, hasPendingRatingSave, rating, userId]);

  function selectRating(value: number) {
    ratingSaveVersion.current += 1;
    setRating(value);
    setHasPendingRatingSave(true);
    setRatingSaveStatus("A avaliação será salva automaticamente.");
    setError("");
  }

  function updateComment(value: string) {
    ratingSaveVersion.current += 1;
    setComment(value);
    if (rating > 0) {
      setHasPendingRatingSave(true);
      setRatingSaveStatus("A avaliação será salva automaticamente.");
      setError("");
    }
  }

  async function openPlaylistPicker() {
    if (!userId) return;

    setIsPlaylistPickerOpen(true);
    setIsLoadingPlaylists(true);
    setError("");
    setMessage("");
    try {
      const snapshot = await getDocs(collection(db, "usuarios", userId, "playlists"));
      setPlaylists(snapshot.docs.map((playlistDocument) => {
        const data = playlistDocument.data();
        return {
          id: playlistDocument.id,
          name: typeof data.name === "string" && data.name.trim()
            ? data.name
            : typeof data.title === "string" && data.title.trim()
              ? data.title
              : "Playlist sem título",
        };
      }));
    } catch (loadError) {
      console.error("Failed to load playlists for album.", loadError);
      setError("Não foi possível carregar suas playlists.");
    } finally {
      setIsLoadingPlaylists(false);
    }
  }

  async function addToPlaylist(playlistId: string) {
    if (!userId || !album) return;

    setError("");
    setMessage("");
    setIsSavingToPlaylist(true);
    try {
      await saveAlbumToPlaylist(userId, playlistId, album);
      setIsPlaylistPickerOpen(false);
      setMessage("Álbum salvo na playlist.");
    } catch (saveError) {
      console.error("Failed to save album to playlist.", saveError);
      setError("Não foi possível salvar o álbum nessa playlist.");
    } finally {
      setIsSavingToPlaylist(false);
    }
  }

  async function createPlaylistAndSaveAlbum() {
    if (!userId || !album) return;
    if (!newPlaylistName.trim()) {
      setError("Digite um nome para a nova playlist.");
      return;
    }

    setError("");
    setMessage("");
    setIsSavingToPlaylist(true);
    try {
      await createPlaylistWithAlbum(userId, newPlaylistName, album);
      setNewPlaylistName("");
      setIsPlaylistPickerOpen(false);
      setMessage("Playlist criada e álbum salvo.");
    } catch (saveError) {
      console.error("Failed to create playlist with album.", saveError);
      setError("Não foi possível criar a playlist. Tente novamente.");
    } finally {
      setIsSavingToPlaylist(false);
    }
  }

  function openExternalLink(url: string) {
    void Linking.openURL(url).catch((linkError: unknown) => {
      console.error("Failed to open album link.", linkError);
      setError("Não foi possível abrir esse link no dispositivo.");
    });
  }

  if (!album) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style={mode === "dark" ? "light" : "dark"} />
        <View style={styles.container}>
          <Text style={styles.title}>Álbum não encontrado.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Voltar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
          <Text style={styles.backLabel}>Voltar às recomendações</Text>
        </Pressable>

        <View style={styles.albumHeader}>
          <AlbumCover album={album} noteStyle={styles.artworkNote} style={styles.artwork} />
          <Text style={styles.title}>{album.title}</Text>
          <Text style={styles.artist}>{album.artist}</Text>
          <Text style={styles.metadata}>{album.releaseDate} · Nota: {album.userScore}/100</Text>
          <Text style={styles.genres}>{album.genres.join(" · ")}</Text>
          <View style={styles.albumActions}>
            <View style={styles.ratingControl}>
              <View accessibilityLabel={`Avaliação: ${rating} de 5 estrelas`} style={styles.stars}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable
                    accessibilityLabel={`${value} ${value === 1 ? "estrela" : "estrelas"}`}
                    accessibilityRole="button"
                    key={value}
                    onPress={() => selectRating(value)}
                    style={styles.starButton}
                  >
                    <Text style={[styles.star, value <= rating && styles.selectedStar]}>
                      {value <= rating ? "★" : "☆"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {rating > 0 && (
                <View style={styles.ratingPopover}>
                  <TextInput
                    multiline
                    onChangeText={updateComment}
                    placeholder="Deixe um comentário (opcional)"
                    placeholderTextColor={colors.placeholder}
                    style={styles.commentInput}
                    textAlignVertical="top"
                    value={comment}
                  />
                  <Text accessibilityLiveRegion="polite" style={styles.ratingSaveStatus}>
                    {isSavingRating ? "Salvando avaliação..." : ratingSaveStatus}
                  </Text>
                </View>
              )}
            </View>
            <Pressable
              accessibilityLabel="Salvar em uma playlist"
              accessibilityRole="button"
              onPress={openPlaylistPicker}
              style={({ pressed }) => [styles.playlistIconButton, pressed && styles.pressed]}
            >
              <SymbolView
                name={{ ios: "text.badge.plus", android: "playlist_add", web: "playlist_add" }}
                size={26}
                tintColor={colors.primaryText}
              />
            </Pressable>
          </View>
          {isPlaylistPickerOpen && (
            <View style={styles.playlistPicker}>
              <Text style={styles.pickerTitle}>Escolha uma playlist</Text>
              {isLoadingPlaylists ? (
                <ActivityIndicator color={colors.primary} />
              ) : playlists.length ? (
                playlists.map((playlist) => (
                  <Pressable
                    accessibilityRole="button"
                    disabled={isSavingToPlaylist}
                    key={playlist.id}
                    onPress={() => addToPlaylist(playlist.id)}
                    style={styles.playlistOption}
                  >
                    <Text style={styles.playlistOptionText}>{playlist.name}</Text>
                    <Text style={styles.playlistOptionArrow}>→</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.bodyText}>Você ainda não tem playlists.</Text>
              )}
              <TextInput
                onChangeText={setNewPlaylistName}
                placeholder="Nome da nova playlist"
                placeholderTextColor={colors.placeholder}
                style={styles.newPlaylistInput}
                value={newPlaylistName}
              />
              <Pressable
                accessibilityRole="button"
                disabled={isSavingToPlaylist}
                onPress={createPlaylistAndSaveAlbum}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                {isSavingToPlaylist
                  ? <ActivityIndicator color={colors.primaryText} />
                  : <Text style={styles.primaryButtonText}>Criar playlist e salvar</Text>}
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setIsPlaylistPickerOpen(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Pressable
          accessibilityRole="link"
          onPress={() => openExternalLink(album.albumLink)}
          style={({ pressed }) => [styles.sourceLink, pressed && styles.pressed]}
        >
          <Text style={styles.sourceLinkText}>Album of the Year</Text>
          <SymbolView
            name={{ ios: "link", android: "link", web: "link" }}
            size={16}
            tintColor={colors.accent}
          />
        </Pressable>

        {!!description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sobre o álbum</Text>
            <Text style={styles.bodyText}>{description}</Text>
          </View>
        )}

        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {!!message && <Text style={styles.success}>{message}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    safeArea: { backgroundColor: colors.background, flex: 1 },
    container: { flex: 1, justifyContent: "center", padding: 24 },
    content: { padding: 24, paddingBottom: 48 },
    backButton: { alignItems: "center", flexDirection: "row", marginBottom: 28 },
    backText: { color: colors.textPrimary, fontSize: 34, lineHeight: 28, marginRight: 8 },
    backLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: "700" },
    albumHeader: { alignItems: "center", paddingBottom: 20 },
    artwork: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.borderMuted,
      borderRadius: 22,
      borderWidth: 1,
      height: 190,
      justifyContent: "center",
      marginBottom: 22,
      width: 190,
    },
    artworkNote: { color: colors.accent, fontSize: 74, fontWeight: "800" },
    title: { color: colors.textPrimary, fontSize: 30, fontWeight: "800", textAlign: "center" },
    artist: { color: colors.textSecondary, fontSize: 18, fontWeight: "700", marginTop: 8 },
    metadata: { color: colors.textMuted, fontSize: 13, marginTop: 12, textAlign: "center" },
    genres: { color: colors.accent, fontSize: 13, lineHeight: 20, marginTop: 10, textAlign: "center" },
    section: { borderTopColor: colors.borderMuted, borderTopWidth: 1, paddingVertical: 22 },
    sectionTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: "800", marginBottom: 10 },
    bodyText: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
    sourceLink: { alignItems: "center", alignSelf: "center", flexDirection: "row", gap: 6, marginBottom: 24 },
    sourceLinkText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
    albumActions: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "center", marginTop: 16, width: "100%" },
    ratingControl: { alignItems: "center" },
    stars: { alignItems: "center", flexDirection: "row", gap: 2, transform: [{ translateY: -3 }] },
    starButton: { paddingHorizontal: 3, paddingVertical: 2 },
    star: { color: colors.textSubtle, fontSize: 34 },
    selectedStar: { color: colors.warning },
    ratingPopover: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, marginTop: 8, padding: 10 },
    ratingSaveStatus: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
    playlistIconButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 12, height: 48, justifyContent: "center", width: 48 },
    commentInput: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      color: colors.textPrimary,
      minHeight: 72,
      padding: 10,
    },
    primaryButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 12, justifyContent: "center", marginTop: 14, minHeight: 52, paddingHorizontal: 16 },
    primaryButtonText: { color: colors.primaryText, fontSize: 15, fontWeight: "800" },
    secondaryButton: { alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, justifyContent: "center", marginTop: 16, minHeight: 52, paddingHorizontal: 16 },
    secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
    playlistPicker: { backgroundColor: colors.surface, borderRadius: 16, marginTop: 14, padding: 16 },
    pickerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "800", marginBottom: 8 },
    playlistOption: { alignItems: "center", borderBottomColor: colors.borderMuted, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 48 },
    playlistOptionText: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
    playlistOptionArrow: { color: colors.accent, fontSize: 18 },
    newPlaylistInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.textPrimary, marginTop: 16, minHeight: 48, paddingHorizontal: 12 },
    cancelButton: { alignItems: "center", marginTop: 14, padding: 10 },
    cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: "700" },
    error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingVertical: 12 },
    success: { color: colors.success, fontSize: 14, fontWeight: "700", paddingVertical: 12 },
    pressed: { opacity: 0.75 },
  });
}
