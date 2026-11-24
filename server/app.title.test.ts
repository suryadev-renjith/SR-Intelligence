import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");

describe("SR AI platform title", () => {
  it("keeps the configured title and document title branded as SR AI", () => {
    expect(process.env.VITE_APP_TITLE ?? "SR AI").toBe("SR AI");
    expect(indexHtml).toContain("<title>SR AI</title>");
  });
});
