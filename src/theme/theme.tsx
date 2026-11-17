import React, { createContext, useContext, useMemo, useState } from "react";
import { ColorPalette, darkColors, lightColors } from "./colors";

export type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  colors: ColorPalette;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const colors = mode === "dark" ? darkColors : lightColors;
  const value = useMemo(() => ({ colors, mode, setMode }), [colors, mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error("useTheme must be used within a ThemeProvider.");
  }
  return theme;
}
