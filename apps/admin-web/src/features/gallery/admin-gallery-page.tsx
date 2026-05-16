"use client";

import Image from "next/image";
import { useState } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { adminApi, type AdminGalleryItem } from "@/lib/admin-api";
import { useAdminGallery } from "@/lib/use-admin-data";

export function AdminGalleryPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [pendingSearch, setPendingSearch] = useState("");
  const { data, error, isLoading, mutate } = useAdminGallery({ page, page_size: 50, q: search || undefined });
  const errorMessage = error instanceof Error ? error.message : error ? "加载失败" : "";

  function handleSearch() {
    setPage(1);
    setSearch(pendingSearch);
  }

  return (
    <AdminShell title="公开图库管理" description="浏览、下架或删除公开图库中的图片。">
      <div className="col-span-12">
        <GalleryToolbar
          pendingSearch={pendingSearch}
          onSearchChange={setPendingSearch}
          onSearch={handleSearch}
          total={data?.total ?? 0}
          loading={isLoading}
        />
        {errorMessage && <ErrorBox message={errorMessage} />}
        {data && (
          <>
            <GalleryGrid items={data.items} onRefresh={() => void mutate()} />
            <GalleryPagination page={page} total={data.total} pageSize={data.page_size} onPageChange={setPage} />
          </>
        )}
      </div>
    </AdminShell>
  );
}

function GalleryToolbar({
  pendingSearch,
  onSearchChange,
  onSearch,
  total,
  loading,
}: Readonly<{
  pendingSearch: string;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  total: number;
  loading: boolean;
}>) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <input
        className="admin-input max-w-xs"
        placeholder="按 prompt 搜索..."
        value={pendingSearch}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
      />
      <button className="admin-button" type="button" onClick={onSearch}>搜索</button>
      <span className="ml-auto text-xs text-gray-500">
        {loading ? "加载中..." : `共 ${total} 张公开图片`}
      </span>
    </div>
  );
}

function GalleryGrid({
  items,
  onRefresh,
}: Readonly<{
  items: readonly AdminGalleryItem[];
  onRefresh: () => void;
}>) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center">暂无公开图片</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item) => (
        <GalleryCard key={item.asset_id} item={item} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

function GalleryCard({
  item,
  onRefresh,
}: Readonly<{
  item: AdminGalleryItem;
  onRefresh: () => void;
}>) {
  const [pending, setPending] = useState(false);

  async function handleTakeDown() {
    if (pending) return;
    setPending(true);
    try {
      await adminApi.adminUpdateAssetVisibility(item.asset_id, "private");
      onRefresh();
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (pending) return;
    if (!window.confirm(`确定删除图片 #${item.asset_id}？此操作不可撤销。`)) return;
    setPending(true);
    try {
      await adminApi.adminDeleteAsset(item.asset_id);
      onRefresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="admin-card group relative overflow-hidden p-0">
      <Image
        src={item.thumbnail_url}
        alt={item.prompt || `图片 ${item.asset_id}`}
        className="aspect-square w-full object-cover"
        height={320}
        loading="lazy"
        unoptimized
        width={320}
      />
      <div className="absolute inset-0 flex flex-col justify-between bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
        <div className="p-2">
          <p className="line-clamp-2 text-xs text-white/90 leading-relaxed">{item.prompt}</p>
        </div>
        <div className="flex gap-1.5 p-2">
          <button
            className="rounded bg-white/90 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-white disabled:opacity-50"
            type="button"
            disabled={pending}
            onClick={() => void handleTakeDown()}
          >
            下架
          </button>
          <button
            className="rounded bg-red-500/90 px-2 py-1 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
            type="button"
            disabled={pending}
            onClick={() => void handleDelete()}
          >
            删除
          </button>
          <span className="ml-auto text-xs text-white/70 self-center">
            #{item.asset_id}
          </span>
        </div>
      </div>
    </div>
  );
}

function GalleryPagination({
  page,
  total,
  pageSize,
  onPageChange,
}: Readonly<{
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}>) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      <button
        className="admin-button"
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        上一页
      </button>
      <span className="text-sm text-gray-600">
        {page} / {totalPages}
      </span>
      <button
        className="admin-button"
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        下一页
      </button>
    </div>
  );
}
