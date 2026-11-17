import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import { Platform, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { getAlbumCover } from "../lib/albumCovers";
import { Album } from "../lib/albums";
import { ColorPalette } from "../theme/colors";
import { useTheme } from "../theme/theme";

type AlbumCoverProps = {
  album: Album;
  style: StyleProp<ViewStyle>;
  noteStyle: StyleProp<TextStyle>;
};

export function AlbumCover({ album, style, noteStyle }: AlbumCoverProps) {
  const [loadedCover, setLoadedCover] = useState<{ albumId: string; uri: string | null } | null>(null);
  const coverUri = loadedCover?.albumId === album.id ? loadedCover.uri : null;
  const { colors } = useTheme();
  const styles = createStyles(colors);

  useEffect(() => {
    let isActive = true;
    void getAlbumCover(album).then((uri) => {
      if (isActive) setLoadedCover({ albumId: album.id, uri });
    }).catch((error: unknown) => {
      console.warn(`Failed to load album cover for ${album.id}.`, error);
    });

    return () => {
      isActive = false;
    };
  }, [album]);

  return (
    <View style={[styles.container, style]}>
      {coverUri ? (
        <Image
          cachePolicy={Platform.OS === "web" ? "memory" : "none"}
          contentFit="cover"
          onError={() => setLoadedCover({ albumId: album.id, uri: null })}
          source={{ uri: coverUri }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Text style={[styles.note, noteStyle]}>♫</Text>
      )}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      alignItems: "center",
      backgroundColor: colors.background,
      justifyContent: "center",
      overflow: "hidden",
    },
    note: { color: colors.accent, fontSize: 46, fontWeight: "800" },
  });
}
