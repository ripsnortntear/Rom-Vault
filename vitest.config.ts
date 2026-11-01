import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

const envLocalPath = path.resolve(__dirname, ".env.local");
const envVars: Record<string, string> = {
  SESSION_SECRET: "test-session-secret-must-be-at-least-32-chars-long",
};

if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [key, ...vals] = trimmed.split("=");
      envVars[key.trim()] = vals.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
}

export default defineConfig({
  test: {
    env: envVars,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/lib/empty.js"),
    },
  },
});
