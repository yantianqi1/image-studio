import { buildCityPosterPrompt } from "./prompt-apps";

const CITY_POSTER_REQUESTED_COUNT = 1;

export type CityPosterSubmitState = Readonly<{
  city: string;
  modelCode: string;
}>;

export type CityPosterPromptState = Readonly<{
  city: string;
  note: string;
}>;

export type CityPosterImageRequest = Readonly<{
  prompt: string;
  model_code: string;
  requested_count: number;
  mode: "generate";
}>;

export type CityPosterImage = Readonly<{
  assetId: number;
  id: string;
  url: string;
}>;

export type CityPosterState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "success"; jobId: number; images: readonly CityPosterImage[] }>
  | Readonly<{ status: "error"; message: string }>;

export function canSubmitCityPoster(form: CityPosterSubmitState) {
  return form.city.trim().length > 0 && form.modelCode.trim().length > 0;
}

export function buildCityPosterImageRequest(
  form: CityPosterPromptState,
  modelCode: string,
): CityPosterImageRequest {
  return {
    prompt: buildCityPosterPrompt({ city: form.city, note: form.note }),
    model_code: modelCode,
    requested_count: CITY_POSTER_REQUESTED_COUNT,
    mode: "generate",
  };
}

export function getCityPosterErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "创建任务失败";
}
