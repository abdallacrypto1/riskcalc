import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Base relativa: funciona tanto no domínio próprio (raiz) quanto na URL
  // de teste github.io/<repo>/.
  base: "./",
  plugins: [react(), tailwindcss()],
});
