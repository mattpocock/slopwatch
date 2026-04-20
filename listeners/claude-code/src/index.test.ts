import { describe, expect, test } from "bun:test";
import { sendEvents } from "@slopwatch/wire";

describe("claude-code listener", () => {
  test("re-exports sendEvents from wire", () => {
    expect(typeof sendEvents).toBe("function");
  });
});
