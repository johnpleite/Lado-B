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
import albumCatalogData from "../data/albums.json";
import { Album } from "../lib/albums";
import { auth, db } from "../lib/firebase";
import { AlbumRating, getAlbumRecommendations } from "../lib/recommendations";
import { ColorPalette } from "../theme/colors";
import { useTheme } from "../theme/theme";

const albumCatalog = albumCatalogData as Album[];

type Profile = {
  username: string;
  displayName: string;
};

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<Profile>({ username: "", displayName: "" });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [recommendations, setRecommendations] = useState<Album[]>([]);
  const [hasRatedAlbums, setHasRatedAlbums] = useState(false);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(true);
  const [recommendationsError, setRecommendationsError] = useState("");
  const { colors, mode } = useTheme();
  const styles = createStyles(colors);

  async function loadProfile(uid: string) {
    const profileSnapshot = await getDoc(doc(db, "usuarios", uid));
    const data = profileSnapshot.data();
    const nextProfile = {
      username: typeof data?.username === "string" ? data.username : "usuario",
      displayName: typeof data?.displayName === "string" ? data.displayName : "usuario",
    };
    setProfile(nextProfile);
    setDisplayName(nextProfile.displayName);
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
      void loadProfile(authenticatedUser.uid);

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
          setHasRatedAlbums(ratings.length > 0);
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

          setRecommendations(
            getAlbumRecommendations(albumCatalog, ratings, excludedAlbumIds),
          );
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
    if (!user || !displayName.trim()) return;

    setIsSaving(true);
    await updateDoc(doc(db, "usuarios", user.uid), { displayName: displayName.trim() });
    setProfile((currentProfile) => ({ ...currentProfile, displayName: displayName.trim() }));
    setIsEditing(false);
    setIsSaving(false);
  }

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/");
  }

  if (isCheckingSession) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>LADO B</Text>
            <Text style={styles.heading}>Seu espaço musical.</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => setIsMenuOpen((open) => !open)} style={styles.avatarButton}>
            <Image source={require("../../assets/images/icon.png")} style={styles.avatar} />
          </Pressable>
        </View>

        {isMenuOpen && (
          <View style={styles.profileMenu}>
            <Image source={require("../../assets/images/icon.png")} style={styles.menuAvatar} />
            <Text style={styles.menuDisplayName}>{profile.displayName || "Seu nome"}</Text>
            <Text style={styles.menuUsername}>@{profile.username || "usuario"}</Text>
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
                <Pressable disabled={isSaving} onPress={handleSaveDisplayName} style={styles.saveButton}>
                  {isSaving ? <ActivityIndicator color={colors.primaryText} size="small" /> : <Text style={styles.saveText}>Salvar</Text>}
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setIsEditing(true)} style={styles.editButton}>
                <Text style={styles.editIcon}>✎</Text>
                <Text style={styles.editText}>Alterar perfil</Text>
              </Pressable>
            )}
            <Pressable onPress={() => router.push("/settings" as never)} style={styles.settingsButton}>
              <Text style={styles.settingsText}>Configurações</Text>
            </Pressable>
            <Pressable onPress={handleSignOut} style={styles.signOutButton}>
              <Text style={styles.signOutText}>Sair</Text>
            </Pressable>
          </View>
        )}
        <ScrollView contentContainerStyle={styles.recommendationsContent}>
          <View style={styles.recommendationsHeading}>
            <View>
              <Text style={styles.sectionTitle}>Para ouvir a seguir</Text>
              <Text style={styles.sectionSubtitle}>
                {hasRatedAlbums ? "Sugestões com base nas suas avaliações" : "Sugestões aleatórias do catálogo"}
              </Text>
            </View>
            {user && <Text style={styles.recommendationCount}>{recommendations.length} álbuns</Text>}
          </View>
          {isLoadingRecommendations ? (
            <View style={styles.recommendationState}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.recommendationStateText}>Preparando recomendações...</Text>
            </View>
          ) : recommendationsError ? (
            <Text style={styles.recommendationStateText}>{recommendationsError}</Text>
          ) : recommendations.length === 0 ? (
            <Text style={styles.recommendationStateText}>Você já explorou todo o catálogo disponível.</Text>
          ) : (
            <ScrollView horizontal contentContainerStyle={styles.albumCards} showsHorizontalScrollIndicator={false}>
              {recommendations.map((album) => (
                <Pressable
                  accessibilityRole="button"
                  key={album.id}
                  onPress={() => router.push({ pathname: "/album/[id]", params: { id: album.id } } as never)}
                  style={({ pressed }) => [styles.albumCard, pressed && styles.pressed]}
                >
                  <View style={styles.albumArtwork}>
                    <Text style={styles.albumArtworkNote}>♫</Text>
                    <Text style={styles.albumScore}>{album.userScore}</Text>
                  </View>
                  <Text numberOfLines={2} style={styles.albumTitle}>{album.title}</Text>
                  <Text numberOfLines={1} style={styles.albumArtist}>{album.artist}</Text>
                  <Text numberOfLines={1} style={styles.albumGenre}>{album.genres[0]}</Text>
                </Pressable>
              ))}
            </ScrollView>
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
  heading: { color: colors.textPrimary, fontSize: 24, fontWeight: "800", marginTop: 8 },
  avatarButton: { borderColor: colors.primary, borderRadius: 28, borderWidth: 2, padding: 2 },
  avatar: { borderRadius: 24, height: 48, width: 48 },
  profileMenu: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 12,
    padding: 18,
    position: "absolute",
    right: 0,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    top: 78,
    width: 250,
    zIndex: 12,
  },
  menuAvatar: { borderRadius: 28, height: 56, marginBottom: 12, width: 56 },
  menuDisplayName: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  menuUsername: { color: colors.accent, fontSize: 14, marginTop: 4 },
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
  recommendationsContent: { flexGrow: 1, paddingBottom: 18, paddingTop: 32 },
  recommendationsHeading: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between" },
  sectionTitle: { color: colors.textPrimary, fontSize: 21, fontWeight: "800" },
  sectionSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  recommendationCount: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  recommendationState: { alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 28 },
  recommendationStateText: { color: colors.textMuted, fontSize: 14, lineHeight: 21, paddingVertical: 24 },
  albumCards: { gap: 12, paddingVertical: 18 },
  albumCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: 16,
    borderWidth: 1,
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
    elevation: 5,
    height: 60,
    justifyContent: "center",
    marginTop: "auto",
    marginBottom: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    width: 60,
  },
  pressed: { opacity: 0.75 },
  });
}