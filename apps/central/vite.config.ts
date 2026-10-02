import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // O plugin de rotas vem antes do React: ele gera a árvore de rotas a partir de src/routes.
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3000,
    // Mesma origem para o navegador: o cookie de sessão (httpOnly, SameSite=Strict)
    // vale para /api sem CORS. Nenhuma chave de API entra no bundle do cliente.
    proxy: {
      '/api': { target: `http://localhost:${process.env.API_PORT ?? 3001}` },
    },
  },
});
