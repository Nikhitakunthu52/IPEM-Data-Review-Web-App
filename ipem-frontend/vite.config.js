import react from '@vitejs/plugin-react'
import process from 'node:process'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site from /<repo-name>/; the deploy workflow sets
  // VITE_BASE to that. Locally it stays "/".
  base: process.env.VITE_BASE || '/',
  server: {
    // Lets the demo read the shared limits file in ../ipem-api 2/limits.json.
    fs: { allow: ['..'] },
  },
})
