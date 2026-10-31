"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export const emptyWelcomeDraft = { name: "", code: null as string | null, isTest: false };

const WelcomeDraftContext = createContext<ReturnType<typeof useDraft> | null>(null);

function useDraft() {
  return useState(emptyWelcomeDraft);
}

export function WelcomeDraftProvider({ children }: { children: ReactNode }) {
  const draft = useDraft();
  return <WelcomeDraftContext value={draft}>{children}</WelcomeDraftContext>;
}

export function useWelcomeDraft() {
  const draft = useContext(WelcomeDraftContext);
  if (!draft) throw new Error("WelcomeDraftProvider is required");
  return draft;
}
