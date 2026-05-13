"use client";

import { useState } from "react";

import { PromptCrafterDrawer, PromptCrafterFab } from "@/features/prompt-crafter/prompt-crafter-drawer";

export function GlobalPromptCrafter() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open ? <PromptCrafterFab onClick={() => setOpen(true)} /> : null}
      {open ? <PromptCrafterDrawer onClose={() => setOpen(false)} /> : null}
    </>
  );
}
