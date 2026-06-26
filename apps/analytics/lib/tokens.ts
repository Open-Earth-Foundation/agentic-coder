// OEF Brand Tokens (sourced from CityCatalyst app theme)

export const BRAND = {
  primary: "#2351DC",
  primaryDeep: "#001EA7",
  primaryLight: "#E8EAFB",
  primaryMuted: "#D7DDF7",
} as const;

export const TEXT = {
  primary: "#00001F",
  secondary: "#232640",
  tertiary: "#7A7B9A",
  inverse: "#FFFFFF",
} as const;

export const BG = {
  base: "#FFFFFF",
  subtle: "#F9FAFB",
  card: "#FFFFFF",
  alt: "#F3F4F6",
  panel: "#FAFAFA",
} as const;

export const BORDER = {
  default: "#E5E7EB",
  strong: "#D1D5DB",
  brand: "#2351DC",
} as const;

export const SEMANTIC = {
  success: "#16A34A",
  successBg: "#DCFCE7",
  successFg: "#166534",
  warning: "#D97706",
  warningBg: "#FEF3C7",
  warningFg: "#92400E",
  danger: "#DC2626",
  dangerBg: "#FEE2E2",
  dangerFg: "#991B1B",
  info: "#2351DC",
  infoBg: "#DBEAFE",
  infoFg: "#1E40AF",
} as const;

export const DOMAIN_COLORS = {
  product: { bg: "#DBEAFE", fg: "#1E40AF", border: "#93C5FD" },
  ai: { bg: "#FEF3C7", fg: "#92400E", border: "#FCD34D" },
  engineering: { bg: "#DCFCE7", fg: "#166534", border: "#86EFAC" },
  leadership: { bg: "#F3E8FF", fg: "#6B21A8", border: "#D8B4FE" },
} as const;
