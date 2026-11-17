import { Stack } from "expo-router";
import React from "react";
import { ThemeProvider } from "../theme/theme";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
