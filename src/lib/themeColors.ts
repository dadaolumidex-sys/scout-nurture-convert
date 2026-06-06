// Runtime theme color system.
// Lets the user switch the whole app's accent colors (buttons, links, chat
// highlights, sidebar, gradients) from Settings. Values are applied as CSS
// variables on the document root and persisted in localStorage.

export interface ThemePreset {
  id: string;
  name: string;
  swatch: string; // hsl preview color for the picker
  vars: Record<string, string>;
}

const makeVars = (opts: {
  primary: string;
  secondary: string;
  accent: string;
  accentFg: string;
}): Record<string, string> => {
  const { primary, secondary, accent, accentFg } = opts;
  return {
    "--primary": primary,
    "--secondary": secondary,
    "--accent": accent,
    "--accent-foreground": accentFg,
    "--ring": primary,
    "--info": secondary,
    "--sidebar-primary": primary,
    "--sidebar-ring": primary,
    "--gradient-primary": `linear-gradient(135deg, hsl(${primary}), hsl(${secondary}))`,
    "--gradient-secondary": `linear-gradient(135deg, hsl(${secondary}), hsl(${primary}))`,
    "--glow-primary": `0 0 20px hsl(${primary} / 0.3)`,
    "--glow-secondary": `0 0 20px hsl(${secondary} / 0.25)`,
  };
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "brown",
    name: "Warm Brown",
    swatch: "28 55% 48%",
    vars: makeVars({ primary: "28 55% 48%", secondary: "35 60% 55%", accent: "28 35% 18%", accentFg: "32 60% 74%" }),
  },
  {
    id: "emerald",
    name: "Emerald",
    swatch: "160 84% 40%",
    vars: makeVars({ primary: "160 84% 40%", secondary: "168 60% 45%", accent: "160 40% 16%", accentFg: "156 72% 70%" }),
  },
  {
    id: "ocean",
    name: "Ocean Blue",
    swatch: "200 85% 50%",
    vars: makeVars({ primary: "200 85% 50%", secondary: "190 70% 50%", accent: "200 40% 18%", accentFg: "195 75% 72%" }),
  },
  {
    id: "indigo",
    name: "Midnight Indigo",
    swatch: "245 75% 62%",
    vars: makeVars({ primary: "245 75% 62%", secondary: "255 65% 66%", accent: "245 40% 20%", accentFg: "248 75% 80%" }),
  },
  {
    id: "violet",
    name: "Electric Violet",
    swatch: "270 72% 62%",
    vars: makeVars({ primary: "270 72% 62%", secondary: "285 65% 64%", accent: "270 40% 20%", accentFg: "275 75% 82%" }),
  },
  {
    id: "rose",
    name: "Rose Pink",
    swatch: "340 75% 58%",
    vars: makeVars({ primary: "340 75% 58%", secondary: "350 70% 62%", accent: "340 40% 20%", accentFg: "345 75% 80%" }),
  },
  {
    id: "gold",
    name: "Golden Yellow",
    swatch: "45 100% 58%",
    vars: makeVars({ primary: "45 100% 58%", secondary: "200 70% 50%", accent: "45 40% 18%", accentFg: "45 90% 75%" }),
  },
];

const STORAGE_KEY = "streamscout_theme_color";
const DEFAULT_THEME = "brown";

export const getStoredTheme = (): string => {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

export const applyTheme = (id: string) => {
  const preset = THEME_PRESETS.find((p) => p.id === id) || THEME_PRESETS[0];
  const root = document.documentElement;
  Object.entries(preset.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  try {
    localStorage.setItem(STORAGE_KEY, preset.id);
  } catch {
    /* ignore */
  }
};

export const applyStoredTheme = () => applyTheme(getStoredTheme());
