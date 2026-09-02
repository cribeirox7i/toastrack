/**
 * Toastrack theme model. A palette is identified internally by a short English
 * hue key (used in the `data-hue` attribute and CSS), and carries the Portuguese
 * label shown in the UI plus the Supabase `user_paleta` enum value it maps to.
 * The OKLCH curves live in globals.css — this file only names the options.
 */

export const HUES = {
  green: 150,
  blue: 245,
  red: 22,
  orange: 55,
  yellow: 95,
  purple: 300,
  pink: 350,
} as const;

export type HueName = keyof typeof HUES;
export type Mode = "light" | "dark";

/** Palettes in the product owner's confirmed order. `enumValue` = Supabase user_paleta. */
export const PALETTES: {
  name: HueName;
  labelPt: string;
  enumValue: "Verde" | "Vermelho" | "Amarelo" | "Azul" | "Roxo" | "Rosa" | "Laranja";
  hue: number;
}[] = [
  { name: "green", labelPt: "Verde", enumValue: "Verde", hue: 150 },
  { name: "red", labelPt: "Vermelho", enumValue: "Vermelho", hue: 22 },
  { name: "yellow", labelPt: "Amarelo", enumValue: "Amarelo", hue: 95 },
  { name: "blue", labelPt: "Azul", enumValue: "Azul", hue: 245 },
  { name: "purple", labelPt: "Roxo", enumValue: "Roxo", hue: 300 },
  { name: "pink", labelPt: "Rosa", enumValue: "Rosa", hue: 350 },
  { name: "orange", labelPt: "Laranja", enumValue: "Laranja", hue: 55 },
];

export const HUE_NAMES = PALETTES.map((p) => p.name);

/** Supabase user_paleta enum value -> internal hue key (for loading saved prefs). */
export function paletteEnumToHue(enumValue: string): HueName {
  return PALETTES.find((p) => p.enumValue === enumValue)?.name ?? "green";
}

/** Internal hue key -> Supabase user_paleta enum value (for saving prefs). */
export function hueToPaletteEnum(hue: HueName): string {
  return PALETTES.find((p) => p.name === hue)?.enumValue ?? "Verde";
}

// Padrão pra quem nunca configurou preferência (primeiro login, ou a tela de login antes de
// autenticar) — decisão do Carlos em 2026-09-02, inspirada numa referência de app de cerveja.
// Continua 100% trocável por usuário em Perfil > Paleta/Modo; não muda a preferência de quem já
// tinha salvo a própria (ver `prefsAppliedFor` em MainApp.tsx, que só aplica o hue/modo salvos do
// usuário quando existem).
export const DEFAULT_HUE: HueName = "orange";
export const DEFAULT_MODE: Mode = "dark";

export const STORAGE_KEYS = {
  hue: "tt.hue",
  mode: "tt.mode",
} as const;

/** Inline no-FOUC bootstrap: applies saved hue/mode to <html> before first paint.
 *  Injected as a raw <script> in layout.tsx (runs before React hydrates). */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{
  var h=localStorage.getItem('${STORAGE_KEYS.hue}');
  var m=localStorage.getItem('${STORAGE_KEYS.mode}');
  var el=document.documentElement;
  if(h)el.setAttribute('data-hue',h);
  if(m)el.setAttribute('data-mode',m);
}catch(e){}})();`;
