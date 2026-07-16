import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 若部署到 GitHub Pages 專案頁（如 https://xxx.github.io/tips-portfolio/），
// 請把 base 改成 '/tips-portfolio/'；部署到 Vercel 或自訂網域則維持 '/'。
export default defineConfig({
  plugins: [react()],
  base: '/',
});
