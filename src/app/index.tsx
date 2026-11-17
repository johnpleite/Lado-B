import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../lib/firebase";
import { ColorPalette } from "../theme/colors";
import { useTheme } from "../theme/theme";

export default function Index() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const { colors, mode } = useTheme();
  const styles = createStyles(colors);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/home" as never);
      } else {
        setCheckingSession(false);
      }
    });
  }, [router]);

  if (checkingSession) return null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <View style={styles.hero}>
        <Image source={require("../../assets/images/icon.png")} style={styles.logo} />
        <Text style={styles.brand}>LADO B</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          onPress={() => router.push("/register")}
        >
          <Text style={styles.primaryButtonText}>Criar uma conta</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          onPress={() => router.push("/login")}
        >
          <Text style={styles.secondaryButtonText}>Fazer login</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    backgroundColor: colors.background,
    paddingHorizontal: 28,
    paddingVertical: 30,
  },
  hero: { alignItems: "center", paddingTop: 54 },
  logo: { borderRadius: 24, height: 108, marginBottom: 36, width: 108 },
  brand: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 2,
  },
  actions: { gap: 14, width: "100%" },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 56,
  },
  primaryButtonText: { color: colors.primaryText, fontSize: 16, fontWeight: "800" },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 56,
  },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.75 },
  footer: { color: colors.textSubtle, fontSize: 12, marginTop: 10, textAlign: "center" },
  });
}
