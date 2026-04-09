import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const apiTarget = env.API_DEV_TARGET || 'http://localhost:3000'
  const onlyofficeTarget = env.ONLYOFFICE_DEV_TARGET || 'http://localhost'

  return {
    base: './',
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => tag === 'doc-preview',
          },
        },
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      allowedHosts: true as any,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/files': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/onlyoffice': {
          target: onlyofficeTarget,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/onlyoffice/, ''),
        },
        '/cache': {
          target: onlyofficeTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
  }
})
