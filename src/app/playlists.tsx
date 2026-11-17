import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  createPlaylist,
  deletePlaylist,
  removeAlbumFromPlaylist,
  updatePlaylist,
} from "../lib/albums";
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
  const [userId, setUserId] = useState("");
  const [playlists, setPlaylists] = useState<SavedPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [isEditingPlaylist, setIsEditingPlaylist] = useState(false);
  const [editPlaylistName, setEditPlaylistName] = useState("");
  const [editPlaylistDescription, setEditPlaylistDescription] = useState("");
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [playlistActionError, setPlaylistActionError] = useState("");
  const [isUpdatingPlaylist, setIsUpdatingPlaylist] = useState(false);
  const { colors, mode } = useTheme();
  const styles = createStyles(colors);
  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId);

  useEffect(() => {
    let isActive = true;
    let activeLoad = 0;
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (!nextUser) {
        router.replace("/");
        return;
      }

      const authenticatedUser = nextUser;
      setUserId(authenticatedUser.uid);
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
        } catch (loadError: unknown) {
          console.error("Failed to load saved playlists.", loadError);
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

  async function handleCreatePlaylist() {
    const name = newPlaylistName.trim();
    if (!name) {
      setCreateError("Digite um nome para a playlist.");
      return;
    }
    if (!userId) {
      setCreateError("Não foi possível identificar sua conta. Entre novamente.");
      return;
    }

    setCreateError("");
    setIsCreating(true);
    try {
      const id = await createPlaylist(userId, name);
      setPlaylists((currentPlaylists) => [
        { id, name, description: "", songCount: null, albums: [] },
        ...currentPlaylists,
      ]);
      setNewPlaylistName("");
      setIsCreateFormOpen(false);
    } catch (createPlaylistError) {
      console.error("Failed to create playlist.", createPlaylistError);
      setCreateError("Não foi possível criar a playlist. Tente novamente.");
    } finally {
      setIsCreating(false);
    }
  }

  function openPlaylist(playlist: SavedPlaylist) {
    setSelectedPlaylistId(playlist.id);
    setIsEditingPlaylist(false);
    setIsDeleteConfirmationOpen(false);
    setPlaylistActionError("");
    setIsCreateFormOpen(false);
  }

  async function handleUpdatePlaylist() {
    if (!selectedPlaylist || !userId) return;
    if (!editPlaylistName.trim()) {
      setPlaylistActionError("Digite um nome para a playlist.");
      return;
    }

    setPlaylistActionError("");
    setIsUpdatingPlaylist(true);
    try {
      await updatePlaylist(userId, selectedPlaylist.id, editPlaylistName, editPlaylistDescription);
      setPlaylists((currentPlaylists) => currentPlaylists.map((playlist) =>
        playlist.id === selectedPlaylist.id
          ? { ...playlist, name: editPlaylistName.trim(), description: editPlaylistDescription.trim() }
          : playlist,
      ));
      setIsEditingPlaylist(false);
    } catch (updateError) {
      console.error("Failed to update playlist.", updateError);
      setPlaylistActionError("Não foi possível atualizar a playlist. Tente novamente.");
    } finally {
      setIsUpdatingPlaylist(false);
    }
  }

  async function handleDeletePlaylist() {
    if (!selectedPlaylist || !userId) return;

    setPlaylistActionError("");
    setIsUpdatingPlaylist(true);
    try {
      await deletePlaylist(userId, selectedPlaylist.id);
      setPlaylists((currentPlaylists) =>
        currentPlaylists.filter((playlist) => playlist.id !== selectedPlaylist.id),
      );
      setSelectedPlaylistId("");
      setIsDeleteConfirmationOpen(false);
    } catch (deleteError) {
      console.error("Failed to delete playlist.", deleteError);
      setPlaylistActionError("Não foi possível excluir a playlist. Tente novamente.");
    } finally {
      setIsUpdatingPlaylist(false);
    }
  }

  async function handleRemoveAlbum(albumId: string) {
    if (!selectedPlaylist || !userId) return;

    setPlaylistActionError("");
    setIsUpdatingPlaylist(true);
    try {
      await removeAlbumFromPlaylist(userId, selectedPlaylist.id, albumId);
      setPlaylists((currentPlaylists) => currentPlaylists.map((playlist) =>
        playlist.id === selectedPlaylist.id
          ? { ...playlist, albums: playlist.albums.filter((album) => album.id !== albumId) }
          : playlist,
      ));
    } catch (removeError) {
      console.error("Failed to remove album from playlist.", removeError);
      setPlaylistActionError("Não foi possível remover o álbum. Tente novamente.");
    } finally {
      setIsUpdatingPlaylist(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.headingRow}>
            {selectedPlaylist ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Voltar para suas playlists"
                  onPress={() => setSelectedPlaylistId("")}
                  style={styles.detailBackButton}
                >
                  <SymbolView
                    name={{ ios: "chevron.left", android: "arrow_back", web: "arrow_back" }}
                    size={22}
                    tintColor={colors.textPrimary}
                  />
                </Pressable>
                <View style={styles.headingCopy}>
                  <Text style={styles.brand}>LADO B</Text>
                  <Text numberOfLines={1} style={styles.title}>{selectedPlaylist.name}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.headingCopy}>
                  <Text style={styles.brand}>LADO B</Text>
                  <Text style={styles.title}>Suas playlists.</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setIsCreateFormOpen((isOpen) => !isOpen);
                    setCreateError("");
                  }}
                  style={({ pressed }) => [styles.createToggle, pressed && styles.pressed]}
                >
                  <SymbolView
                    name={{ ios: "plus", android: "add", web: "add" }}
                    size={20}
                    tintColor={colors.primaryText}
                  />
                  <Text style={styles.createToggleText}>Criar</Text>
                </Pressable>
              </>
            )}
          </View>

          {!selectedPlaylist && isCreateFormOpen && (
            <View style={styles.createForm}>
              <TextInput
                accessibilityLabel="Nome da nova playlist"
                autoFocus
                onChangeText={setNewPlaylistName}
                onSubmitEditing={() => void handleCreatePlaylist()}
                placeholder="Nome da playlist"
                placeholderTextColor={colors.placeholder}
                returnKeyType="done"
                style={styles.createInput}
                value={newPlaylistName}
              />
              {!!createError && <Text accessibilityRole="alert" style={styles.createError}>{createError}</Text>}
              <View style={styles.createActions}>
                <Pressable
                  disabled={isCreating}
                  onPress={() => {
                    setIsCreateFormOpen(false);
                    setNewPlaylistName("");
                    setCreateError("");
                  }}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isCreating}
                  onPress={() => void handleCreatePlaylist()}
                  style={({ pressed }) => [styles.createButton, pressed && styles.pressed, isCreating && styles.disabled]}
                >
                  {isCreating
                    ? <ActivityIndicator color={colors.primaryText} />
                    : <Text style={styles.createButtonText}>Criar playlist</Text>}
                </Pressable>
              </View>
            </View>
          )}

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
          ) : selectedPlaylist ? (
            <View style={styles.playlistDetailsView}>
              <View style={styles.detailActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isUpdatingPlaylist}
                  onPress={() => {
                    setEditPlaylistName(selectedPlaylist.name);
                    setEditPlaylistDescription(selectedPlaylist.description);
                    setIsEditingPlaylist((isEditing) => !isEditing);
                    setIsDeleteConfirmationOpen(false);
                    setPlaylistActionError("");
                  }}
                  style={styles.detailActionButton}
                >
                  <Text style={styles.detailActionText}>{isEditingPlaylist ? "Cancelar edição" : "Editar"}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isUpdatingPlaylist}
                  onPress={() => {
                    setIsDeleteConfirmationOpen(true);
                    setIsEditingPlaylist(false);
                    setPlaylistActionError("");
                  }}
                  style={[styles.detailActionButton, styles.deleteActionButton]}
                >
                  <Text style={styles.deleteActionText}>Excluir playlist</Text>
                </Pressable>
              </View>

              {isEditingPlaylist && (
                <View style={styles.editForm}>
                  <TextInput
                    accessibilityLabel="Nome da playlist"
                    onChangeText={setEditPlaylistName}
                    placeholder="Nome da playlist"
                    placeholderTextColor={colors.placeholder}
                    style={styles.createInput}
                    value={editPlaylistName}
                  />
                  <TextInput
                    accessibilityLabel="Descrição da playlist"
                    multiline
                    onChangeText={setEditPlaylistDescription}
                    placeholder="Descrição (opcional)"
                    placeholderTextColor={colors.placeholder}
                    style={[styles.createInput, styles.descriptionInput]}
                    textAlignVertical="top"
                    value={editPlaylistDescription}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={isUpdatingPlaylist}
                    onPress={() => void handleUpdatePlaylist()}
                    style={({ pressed }) => [styles.createButton, pressed && styles.pressed, isUpdatingPlaylist && styles.disabled]}
                  >
                    {isUpdatingPlaylist
                      ? <ActivityIndicator color={colors.primaryText} />
                      : <Text style={styles.createButtonText}>Salvar alterações</Text>}
                  </Pressable>
                </View>
              )}

              {isDeleteConfirmationOpen && (
                <View style={styles.deleteConfirmation}>
                  <Text style={styles.confirmationText}>Excluir “{selectedPlaylist.name}” e removê-la da sua biblioteca?</Text>
                  <View style={styles.createActions}>
                    <Pressable onPress={() => setIsDeleteConfirmationOpen(false)} style={styles.cancelButton}>
                      <Text style={styles.cancelText}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isUpdatingPlaylist}
                      onPress={() => void handleDeletePlaylist()}
                      style={({ pressed }) => [styles.confirmDeleteButton, pressed && styles.pressed, isUpdatingPlaylist && styles.disabled]}
                    >
                      {isUpdatingPlaylist
                        ? <ActivityIndicator color={colors.primaryText} />
                        : <Text style={styles.createButtonText}>Excluir</Text>}
                    </Pressable>
                  </View>
                </View>
              )}

              {!!selectedPlaylist.description && (
                <Text style={styles.playlistDescription}>{selectedPlaylist.description}</Text>
              )}
              <Text style={styles.detailSectionTitle}>Álbuns ({selectedPlaylist.albums.length})</Text>
              {selectedPlaylist.albums.length ? (
                <View style={styles.detailAlbumList}>
                  {selectedPlaylist.albums.map((album) => (
                    <View key={album.id} style={styles.detailAlbumRow}>
                      <View style={styles.detailAlbumCopy}>
                        <Text style={styles.detailAlbumTitle}>{album.title}</Text>
                        {!!album.artist && <Text style={styles.detailAlbumArtist}>{album.artist}</Text>}
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remover ${album.title} da playlist`}
                        disabled={isUpdatingPlaylist}
                        onPress={() => void handleRemoveAlbum(album.id)}
                        style={styles.removeAlbumButton}
                      >
                        <Text style={styles.deleteActionText}>Remover</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.stateText}>Esta playlist ainda não tem álbuns.</Text>
                </View>
              )}
              {!!playlistActionError && (
                <Text accessibilityRole="alert" style={styles.createError}>{playlistActionError}</Text>
              )}
            </View>
          ) : playlists.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>♫</Text>
              <Text style={styles.stateTitle}>Ainda não há playlists salvas.</Text>
              <Text style={styles.stateText}>Crie uma playlist ou salve um álbum nela para vê-la aqui.</Text>
            </View>
          ) : (
            <View style={styles.playlistList}>
              {playlists.map((playlist) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir playlist ${playlist.name}`}
                  key={playlist.id}
                  onPress={() => openPlaylist(playlist)}
                  style={({ pressed }) => [styles.playlistCard, pressed && styles.pressed]}
                >
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
                        {playlist.albums.slice(0, 3).map((album, index) => (
                          <Text
                            key={album.id}
                            numberOfLines={1}
                            style={[
                              styles.albumItem,
                              playlist.albums.length >= 3 && index === 1 && styles.albumPreviewMidFade,
                              playlist.albums.length >= 3 && index === 2 && styles.albumPreviewFade,
                            ]}
                          >
                            {album.title}{album.artist ? ` · ${album.artist}` : ""}
                          </Text>
                        ))}
                        {playlist.albums.length > 3 && (
                          <Text style={styles.moreAlbums}>+{playlist.albums.length - 3} álbuns</Text>
                        )}
                      </View>
                    )}
                    {playlist.albums.length === 0 && playlist.songCount === null && (
                      <Text style={styles.songCount}>Nenhum álbum salvo ainda</Text>
                    )}
                  </View>
                  </Pressable>
              ))}
            </View>
          )}
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar para o início"
          onPress={() => router.push("/home" as never)}
          style={({ pressed }) => [styles.homeButton, pressed && styles.pressed]}
        >
          <SymbolView
            name={{ ios: "arrow.backward", android: "arrow_back", web: "arrow_back" }}
            size={24}
            tintColor={colors.primaryText}
          />
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
    headingRow: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
    headingCopy: { flex: 1 },
    createToggle: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 12,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    createToggleText: { color: colors.primaryText, fontSize: 14, fontWeight: "800" },
    detailBackButton: { alignItems: "center", justifyContent: "center", minHeight: 44, width: 36 },
    createForm: {
      backgroundColor: colors.surface,
      borderColor: colors.borderMuted,
      borderRadius: 16,
      borderWidth: 1,
      gap: 12,
      marginTop: 22,
      padding: 16,
    },
    createInput: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      color: colors.textPrimary,
      minHeight: 48,
      paddingHorizontal: 12,
    },
    createError: { color: colors.danger, fontSize: 13 },
    createActions: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "flex-end" },
    cancelButton: { paddingHorizontal: 12, paddingVertical: 10 },
    cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: "700" },
    createButton: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 10,
      justifyContent: "center",
      minHeight: 42,
      minWidth: 124,
      paddingHorizontal: 12,
    },
    createButtonText: { color: colors.primaryText, fontSize: 13, fontWeight: "800" },
    playlistDetailsView: { marginTop: 26 },
    detailActions: { flexDirection: "row", gap: 10, marginBottom: 20 },
    detailActionButton: {
      alignItems: "center",
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 14,
    },
    detailActionText: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
    deleteActionButton: { borderColor: colors.danger },
    deleteActionText: { color: colors.danger, fontSize: 13, fontWeight: "700" },
    editForm: {
      backgroundColor: colors.surface,
      borderColor: colors.borderMuted,
      borderRadius: 16,
      borderWidth: 1,
      gap: 12,
      marginBottom: 20,
      padding: 16,
    },
    descriptionInput: { minHeight: 80, paddingTop: 12 },
    deleteConfirmation: {
      backgroundColor: colors.surface,
      borderColor: colors.danger,
      borderRadius: 14,
      borderWidth: 1,
      gap: 12,
      marginBottom: 20,
      padding: 16,
    },
    confirmDeleteButton: {
      alignItems: "center",
      backgroundColor: colors.danger,
      borderRadius: 10,
      justifyContent: "center",
      minHeight: 42,
      minWidth: 92,
      paddingHorizontal: 12,
    },
    confirmationText: { color: colors.textPrimary, fontSize: 14, lineHeight: 21 },
    detailSectionTitle: { color: colors.textPrimary, fontSize: 19, fontWeight: "800", marginBottom: 14 },
    detailAlbumList: { gap: 10 },
    detailAlbumRow: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.borderMuted,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      padding: 14,
    },
    detailAlbumCopy: { flex: 1, gap: 4 },
    detailAlbumTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
    detailAlbumArtist: { color: colors.textMuted, fontSize: 12 },
    removeAlbumButton: { paddingHorizontal: 4, paddingVertical: 8 },
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
    albumList: { gap: 4, marginTop: 6, overflow: "hidden" },
    albumItem: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
    albumPreviewMidFade: { opacity: 0.6 },
    albumPreviewFade: { opacity: 0.25 },
    moreAlbums: { color: colors.accent, fontSize: 11, fontWeight: "700" },
    homeButton: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 14,
      justifyContent: "center",
      marginBottom: 16,
      minHeight: 58,
      width: 58,
      alignSelf: "center",
    },
    pressed: { opacity: 0.75 },
    disabled: { opacity: 0.6 },
  });
}
