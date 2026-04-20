import { describe, expect, test } from "bun:test";
import type { NormalEvent } from "@slopwatch/wire";

describe("server", () => {
  test("can construct a stub event", () => {
    const event: NormalEvent = { kind: "stub" };
    expect(event).toEqual({ kind: "stub" });
  });
});
