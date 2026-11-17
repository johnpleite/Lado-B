import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { signInWithEmailAndPassword } from "firebase/auth";
import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../lib/firebase";
import { ColorPalette } from "../theme/colors";
import { useTheme } from "../theme/theme";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { colors, mode } = useTheme();
  const styles = createStyles(colors);

  async function handleLogin() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError("Preencha e-mail e senha.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
      setError("Digite um e-mail válido, como voce@gmail.com.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
      router.replace("/home" as never);
    } catch (loginError) {
      setError(getLoginErrorMessage(loginError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" style={styles.scrollView}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
            <Text style={styles.backLabel}>Voltar</Text>
          </Pressable>
          <Text style={styles.title}>Entrar</Text>
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>E-mail</Text>
              <TextInput autoCapitalize="none" keyboardType="email-address" placeholder="Digite seu e-mail" placeholderTextColor={colors.placeholder} style={styles.input} value={email} onChangeText={setEmail} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Senha</Text>
              <TextInput placeholder="Digite sua senha" placeholderTextColor={colors.placeholder} secureTextEntry style={styles.input} value={password} onChangeText={setPassword} />
            </View>
          </View>
          <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={handleLogin} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            {isSubmitting ? <ActivityIndicator color={colors.background} /> : <Text style={styles.buttonText}>Entrar</Text>}
          </Pressable>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable accessibilityRole="button" onPress={() => router.push("/register")} style={styles.registerLink}>
            <Text style={styles.registerText}>Ainda não tem uma conta? <Text style={styles.registerStrong}>Cadastre-se</Text></Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getLoginErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password": return "E-mail ou senha incorretos.";
      case "auth/invalid-email": return "Digite um e-mail válido.";
    }
  }
  return "Não foi possível entrar. Tente novamente.";
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  keyboardView: { flex: 1 },
  scrollView: { flex: 1 },
  content: { padding: 28, paddingBottom: 96 },
  backButton: { alignItems: "center", flexDirection: "row", marginBottom: 56 },
  backText: { color: colors.textPrimary, fontSize: 34, lineHeight: 26, marginRight: 8 },
  backLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: "700" },
  title: { color: colors.textPrimary, fontSize: 38, fontWeight: "800", lineHeight: 44 },
  form: { gap: 20, marginTop: 32 },
  field: { gap: 8 },
  label: { color: colors.textLabel, fontSize: 13, fontWeight: "800" },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.textPrimary, fontSize: 16, minHeight: 56, paddingHorizontal: 16 },
  button: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 14, justifyContent: "center", marginTop: 34, minHeight: 58 },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.75 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: 16, textAlign: "center" },
  registerLink: { alignItems: "center", marginTop: 26 },
  registerText: { color: colors.textMuted, fontSize: 14 },
  registerStrong: { color: colors.accent, fontWeight: "800" },
  });
}
