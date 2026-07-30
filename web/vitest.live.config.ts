import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.live.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // the runtime guard must stay in the bundle, but vitest has no RSC graph
      "server-only": path.resolve(__dirname, "./test/server-only-stub.ts"),
    },
  },
});
