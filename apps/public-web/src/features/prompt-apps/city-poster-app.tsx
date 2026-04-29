"use client";

import {
  buildCityPosterImageRequest,
  canSubmitCityPoster,
  getCityPosterErrorMessage,
} from "./city-poster-app-state";
import {
  PromptImageGenerateApp,
  type PromptImageGenerateForm,
} from "./prompt-image-generate-app";

export function CityPosterApp() {
  return (
    <PromptImageGenerateApp
      buildImageRequest={buildCityPosterRequest}
      canSubmit={canSubmitCityPosterForm}
      getErrorMessage={getCityPosterErrorMessage}
      headerTitle="城市宣传海报"
      lead="输入城市和备注，生成新春国潮城市宣传海报。"
      notePlaceholder="可补充地标、山水河湖、宣传方向或城市气质。"
      primaryLabel="城市"
      primaryName="city"
      primaryPlaceholder="例如：杭州"
      submitLabel="生成海报"
    />
  );
}

function buildCityPosterRequest(form: PromptImageGenerateForm, modelCode: string) {
  return buildCityPosterImageRequest({ city: form.primary, note: form.note }, modelCode);
}

function canSubmitCityPosterForm(form: Readonly<{ modelCode: string; primary: string }>) {
  return canSubmitCityPoster({ city: form.primary, modelCode: form.modelCode });
}
