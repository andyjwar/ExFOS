import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Actions sets VITE_BASE_PATH=./ for Pages; local dev defaults to /TCLOT/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/TCLOT/',
  plugins: [react()],
})
