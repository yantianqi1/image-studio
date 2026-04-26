export const CHARACTER_REFERENCE_MODES = {
  perCharacter: "per_character",
  singleSheet: "single_sheet",
} as const;

export type CharacterReferenceMode = typeof CHARACTER_REFERENCE_MODES[keyof typeof CHARACTER_REFERENCE_MODES];

export const DEFAULT_CHARACTER_REFERENCE_MODE: CharacterReferenceMode = CHARACTER_REFERENCE_MODES.perCharacter;

export const CHARACTER_REFERENCE_MODE_OPTIONS: readonly Readonly<{
  value: CharacterReferenceMode;
  label: string;
  detail: string;
}>[] = [
  { value: CHARACTER_REFERENCE_MODES.singleSheet, label: "单张总设定图", detail: "所有角色共用一张图" },
  { value: CHARACTER_REFERENCE_MODES.perCharacter, label: "逐角色三视图", detail: "每个角色一张图" },
];
