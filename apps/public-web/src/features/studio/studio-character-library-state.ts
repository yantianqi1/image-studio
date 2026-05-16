import { useCallback, useEffect, useState, type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction } from "react";

import { isUnauthorizedApiError } from "@/lib/api-client";
import { publicApi, type CharacterLibraryItem } from "@/lib/public-api";

export type UploadState = Readonly<{
  file: File | null;
  name: string;
}>;

const INITIAL_UPLOAD: UploadState = { file: null, name: "" };

type ItemsSetter = Dispatch<SetStateAction<readonly CharacterLibraryItem[]>>;
type StringSetter = Dispatch<SetStateAction<string>>;
type BoolSetter = Dispatch<SetStateAction<boolean>>;
type IdSetter = Dispatch<SetStateAction<number | null>>;

export function useCharacterLibrary(
  open: boolean,
  onSelect: (item: CharacterLibraryItem) => void,
  onDelete?: (item: CharacterLibraryItem) => void,
) {
  const [items, setItems] = useState<readonly CharacterLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState<UploadState>(INITIAL_UPLOAD);
  const loadItems = useCallback(
    () => loadCharacterItems({ setError, setItems, setLoading }),
    [],
  );
  useEffect(() => {
    if (open) void loadItems();
  }, [loadItems, open]);
  const handleUpload = (event: FormEvent<HTMLFormElement>) => uploadCharacterItem({
    event,
    onSelect,
    setError,
    setItems,
    setUpload,
    setUploading,
    upload,
    uploading,
  });
  const handleDelete = (item: CharacterLibraryItem) => deleteCharacterItem({
    deletingId,
    item,
    onDelete,
    setDeletingId,
    setError,
    setItems,
  });
  return { deletingId, error, handleDelete, handleUpload, items, loadItems, loading, setUpload, upload, uploading };
}

async function loadCharacterItems(options: { setError: StringSetter; setItems: ItemsSetter; setLoading: BoolSetter }) {
  options.setLoading(true);
  options.setError("");
  try {
    options.setItems(await publicApi.getCharacterLibrary());
  } catch (loadError) {
    options.setError(loadError instanceof Error ? loadError.message : "形象库加载失败");
  } finally {
    options.setLoading(false);
  }
}

async function uploadCharacterItem(options: {
  event: FormEvent<HTMLFormElement>;
  onSelect: (item: CharacterLibraryItem) => void;
  setError: StringSetter;
  setItems: ItemsSetter;
  setUpload: Dispatch<SetStateAction<UploadState>>;
  setUploading: BoolSetter;
  upload: UploadState;
  uploading: boolean;
}) {
  options.event.preventDefault();
  if (!options.upload.file || !options.upload.name.trim() || options.uploading) return;
  options.setUploading(true);
  options.setError("");
  try {
    const item = await publicApi.createCharacterLibraryItem({
      name: options.upload.name.trim(),
      file: options.upload.file,
    });
    options.setItems((current) => [item, ...current]);
    options.setUpload(INITIAL_UPLOAD);
    options.onSelect(item);
  } catch (uploadError) {
    options.setError(resolveUploadError(uploadError));
  } finally {
    options.setUploading(false);
  }
}

async function deleteCharacterItem(options: {
  deletingId: number | null;
  item: CharacterLibraryItem;
  onDelete?: (item: CharacterLibraryItem) => void;
  setDeletingId: IdSetter;
  setError: StringSetter;
  setItems: ItemsSetter;
}) {
  if (options.deletingId !== null) return;
  if (!window.confirm(`确定删除形象「${options.item.name}」？此操作不可撤销。`)) return;
  options.setDeletingId(options.item.id);
  options.setError("");
  try {
    await publicApi.deleteCharacterLibraryItem(options.item.id);
    options.setItems((current) => current.filter((entry) => entry.id !== options.item.id));
    options.onDelete?.(options.item);
  } catch (deleteError) {
    options.setError(deleteError instanceof Error ? deleteError.message : "形象删除失败");
  } finally {
    options.setDeletingId(null);
  }
}

export function readFile(event: ChangeEvent<HTMLInputElement>): File | null {
  return event.target.files?.[0] ?? null;
}

function resolveUploadError(error: unknown): string {
  if (isUnauthorizedApiError(error)) {
    return "请先登录";
  }
  return error instanceof Error ? error.message : "形象保存失败";
}
