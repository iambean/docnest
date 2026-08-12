import { defineConfig } from 'docnest/config'

export default defineConfig({
  // 默认读取项目根目录 docs/
  docsDir: 'docs',
  site: {
    title: '我的项目文档',
    subtitle: '本地 Markdown 文档服务',
    logo: '',
    storageKeyPrefix: 'docnest:my-project',
  },
  navigation: {
    rootDirectoryOrder: [],
  },
  appearance: {
    // slate-modern | editorial-atlas | precision-index | archive-room | swiss-manual
    defaultTheme: 'slate-modern',
    // auto | light | dark
    defaultMode: 'auto',
    enabledThemes: [
      'slate-modern',
      'editorial-atlas',
      'precision-index',
      'archive-room',
      'swiss-manual',
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    watch: true,
    openBrowser: true,
  },
  export: {
    watermark: {
      enabled: false,
      text: '我的项目文档',
    },
  },
})
