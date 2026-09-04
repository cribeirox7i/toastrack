"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { Stars, Thumb, formatDate } from "@/components/ui";
import RatingInput from "@/components/app/RatingInput";
import { deleteItem, driveImageUrl, duplicateItem, IMG_URL_COL, TYPE_LABEL_SINGULAR, TYPE_TAB, type ItemType } from "@/lib/catalog";
import { canEditRow } from "@/lib/itemPermissions";
import {
  formatDiagnostics,
  getPendingPhotoUpload,
  preparePhoto,
  queuePhotoUpload,
  type PhotoDiagnostics,
  type PreparedPhoto,
} from "@/lib/photoUpload";
import { photoDateForInput, toDateInputValue } from "@/lib/photoDate";
import { syncEvents, type RemapDetail } from "@/lib/offline/sync";
import PhotoViewer from "@/components/PhotoViewer";
import {
  SCHEMA,
  fieldByRole,
  fetchLookups,
  fetchFullItem,
  saveItem,
  toFormString,
  type Field,
  type Lookup,
} from "@/lib/itemSchema";

const inputCls =
  "w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-[14px] outline-none focus:border-accent";
const labelCls = "mb-1 mt-3 block text-[12.5px] font-semibold text-muted";

export default function DetailScreen({
  type,
  itemId,
  initialEditing,
  ownUserId,
  onClose,
  onChanged,
}: {
  type: ItemType;
  itemId: string | null;
  initialEditing: boolean;
  ownUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const fields = SCHEMA[type].fields;
  const nameField = fieldByRole(type, "name")!;
  const producerField = fieldByRole(type, "producer")!;
  const ratingField = fieldByRole(type, "rating")!;
  const dateField = useMemo(() => fields.find((f) => f.kind === "date"), [fields]);

  const [currentId, setCurrentId] = useState<string | null>(itemId);
  const [editing, setEditing] = useState(initialEditing);
  const [loading, setLoading] = useState(true);
  const [lookup, setLookup] = useState<Lookup>({ pais: [], bjcp: [] });
  const [values, setValues] = useState<Record<string, string>>({});
  // Espelho de `values` pra `applyPhotoDate` ler o estado mais recente sem depender do closure.
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);
  // true enquanto a data de degustação em tela veio do app (o "hoje" que um item novo já nasce
  // preenchido, ou a data lida da foto anexada) e não da mão do usuário. Só nesse estado a data
  // da foto pode sobrescrever o que está no campo - digitou a data, ela manda. Ver applyPhotoDate.
  const dateIsAuto = useRef(false);
  const [imgUrl, setImgUrl] = useState("");
  const [canEdit, setCanEdit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  // true quando HÁ um upload em segundo plano em curso pra ESTE item (nunca quando a foto está só
  // escolhida e esperando o Salvar - até lá não existe upload nenhum, ver onPhotoSelected). Fica
  // true também ao reabrir um item cujo upload de uma edição anterior ainda não terminou (ver
  // efeito de carga, `getPendingPhotoUpload`).
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Estado da foto DESTA edição, antes de qualquer rede. "preparando" é a compressão local (ver
  // preparePhoto); "erro" é o que antes só aparecia depois do Salvar, num toast, quando já não
  // dava pra fazer nada - agora aparece aqui, com a tela aberta e outra foto a um toque.
  const [photoStatus, setPhotoStatus] = useState<"idle" | "preparando" | "pronta" | "erro">("idle");
  const [photoError, setPhotoError] = useState("");
  const [photoDiag, setPhotoDiag] = useState<PhotoDiagnostics | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  // Foto já comprimida e pronta pra subir - o upload só começa no Salvar (queuePhotoUpload).
  // Cancelar, portanto, nunca precisa desfazer nada no servidor: só descarta isto (pedido do
  // Carlos 2026-09-03: a foto não pode travar o cadastro nem subir antes de o usuário salvar).
  const preparedPhoto = useRef<PreparedPhoto | null>(null);
  // URL local (blob:) do preview - precisa ser revogada pra não vazar memória.
  const previewRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);

  function showToast(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(""), 2200);
  }

  // Trocar de item sem desmontar a tela ("Duplicar" troca currentId no lugar) descarta a foto
  // escolhida e ainda não salva - ela pertencia ao item anterior. Ajuste de estado durante a
  // renderização, o padrão do React pra "resetar estado quando uma prop muda" (mesmo que o Thumb
  // usa em ui.tsx); num efeito isto viraria um render em cascata.
  const chaveDoItem = `${type}:${currentId}`;
  const [prevChave, setPrevChave] = useState(chaveDoItem);
  if (chaveDoItem !== prevChave) {
    setPrevChave(chaveDoItem);
    descartarFotoLocal();
  }

  /** Joga fora a foto escolhida nesta edição e o preview dela. Nada disso chegou ao servidor -
   *  a preparação é local e o envio só começa no Salvar -, então não há o que desfazer lá. */
  function descartarFotoLocal() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    preparedPhoto.current = null;
    setPhotoStatus("idle");
    setPhotoError("");
    setPhotoDiag(null);
    setDiagOpen(false);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const lk = await fetchLookups();
        if (!alive) return;
        setLookup(lk);
        if (currentId != null) {
          const row = await fetchFullItem(type, currentId);
          if (!alive) return;
          const v: Record<string, string> = {};
          for (const f of fields) v[f.col] = toFormString(row?.[f.col]);
          setValues(v);
          setImgUrl(driveImageUrl(row?.[IMG_URL_COL[type]]));
          setCanEdit(row ? canEditRow(row, ownUserId) : false);
          dateIsAuto.current = false;

          // Um upload em segundo plano de uma edição anterior ainda pode estar em curso pra este
          // MESMO item (o usuário salvou, voltou pra lista e reabriu antes de terminar) - pega
          // esse resultado em vez de mostrar a foto velha até a próxima sincronização.
          const pendente = getPendingPhotoUpload(type, currentId);
          if (pendente) {
            setUploadingPhoto(true);
            pendente.then((r) => {
              if (!alive) return;
              setUploadingPhoto(false);
              if (r.ok && r.url) setImgUrl(r.url);
            });
          } else {
            setUploadingPhoto(false);
          }
        } else {
          // Item novo: só monta o formulário vazio na hora, SEM criar nada na planilha - a linha
          // só nasce quando o usuário dá Salvar.
          const v: Record<string, string> = {};
          for (const f of fields) v[f.col] = "";
          if (dateField) {
            v[dateField.col] = toDateInputValue(new Date());
            dateIsAuto.current = true;
          }
          setValues(v);
          setImgUrl("");
          setCanEdit(true);
          setUploadingPhoto(false);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, type]);

  // Revoga o preview local quando a tela sai do ar (o objeto fica na memória do navegador até lá).
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  // Rede de segurança pro caso raro do rascunho ter sido criado offline (sem internet o id
  // sequencial não pode ser atribuído na hora - ver createNewItem em itemSchema.ts): se esta
  // tela continuar aberta até a sincronização remapear o id temporário pro id real, troca a
  // referência sem sair da tela em vez de deixar currentId apontando pra uma linha que sumiu.
  useEffect(() => {
    function onRemap(e: Event) {
      const { tab, oldId, newId } = (e as CustomEvent<RemapDetail>).detail;
      if (tab === TYPE_TAB[type] && oldId === currentId) setCurrentId(newId);
    }
    syncEvents.addEventListener("remap", onRemap);
    return () => syncEvents.removeEventListener("remap", onRemap);
  }, [type, currentId]);

  const paisName = useMemo(() => {
    const map = new Map(lookup.pais.map((p) => [String(p.pais_id), p.pais_nome]));
    return (id: string) => map.get(id) ?? "";
  }, [lookup.pais]);
  const bjcpLabel = useMemo(() => {
    const map = new Map(lookup.bjcp.map((b) => [String(b.bjcp21_id), b.bjcp21_cod]));
    return (id: string) => map.get(id) ?? "";
  }, [lookup.bjcp]);

  function set(col: string, v: string) {
    if (col === dateField?.col) dateIsAuto.current = false;
    // Espelha na hora (e não só no efeito, que roda depois do render): `applyPhotoDate` pode ler
    // valuesRef no mesmo tick em que o campo de data é alterado.
    valuesRef.current = { ...valuesRef.current, [col]: v };
    setValues((prev) => ({ ...prev, [col]: v }));
  }

  async function save() {
    if (!(values[nameField.col] ?? "").trim()) {
      showToast("Informe o nome.");
      return;
    }
    // A foto ainda está sendo comprimida: esperar aqui custa no máximo um segundo e evita salvar
    // o item sem ela. É a ÚNICA espera que o Salvar faz por foto - o envio em si nunca é esperado.
    if (photoStatus === "preparando") {
      showToast("Preparando a foto…");
      return;
    }
    setSaving(true);
    const idAtual = currentId;
    const id = await saveItem(type, idAtual, values, ownUserId);
    setSaving(false);
    if (id == null) {
      showToast("Erro ao salvar.");
      return;
    }
    // A foto (se houver uma pronta) sobe em segundo plano a partir daqui - o Salvar não espera por
    // ela. `queuePhotoUpload` sobrevive à tela fechando: o resultado chega pelo toast global (ver
    // GlobalPhotoToast em MainApp.tsx) e, dando certo, direto no cache local. Como a foto já vem
    // comprimida da escolha, o que resta aqui é só a requisição - sem CPU, sem risco de falhar
    // por memória com a tela já fechada.
    const pronta = preparedPhoto.current;
    if (pronta) {
      queuePhotoUpload(type, id, pronta);
      preparedPhoto.current = null;
    }
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    onChanged();
    if (idAtual == null) setCurrentId(id);
    // Pedido do Carlos 2026-09-03: Salvar volta pra lista na hora (mostrando o item já lá),
    // em vez de ficar na tela de detalhe esperando qualquer coisa - a foto que continue subindo
    // por conta própria.
    onClose();
  }

  async function cancel() {
    // Nada foi enviado ao servidor ainda - o upload só começa em queuePhotoUpload, chamado por
    // save() -, então cancelar é só descartar o que foi escolhido localmente. Sem rollback nenhum
    // no servidor: nunca chegou a existir uma foto órfã lá pra desfazer.
    descartarFotoLocal();

    if (currentId == null) {
      onClose();
      return;
    }
    // Revert unsaved edits by reloading the row from the DB.
    const row = await fetchFullItem(type, currentId);
    const v: Record<string, string> = {};
    for (const f of fields) v[f.col] = toFormString(row?.[f.col]);
    setValues(v);
    setImgUrl(driveImageUrl(row?.[IMG_URL_COL[type]]));
    dateIsAuto.current = false; // os valores voltaram a ser os do banco, nada aqui é palpite do app
    setEditing(false);
  }

  function pickPhoto() {
    fileInputRef.current?.click();
  }

  /**
   * Pedido do Carlos (2026-09-03): a foto escolhida na galeria carrega a data em que foi tirada
   * (EXIF) - ou, na falta dela, a data do arquivo - e é essa a data de degustação de verdade,
   * não o dia em que o item foi cadastrado. Só preenche quando o campo está vazio ou ainda tem
   * uma data posta pelo app; data escolhida pelo usuário nunca é sobrescrita.
   * Devolve a data aplicada ("yyyy-mm-dd") ou "" se não mexeu em nada.
   */
  async function applyPhotoDate(file: File): Promise<string> {
    if (!dateField) return "";
    const current = (valuesRef.current[dateField.col] ?? "").trim();
    if (current !== "" && !dateIsAuto.current) return "";
    const photoDate = await photoDateForInput(file);
    if (!photoDate || photoDate === current) return "";
    set(dateField.col, photoDate);
    dateIsAuto.current = true; // veio do app, não do usuário: outra foto ainda pode substituir
    return photoDate;
  }

  /**
   * Escolher a foto NUNCA sobe nada (pedido do Carlos 2026-09-03: "aplicação mostra a foto no
   * controle de imagem, sem subir, localmente"). O que mudou em 2026-09-04: a compressão passou a
   * acontecer AQUI, e o preview mostrado é o resultado dela - não mais um `blob:` do arquivo cru.
   *
   * Isso é o que faz o preview valer como garantia: se a foto aparece, é porque o JPEG que vai
   * subir já existe na memória, pronto. E quando o navegador não dá conta do arquivo (HEIC do
   * iPhone, foto grande demais pra RAM do aparelho), o erro aparece agora - com a tela aberta e o
   * usuário podendo escolher outra - em vez de depois do Salvar, num toast, já de volta na lista.
   */
  async function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois
    if (!file) return;

    descartarFotoLocal();
    setPhotoStatus("preparando");

    // EXIF é leitura local e barata: sai na frente pra a data já aparecer enquanto a compressão
    // (que é o passo pesado) ainda está rodando.
    const dataDaFoto = await applyPhotoDate(file);

    const resultado = await preparePhoto(file);
    if (!resultado.ok) {
      setPhotoStatus("erro");
      setPhotoError(resultado.error);
      setPhotoDiag(resultado.diagnostics);
      return;
    }

    preparedPhoto.current = resultado.photo;
    previewRef.current = resultado.photo.previewUrl;
    setImgUrl(resultado.photo.previewUrl);
    setPhotoDiag(resultado.photo.diagnostics);
    setPhotoStatus("pronta");
    showToast(
      dataDaFoto
        ? `Foto pronta (${resultado.photo.larguraKb} KB) · data ${formatDate(dataDaFoto)}`
        : `Foto pronta (${resultado.photo.larguraKb} KB)`,
    );
  }

  async function doDuplicate() {
    if (currentId == null) return;
    const newId = await duplicateItem(type, currentId, ownUserId);
    if (newId) {
      onChanged();
      // Troca pra cópia nova, já em edição, sem sair da tela (pedido do Carlos 2026-09-02).
      setCurrentId(newId);
      setEditing(true);
    } else {
      showToast("Erro ao duplicar");
    }
  }

  async function doDelete() {
    if (currentId == null) return;
    setConfirmDel(false);
    const ok = await deleteItem(type, currentId);
    if (ok) {
      onChanged();
      onClose();
    } else showToast("Erro ao excluir");
  }

  function googleSearch() {
    const q = `${values[nameField.col] ?? ""} ${values[producerField.col] ?? ""}`.trim();
    window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, "_blank", "noopener");
  }
  async function share() {
    const title = values[nameField.col] ?? "Toastrack";
    if (navigator.share) {
      try {
        await navigator.share({ title, text: title });
      } catch {
        /* user cancelled */
      }
    } else {
      try {
        await navigator.clipboard.writeText(title);
        showToast("Nome copiado");
      } catch {
        showToast(title);
      }
    }
  }

  const title = editing
    ? currentId == null
      ? "Novo item"
      : "Editar"
    : values[nameField.col] || TYPE_LABEL_SINGULAR[type];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center border-b border-border px-5 py-3">
        <button
          onClick={editing ? cancel : onClose}
          className="text-[13px] font-bold text-accent"
        >
          {editing ? "Cancelar" : "← Voltar"}
        </button>
        <div className="mx-auto truncate px-3 text-[16px] font-extrabold">{title}</div>
        {editing ? (
          <button onClick={save} disabled={saving} className="text-[13px] font-bold text-accent">
            {saving ? "…" : "Salvar"}
          </button>
        ) : (
          <div className="w-14" />
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-muted">Carregando…</div>
        ) : editing ? (
          /* ---------- EDIT ---------- */
          <div className="mx-auto w-full max-w-md px-5 py-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onPhotoSelected(e)}
            />
            <button
              onClick={pickPhoto}
              disabled={uploadingPhoto || photoStatus === "preparando"}
              className="relative mb-2 w-full"
            >
              <Thumb
                label={values[nameField.col] || "novo item"}
                src={imgUrl}
                className="h-40 w-full rounded-2xl"
              />
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 rounded-b-2xl bg-black/55 py-2 text-[12.5px] font-bold text-white">
                <Icon name="edit" size={13} />
                {photoStatus === "preparando"
                  ? "Preparando…"
                  : uploadingPhoto
                    ? "Enviando…"
                    : imgUrl
                      ? "Trocar foto"
                      : "Adicionar foto"}
              </span>
            </button>

            {photoStatus === "pronta" && (
              <div className="mb-2 text-[12px] font-semibold text-muted">
                Foto pronta - sobe quando você salvar.
              </div>
            )}

            {photoStatus === "erro" && (
              <div className="mb-2 rounded-xl border border-danger px-3 py-2.5">
                <div className="text-[12.5px] font-semibold" style={{ color: "var(--danger)" }}>
                  {photoError}
                </div>
                <div className="mt-1.5 flex gap-3">
                  <button onClick={pickPhoto} className="text-[12px] font-bold text-accent">
                    Escolher outra
                  </button>
                  {photoDiag && (
                    // Sem isto não há como diagnosticar uma falha que só acontece no aparelho do
                    // Carlos: a Browser pane é proibida neste projeto e o console de um celular
                    // não está ao meu alcance. Um print deste bloco é o laudo.
                    <button
                      onClick={() => setDiagOpen((v) => !v)}
                      className="text-[12px] font-bold text-muted"
                    >
                      {diagOpen ? "Ocultar detalhes" : "Detalhes"}
                    </button>
                  )}
                </div>
                {diagOpen && photoDiag && (
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-bg p-2 font-mono text-[10.5px] leading-snug text-muted">
                    {formatDiagnostics(photoDiag)}
                  </pre>
                )}
              </div>
            )}

            <label className={labelCls}>{ratingField.label}</label>
            <RatingInput
              value={Number(values[ratingField.col]) || 0}
              onChange={(v) => set(ratingField.col, String(v))}
            />

            {[nameField, producerField, ...fields.filter((f) => f.role === "field")].map((f) => (
              <div key={f.col}>
                <label className={labelCls}>{f.label}</label>
                <EditField f={f} value={values[f.col] ?? ""} onChange={(v) => set(f.col, v)} lookup={lookup} />
              </div>
            ))}
          </div>
        ) : (
          /* ---------- VIEW ---------- */
          <div className="mx-auto w-full max-w-md px-5 py-4">
            <button
              onClick={() => imgUrl && setPhotoViewerOpen(true)}
              disabled={!imgUrl}
              className="block w-full disabled:cursor-default"
            >
              <Thumb
                label={values[nameField.col] || "item"}
                src={imgUrl}
                className="h-44 w-full rounded-2xl"
              />
            </button>

            <div className="mt-3 flex gap-2">
              <ActionBtn label="Google" onClick={googleSearch} icon="search" />
              <ActionBtn label="Compartilhar" onClick={share} icon="share" />
              {canEdit && (
                <>
                  <ActionBtn label="Editar" onClick={() => setEditing(true)} icon="edit" />
                  <ActionBtn label="Duplicar" onClick={doDuplicate} text="⧉" />
                  <ActionBtn label="Excluir" onClick={() => setConfirmDel(true)} text="✕" danger />
                </>
              )}
            </div>

            <h1 className="mt-4 text-[22px] font-extrabold leading-tight">
              {values[nameField.col]}
            </h1>
            <div className="mt-1 text-[13px] text-muted">
              {[values[producerField.col], paisName(values.pais_id ?? "")].filter(Boolean).join(" · ")}
            </div>
            <div className="mt-2">
              <Stars value={Number(values[ratingField.col]) || 0} className="text-[18px]" />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
              {fields
                .filter((f) => f.role === "field")
                .map((f) => {
                  const disp = displayValue(f, values, paisName, bjcpLabel);
                  if (!disp) return null;
                  return (
                    <div key={f.col}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                        {f.label}
                      </div>
                      <div className="text-[14px] font-semibold">{disp}</div>
                    </div>
                  );
                })}
            </div>

            {currentId != null && (
              <div className="mt-6 inline-block rounded-lg bg-accent-soft px-2.5 py-1 font-mono text-[11px] text-accent">
                ID {currentId}
              </div>
            )}

            {!canEdit && (
              <div className="mt-4 text-[12.5px] font-semibold text-accent">
                Somente visualização
              </div>
            )}
          </div>
        )}
      </div>

      {confirmDel && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-xs rounded-2xl border border-border bg-surface p-5 text-center">
            <div className="text-[15px] font-bold">Excluir item?</div>
            <div className="mt-1 text-[13px] text-muted">{values[nameField.col]}</div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmDel(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-[13px] font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={doDelete}
                className="flex-1 rounded-xl bg-danger py-2.5 text-[13px] font-bold text-white"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-full bg-text px-4 py-2 text-[13px] font-semibold text-bg shadow-lg">
          {toast}
        </div>
      )}

      {photoViewerOpen && imgUrl && (
        <PhotoViewer
          src={imgUrl}
          alt={values[nameField.col] || "item"}
          onClose={() => setPhotoViewerOpen(false)}
        />
      )}
    </div>
  );
}

function displayValue(
  f: Field,
  values: Record<string, string>,
  paisName: (id: string) => string,
  bjcpLabel: (id: string) => string,
): string {
  const raw = values[f.col] ?? "";
  if (!raw) return "";
  if (f.kind === "country") return paisName(raw);
  if (f.kind === "bjcp") return bjcpLabel(raw);
  if (f.kind === "date") return formatDate(raw);
  return raw + (f.suffix ?? "");
}

function EditField({
  f,
  value,
  onChange,
  lookup,
}: {
  f: Field;
  value: string;
  onChange: (v: string) => void;
  lookup: Lookup;
}) {
  if (f.kind === "date") {
    return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
  }
  if (f.kind === "number") {
    return (
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    );
  }
  if (f.kind === "select") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">-</option>
        {f.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (f.kind === "country") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">-</option>
        {lookup.pais.map((p) => (
          <option key={p.pais_id} value={p.pais_id}>
            {p.pais_nome}
          </option>
        ))}
      </select>
    );
  }
  if (f.kind === "bjcp") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">-</option>
        {lookup.bjcp.map((b) => (
          <option key={b.bjcp21_id} value={b.bjcp21_id}>
            {b.bjcp21_cod}
          </option>
        ))}
      </select>
    );
  }
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
}

function ActionBtn({
  label,
  onClick,
  icon,
  text,
  danger,
}: {
  label: string;
  onClick: () => void;
  icon?: string;
  text?: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-10 items-center justify-center rounded-xl border"
      style={{
        borderColor: danger ? "var(--danger)" : "var(--border)",
        color: danger ? "var(--danger)" : "var(--text)",
      }}
    >
      {icon ? <Icon name={icon} size={18} /> : <span className="text-[15px]">{text}</span>}
    </button>
  );
}
