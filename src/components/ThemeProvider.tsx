"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_HUE,
  DEFAULT_MODE,
  HUES,
  STORAGE_KEYS,
  type HueName,
  type Mode,
} from "@/lib/theme";

type ThemeContextValue = {
  hue: HueName;
  mode: Mode;
  mounted: boolean;
  setHue: (hue: HueName) => void;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readAttr<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  if (typeof document === "undefined") return fallback;
  const v = document.documentElement.getAttribute(name);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Holds the active palette (hue) and light/dark mode, mirrors them onto the
 * <html data-hue / data-mode> attributes (which drive the CSS token system),
 * and persists them to localStorage. The no-FOUC bootstrap script has already
 * set the attributes before hydration, so we read the initial values back from
 * the DOM to stay consistent. Saved-to-Supabase sync (user_paleta/user_modo)
 * will be layered on later when auth/profile are wired.
 */
export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [hue, setHueState] = useState<HueName>(DEFAULT_HUE);
  const [mode, setModeState] = useState<Mode>(DEFAULT_MODE);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setHueState(readAttr(
      "data-hue",
      Object.keys(HUES) as HueName[],
      DEFAULT_HUE,
    ));
    setModeState(readAttr("data-mode", ["light", "dark"] as const, DEFAULT_MODE));
    setMounted(true);
  }, []);

  const setHue = useCallback((next: HueName) => {
    setHueState(next);
    document.documentElement.setAttribute("data-hue", next);
    try {
      localStorage.setItem(STORAGE_KEYS.hue, next);
    } catch {}
  }, []);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    document.documentElement.setAttribute("data-mode", next);
    try {
      localStorage.setItem(STORAGE_KEYS.mode, next);
    } catch {}
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  return (
    <ThemeContext.Provider value={{ hue, mode, mounted, setHue, setMode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
