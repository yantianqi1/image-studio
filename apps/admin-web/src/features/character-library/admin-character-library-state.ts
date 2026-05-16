import { useCallback, useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

import { adminApi, type AdminCharacterLibraryItem } from "@/lib/admin-api";

export type UploadState = Readonly<{
  file: File | null;
  name: string;
}>;

const INITIAL_UPLOAD: UploadState = { file: null, name: "" };

type ItemsSetter = Dispatch<SetStateAction<readonly AdminCharacterLibraryItem[]>>;
type StringSetter = Dispatch<SetStateAction<string>>;
type BoolSetter = Dispatch<SetStateAction<boolean>>;
type IdSetter = Dispatch<SetStateAction<number | null>>;

export function useAdminCharacterLibrary() {
  const [items, setItems] = useState<readonly AdminCharacterLibraryItem[]>([]);
  const [upload, setUpload] = useState<UploadState>(INITIAL_UPLOAD);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const refresh = useCallback(
    () => loadAdminCharacters({ setError, setItems, setLoading }),
    [],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => uploadAdminCharacter({
    event,
    setError,
    setItems,
    setSubmitting,
    setUpload,
    submitting,
    upload,
  });
  const handleDelete = (item: AdminCharacterLibraryItem) => deleteAdminCharacter({
    deletingId,
    item,
    setDeletingId,
    setError,
    setItems,
  });
  return { deletingId, error, handleDelete, handleSubmit, items, loading, refresh, setUpload, submitting, upload };
}

async function loadAdminCharacters(options: { setError: StringSetter; setItems: ItemsSetter; setLoading: BoolSetter }) {
  options.setLoading(true);
  options.setError("");
  try {
    options.setItems(await adminApi.characterLibrary());
  } catch (err) {
    options.setError(err instanceof Error ? err.message : "加载失败");
  } finally {
    options.setLoading(false);
  }
}

async function uploadAdminCharacter(options: {
  event: FormEvent<HTMLFormElement>;
  setError: StringSetter;
  setItems: ItemsSetter;
  setSubmitting: BoolSetter;
  setUpload: Dispatch<SetStateAction<UploadState>>;
  submitting: boolean;
  upload: UploadState;
}) {
  options.event.preventDefault();
  if (!options.upload.file || !options.upload.name.trim() || options.submitting) return;
  options.setSubmitting(true);
  options.setError("");
  try {
    const item = await adminApi.createCharacterLibraryItem({
      name: options.upload.name.trim(),
      file: options.upload.file,
    });
    options.setItems((current) => [item, ...current]);
    options.setUpload(INITIAL_UPLOAD);
  } catch (err) {
    options.setError(err instanceof Error ? err.message : "上传失败");
  } finally {
    options.setSubmitting(false);
  }
}

async function deleteAdminCharacter(options: {
  deletingId: number | null;
  item: AdminCharacterLibraryItem;
  setDeletingId: IdSetter;
  setError: StringSetter;
  setItems: ItemsSetter;
}) {
  if (options.deletingId !== null) return;
  if (!window.confirm(`确定删除公共形象「${options.item.name}」？此操作不可撤销。`)) return;
  options.setDeletingId(options.item.id);
  options.setError("");
  try {
    await adminApi.deleteCharacterLibraryItem(options.item.id);
    options.setItems((current) => current.filter((entry) => entry.id !== options.item.id));
  } catch (err) {
    options.setError(err instanceof Error ? err.message : "删除失败");
  } finally {
    options.setDeletingId(null);
  }
}
