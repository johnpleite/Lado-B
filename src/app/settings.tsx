import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { deleteUser, EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, updateEmail, updatePassword, User } from "firebase/auth";
import { deleteDoc, doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../lib/firebase";
import { ColorPalette } from "../theme/colors";
import { ThemeMode, useTheme } from "../theme/theme";

type Action = "username" | "email" | "password" | "delete";
type Profile = { username: string; email: string };

export default function Settings() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<Profile>({ username: "", email: "" });
  const [step, setStep] = useState<"options" | "confirm" | "edit" | "deleteConfirm">("options");
  const [action, setAction] = useState<Action | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newValue, setNewValue] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { colors, mode, setMode } = useTheme();
  const styles = createStyles(colors);

  async function loadProfile(uid: string) {
    const snapshot = await getDoc(doc(db, "usuarios", uid));
    const data = snapshot.data();
    setProfile({
      username: typeof data?.username === "string" ? data.username : "",
      email: typeof data?.email === "string" ? data.email : auth.currentUser?.email ?? "",
    });
  }

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    if (!nextUser) {
      router.replace("/");
      return;
    }
    setUser(nextUser);
    void loadProfile(nextUser.uid);
  }), [router]);

  function selectAction(nextAction: Action) {
    setAction(nextAction);
    setCurrentPassword("");
    setNewValue("");
    setConfirmNewPassword("");
    setError("");
    setMessage("");
    setStep("confirm");
  }

  async function confirmPassword() {
    if (!user || !currentPassword) {
      setError("Digite sua senha atual.");
      return;
    }
    setError("");
    setIsSaving(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? "", currentPassword));
      setStep(action === "delete" ? "deleteConfirm" : "edit");
    } catch (confirmationError) {
      setError(getErrorMessage(confirmationError));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveChange() {
    if (!user || !action) return;
    const value = newValue.trim();

    if (action === "username" && !/^[a-zA-Z0-9]{3,24}$/.test(value)) {
      setError("O username deve ter 3 a 24 caracteres e usar apenas letras e números.");
      return;
    }
    if (action === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setError("Digite um e-mail válido.");
      return;
    }
    if (action === "password" && value.length < 6) {
      setError("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (action === "password" && value !== confirmNewPassword) {
      setError("As novas senhas não coincidem.");
      return;
    }

    setError("");
    setMessage("");
    setIsSaving(true);
    try {
      if (action === "username") {
        const normalized = value.toLowerCase();
        await updateDoc(doc(db, "usuarios", user.uid), { username: normalized });
        setProfile((current) => ({ ...current, username: normalized }));
      } else if (action === "email") {
        const normalized = value.toLowerCase();
        await updateEmail(user, normalized);
        await updateDoc(doc(db, "usuarios", user.uid), { email: normalized });
        setProfile((current) => ({ ...current, email: normalized }));
      } else {
        await updatePassword(user, value);
      }

      setMessage("Alteração salva com sucesso.");
      setStep("options");
      setAction(null);
      setCurrentPassword("");
      setNewValue("");
      setConfirmNewPassword("");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAccount() {
    if (!user) return;

    setError("");
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, "usuarios", user.uid));
      await deleteUser(user);
      router.replace("/" as never);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsSaving(false);
    }
  }

  function goBack() {
    if (step === "options") {
      router.replace("/home" as never);
      return;
    }
    setStep("options");
    setAction(null);
    setError("");
  }

  const title = step === "options" ? "Sua conta, do seu jeito." : step === "confirm" ? "Confirme sua identidade." : step === "deleteConfirm" ? "Excluir conta?" : action === "username" ? "Novo username." : action === "email" ? "Novo e-mail." : "Nova senha.";
  const subtitle = step === "options" ? "Escolha o que deseja alterar." : step === "confirm" ? "Confirme sua senha atual para continuar." : step === "deleteConfirm" ? "Essa ação removerá sua conta permanentemente." : "Digite o novo dado da sua conta.";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={goBack} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
            <Text style={styles.backLabel}>{step === "options" ? "Voltar para o Lado B" : "Voltar"}</Text>
          </Pressable>
          <Text style={styles.kicker}>CONFIGURAÇÕES</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {step === "options" && <>
            <View style={styles.appearance}>
              <Text style={styles.appearanceTitle}>Aparência</Text>
              <Text style={styles.appearanceDescription}>Escolha o tema do aplicativo.</Text>
              <View style={styles.themeOptions}>
                <ThemeButton label="Claro" value="light" selectedMode={mode} onSelect={setMode} />
                <ThemeButton label="Escuro" value="dark" selectedMode={mode} onSelect={setMode} />
              </View>
            </View>
            <View style={styles.options}>
              <Option label="Alterar username" value={`@${profile.username}`} onPress={() => selectAction("username")} />
              <Option label="Alterar e-mail" value={profile.email} onPress={() => selectAction("email")} />
              <Option label="Alterar senha" value="Senha protegida" onPress={() => selectAction("password")} />
              <Option label="Deletar conta" value="Ação permanente" destructive onPress={() => selectAction("delete")} />
            </View>
          </>}

          {step === "confirm" && <View style={styles.form}>
            <Field label="Senha atual" placeholder="Digite sua senha atual" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
            <ActionButton label="Confirmar senha" busy={isSaving} onPress={confirmPassword} />
          </View>}

          {step === "edit" && action === "username" && <View style={styles.form}>
            <Field label="Username atual" value={`@${profile.username}`} editable={false} />
            <Field label="Novo username" placeholder="ex: ladob" autoCapitalize="none" value={newValue} onChangeText={setNewValue} />
            <ActionButton label="Salvar username" busy={isSaving} onPress={saveChange} />
          </View>}
          {step === "edit" && action === "email" && <View style={styles.form}>
            <Field label="E-mail atual" value={profile.email} editable={false} />
            <Field label="Novo e-mail" placeholder="novo@email.com" keyboardType="email-address" autoCapitalize="none" value={newValue} onChangeText={setNewValue} />
            <ActionButton label="Salvar e-mail" busy={isSaving} onPress={saveChange} />
          </View>}
          {step === "edit" && action === "password" && <View style={styles.form}>
            <Field label="Nova senha" placeholder="Digite a nova senha" secureTextEntry value={newValue} onChangeText={setNewValue} />
            <Field label="Confirmar nova senha" placeholder="Repita a nova senha" secureTextEntry value={confirmNewPassword} onChangeText={setConfirmNewPassword} />
            <ActionButton label="Salvar senha" busy={isSaving} onPress={saveChange} />
          </View>}
          {step === "deleteConfirm" && <View style={styles.form}>
            <Text style={styles.deleteWarning}>Seu username, e-mail, senha e perfil serão removidos definitivamente.</Text>
            <ActionButton label="Sim, deletar minha conta" busy={isSaving} destructive onPress={deleteAccount} />
          </View>}

          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!message && <Text style={styles.message}>{message}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Option({ label, value, onPress, destructive = false }: { label: string; value: string; onPress: () => void; destructive?: boolean }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return <Pressable onPress={onPress} style={({ pressed }) => [styles.option, destructive && styles.deleteOption, pressed && styles.pressed]}><View><Text style={[styles.optionLabel, destructive && styles.deleteText]}>{label}</Text><Text style={[styles.optionValue, destructive && styles.deleteText]}>{value}</Text></View><Text style={[styles.optionArrow, destructive && styles.deleteText]}>›</Text></Pressable>;
}

function ActionButton({ label, busy, onPress, destructive = false }: { label: string; busy: boolean; onPress: () => void; destructive?: boolean }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return <Pressable disabled={busy} onPress={onPress} style={({ pressed }) => [styles.button, destructive && styles.deleteButton, pressed && styles.pressed]}>{busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.buttonText}>{label}</Text>}</Pressable>;
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor={colors.placeholder} style={styles.input} {...props} /></View>;
}

function ThemeButton({ label, value, selectedMode, onSelect }: { label: string; value: ThemeMode; selectedMode: ThemeMode; onSelect: (mode: ThemeMode) => void }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const selected = value === selectedMode;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onSelect(value)}
      style={({ pressed }) => [
        styles.themeButton,
        selected && styles.themeButtonSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.themeButtonText, selected && styles.themeButtonTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    switch (error.code) {
      case "auth/wrong-password":
      case "auth/invalid-credential": return "A senha atual está incorreta.";
      case "auth/email-already-in-use": return "Este e-mail já está em uso.";
      case "auth/requires-recent-login": return "Confirme novamente sua senha atual.";
      case "auth/invalid-email": return "Digite um e-mail válido.";
    }
  }
  return "Não foi possível atualizar esta informação.";
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  keyboardView: { flex: 1 },
  content: { padding: 28, paddingBottom: 48 },
  backButton: { alignItems: "center", flexDirection: "row", marginBottom: 48 },
  backText: { color: colors.textPrimary, fontSize: 34, lineHeight: 26, marginRight: 8 },
  backLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: "700" },
  kicker: { color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 2, marginBottom: 12 },
  title: { color: colors.textPrimary, fontSize: 34, fontWeight: "800", lineHeight: 42 },
  subtitle: { color: colors.textMuted, fontSize: 16, lineHeight: 24, marginTop: 12 },
  appearance: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 32,
    padding: 18,
  },
  appearanceTitle: { color: colors.textLabel, fontSize: 16, fontWeight: "800" },
  appearanceDescription: { color: colors.textMuted, fontSize: 13, marginTop: 5 },
  themeOptions: { flexDirection: "row", gap: 10, marginTop: 16 },
  themeButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  themeButtonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  themeButtonText: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  themeButtonTextSelected: { color: colors.primaryText },
  options: { gap: 12, marginTop: 16 },
  option: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 18,
  },
  optionLabel: { color: colors.textLabel, fontSize: 16, fontWeight: "800" },
  optionValue: { color: colors.textSubtle, fontSize: 13, marginTop: 5 },
  optionArrow: { color: colors.accent, fontSize: 28 },
  deleteOption: { borderColor: colors.dangerBorder },
  deleteText: { color: colors.danger },
  form: { gap: 18, marginTop: 38 },
  field: { gap: 8 },
  label: { color: colors.textLabel, fontSize: 13, fontWeight: "800" },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 16,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 14,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 58,
  },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: "800" },
  deleteButton: { backgroundColor: colors.danger },
  pressed: { opacity: 0.75 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: 16, textAlign: "center" },
  message: { color: colors.success, fontSize: 13, lineHeight: 19, marginTop: 16, textAlign: "center" },
  deleteWarning: { color: colors.danger, fontSize: 15, lineHeight: 23, textAlign: "center" },
  });
}
