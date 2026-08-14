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
  auth: {
    // 极简单口令授权；关闭时文档中心保持本地开放。
    enabled: false,
    // 仅首次启动且授权状态文件不存在时使用，之后可在页面内修改。
    passphrase: '',
    stateFile: '.docnest/auth.json',
    // 前端 localStorage 的键；口令会永久保存在浏览器本地，直到用户退出或修改口令。
    localStorageKey: 'my-project:auth-passphrase',
    sessionTtlMinutes: 24 * 60,
  },
  export: {
    watermark: {
      enabled: false,
      text: '我的项目文档',
    },
  },
})
