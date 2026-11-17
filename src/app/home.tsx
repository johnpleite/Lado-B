import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { StatusBar } from "expo-status-bar";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlbumCover } from "../components/AlbumCover";
import albumCatalogData from "../data/albums.json";
import { Album } from "../lib/albums";
import { auth, db } from "../lib/firebase";
import { AlbumRating, getAlbumRecommendations } from "../lib/recommendations";
import { ColorPalette } from "../theme/colors";
import { useTheme } from "../theme/theme";

const albumCatalog = albumCatalogData as Album[];
const GENRE_ROW_COUNT = 5;
const ALBUMS_PER_GENRE = 8;

type Profile = {
  username: string;
  displayName: string;
};

type GenreRecommendations = {
  genre: string;
  albums: Album[];
};

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<Profile>({ username: "", displayName: "" });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [genreRecommendations, setGenreRecommendations] = useState<GenreRecommendations[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(true);
  const [recommendationsError, setRecommendationsError] = useState("");
  const { colors, mode } = useTheme();
  const styles = createStyles(colors);

  async function loadProfile(uid: string) {
    const profileSnapshot = await getDoc(doc(db, "usuarios", uid));
    const data = profileSnapshot.data();
    return {
      username: typeof data?.username === "string" ? data.username : "usuario",
      displayName: typeof data?.displayName === "string" ? data.displayName : "usuario",
    };
  }

  useEffect(() => {
    let isActive = true;
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (!nextUser) {
        router.replace("/");
        return;
      }

      const authenticatedUser = nextUser;
      setUser(authenticatedUser);
      setIsCheckingSession(false);
      void loadProfile(authenticatedUser.uid).then((nextProfile) => {
        if (!isActive) return;
        setProfile(nextProfile);
        setDisplayName(nextProfile.displayName);
      }).catch((profileLoadError: unknown) => {
        console.error("Failed to load user profile.", profileLoadError);
        if (isActive) setProfileError("Não foi possível carregar seu perfil.");
      });

      async function loadRecommendations() {
        setIsLoadingRecommendations(true);
        setRecommendationsError("");

        try {
          const [reviewsSnapshot, playlistsSnapshot] = await Promise.all([
            getDocs(collection(db, "usuarios", authenticatedUser.uid, "avaliacoes")),
            getDocs(collection(db, "usuarios", authenticatedUser.uid, "playlists")),
          ]);
          if (!isActive) return;

          const ratings: AlbumRating[] = reviewsSnapshot.docs.flatMap((reviewDocument) => {
            const data = reviewDocument.data();
            if (typeof data.rating !== "number" || !Array.isArray(data.genres)) return [];

            return [{
              albumId: reviewDocument.id,
              rating: data.rating,
              genres: data.genres.filter((genre): genre is string => typeof genre === "string"),
            }];
          });
          const savedAlbumIds = playlistsSnapshot.docs.flatMap((playlistDocument) => {
            const albumIds = playlistDocument.data().albumIds;
            return Array.isArray(albumIds)
              ? albumIds.filter((albumId): albumId is string => typeof albumId === "string")
              : [];
          });
          const excludedAlbumIds = new Set([
            ...ratings.map((rating) => rating.albumId),
            ...savedAlbumIds,
          ]);

          const genreCounts = new Map<string, number>();
          for (const album of albumCatalog) {
            if (excludedAlbumIds.has(album.id)) continue;
            for (const genre of album.genres) {
              genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
            }
          }

          const selectedGenres = [...genreCounts.entries()]
            .filter(([, count]) => count >= ALBUMS_PER_GENRE)
            .sort((first, second) => second[1] - first[1])
            .slice(0, GENRE_ROW_COUNT)
            .map(([genre]) => genre);
          const seenAlbumIds = new Set(excludedAlbumIds);
          const nextGenreRecommendations = selectedGenres.flatMap((genre) => {
            const genreCatalog = albumCatalog.filter((album) =>
              album.genres.includes(genre) && !seenAlbumIds.has(album.id),
            );
            const albums = getAlbumRecommendations(
              genreCatalog,
              ratings,
              seenAlbumIds,
              ALBUMS_PER_GENRE,
            );
            for (const album of albums) seenAlbumIds.add(album.id);
            return albums.length ? [{ genre, albums }] : [];
          });
          setGenreRecommendations(nextGenreRecommendations);
        } catch (recommendationError) {
          console.error("Failed to load album recommendations.", recommendationError);
          if (isActive) {
            setRecommendationsError("Não foi possível carregar as recomendações.");
          }
        } finally {
          if (isActive) setIsLoadingRecommendations(false);
        }
      }

      void loadRecommendations();
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [router]);

  async function handleSaveDisplayName() {
    if (!user) return;
    const normalizedDisplayName = displayName.trim();
    if (!normalizedDisplayName) {
      setProfileError("O nome não pode ficar vazio.");
      return;
    }

    setProfileError("");
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "usuarios", user.uid), { displayName: normalizedDisplayName });
      setProfile((currentProfile) => ({ ...currentProfile, displayName: normalizedDisplayName }));
      setIsEditing(false);
    } catch (saveError) {
      console.error("Failed to save display name.", saveError);
      setProfileError("Não foi possível salvar seu nome. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSignOut() {
    setProfileError("");
    try {
      await signOut(auth);
      router.replace("/");
    } catch (signOutError) {
      console.error("Failed to sign out.", signOutError);
      setProfileError("Não foi possível sair da conta. Tente novamente.");
    }
  }

  if (isCheckingSession) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.brand}>LADO B</Text>
          <Pressable accessibilityRole="button" onPress={() => setIsMenuOpen((open) => !open)} style={styles.avatarButton}>
            <Image source={require("../../assets/images/icon.png")} style={styles.avatar} />
          </Pressable>
        </View>

        {isMenuOpen && (
          <View style={styles.profileMenu}>
            <Image source={require("../../assets/images/icon.png")} style={styles.menuAvatar} />
            <Text style={styles.menuDisplayName}>{profile.displayName || "Seu nome"}</Text>
            <Text style={styles.menuUsername}>@{profile.username || "usuario"}</Text>
            {!!profileError && <Text accessibilityRole="alert" style={styles.profileError}>{profileError}</Text>}
            {isEditing ? (
              <View style={styles.editArea}>
                <TextInput
                  autoFocus
                  onChangeText={setDisplayName}
                  placeholder="Seu display name"
                  placeholderTextColor={colors.placeholder}
                  style={styles.editInput}
                  value={displayName}
                />
                <Pressable accessibilityRole="button" disabled={isSaving} onPress={handleSaveDisplayName} style={styles.saveButton}>
                  {isSaving ? <ActivityIndicator color={colors.primaryText} size="small" /> : <Text style={styles.saveText}>Salvar</Text>}
                </Pressable>
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setIsEditing(true)} style={styles.editButton}>
                <Text style={styles.editIcon}>✎</Text>
                <Text style={styles.editText}>Alterar perfil</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" onPress={() => router.push("/settings" as never)} style={styles.settingsButton}>
              <Text style={styles.settingsText}>Configurações</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={handleSignOut} style={styles.signOutButton}>
              <Text style={styles.signOutText}>Sair</Text>
            </Pressable>
          </View>
        )}
        <ScrollView contentContainerStyle={styles.recommendationsContent} nestedScrollEnabled>
          <Text style={styles.sectionTitle}>Explore por gênero</Text>
          {isLoadingRecommendations ? (
            <View style={styles.recommendationState}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.recommendationStateText}>Preparando recomendações...</Text>
            </View>
          ) : recommendationsError ? (
            <Text style={styles.recommendationStateText}>{recommendationsError}</Text>
          ) : genreRecommendations.length === 0 ? (
            <Text style={styles.recommendationStateText}>Você já explorou todo o catálogo disponível.</Text>
          ) : (
            <View style={styles.genreRows}>
              {genreRecommendations.map(({ genre, albums }) => (
                <View key={genre}>
                  <Text style={styles.genreHeading}>{genre}</Text>
                  <ScrollView
                    horizontal
                    contentContainerStyle={styles.albumCards}
                    showsHorizontalScrollIndicator={false}
                    style={styles.albumScroll}
                  >
                    {albums.map((album) => (
                      <Pressable
                        accessibilityRole="button"
                        key={album.id}
                        onPress={() => router.push({ pathname: "/album/[id]", params: { id: album.id } } as never)}
                        style={({ pressed }) => [styles.albumCard, pressed && styles.pressed]}
                      >
                        <View style={styles.albumArtwork}>
                          <AlbumCover album={album} noteStyle={styles.albumArtworkNote} style={styles.albumArtworkImage} />
                          <Text style={styles.albumScore}>{album.userScore}</Text>
                        </View>
                        <Text numberOfLines={2} style={styles.albumTitle}>{album.title}</Text>
                        <Text numberOfLines={1} style={styles.albumArtist}>{album.artist}</Text>
                        <Text numberOfLines={1} style={styles.albumGenre}>{genre}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Minhas playlists"
          accessibilityHint="Abre suas playlists salvas"
          onPress={() => router.push("/playlists" as never)}
          style={({ pressed }) => [styles.playlistsButton, pressed && styles.pressed]}
        >
          <SymbolView
            name={{ ios: "music.note.list", android: "queue_music", web: "queue_music" }}
            size={28}
            tintColor={colors.primaryText}
          />
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  container: { flex: 1, paddingHorizontal: 24 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingTop: 18 },
  brand: { color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  avatarButton: { borderColor: colors.primary, borderRadius: 28, borderWidth: 2, padding: 2 },
  avatar: { borderRadius: 24, height: 48, width: 48 },
  profileMenu: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: 18,
    borderWidth: 1,
    boxShadow: "0px 6px 12px rgba(0, 0, 0, 0.2)",
    padding: 18,
    position: "absolute",
    right: 0,
    top: 78,
    width: 250,
    zIndex: 12,
  },
  menuAvatar: { borderRadius: 28, height: 56, marginBottom: 12, width: 56 },
  menuDisplayName: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  menuUsername: { color: colors.accent, fontSize: 14, marginTop: 4 },
  profileError: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 8 },
  editArea: { gap: 10, marginTop: 18 },
  editInput: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.textPrimary, minHeight: 44, paddingHorizontal: 12 },
  saveButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 10, minHeight: 42, justifyContent: "center" },
  saveText: { color: colors.primaryText, fontWeight: "800" },
  editButton: { alignItems: "center", flexDirection: "row", marginTop: 18 },
  editIcon: { color: colors.accent, fontSize: 21, marginRight: 8 },
  editText: { color: colors.primary, fontSize: 14, fontWeight: "800" },
  settingsButton: { marginTop: 14 },
  settingsText: { color: colors.primary, fontSize: 14, fontWeight: "800" },
  signOutButton: { borderTopColor: colors.borderMuted, borderTopWidth: 1, marginTop: 18, paddingTop: 14 },
  signOutText: { color: colors.danger, fontSize: 14, fontWeight: "700" },
  recommendationsContent: { paddingBottom: 18, paddingTop: 32 },
  sectionTitle: { color: colors.textPrimary, fontSize: 21, fontWeight: "800" },
  genreRows: { gap: 20, marginTop: 24 },
  genreHeading: { color: colors.textSecondary, fontSize: 16, fontWeight: "800" },
  albumScroll: { flexGrow: 0 },
  recommendationState: { alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 28 },
  recommendationStateText: { color: colors.textMuted, fontSize: 14, lineHeight: 21, paddingVertical: 24 },
  albumCards: { alignItems: "flex-start", gap: 12, paddingBottom: 4, paddingTop: 12 },
  albumCard: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: 16,
    borderWidth: 1,
    flexGrow: 0,
    padding: 12,
    width: 176,
  },
  albumArtwork: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 12,
    height: 128,
    justifyContent: "center",
    marginBottom: 12,
    position: "relative",
  },
  albumArtworkImage: { borderRadius: 12, bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  albumArtworkNote: { color: colors.accent, fontSize: 46, fontWeight: "800" },
  albumScore: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    color: colors.primaryText,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
    right: 8,
    top: 8,
  },
  albumTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "800", minHeight: 38 },
  albumArtist: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  albumGenre: { color: colors.accent, fontSize: 11, marginTop: 6 },
  playlistsButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 30,
    boxShadow: "0px 3px 5px rgba(0, 0, 0, 0.2)",
    height: 60,
    justifyContent: "center",
    marginTop: "auto",
    marginBottom: 16,
    width: 60,
  },
  pressed: { opacity: 0.75 },
  });
}