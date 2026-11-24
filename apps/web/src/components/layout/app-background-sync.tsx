"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import { getBrandFromPathname } from "@/lib/experience-brand";

const BG_GUESS = "magical-app-bg-guess";
const BG_CODEX = "magical-app-bg-codex";
const BG_FRAGMENTS = "magical-app-bg-fragments";
const BG_TOME = "magical-app-bg-tome";
const LEGACY = "magical-app-bg";

/** Sync the active experience backdrop before paint. */
export function AppBackgroundSync() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const body = document.body;
    const brand = getBrandFromPathname(pathname);
    body.classList.remove(BG_GUESS, BG_CODEX, BG_FRAGMENTS, BG_TOME, LEGACY);
    if (pathname === "/tome" || pathname?.startsWith("/tome/")) {
      body.classList.add(BG_TOME);
      return;
    }
    body.classList.add(
      brand === "codex" ? BG_CODEX : brand === "fragments" ? BG_FRAGMENTS : BG_GUESS,
    );
  }, [pathname]);

  return null;
}
