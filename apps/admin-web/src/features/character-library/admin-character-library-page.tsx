"use client";

import type { ChangeEvent, FormEvent } from "react";

import { useAdminCharacterLibrary, type UploadState } from "@/features/character-library/admin-character-library-state";
import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import type { AdminCharacterLibraryItem } from "@/lib/admin-api";

export function AdminCharacterLibraryPage() {
  const library = useAdminCharacterLibrary();

  return (
    <AdminShell title="形象库" description="管理可被所有用户调用的公共形象。">
      <section className="admin-panel">
        <CharacterUploadForm
          state={library.upload}
          submitting={library.submitting}
          onChange={library.setUpload}
          onSubmit={library.handleSubmit}
        />
      </section>
      <section className="admin-panel">
        <CharacterLibraryHeader loading={library.loading} total={library.items.length} onRefresh={library.refresh} />
        {library.error ? <ErrorBox message={library.error} /> : null}
        <CharacterGrid
          deletingId={library.deletingId}
          items={library.items}
          loading={library.loading}
          onDelete={library.handleDelete}
        />
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
  deletingId,
  items,
  loading,
  onDelete,
}: Readonly<{
  deletingId: number | null;
  items: readonly AdminCharacterLibraryItem[];
  loading: boolean;
  onDelete: (item: AdminCharacterLibraryItem) => void;
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
        <CharacterCard deleting={item.id === deletingId} key={item.id} item={item} onDelete={onDelete} />
      ))}
    </div>
  );
}

function CharacterCard({
  deleting,
  item,
  onDelete,
}: Readonly<{
  deleting: boolean;
  item: AdminCharacterLibraryItem;
  onDelete: (item: AdminCharacterLibraryItem) => void;
}>) {
  return (
    <article className="admin-card overflow-hidden p-0">
      <img src={item.thumbnail_url} alt={item.name} className="aspect-square w-full object-cover" loading="lazy" />
      <div className="px-3 py-2">
        <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
        <div className="mt-2 flex items-center gap-2">
          <p className="text-xs text-gray-500">#{item.id}</p>
          <button
            className="ml-auto rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
            type="button"
            disabled={deleting}
            onClick={() => onDelete(item)}
            aria-label={`删除公共形象 ${item.name}`}
          >
            {deleting ? "删除中..." : "删除"}
          </button>
        </div>
      </div>
    </article>
  );
}

function readFile(event: ChangeEvent<HTMLInputElement>): File | null {
  return event.target.files?.[0] ?? null;
}
