import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/accounting_v3/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Бухгалтерія ФОП',
        short_name: 'ФОП-Облік',
        description: 'Облік доходів, витрат, складу та податків для ФОП',
        theme_color: '#2f6f5e',
        background_color: '#eef6f1',
        display: 'standalone',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});