export function selectionAfterRunAction(current: string | null, action: "ready" | "reveal" | "confirm" | "ack") {
  return action === "reveal" ? current : null;
}
