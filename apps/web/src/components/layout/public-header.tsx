"use client";

import { usePathname } from "next/navigation";
import { ChronicleHeader } from "@/components/layout/chronicle-header";
import { CodexHeader } from "@/components/layout/codex-header";
import { FragmentsHeader } from "@/components/layout/fragments-header";
import { TomeHeader } from "@/components/layout/tome-header";
import { SiteHeader } from "@/components/layout/site-header";
import { getBrandFromPathname } from "@/lib/experience-brand";

/** Route-aware header by active experience brand. */
export function PublicHeader() {
  const pathname = usePathname();
  const brand = getBrandFromPathname(pathname);
  if (pathname === "/chronicle" || pathname === "/chronicle/") return <ChronicleHeader />;
  if (pathname === "/chronicle/leaderboard" || pathname === "/chronicle/leaderboard/") {
    return <ChronicleHeader leaderboard />;
  }
  if (pathname === "/tome" || pathname === "/tome/") return <TomeHeader />;
  if (brand === "codex") return <CodexHeader />;
  if (brand === "fragments") return <FragmentsHeader />;
  return <SiteHeader />;
}
