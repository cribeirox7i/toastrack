"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCatalog } from "@/components/CatalogProvider";
import { useTheme } from "@/components/ThemeProvider";
import Icon from "@/components/Icon";
import { initialsFor } from "@/lib/utils";
import { paletteEnumToHue } from "@/lib/theme";
import { TYPE_LABELS, type Item, type ItemType } from "@/lib/catalog";
import { fetchFollowedProfiles, type SecondaryProfile } from "@/lib/profiles";
import HomeScreen from "@/components/app/HomeScreen";
import ProfileScreen from "@/components/app/ProfileScreen";
import ListScreen from "@/components/app/ListScreen";
import DetailScreen from "@/components/app/DetailScreen";
import StatsScreen from "@/components/app/StatsScreen";

type View = "home" | ItemType | "profile" | "stats" | "detail";

const MAIN_TABS: { key: "home" | ItemType; label: string; icon: string }[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "beer", label: "Cervejas", icon: "beer" },
  { key: "wine", label: "Vinhos", icon: "wine" },
  { key: "drink", label: "Drinks", icon: "drink" },
  { key: "spirit", label: "Destilados", icon: "spirit" },
];

function isMainView(v: View): v is "home" | ItemType {
  return v === "home" || v === "beer" || v === "wine" || v === "drink" || v === "spirit";
}

export default function MainApp() {
  const { appUser, userId, userEmail } = useAuth();
  const { reload: reloadCatalog } = useCatalog();
  const { setHue, setMode } = useTheme();
  const ownUserId = userId ?? "";
  const name = appUser?.user_nome ?? userEmail ?? "";

  // Apply the user's saved palette/mode once when their profile loads (Supabase
  // is the source of truth across devices; overrides the localStorage bootstrap).
  const prefsAppliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (appUser && prefsAppliedFor.current !== appUser.user_id) {
      prefsAppliedFor.current = appUser.user_id ?? null;
      setHue(paletteEnumToHue(appUser.user_paleta ?? ""));
      if (appUser.user_modo === "light" || appUser.user_modo === "dark") setMode(appUser.user_modo);
    }
  }, [appUser, setHue, setMode]);

  const [view, setView] = useState<View>("home");
  const [prevView, setPrevView] = useState<"home" | ItemType>("home");
  const [statsType, setStatsType] = useState<ItemType>("beer");
  const [query, setQuery] = useState("");

  // Detail/edit screen state.
  const [detailType, setDetailType] = useState<ItemType>("beer");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);

  // Secondary-profile state (persists across category tabs; resets on remount = login/logout).
  const [secondaryProfiles, setSecondaryProfiles] = useState<SecondaryProfile[]>([]);
  const [viewedProfileId, setViewedProfileId] = useState<string | null>(null);

  useEffect(() => {
    fetchFollowedProfiles().then(setSecondaryProfiles);
  }, []);

  const main = isMainView(view);

  function openTab(key: "home" | ItemType) {
    setView(key);
    setQuery("");
  }
  function openProfile() {
    if (isMainView(view)) setPrevView(view);
    setView("profile");
  }
  function openStats(type: ItemType) {
    if (isMainView(view)) setPrevView(view);
    setStatsType(type);
    setView("stats");
  }
  function goBack() {
    setView(prevView);
  }
  function openItem(item: Item) {
    if (isMainView(view)) setPrevView(view);
    setDetailType(item.type);
    setDetailId(item.id);
    setDetailEditing(false);
    setView("detail");
  }
  function editItem(item: Item) {
    if (isMainView(view)) setPrevView(view);
    setDetailType(item.type);
    setDetailId(item.id);
    setDetailEditing(true);
    setView("detail");
  }
  function addItem(type: ItemType) {
    if (isMainView(view)) setPrevView(view);
    setDetailType(type);
    setDetailId(null);
    setDetailEditing(true);
    setView("detail");
  }
  function closeDetail() {
    setView(prevView);
  }

  const avatarBtn = (
    <button
      onClick={openProfile}
      aria-label="Perfil"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent"
    >
      {initialsFor(name)}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Desktop top nav (main views) */}
      {main && (
        <nav className="hidden items-center gap-2 border-b border-border px-5 py-2.5 sm:flex">
          <button onClick={() => openTab("home")} className="mr-2 flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft">
              <span className="size-3.5 rounded-full bg-accent" />
            </span>
            <span className="text-[16px] font-extrabold tracking-tight">Toastrack</span>
          </button>
          <div className="flex items-center gap-1">
            {MAIN_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => openTab(t.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13.5px] font-bold transition ${
                  view === t.key ? "bg-accent-soft text-accent" : "text-muted hover:text-text"
                }`}
              >
                <Icon name={t.icon} size={17} />
                {t.label}
              </button>
            ))}
          </div>
          <div className="ml-auto">{avatarBtn}</div>
        </nav>
      )}

      {/* Sub-header: search on Home, back on profile/stats. Category lists render their own header. */}
      {view === "home" && (
        <header className="flex items-center gap-2 border-b border-border px-5 py-2.5">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="search" size={17} />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, fabricante, país…"
              className="w-full rounded-full border border-border bg-surface py-2.5 pl-9 pr-4 text-[14px] outline-none placeholder:text-muted focus:border-accent"
            />
          </div>
          <div className="sm:hidden">{avatarBtn}</div>
        </header>
      )}
      {(view === "profile" || view === "stats") && (
        <header className="flex items-center border-b border-border px-5 py-3">
          <button onClick={goBack} className="text-[13px] font-bold text-accent">
            ← Voltar
          </button>
          <div className="mx-auto text-[16px] font-extrabold">
            {view === "profile" ? "Perfil" : TYPE_LABELS[statsType]}
          </div>
          <div className="w-14" />
        </header>
      )}

      {/* Content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {view === "home" && (
          <div className="flex-1 overflow-y-auto">
            <HomeScreen searchQuery={query} onOpenStats={openStats} onOpenItem={openItem} />
          </div>
        )}
        {isMainView(view) && view !== "home" && (
          <ListScreen
            listType={view}
            ownUserId={ownUserId}
            ownName={name}
            secondaryProfiles={secondaryProfiles}
            viewedProfileId={viewedProfileId}
            onSelectProfile={setViewedProfileId}
            onOpenProfile={openProfile}
            onOpenItem={openItem}
            onEditItem={editItem}
            onAddItem={() => addItem(view)}
            onCatalogChanged={reloadCatalog}
          />
        )}
        {view === "detail" && (
          <DetailScreen
            type={detailType}
            itemId={detailId}
            initialEditing={detailEditing}
            ownUserId={ownUserId}
            onClose={closeDetail}
            onChanged={reloadCatalog}
          />
        )}
        {view === "stats" && (
          <div className="flex-1 overflow-y-auto">
            <StatsScreen type={statsType} />
          </div>
        )}
        {view === "profile" && (
          <div className="flex-1 overflow-y-auto">
            <ProfileScreen />
          </div>
        )}
      </main>

      {/* Mobile bottom nav (main views) */}
      {main && (
        <nav className="flex border-t border-border sm:hidden">
          {MAIN_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => openTab(t.key)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition ${
                view === t.key ? "text-accent" : "text-muted"
              }`}
            >
              <Icon name={t.icon} size={21} />
              {t.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
