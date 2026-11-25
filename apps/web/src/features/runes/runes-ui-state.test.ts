import { describe, expect, it } from "vitest";
import { selectionAfterRunAction } from "./runes-ui-state";

describe("Read the Runes round controls", () => {
  it("keeps a selected artwork while revealing another clue", () => {
    expect(selectionAfterRunAction("artwork-b", "reveal")).toBe("artwork-b");
  });

  it("clears selection only at round setup, confirmation, or acknowledgement", () => {
    expect(selectionAfterRunAction("artwork-b", "ready")).toBeNull();
    expect(selectionAfterRunAction("artwork-b", "confirm")).toBeNull();
    expect(selectionAfterRunAction("artwork-b", "ack")).toBeNull();
  });
});
