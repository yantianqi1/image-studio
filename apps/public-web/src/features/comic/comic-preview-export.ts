import type { StoryboardShot } from "./comic-utils";
import { buildSequentialImageName, buildStitchedImageName, getExportableShots } from "./comic-preview-utils";

const CANVAS_BACKGROUND = "#ffffff";
const FIRST_CANVAS_OFFSET = 0;
const IMAGE_LOAD_TIMEOUT_MS = 20000;
const PNG_MIME_TYPE = "image/png";

type ExportOptions = Readonly<{
  shots: readonly StoryboardShot[];
  projectTitle: string;
}>;

type CanvasLayout = Readonly<{
  width: number;
  height: number;
  imageHeights: readonly number[];
}>;

export async function downloadSequentialImages(options: ExportOptions): Promise<void> {
  const shots = requireExportableShots(options.shots);
  for (const shot of shots) {
    triggerDownload({
      href: shot.assetUrl ?? "",
      fileName: buildSequentialImageName({ projectTitle: options.projectTitle, index: shot.index }),
    });
  }
}

export async function downloadStitchedImage(options: ExportOptions): Promise<void> {
  const shots = requireExportableShots(options.shots);
  const images = await Promise.all(shots.map((shot) => loadImage(String(shot.assetUrl))));
  const layout = buildCanvasLayout(images);
  const canvas = document.createElement("canvas");
  const context = requireCanvasContext(canvas);
  canvas.width = layout.width;
  canvas.height = layout.height;
  paintCanvasBackground(context, layout);
  drawStackedImages({ context, images, layout });
  triggerDownload({ href: canvas.toDataURL(PNG_MIME_TYPE), fileName: buildStitchedImageName(options.projectTitle) });
}

function requireExportableShots(shots: readonly StoryboardShot[]): readonly StoryboardShot[] {
  const exportableShots = getExportableShots(shots);
  if (exportableShots.length === 0) {
    throw new Error("没有可导出的漫画图片");
  }
  return exportableShots;
}

function triggerDownload(options: Readonly<{ href: string; fileName: string }>): void {
  const link = document.createElement("a");
  link.href = options.href;
  link.download = options.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  let timeoutId: number | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`图片加载超时：${src}`)), IMAGE_LOAD_TIMEOUT_MS);
  });
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.src = src;
  try {
    await Promise.race([image.decode(), timeout]);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
  assertImageDimensions(image, src);
  return image;
}

function buildCanvasLayout(images: readonly HTMLImageElement[]): CanvasLayout {
  const width = Math.max(...images.map((image) => image.naturalWidth));
  const imageHeights = images.map((image) => Math.round(image.naturalHeight * (width / image.naturalWidth)));
  return {
    width,
    height: imageHeights.reduce((total, height) => total + height, FIRST_CANVAS_OFFSET),
    imageHeights,
  };
}

function requireCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器无法创建长图画布");
  }
  return context;
}

function paintCanvasBackground(context: CanvasRenderingContext2D, layout: CanvasLayout): void {
  context.fillStyle = CANVAS_BACKGROUND;
  context.fillRect(FIRST_CANVAS_OFFSET, FIRST_CANVAS_OFFSET, layout.width, layout.height);
}

function drawStackedImages(options: Readonly<{
  context: CanvasRenderingContext2D;
  images: readonly HTMLImageElement[];
  layout: CanvasLayout;
}>): void {
  let y = FIRST_CANVAS_OFFSET;
  options.images.forEach((image, index) => {
    const height = options.layout.imageHeights[index] ?? image.naturalHeight;
    options.context.drawImage(image, FIRST_CANVAS_OFFSET, y, options.layout.width, height);
    y += height;
  });
}

function assertImageDimensions(image: HTMLImageElement, src: string): void {
  if (image.naturalWidth <= FIRST_CANVAS_OFFSET || image.naturalHeight <= FIRST_CANVAS_OFFSET) {
    throw new Error(`无法读取图片尺寸：${src}`);
  }
}
