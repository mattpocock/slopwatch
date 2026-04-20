import { describe, expect, test } from "bun:test";
import type { NormalEvent } from "./index";
import { sendEvents } from "./index";

describe("wire", () => {
  test("NormalEvent shape is assignable", () => {
    const event: NormalEvent = { kind: "stub" };
    expect(event.kind).toBe("stub");
  });

  test("sendEvents is not yet implemented", async () => {
    await expect(sendEvents([])).rejects.toThrow("not implemented");
  });
});
