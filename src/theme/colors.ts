export const lightColors = {
  background: "#F2F4FF",
  surface: "#FFFFFF",
  textPrimary: "#182452",
  textSecondary: "#53618F",
  textLabel: "#263568",
  textMuted: "#64709A",
  textSubtle: "#7D88AD",
  placeholder: "#829397",
  accent: "#6657C8",
  primary: "#263B91",
  primaryText: "#F3F5FF",
  border: "#CDD5F0",
  borderMuted: "#DDE3F7",
  danger: "#B4234D",
  dangerBorder: "#E8B6C2",
  warning: "#C27A2C",
  info: "#4E70C8",
  success: "#23836B",
  welcomeMuted: "#64709A",
} as const;

export const darkColors = {
  background: "#10183C",
  surface: "#182452",
  textPrimary: "#F3F5FF",
  textSecondary: "#B7C0DD",
  textLabel: "#E6E9FF",
  textMuted: "#B7C0DD",
  textSubtle: "#AAB4D9",
  placeholder: "#8995C0",
  accent: "#9EA9FF",
  primary: "#8490FF",
  primaryText: "#10183C",
  border: "#5E6DA8",
  borderMuted: "#5E6DA8",
  danger: "#FF8FA3",
  dangerBorder: "#823B59",
  warning: "#FFCB8A",
  info: "#9EA9FF",
  success: "#62D5B0",
  welcomeMuted: "#B7C0DD",
} as const;

export type ColorPalette = {
  [Key in keyof typeof lightColors]: string;
};
