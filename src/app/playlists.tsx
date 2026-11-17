import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../lib/firebase";
import { ColorPalette } from "../theme/colors";
import { useTheme } from "../theme/theme";

type SavedPlaylist = {
  id: string;
  name: string;
  description: string;
  songCount: number | null;
  albums: { id: string; title: string; artist: string }[];
};

export default function Playlists() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<SavedPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const { colors, mode } = useTheme();
  const styles = createStyles(colors);

  useEffect(() => {
    let isActive = true;
    let activeLoad = 0;
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (!nextUser) {
        router.replace("/");
        return;
      }

      const authenticatedUser = nextUser;
      const currentLoad = ++activeLoad;
      setIsLoading(true);
      setError("");

      async function loadPlaylists() {
        try {
          const snapshot = await getDocs(collection(db, "usuarios", authenticatedUser.uid, "playlists"));
          if (!isActive || currentLoad !== activeLoad) return;

          const nextPlaylists = await Promise.all(snapshot.docs.map(async (playlistDocument) => {
            const data = playlistDocument.data();
            const name = typeof data.name === "string" ? data.name : data.title;
            const albumIds = Array.isArray(data.albumIds)
              ? data.albumIds.filter((albumId): albumId is string => typeof albumId === "string")
              : [];
            const albums = await Promise.all(albumIds.map(async (albumId) => {
              const albumSnapshot = await getDoc(doc(db, "albuns", albumId));
              const albumData = albumSnapshot.data();
              return {
                id: albumId,
                title: typeof albumData?.title === "string" ? albumData.title : "Álbum indisponível",
                artist: typeof albumData?.artist === "string" ? albumData.artist : "",
              };
            }));

            return {
              id: playlistDocument.id,
              name: typeof name === "string" && name.trim() ? name : "Playlist sem título",
              description: typeof data.description === "string" ? data.description : "",
              songCount: typeof data.songCount === "number" ? data.songCount : null,
              albums,
            };
          }));
          if (!isActive) return;
          setPlaylists(nextPlaylists);
        } catch {
          if (isActive && currentLoad === activeLoad) {
            setError("Não foi possível carregar suas playlists. Tente novamente.");
          }
        } finally {
          if (isActive && currentLoad === activeLoad) setIsLoading(false);
        }
      }

      void loadPlaylists();
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [router]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.brand}>LADO B</Text>
          <Text style={styles.title}>Suas playlists.</Text>
          <Text style={styles.subtitle}>Tudo o que você salvou, reunido em um só lugar.</Text>

          {isLoading ? (
            <View style={styles.state}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.stateText}>Carregando suas playlists...</Text>
            </View>
          ) : error ? (
            <View style={styles.state}>
              <Text style={styles.stateTitle}>Ops, algo deu errado.</Text>
              <Text style={styles.stateText}>{error}</Text>
            </View>
          ) : playlists.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>♫</Text>
              <Text style={styles.stateTitle}>Ainda não há playlists salvas.</Text>
              <Text style={styles.stateText}>Quando você salvar uma playlist, ela vai aparecer aqui.</Text>
            </View>
          ) : (
            <View style={styles.playlistList}>
              {playlists.map((playlist) => (
                <View key={playlist.id} style={styles.playlistCard}>
                  <View style={styles.playlistArtwork}>
                    <Text style={styles.artworkIcon}>♫</Text>
                  </View>
                  <View style={styles.playlistDetails}>
                    <Text numberOfLines={1} style={styles.playlistName}>{playlist.name}</Text>
                    {!!playlist.description && (
                      <Text numberOfLines={2} style={styles.playlistDescription}>{playlist.description}</Text>
                    )}
                    {playlist.songCount !== null && playlist.albums.length === 0 && (
                      <Text style={styles.songCount}>
                        {playlist.songCount} {playlist.songCount === 1 ? "faixa" : "faixas"}
                      </Text>
                    )}
                    {playlist.albums.length > 0 && (
                      <View style={styles.albumList}>
                        {playlist.albums.map((album) => (
                          <Text key={album.id} numberOfLines={1} style={styles.albumItem}>
                            {album.title}{album.artist ? ` · ${album.artist}` : ""}
                          </Text>
                        ))}
                      </View>
                    )}
                    {playlist.albums.length === 0 && playlist.songCount === null && (
                      <Text style={styles.songCount}>Nenhum álbum salvo ainda</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/home" as never)}
          style={({ pressed }) => [styles.homeButton, pressed && styles.pressed]}
        >
          <Text style={styles.homeButtonArrow}>←</Text>
          <Text style={styles.homeButtonText}>Voltar para o início</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    safeArea: { backgroundColor: colors.background, flex: 1 },
    container: { flex: 1, paddingHorizontal: 24 },
    content: { flexGrow: 1, paddingBottom: 24, paddingTop: 28 },
    brand: { color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 2 },
    title: { color: colors.textPrimary, fontSize: 32, fontWeight: "800", marginTop: 14 },
    subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 23, marginTop: 10 },
    state: { alignItems: "center", gap: 12, marginTop: 72, paddingHorizontal: 16 },
    emptyState: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.borderMuted,
      borderRadius: 20,
      borderWidth: 1,
      marginTop: 48,
      paddingHorizontal: 24,
      paddingVertical: 36,
    },
    emptyIcon: { color: colors.accent, fontSize: 42, marginBottom: 16 },
    stateTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800", textAlign: "center" },
    stateText: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
    playlistList: { gap: 12, marginTop: 30 },
    playlistCard: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.borderMuted,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 14,
      padding: 14,
    },
    playlistArtwork: {
      alignItems: "center",
      backgroundColor: colors.background,
      borderRadius: 12,
      height: 64,
      justifyContent: "center",
      width: 64,
    },
    artworkIcon: { color: colors.accent, fontSize: 30 },
    playlistDetails: { flex: 1, gap: 4 },
    playlistName: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
    playlistDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
    songCount: { color: colors.accent, fontSize: 12, fontWeight: "700" },
    albumList: { gap: 4, marginTop: 6 },
    albumItem: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
    homeButton: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 14,
      flexDirection: "row",
      gap: 10,
      justifyContent: "center",
      marginBottom: 16,
      minHeight: 58,
    },
    homeButtonArrow: { color: colors.primaryText, fontSize: 21, fontWeight: "700" },
    homeButtonText: { color: colors.primaryText, fontSize: 16, fontWeight: "800" },
    pressed: { opacity: 0.75 },
  });
}
