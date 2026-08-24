# DocNest

DocNest 是一个可复用的本地 Markdown 文档中心。文档内容归使用它的项目所有，DocNest 只提供查看、导航、Mermaid 图表、导出和本地 Watch 能力。

## 快速接入

在项目根目录执行：

```bash
npm install docnest
```

项目默认读取 `docs/`，可直接启动：

```bash
npx docnest serve
```

默认只监听 `127.0.0.1`，从 3000 开始查找可用端口。启动时会自动打开浏览器；使用 `--no-open` 可关闭。

## 配置

复制 `docnest.config.example.mjs` 为项目根目录的 `docnest.config.mjs`，配置项目自己的标题、目录顺序、存储键前缀和阅读限制策略。

### 外观主题

DocNest 内置五套独立主题，主题风格与明暗模式分别选择、分别持久化：

- `slate-modern`：中性灰阶与克制强调色构成的现代文档风格，也是默认主题
- `editorial-atlas`：强调长文阅读与技术出版秩序
- `precision-index`：高信息密度的工程索引
- `archive-room`：带有档案与阅览室气质的纸张风格
- `swiss-manual`：黑白网格与信号色构成的工程手册

页面右上角可以选择主题风格；相邻的明暗模式按钮在 `auto → light → dark` 之间循环。偏好使用 `site.storageKeyPrefix` 隔离，因此同一域名下的多个 DocNest 实例不会互相覆盖。

宿主项目可以设置默认外观，并限制用户可选主题：

```js
import { defineConfig } from 'docnest/config'

export default defineConfig({
  appearance: {
    defaultTheme: 'editorial-atlas',
    defaultMode: 'auto',
    enabledThemes: [
      'slate-modern',
      'editorial-atlas',
      'precision-index',
      'archive-room',
      'swiss-manual',
    ],
  },
})
```

未配置 `appearance` 时使用 `slate-modern + auto`。旧配置中的 `current-docs` 会自动迁移到 `slate-modern`，正文视觉不会发生变化；旧版保存的 `markdown-theme` 明暗偏好也会自动迁移到新的项目级存储键。

PDF、页面水印和图表外带能力由一个开关统一控制，默认使用普通阅读模式：

```js
export default defineConfig({
  restrictedMode: false,
})
```

- `restrictedMode: false`：显示打印和 PDF 导出，允许 Mermaid 图下载与大图查看。导出 PDF 时会弹出本次水印设置，可选择是否添加并自定义文案；默认文案为 `site.title`，不会写回配置。
- `restrictedMode: true`：隐藏打印和 PDF 导出入口且不加载导出模块；使用 `site.title` 作为固定水印，禁止文字选择、复制、剪切和拖拽，并隐藏 Mermaid 下载与大图查看入口。Mermaid 仍会在正文中正常渲染。

受限模式只移除 DocNest 提供的页面入口和脚本，不承诺对浏览器开发者工具或系统级截图提供绝对防护。

### 极简单口令授权

需要让文档中心只对知道口令的人开放时，可以启用单口令授权：

```js
export default defineConfig({
  auth: {
    enabled: true,
    passphrase: '请替换为项目自己的长口令',
    // 服务通过反向代理挂载在子路径时填写，例如 /documents；默认跳转到 /。
    redirectPrefix: '',
    stateFile: '.docnest/auth.json',
    localStorageKey: 'my-project:auth-passphrase',
    sessionTtlMinutes: 24 * 60,
  },
})
```

授权只有一道关口，没有账号、密码组合或角色体系。首次启动时，`passphrase` 会初始化到由
`stateFile` 指定的本地授权状态文件；状态文件只保存带随机盐的口令哈希，不保存明文口令。
按极简模式约定，前端会把可回填的口令永久保存到浏览器 `localStorage`（不写入 URL）；每次打开或刷新文档页面，前端都会把当前缓存的口令交给后台重新校验。校验失败会回到口令页，校验成功才会继续打开当前页面；输入页会保留跳转前的目标地址，错误口令会停留在输入页。由于 `localStorage` 是浏览器本地明文存储，请只在受信任的浏览器环境使用此模式。
`localStorageKey` 可选，用于为不同宿主项目隔离浏览器存储键。内置授权不提供“修改口令”或“退出”按钮；需要更换口令时，停止服务、删除 `stateFile`，修改配置中的 `passphrase` 后重新启动。
建议把 `.docnest/` 加入宿主项目的 `.gitignore`，并为口令状态文件设置仅当前用户可读写的权限。

如果 DocNest 由反向代理挂载在 `/documents/` 等子路径下，将 `auth.redirectPrefix` 配置为 `/documents`。登录页会把原始文档目标写成带此前缀的路径，口令登录后的服务端跳转也会使用同一前缀；不配置时保持跳转到 `/` 的默认行为。

授权开启但既没有状态文件，也没有初始 `passphrase` 时，DocNest 会拒绝启动，避免意外以空口令开放文档。

如需显式指定端口、文档目录或监听地址：

```bash
npx docnest serve --port 3000 --docs-dir docs --host 127.0.0.1
```

`--host 0.0.0.0` 只应由项目自己的生产启动适配层显式使用；DocNest 不提供远程发布、SSH、Docker、云厂商流水线、SSO、Redis 或对象存储能力。

若宿主项目需要固定生产端口，可在适配层设置 `DOCS_PORT_FALLBACK=false`；普通本地启动保持从起始端口向后查找空闲端口。

## 嵌入现有 Node 服务

需要接入项目自己的鉴权或文档来源时，在加载 `docnest/server` 前注入中间件和文档存储适配器，然后使用导出的 Express/Socket.IO 实例。项目若不使用上面的内置单口令授权，仍可在这里接入自己的访问控制：

```js
globalThis.__DOCNEST_BEFORE_DOCUMENT_ROUTES__ = [projectAuthMiddleware]
globalThis.__DOCNEST_DOCUMENT_STORE__ = projectDocumentStore
process.env.DOCS_AUTOSTART = 'false'

const { app, io, startServer } = require('docnest/server')
io.use(projectSocketAuth)
startServer(3000)
```

存储适配器实现 `name`、`readDir`、`fileExists`、`readFile`、`readAsset`，可选实现 `ready`；这样文档内容仍由宿主项目提供，DocNest 负责展示、交互和可选的单口令授权。

## 静态构建中的文档附件

如果宿主项目需要生成静态站点，可使用 `docnest/attachments` 提供的
`collectDocumentAttachmentPaths` 和 `copyDocumentAttachments`。它们只复制
Markdown 或 HTML 中明确引用的本地附件，不按文件扩展名设置业务白名单；外链、文档链接、隐藏路径、路径穿越和代码块中的伪引用会被忽略，缺失的附件默认会让构建失败。
常见凭据文件（如 `.env`、私钥和证书容器）属于公共安全阻断项，即使被误写进文档链接也不会进入静态产物。
静态生成 HTML 时，可再调用 `rewriteDocumentAttachmentUrls`，将正文中的附件链接统一改写到 `/doc-asset/` 端点。

## 开发

```bash
npm install
npm test
npm run pack:check
```

最低支持 Node.js 20，验证 Node.js 20 和 22。

## 发布规范

DocNest 的 GitHub Release 和 npm 发布统一由 GitHub Actions 完成，不在本地直接执行 `npm publish`。

发布新版本时：

1. 更新 `package.json` 和 `package-lock.json` 的版本号，并运行 `npm test` 与 `npm run pack:check`。
2. 将版本提交推送到 `main`。
3. 在 `main` 上创建与包版本一致的标签，例如 `v0.1.13`。
4. 推送该标签：`git push origin v0.1.13`。

标签推送后，`.github/workflows/publish.yml` 会校验标签与包版本一致，使用 npm OIDC 发布公开包，并自动创建名为 `DocNest v0.1.13` 的 GitHub Release。远程仓库只保留 `main` 分支，发布标签不需要推送临时开发分支。
