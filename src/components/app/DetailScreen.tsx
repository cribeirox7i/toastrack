"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { Stars, Thumb, formatDate } from "@/components/ui";
import RatingInput from "@/components/app/RatingInput";
import { deleteItem, duplicateItem, TYPE_LABEL_SINGULAR, type ItemType } from "@/lib/catalog";
import { canEditRow } from "@/lib/itemPermissions";
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

  const [currentId, setCurrentId] = useState<string | null>(itemId);
  const [editing, setEditing] = useState(initialEditing);
  const [loading, setLoading] = useState(true);
  const [lookup, setLookup] = useState<Lookup>({ pais: [], bjcp: [] });
  const [values, setValues] = useState<Record<string, string>>({});
  const [canEdit, setCanEdit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  function showToast(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(""), 2200);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const lk = await fetchLookups();
      if (currentId != null) {
        const row = await fetchFullItem(type, currentId);
        if (!alive) return;
        const v: Record<string, string> = {};
        for (const f of fields) v[f.col] = toFormString(row?.[f.col]);
        setValues(v);
        setCanEdit(row ? canEditRow(row, ownUserId) : false);
      } else {
        const v: Record<string, string> = {};
        for (const f of fields) v[f.col] = "";
        const dateField = fields.find((f) => f.kind === "date");
        if (dateField) v[dateField.col] = new Date().toISOString().slice(0, 10);
        setValues(v);
        setCanEdit(true);
      }
      setLookup(lk);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, type]);

  const paisName = useMemo(() => {
    const map = new Map(lookup.pais.map((p) => [String(p.pais_id), p.pais_nome]));
    return (id: string) => map.get(id) ?? "";
  }, [lookup.pais]);
  const bjcpLabel = useMemo(() => {
    const map = new Map(lookup.bjcp.map((b) => [String(b.bjcp21_id), b.bjcp21_cod]));
    return (id: string) => map.get(id) ?? "";
  }, [lookup.bjcp]);

  function set(col: string, v: string) {
    setValues((prev) => ({ ...prev, [col]: v }));
  }

  async function save() {
    if (!(values[nameField.col] ?? "").trim()) {
      showToast("Informe o nome.");
      return;
    }
    setSaving(true);
    const id = await saveItem(type, currentId, values, ownUserId);
    setSaving(false);
    if (id == null) {
      showToast("Erro ao salvar.");
      return;
    }
    onChanged();
    if (currentId == null) setCurrentId(id);
    setEditing(false);
    showToast("Salvo");
  }

  async function cancel() {
    if (currentId == null) {
      onClose();
      return;
    }
    // Revert unsaved edits by reloading the row from the DB.
    const row = await fetchFullItem(type, currentId);
    const v: Record<string, string> = {};
    for (const f of fields) v[f.col] = toFormString(row?.[f.col]);
    setValues(v);
    setEditing(false);
  }

  async function doDuplicate() {
    if (currentId == null) return;
    const ok = await duplicateItem(type, currentId, ownUserId);
    if (ok) {
      onChanged();
      showToast("Item duplicado");
    } else showToast("Erro ao duplicar");
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
          onClick={editing && currentId != null ? cancel : onClose}
          className="text-[13px] font-bold text-accent"
        >
          {editing && currentId != null ? "Cancelar" : "← Voltar"}
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
            <button
              onClick={() => showToast("Upload de foto chega com o Storage.")}
              className="mb-2 w-full"
            >
              <Thumb label={values[nameField.col] || "novo item"} className="h-40 w-full rounded-2xl" />
            </button>

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
            <Thumb label={values[nameField.col] || "item"} className="h-44 w-full rounded-2xl" />

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
        <option value="">—</option>
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
        <option value="">—</option>
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
        <option value="">—</option>
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
