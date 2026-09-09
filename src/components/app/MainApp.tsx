"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCatalog } from "@/components/CatalogProvider";
import { useTheme } from "@/components/ThemeProvider";
import Icon from "@/components/Icon";
import RefreshButton from "@/components/RefreshButton";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Avatar } from "@/components/ui";
import { refreshAllWithMessage } from "@/lib/refreshAll";
import { paletteEnumToHue } from "@/lib/theme";
import { TYPE_LABELS, type Item, type ItemType } from "@/lib/catalog";
import { fetchFollowedProfiles, type SecondaryProfile } from "@/lib/profiles";
import HomeScreen from "@/components/app/HomeScreen";
import ProfileScreen from "@/components/app/ProfileScreen";
import ListScreen, { type SearchField, type ViewMode } from "@/components/app/ListScreen";
import DetailScreen from "@/components/app/DetailScreen";
import StatsScreen from "@/components/app/StatsScreen";
import GlobalPhotoToast from "@/components/app/GlobalPhotoToast";

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
  // Modo de exibição da lista (deck/tabela/galeria) - fica AQUI porque a ListScreen desmonta ao
  // abrir o Detalhe; guardado nela, voltava sempre pro "deck" (relato do Carlos 2026-09-09).
  const [listViewMode, setListViewMode] = useState<ViewMode>("deck");
  // Busca da lista - aqui e não na ListScreen (que desmonta ao abrir o Detalhe), senão voltar de
  // um item abria a lista sem o filtro (relato do Carlos 2026-09-09).
  const [listQuery, setListQuery] = useState("");
  const [listSearchField, setListSearchField] = useState<SearchField>("all");

  // Detail/edit screen state.
  const [detailType, setDetailType] = useState<ItemType>("beer");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);
  // Duplicar: abre a tela como item NOVO (detailId null), mas pré-preenchido com os dados deste
  // id. O item só é criado de fato no Salvar (pedido do Carlos 2026-09-08).
  const [detailDuplicateFrom, setDetailDuplicateFrom] = useState<string | null>(null);

  // Secondary-profile state (persists across category tabs; resets on remount = login/logout).
  const [secondaryProfiles, setSecondaryProfiles] = useState<SecondaryProfile[]>([]);
  const [viewedProfileId, setViewedProfileId] = useState<string | null>(null);

  useEffect(() => {
    fetchFollowedProfiles().then(setSecondaryProfiles);
  }, []);

  // Puxar-pra-baixo em Home/Stats (ver PullToRefresh.tsx). Mesma reconciliação completa do botão
  // "Atualizar dados" da barra. O `notifyChange()` de `refreshAllNow` já atualiza os hooks de
  // catálogo; o toast é só o retorno visível.
  const [refreshMsg, setRefreshMsg] = useState("");
  const onPullRefresh = useCallback(async () => {
    const msg = await refreshAllWithMessage();
    setRefreshMsg(msg);
    window.setTimeout(() => setRefreshMsg(""), 5000);
  }, []);

  const main = isMainView(view);

  // Botão "voltar" do celular / navegador: enquanto uma tela de sobreposição (detalhe/perfil/
  // stats) está aberta, o back deve FECHAR ela e voltar pra lista - não sair do PWA (pedido do
  // Carlos 2026-09-09). Empurra uma entrada no histórico ao abrir a sobreposição; o `popstate`
  // devolve a view anterior. Os botões "Voltar" internos chamam `history.back()`, pra o histórico
  // desenrolar simétrico.
  const overlay = view === "detail" || view === "profile" || view === "stats";
  const prevViewRef = useRef(prevView);
  useEffect(() => {
    prevViewRef.current = prevView;
  }, [prevView]);
  // Verdadeiro só enquanto a NOSSA entrada de histórico está no topo. Impede `closeOverlay` de
  // chamar `history.back()` quando não há o que desempilhar (o back sairia do PWA).
  const overlayPushed = useRef(false);
  useEffect(() => {
    if (!overlay) return;
    window.history.pushState({ ttOverlay: true }, "");
    overlayPushed.current = true;
    function onPop() {
      overlayPushed.current = false;
      setView(prevViewRef.current);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [overlay]);

  function closeOverlay() {
    if (overlayPushed.current) {
      overlayPushed.current = false;
      window.history.back(); // dispara o popstate, que faz o setView
    } else {
      setView(prevViewRef.current);
    }
  }

  function openTab(key: "home" | ItemType) {
    // Trocar de categoria zera a busca (voltar de um item, não - aí passa por closeOverlay).
    if (key !== view) {
      setListQuery("");
      setListSearchField("all");
    }
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
    closeOverlay();
  }
  function openItem(item: Item) {
    if (isMainView(view)) setPrevView(view);
    setDetailType(item.type);
    setDetailId(item.id);
    setDetailDuplicateFrom(null);
    setDetailEditing(false);
    setView("detail");
  }
  function editItem(item: Item) {
    if (isMainView(view)) setPrevView(view);
    setDetailType(item.type);
    setDetailId(item.id);
    setDetailDuplicateFrom(null);
    setDetailEditing(true);
    setView("detail");
  }
  function addItem(type: ItemType) {
    if (isMainView(view)) setPrevView(view);
    setDetailType(type);
    setDetailId(null);
    setDetailDuplicateFrom(null);
    setDetailEditing(true);
    setView("detail");
  }
  function duplicateItem(type: ItemType, sourceId: string) {
    if (isMainView(view)) setPrevView(view);
    setDetailType(type);
    setDetailId(null);
    setDetailDuplicateFrom(sourceId);
    setDetailEditing(true);
    setView("detail");
  }
  function closeDetail() {
    closeOverlay();
  }

  const avatarBtn = (
    <button onClick={openProfile} aria-label="Perfil">
      <Avatar url={appUser?.user_url_img} name={name} className="size-9 text-[13px]" />
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
          <div className="ml-auto flex items-center gap-2">
            <RefreshButton />
            {avatarBtn}
          </div>
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
          <div className="flex items-center gap-2 sm:hidden">
            <RefreshButton />
            {avatarBtn}
          </div>
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
          <RefreshButton />
        </header>
      )}

      {/* Content */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {view === "home" && (
          <PullToRefresh onRefresh={onPullRefresh} className="min-h-0 flex-1">
            <HomeScreen searchQuery={query} onOpenStats={openStats} onOpenItem={openItem} />
          </PullToRefresh>
        )}
        {isMainView(view) && view !== "home" && (
          <ListScreen
            listType={view}
            ownUserId={ownUserId}
            ownName={name}
            ownAvatarUrl={appUser?.user_url_img}
            secondaryProfiles={secondaryProfiles}
            viewedProfileId={viewedProfileId}
            onSelectProfile={setViewedProfileId}
            onOpenProfile={openProfile}
            onOpenItem={openItem}
            onEditItem={editItem}
            onDuplicateItem={(item) => duplicateItem(item.type, item.id)}
            onAddItem={() => addItem(view)}
            onCatalogChanged={reloadCatalog}
            viewMode={listViewMode}
            onViewModeChange={setListViewMode}
            query={listQuery}
            onQueryChange={setListQuery}
            searchField={listSearchField}
            onSearchFieldChange={setListSearchField}
          />
        )}
        {view === "detail" && (
          <DetailScreen
            key={`${detailType}-${detailId ?? "new"}-${detailDuplicateFrom ?? ""}`}
            type={detailType}
            itemId={detailId}
            duplicateFromId={detailDuplicateFrom}
            initialEditing={detailEditing}
            ownUserId={ownUserId}
            onClose={closeDetail}
            onChanged={reloadCatalog}
            onDuplicate={duplicateItem}
          />
        )}
        {view === "stats" && (
          <PullToRefresh onRefresh={onPullRefresh} className="min-h-0 flex-1">
            <StatsScreen type={statsType} />
          </PullToRefresh>
        )}
        {view === "profile" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
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

      {/* Foto sobe em segundo plano (ver photoUpload.ts) - este toast é o único jeito de o
       *  usuário saber se ela deu certo ou não depois de já ter saído do Detalhe (Salvar volta
       *  pra lista na hora, sem esperar o upload). Fica aqui, no shell que nunca desmonta entre
       *  telas, ao contrário do toast local de cada tela. */}
      <GlobalPhotoToast />

      {refreshMsg && (
        <div className="fixed bottom-20 left-1/2 z-40 max-w-[90vw] -translate-x-1/2 rounded-full bg-text px-4 py-2 text-center text-[13px] font-semibold text-bg shadow-lg">
          {refreshMsg}
        </div>
      )}
    </div>
  );
}
