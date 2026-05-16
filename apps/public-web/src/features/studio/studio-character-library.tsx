"use client";

import type { FormEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, ImagePlus, Loader2, RefreshCcw, Trash2, UserRound, X } from "lucide-react";

import { cn } from "@/lib/cn";
import type { CharacterLibraryItem } from "@/lib/public-api";
import { readFile, useCharacterLibrary, type UploadState } from "@/features/studio/studio-character-library-state";

type StudioCharacterLibraryProps = Readonly<{
  open: boolean;
  selectedId: number | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: CharacterLibraryItem) => void;
  onDelete?: (item: CharacterLibraryItem) => void;
}>;

export function StudioCharacterLibrary({
  open,
  selectedId,
  onOpenChange,
  onSelect,
  onDelete,
}: StudioCharacterLibraryProps) {
  const library = useCharacterLibrary(open, onSelect, onDelete);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex h-[min(92dvh,760px)] w-[min(94vw,960px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
          <CharacterLibraryHeader count={library.items.length} loading={library.loading} onRefresh={library.loadItems} />
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[17rem_minmax(0,1fr)]">
            <CharacterUploadForm state={library.upload} uploading={library.uploading} onChange={library.setUpload} onSubmit={library.handleUpload} />
            <CharacterGrid
              deletingId={library.deletingId}
              items={library.items}
              loading={library.loading}
              selectedId={selectedId}
              onDelete={library.handleDelete}
              onSelect={onSelect}
            />
          </div>
          {library.error ? <p className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm font-medium text-red-600">{library.error}</p> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CharacterLibraryHeader({
  count,
  loading,
  onRefresh,
}: Readonly<{ count: number; loading: boolean; onRefresh: () => void }>) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
      <div>
        <DialogPrimitive.Title className="text-lg font-semibold text-gray-950">形象库</DialogPrimitive.Title>
        <DialogPrimitive.Description className="mt-1 text-sm text-gray-500">
          选择固定形象
        </DialogPrimitive.Description>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">{count} 个</span>
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50"
          onClick={onRefresh}
          disabled={loading}
          aria-label="刷新形象库"
          title="刷新"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
        </button>
        <DialogPrimitive.Close className="inline-flex size-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50" aria-label="关闭形象库">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </div>
    </div>
  );
}

function CharacterUploadForm({
  state,
  uploading,
  onChange,
  onSubmit,
}: Readonly<{
  state: UploadState;
  uploading: boolean;
  onChange: (state: UploadState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  const canSubmit = Boolean(state.file && state.name.trim() && !uploading);
  return (
    <form className="border-b border-gray-100 bg-gray-50/70 p-4 md:border-b-0 md:border-r" onSubmit={onSubmit}>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">我的形象</h3>
      <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center text-sm text-gray-500 transition hover:border-gray-400">
        <ImagePlus className="mb-2 size-6 text-gray-400" />
        <span className="px-3">{state.file ? state.file.name : "选择图片"}</span>
        <input type="file" accept="image/*" className="hidden" onChange={(event) => onChange({ ...state, file: readFile(event) })} />
      </label>
      <input
        className="mt-3 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-gray-400"
        value={state.name}
        onChange={(event) => onChange({ ...state, name: event.target.value })}
        placeholder="形象名称"
      />
      <button
        type="submit"
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 px-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
        disabled={!canSubmit}
      >
        {uploading ? <Loader2 className="size-4 animate-spin" /> : <UserRound className="size-4" />}
        保存
      </button>
    </form>
  );
}

function CharacterGrid({
  deletingId,
  items,
  loading,
  selectedId,
  onDelete,
  onSelect,
}: Readonly<{
  deletingId: number | null;
  items: readonly CharacterLibraryItem[];
  loading: boolean;
  selectedId: number | null;
  onDelete: (item: CharacterLibraryItem) => void;
  onSelect: (item: CharacterLibraryItem) => void;
}>) {
  if (loading) {
    return <div className="flex items-center justify-center text-sm text-gray-500">加载中...</div>;
  }
  if (items.length === 0) {
    return <div className="flex items-center justify-center text-sm text-gray-500">暂无形象</div>;
  }
  return (
    <div className="min-h-0 overflow-y-auto p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <CharacterCard
            deleting={item.id === deletingId}
            item={item}
            key={item.id}
            selected={item.id === selectedId}
            onDelete={onDelete}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function CharacterCard({
  deleting,
  item,
  selected,
  onDelete,
  onSelect,
}: Readonly<{
  deleting: boolean;
  item: CharacterLibraryItem;
  selected: boolean;
  onDelete: (item: CharacterLibraryItem) => void;
  onSelect: (item: CharacterLibraryItem) => void;
}>) {
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-gray-950 ring-2 ring-gray-950/10" : "border-gray-200",
      )}
    >
      <button type="button" className="block w-full text-left" onClick={() => onSelect(item)}>
        <img src={item.thumbnail_url} alt={item.name} className="aspect-square w-full object-cover" loading="lazy" />
        <span className="block truncate px-3 py-2 text-sm font-semibold text-gray-900">{item.name}</span>
      </button>
      {selected ? (
        <span className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-gray-950 text-white shadow">
          <Check className="size-4" />
        </span>
      ) : null}
      {item.visibility === "private" ? (
        <button
          type="button"
          className="absolute bottom-2 right-2 inline-flex size-8 items-center justify-center rounded-full bg-white/90 text-red-600 opacity-0 shadow transition hover:bg-white disabled:opacity-60 group-hover:opacity-100"
          disabled={deleting}
          onClick={() => onDelete(item)}
          aria-label={`删除形象 ${item.name}`}
          title="删除形象"
        >
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </button>
      ) : null}
    </article>
  );
}
