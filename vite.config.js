import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	root: 'src/frontend',
	base: './',
	plugins: [react(), tailwindcss()],
	build: { outDir: '../../static/dashboard', emptyOutDir: true },
	server: { port: 5173 }
});
