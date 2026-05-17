"use client";

import { useCallback, useState, type ComponentType } from "react";

import { PromptCrafterFab } from "@/features/prompt-crafter/prompt-crafter-fab";

type PromptCrafterDrawerComponent = ComponentType<Readonly<{ onClose: () => void }>>;

let promptCrafterDrawerPromise: Promise<PromptCrafterDrawerComponent> | null = null;

function loadPromptCrafterDrawer() {
  promptCrafterDrawerPromise ??= import("@/features/prompt-crafter/prompt-crafter-drawer").then(
    (module) => module.PromptCrafterDrawer,
  );
  return promptCrafterDrawerPromise;
}

export function GlobalPromptCrafter() {
  const [open, setOpen] = useState(false);
  const [Drawer, setDrawer] = useState<PromptCrafterDrawerComponent | null>(null);
  const preloadDrawer = useCallback(() => {
    void loadPromptCrafterDrawer().then((component) => setDrawer(() => component));
  }, []);
  const openDrawer = useCallback(() => {
    void loadPromptCrafterDrawer().then((component) => {
      setDrawer(() => component);
      setOpen(true);
    });
  }, []);

  return (
    <>
      {!open ? <PromptCrafterFab onClick={openDrawer} onPrefetch={preloadDrawer} /> : null}
      {open && Drawer ? <Drawer onClose={() => setOpen(false)} /> : null}
    </>
  );
}
