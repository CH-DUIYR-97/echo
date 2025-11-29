import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // 👇 IMPORTANT for Capacitor (iOS/Android WebView): use relative asset URLs
  base: './',

  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Optional but helpful for Xcode/Safari debugging
  build: {
    outDir: 'dist',     // matches your Capacitor webDir
    sourcemap: true,    // lets you see real TS/TSX lines in the simulator
  },
})