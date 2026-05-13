"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCcw, Search, SlidersHorizontal } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/cn";
import {
  AWESOME_GPT_IMAGE_2_PROMPTS_SOURCE_URL,
  BANANA_PROMPTS_SOURCE_URL,
  PROMPT_MARKET_SOURCE_OPTIONS,
  fetchPromptMarketPrompts,
  type BananaPrompt,
  type BananaPromptMode,
  type PromptMarketLanguage,
  type PromptMarketLocalization,
  type PromptMarketSourceId,
} from "@/features/studio/studio-prompt-sources";

type PromptMarketModeFilter = "all" | BananaPromptMode;
type PromptMarketNsfwFilter = "safe" | "include" | "only";
type PromptMarketSourceFilter = "all" | PromptMarketSourceId;

type StudioPromptMarketProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyPrompt: (prompt: BananaPrompt) => void;
}>;

const ALL_CATEGORY_VALUE = "__all__";
const INITIAL_VISIBLE_COUNT = 60;
const VISIBLE_COUNT_STEP = 60;

function includesKeyword(value: string | undefined, keyword: string) {
  return Boolean(value && value.toLowerCase().includes(keyword));
}

function formatPromptDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function getPromptLocalization(
  prompt: BananaPrompt,
  language: PromptMarketLanguage,
): PromptMarketLocalization | undefined {
  return prompt.localizations?.[language] ?? prompt.localizations?.["zh-CN"] ?? prompt.localizations?.en;
}

function getLocalizedPrompt(prompt: BananaPrompt, language: PromptMarketLanguage): BananaPrompt {
  const localization = getPromptLocalization(prompt, language);
  if (!localization) return prompt;
  return {
    ...prompt,
    title: localization.title,
    prompt: localization.prompt,
    category: localization.category,
    subCategory: localization.subCategory,
  };
}

function PromptPreviewImage({ prompt }: { prompt: BananaPrompt }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm font-medium text-gray-400">
        {prompt.title}
      </div>
    );
  }

  return (
    <img
      src={prompt.preview}
      alt={prompt.title}
      loading="lazy"
      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
      onError={() => setFailed(true)}
    />
  );
}

export function StudioPromptMarket({ open, onOpenChange, onApplyPrompt }: StudioPromptMarketProps) {
  const [prompts, setPrompts] = useState<BananaPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [source, setSource] = useState<PromptMarketSourceFilter>("all");
  const [promptLanguage, setPromptLanguage] = useState<PromptMarketLanguage>("zh-CN");
  const [category, setCategory] = useState(ALL_CATEGORY_VALUE);
  const [mode, setMode] = useState<PromptMarketModeFilter>("all");
  const [nsfwFilter, setNsfwFilter] = useState<PromptMarketNsfwFilter>("safe");
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const loadPromptData = () => {
    setIsLoading(true);
    setError("");
    void fetchPromptMarketPrompts()
      .then((items) => setPrompts(items))
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "读取提示词市场失败");
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (!open || prompts.length > 0) return;
    setIsLoading(true);
    setError("");
    const controller = new AbortController();
    void fetchPromptMarketPrompts(controller.signal)
      .then((items) => setPrompts(items))
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "读取提示词市场失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [open, prompts.length]);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
    scrollAreaRef.current?.scrollTo({ top: 0 });
  }, [keyword, source, promptLanguage, category, mode, nsfwFilter]);

  useEffect(() => {
    if (open) {
      scrollAreaRef.current?.scrollTo({ top: 0 });
      return;
    }
    setIsMobileFiltersOpen(false);
  }, [open]);

  const sourceFilteredPrompts = useMemo(() => {
    if (source === "all") return prompts;
    return prompts.filter((p) => p.source === source);
  }, [prompts, source]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    sourceFilteredPrompts.forEach((p) => {
      values.add(getLocalizedPrompt(p, promptLanguage).category);
    });
    return [...values].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [promptLanguage, sourceFilteredPrompts]);

  useEffect(() => {
    if (category !== ALL_CATEGORY_VALUE && !categories.includes(category)) {
      setCategory(ALL_CATEGORY_VALUE);
    }
  }, [categories, category]);

  const filteredPrompts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return sourceFilteredPrompts.filter((prompt) => {
      const localizedPrompt = getLocalizedPrompt(prompt, promptLanguage);
      if (nsfwFilter === "safe" && prompt.isNsfw) return false;
      if (nsfwFilter === "only" && !prompt.isNsfw) return false;
      if (category !== ALL_CATEGORY_VALUE && localizedPrompt.category !== category) return false;
      if (mode !== "all" && localizedPrompt.mode !== mode) return false;
      if (!normalizedKeyword) return true;
      return (
        includesKeyword(localizedPrompt.title, normalizedKeyword) ||
        includesKeyword(localizedPrompt.prompt, normalizedKeyword) ||
        includesKeyword(localizedPrompt.author, normalizedKeyword) ||
        includesKeyword(localizedPrompt.category, normalizedKeyword) ||
        includesKeyword(localizedPrompt.subCategory, normalizedKeyword) ||
        includesKeyword(localizedPrompt.sourceLabel, normalizedKeyword)
      );
    });
  }, [category, keyword, mode, nsfwFilter, promptLanguage, sourceFilteredPrompts]);

  const visiblePrompts = filteredPrompts.slice(0, visibleCount);
  const hasMore = visiblePrompts.length < filteredPrompts.length;

  const activeFilterCount = [
    source !== "all",
    promptLanguage !== "zh-CN",
    category !== ALL_CATEGORY_VALUE,
    mode !== "all",
    nsfwFilter !== "safe",
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSource("all");
    setPromptLanguage("zh-CN");
    setCategory(ALL_CATEGORY_VALUE);
    setMode("all");
    setNsfwFilter("safe");
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 flex h-[min(94dvh,860px)] w-[min(96vw,1180px)] max-w-none translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          {/* Header */}
          <div className="shrink-0 border-b border-gray-100 px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-xl font-semibold leading-tight text-gray-900 sm:text-2xl">
                  Prompts 提示词市场
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-2 hidden text-sm leading-6 text-gray-500 sm:block">
                  来自{" "}
                  <a href={BANANA_PROMPTS_SOURCE_URL} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline">
                    glidea/banana-prompt-quicker
                  </a>
                  {" "}和{" "}
                  <a href={AWESOME_GPT_IMAGE_2_PROMPTS_SOURCE_URL} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline">
                    EvoLinkAI/awesome-gpt-image-2-prompts
                  </a>
                  ，可按来源筛选并一键套用到当前生图输入框。
                </DialogPrimitive.Description>
              </div>
              <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500">
                {prompts.length > 0 ? `${filteredPrompts.length} / ${sourceFilteredPrompts.length}` : "远程市场"}
              </span>
            </div>
          </div>

          {/* Filter bar */}
          <div className="shrink-0 border-b border-gray-100 px-4 py-2.5 sm:px-6 sm:py-3">
            {/* Mobile filters */}
            <div className="md:hidden">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="搜索提示词"
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <button
                  type="button"
                  className={cn(
                    "relative inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50",
                    isMobileFiltersOpen && "border-blue-200 bg-blue-50 text-blue-600",
                  )}
                  onClick={() => setIsMobileFiltersOpen((v) => !v)}
                  aria-label={isMobileFiltersOpen ? "收起筛选项" : "展开筛选项"}
                  aria-expanded={isMobileFiltersOpen}
                >
                  <SlidersHorizontal className="size-4" />
                  {activeFilterCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex size-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
              {isMobileFiltersOpen && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <FilterSelect label="来源" value={source} onChange={(v) => setSource(v as PromptMarketSourceFilter)} options={[{ value: "all", label: "全部" }, ...PROMPT_MARKET_SOURCE_OPTIONS]} />
                  <FilterSelect label="语言" value={promptLanguage} onChange={(v) => setPromptLanguage(v as PromptMarketLanguage)} options={[{ value: "zh-CN", label: "中文" }, { value: "en", label: "English" }]} />
                  <FilterSelect label="分类" value={category} onChange={setCategory} options={[{ value: ALL_CATEGORY_VALUE, label: "全部分类" }, ...categories.map((c) => ({ value: c, label: c }))]} />
                  <FilterSelect label="模式" value={mode} onChange={(v) => setMode(v as PromptMarketModeFilter)} options={[{ value: "all", label: "全部模式" }, { value: "generate", label: "文生图" }, { value: "edit", label: "编辑" }]} />
                  <FilterSelect label="NSFW" value={nsfwFilter} onChange={(v) => setNsfwFilter(v as PromptMarketNsfwFilter)} options={[{ value: "safe", label: "隐藏 NSFW" }, { value: "include", label: "包含 NSFW" }, { value: "only", label: "仅 NSFW" }]} />
                  <button type="button" className="col-span-2 h-9 rounded-full border border-gray-200 bg-white text-xs text-gray-500 transition hover:bg-gray-50 disabled:opacity-50" onClick={resetFilters} disabled={activeFilterCount === 0}>
                    重置筛选
                  </button>
                </div>
              )}
            </div>
            {/* Desktop filters */}
            <div className="hidden gap-2 md:flex md:items-center md:flex-wrap">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索标题、作者、分类或提示词"
                  className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <FilterSelect label="来源" value={source} onChange={(v) => setSource(v as PromptMarketSourceFilter)} options={[{ value: "all", label: "全部" }, ...PROMPT_MARKET_SOURCE_OPTIONS]} />
              <FilterSelect label="语言" value={promptLanguage} onChange={(v) => setPromptLanguage(v as PromptMarketLanguage)} options={[{ value: "zh-CN", label: "中文" }, { value: "en", label: "English" }]} />
              <FilterSelect label="分类" value={category} onChange={setCategory} options={[{ value: ALL_CATEGORY_VALUE, label: "全部分类" }, ...categories.map((c) => ({ value: c, label: c }))]} />
              <FilterSelect label="模式" value={mode} onChange={(v) => setMode(v as PromptMarketModeFilter)} options={[{ value: "all", label: "全部模式" }, { value: "generate", label: "文生图" }, { value: "edit", label: "编辑" }]} />
              <FilterSelect label="NSFW" value={nsfwFilter} onChange={(v) => setNsfwFilter(v as PromptMarketNsfwFilter)} options={[{ value: "safe", label: "隐藏 NSFW" }, { value: "include", label: "包含 NSFW" }, { value: "only", label: "仅 NSFW" }]} />
            </div>
          </div>

          {/* Content */}
          <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-3 sm:px-6 sm:py-4 [scrollbar-width:thin]">
            {isLoading ? (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 text-gray-500">
                <LoaderCircle className="size-6 animate-spin text-blue-600" />
                <p className="text-sm">正在读取远程提示词市场...</p>
              </div>
            ) : error ? (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 text-center">
                <div className="max-w-[420px] text-sm leading-6 text-gray-500">{error}</div>
                <button type="button" className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50" onClick={loadPromptData}>
                  <RefreshCcw className="size-4" />
                  重新加载
                </button>
              </div>
            ) : visiblePrompts.length === 0 ? (
              <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-gray-400">
                没有找到匹配的提示词
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visiblePrompts.map((prompt) => {
                    const localizedPrompt = getLocalizedPrompt(prompt, promptLanguage);
                    const dateLabel = formatPromptDate(prompt.created);
                    return (
                      <PromptCard
                        key={prompt.id}
                        prompt={prompt}
                        localizedPrompt={localizedPrompt}
                        dateLabel={dateLabel}
                        onApply={onApplyPrompt}
                      />
                    );
                  })}
                </div>
                {hasMore && (
                  <div className="flex justify-center pt-1">
                    <button type="button" className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm text-gray-700 transition hover:bg-gray-50" onClick={() => setVisibleCount((c) => c + VISIBLE_COUNT_STEP)}>
                      加载更多 ({visiblePrompts.length}/{filteredPrompts.length})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="h-9 min-w-0 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function PromptCard({
  prompt,
  localizedPrompt,
  dateLabel,
  onApply,
}: {
  prompt: BananaPrompt;
  localizedPrompt: BananaPrompt;
  dateLabel: string;
  onApply: (prompt: BananaPrompt) => void;
}) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[16/10] overflow-hidden bg-gray-100">
        <PromptPreviewImage prompt={localizedPrompt} />
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1.5 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-3 pt-8 pb-2">
          <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-gray-800">
            {localizedPrompt.mode === "edit" ? "编辑" : "文生图"}
          </span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            {localizedPrompt.category}
          </span>
          {prompt.isNsfw && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
              NSFW
            </span>
          )}
          {prompt.referenceImageUrls.length > 0 && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
              {prompt.referenceImageUrls.length} 张参考图
            </span>
          )}
        </div>
      </div>
      <div className="flex min-h-[180px] flex-col gap-3 p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-900">{localizedPrompt.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400">
              <span>{localizedPrompt.author}</span>
              {localizedPrompt.subCategory && <span>/{localizedPrompt.subCategory}</span>}
              {dateLabel && <span>/{dateLabel}</span>}
            </div>
          </div>
          {prompt.link && (
            <a
              href={prompt.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-400 transition hover:bg-gray-50 hover:text-gray-600"
              aria-label="查看来源"
              title="查看来源"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
        <p className="line-clamp-4 text-xs leading-5 text-gray-500">{localizedPrompt.prompt}</p>
        <div className="mt-auto flex justify-end border-t border-gray-100 pt-3">
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-full bg-gray-900 px-4 text-xs font-medium text-white shadow-sm transition hover:bg-gray-800"
            onClick={() => onApply(localizedPrompt)}
          >
            应用
          </button>
        </div>
      </div>
    </article>
  );
}
