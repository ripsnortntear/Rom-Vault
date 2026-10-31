import { describe, it, expect } from "vitest";

describe("pipeline verification", () => {
  it("verifies unit test reports work in gitlab", () => {
    expect(1 + 1).toBe(2);
  });
})