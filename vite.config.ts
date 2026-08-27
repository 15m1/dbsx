import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // 相对路径，兼容 GitHub Pages 子路径部署（用户名.github.io/仓库名）
  base: './',
  plugins: [react()],
})
