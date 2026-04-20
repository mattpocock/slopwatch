import { describe, expect, test } from "bun:test";
import { sendEvents } from "@slopwatch/events";

describe("claude-code listener", () => {
  test("re-exports sendEvents from events", () => {
    expect(typeof sendEvents).toBe("function");
  });
});
