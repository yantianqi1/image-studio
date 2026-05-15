"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { adminApi, type AdminCharacterLibraryItem } from "@/lib/admin-api";

type UploadState = Readonly<{
  file: File | null;
  name: string;
}>;

const INITIAL_UPLOAD: UploadState = { file: null, name: "" };

export function AdminCharacterLibraryPage() {
  const [items, setItems] = useState<readonly AdminCharacterLibraryItem[]>([]);
  const [upload, setUpload] = useState<UploadState>(INITIAL_UPLOAD);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await adminApi.characterLibrary());
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!upload.file || !upload.name.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const item = await adminApi.createCharacterLibraryItem({ name: upload.name.trim(), file: upload.file });
      setItems((current) => [item, ...current]);
      setUpload(INITIAL_UPLOAD);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminShell title="形象库" description="管理可被所有用户调用的公共形象。">
      <section className="admin-panel">
        <CharacterUploadForm state={upload} submitting={submitting} onChange={setUpload} onSubmit={handleSubmit} />
      </section>
      <section className="admin-panel">
        <CharacterLibraryHeader loading={loading} total={items.length} onRefresh={refresh} />
        {error ? <ErrorBox message={error} /> : null}
        <CharacterGrid items={items} loading={loading} />
      </section>
    </AdminShell>
  );
}

function CharacterUploadForm({
  state,
  submitting,
  onChange,
  onSubmit,
}: Readonly<{
  state: UploadState;
  submitting: boolean;
  onChange: (state: UploadState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  const canSubmit = Boolean(state.file && state.name.trim() && !submitting);
  return (
    <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={onSubmit}>
      <input
        className="admin-input"
        value={state.name}
        onChange={(event) => onChange({ ...state, name: event.target.value })}
        placeholder="形象名称"
      />
      <label className="admin-input cursor-pointer">
        {state.file ? state.file.name : "选择图片"}
        <input type="file" accept="image/*" className="hidden" onChange={(event) => onChange({ ...state, file: readFile(event) })} />
      </label>
      <button className="admin-button" type="submit" disabled={!canSubmit}>
        {submitting ? "上传中..." : "上传公共形象"}
      </button>
    </form>
  );
}

function CharacterLibraryHeader({
  loading,
  total,
  onRefresh,
}: Readonly<{ loading: boolean; total: number; onRefresh: () => void }>) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <h2 className="text-base font-semibold text-gray-900">公共库</h2>
      <span className="text-xs text-gray-500">{loading ? "加载中..." : `${total} 个形象`}</span>
      <button className="admin-button ml-auto" type="button" onClick={onRefresh} disabled={loading}>
        刷新
      </button>
    </div>
  );
}

function CharacterGrid({
  items,
  loading,
}: Readonly<{
  items: readonly AdminCharacterLibraryItem[];
  loading: boolean;
}>) {
  if (loading) {
    return <p className="py-8 text-center text-sm text-gray-500">加载中...</p>;
  }
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">暂无形象</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {items.map((item) => (
        <CharacterCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function CharacterCard({ item }: Readonly<{ item: AdminCharacterLibraryItem }>) {
  return (
    <article className="admin-card overflow-hidden p-0">
      <img src={item.thumbnail_url} alt={item.name} className="aspect-square w-full object-cover" loading="lazy" />
      <div className="px-3 py-2">
        <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
        <p className="mt-1 text-xs text-gray-500">#{item.id}</p>
      </div>
    </article>
  );
}

function readFile(event: ChangeEvent<HTMLInputElement>): File | null {
  return event.target.files?.[0] ?? null;
}
