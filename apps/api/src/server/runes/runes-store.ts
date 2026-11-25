import { prisma } from "@/lib/prisma";
import type { RunesRunState } from "./runes-game";

const RUN_TTL = 60 * 60 * 1000;

function stateFromJson(value: unknown): RunesRunState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as RunesRunState;
  if (typeof state.runId !== "string" || typeof state.ownerKey !== "string" ||
    !Array.isArray(state.artworks) || !Array.isArray(state.clueOrder) ||
    !["loading", "active", "complete", "closed"].includes(state.status)) return null;
  return state;
}

export async function createStoredRun(state: RunesRunState) {
  await prisma.runeRun.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.runeRun.create({
    data: {
      id: state.runId,
      ownerKey: state.ownerKey,
      userId: state.userId,
      status: state.status,
      state: state as unknown as object,
      expiresAt: new Date(state.expiresAt),
    },
  });
}

export async function getCurrentRun(ownerKey: string) {
  const where = { ownerKey, expiresAt: { gt: new Date() } };
  const row = await prisma.runeRun.findFirst({
    where: { ...where, status: { in: ["loading", "active"] } },
    orderBy: { createdAt: "desc" },
  }) ?? await prisma.runeRun.findFirst({
    where: { ...where, status: "complete" },
    orderBy: { createdAt: "desc" },
  });
  return row ? { state: stateFromJson(row.state), revision: row.revision } : null;
}

export async function getOwnedRun(runId: string, ownerKey: string) {
  const row = await prisma.runeRun.findFirst({ where: { id: runId, ownerKey } });
  return row ? { state: stateFromJson(row.state), revision: row.revision } : null;
}

export async function saveRunRevision(state: RunesRunState, revision: number) {
  const updated = await prisma.runeRun.updateMany({
    where: { id: state.runId, ownerKey: state.ownerKey, revision },
    data: {
      status: state.status,
      state: state as unknown as object,
      expiresAt: new Date(state.expiresAt),
      revision: { increment: 1 },
    },
  });
  return updated.count === 1;
}

export const runExpiryMs = RUN_TTL;
