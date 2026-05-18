import type {
  ImageConversationContentPart,
  ImageConversationMessage,
  ImageGenerationRequest,
  UploadedImageAsset,
} from "@/lib/public-api.types";
import type {
  StoredImage,
  StoredReferenceImage,
  StudioConversation,
  StudioTurn,
  TurnDraft,
} from "@/features/studio/studio-types";

type BuildImageJobRequestInput = Readonly<{
  autoTitle?: boolean;
  draft: TurnDraft;
  conversation: StudioConversation | null;
  contextBeforeTurnId?: string;
  referenceImages: readonly StoredReferenceImage[];
}>;

type UploadImageAsset = (file: File) => Promise<UploadedImageAsset>;
type FetchImage = (input: RequestInfo | URL) => Promise<Response>;
type BuildImageConversationMessagesInput = Readonly<{
  conversation: StudioConversation | null;
  contextBeforeTurnId?: string;
  draft: TurnDraft;
  referenceImages: readonly StoredReferenceImage[];
}>;

const DEFAULT_REFERENCE_MIME_TYPE = "image/png";

export function buildImageJobRequest(input: BuildImageJobRequestInput): ImageGenerationRequest {
  const referenceAssetIds = collectReferenceAssetIds(input.referenceImages);
  const request: ImageGenerationRequest = {
    prompt: input.draft.prompt,
    model_code: input.draft.model,
    requested_count: input.draft.count,
    mode: input.draft.mode === "chat" ? undefined : input.draft.mode,
    size: input.draft.resolution === "auto" ? undefined : input.draft.resolution,
    quality: input.draft.quality,
    visibility: "private",
    ...(input.autoTitle ? { auto_title: true } : {}),
    ...(resolveCharacterLibraryIds(input.draft).length
      ? { character_library_ids: resolveCharacterLibraryIds(input.draft) }
      : {}),
  };
  return withOptionalImageFields(request, input, referenceAssetIds);
}

export function buildImageConversationMessages(
  input: BuildImageConversationMessagesInput,
): readonly ImageConversationMessage[] {
  const turns = getContextTurns(input.conversation, input.contextBeforeTurnId);
  const history = turns.flatMap(turnToConversationMessages);
  return [...history, buildUserMessage(input.draft.prompt, input.referenceImages)];
}

export async function uploadPendingReferenceImages(
  images: readonly StoredReferenceImage[],
  uploadImageAsset: UploadImageAsset,
  fetchImage: FetchImage = fetch,
): Promise<StoredReferenceImage[]> {
  return Promise.all(
    images.map((image) => uploadReferenceImage(image, uploadImageAsset, fetchImage)),
  );
}

function withOptionalImageFields(
  request: ImageGenerationRequest,
  input: BuildImageJobRequestInput,
  referenceAssetIds: readonly number[],
): ImageGenerationRequest {
  return {
    ...request,
    ...(input.draft.mode === "edit" && referenceAssetIds[0] ? { source_asset_id: referenceAssetIds[0] } : {}),
    ...(referenceAssetIds.length > 0 ? { reference_asset_ids: referenceAssetIds } : {}),
    conversation_messages: buildImageConversationMessages(input),
  };
}

function getContextTurns(
  conversation: StudioConversation | null,
  contextBeforeTurnId: string | undefined,
): readonly StudioTurn[] {
  const turns = conversation?.turns ?? [];
  if (!contextBeforeTurnId) return turns;
  const index = turns.findIndex((turn) => turn.id === contextBeforeTurnId);
  if (index < 0) {
    throw new Error("重试消息不在当前对话上下文中");
  }
  return turns.slice(0, index);
}

function turnToConversationMessages(turn: StudioTurn): readonly ImageConversationMessage[] {
  if (turn.status !== "success") {
    return [];
  }
  const userMessage = buildUserMessage(turn.prompt, turn.referenceImages);
  const assistantMessage = buildAssistantMessage(turn);
  return assistantMessage ? [userMessage, assistantMessage] : [userMessage];
}

function buildUserMessage(
  prompt: string,
  referenceImages: readonly StoredReferenceImage[],
): ImageConversationMessage {
  const assetParts = collectReferenceAssetIds(referenceImages).map(assetPart);
  if (assetParts.length === 0) {
    return { role: "user", content: prompt };
  }
  return { role: "user", content: [{ type: "text", text: prompt }, ...assetParts] };
}

function buildAssistantMessage(turn: StudioTurn): ImageConversationMessage | null {
  const assetParts = turn.images.flatMap(imageToAssetPart);
  if (assetParts.length === 0 && turn.images.length === 0) {
    return null;
  }
  const revisedPrompt = turn.images.find((image) => image.revisedPrompt)?.revisedPrompt ?? turn.prompt;
  if (assetParts.length === 0) {
    return { role: "assistant", content: `Generated image: ${revisedPrompt}` };
  }
  return {
    role: "assistant",
    content: [{ type: "text", text: `Generated image: ${revisedPrompt}` }, ...assetParts],
  };
}

function imageToAssetPart(image: StoredImage): readonly ImageConversationContentPart[] {
  return image.assetId ? [assetPart(image.assetId)] : [];
}

function assetPart(assetId: number): ImageConversationContentPart {
  return { type: "image_asset", asset_id: assetId };
}

function collectReferenceAssetIds(images: readonly StoredReferenceImage[]): readonly number[] {
  return images.flatMap((image) => (image.assetId ? [image.assetId] : []));
}

function resolveCharacterLibraryIds(draft: TurnDraft): readonly number[] {
  if (draft.characterLibraryIds?.length) {
    return draft.characterLibraryIds;
  }
  return draft.characterReferences?.map((character) => character.id) ?? [];
}

async function uploadReferenceImage(
  image: StoredReferenceImage,
  uploadImageAsset: UploadImageAsset,
  fetchImage: FetchImage,
): Promise<StoredReferenceImage> {
  if (image.assetId) {
    return image;
  }
  const file = await referenceImageToFile(image, fetchImage);
  const uploaded = await uploadImageAsset(file);
  return {
    ...image,
    assetId: uploaded.id,
    assetUrl: uploaded.asset_url,
    thumbnailUrl: uploaded.thumbnail_url ?? uploaded.asset_url,
  };
}

async function referenceImageToFile(image: StoredReferenceImage, fetchImage: FetchImage): Promise<File> {
  const blob = image.dataUrl
    ? await fetchImageBlob(image.dataUrl, fetchImage)
    : await fetchRemoteReferenceBlob(image, fetchImage);
  const type = image.mimeType || blob.type || DEFAULT_REFERENCE_MIME_TYPE;
  return new File([blob], image.name || "reference.png", { type });
}

async function fetchRemoteReferenceBlob(image: StoredReferenceImage, fetchImage: FetchImage): Promise<Blob> {
  const url = image.assetUrl || image.thumbnailUrl;
  if (!url) {
    throw new Error("参考图缺少可上传的图片数据");
  }
  return fetchImageBlob(url, fetchImage);
}

async function fetchImageBlob(url: string, fetchImage: FetchImage): Promise<Blob> {
  const response = await fetchImage(url);
  if (!response.ok) {
    throw new Error(`参考图读取失败: ${response.status}`);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("参考图不是有效图片");
  }
  return blob;
}
