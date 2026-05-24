import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://jayne-07.github.io/crossword-generator/ on GitHub Pages.
export default defineConfig({
  base: '/crossword-generator/',
  plugins: [react()],
});
