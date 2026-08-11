# DocNest

DocNest 是一个可复用的本地 Markdown 文档中心。文档内容归使用它的项目所有，DocNest 只提供查看、导航、Mermaid 图表、导出和本地 Watch 能力。

## 快速接入

在项目根目录执行：

```bash
npm install docnest@0.1.0
```

项目默认读取 `docs/`，可直接启动：

```bash
npx docnest serve
```

默认只监听 `127.0.0.1`，从 3000 开始查找可用端口。启动时会自动打开浏览器；使用 `--no-open` 可关闭。

## 配置

复制 `docnest.config.example.mjs` 为项目根目录的 `docnest.config.mjs`，配置项目自己的标题、目录顺序、存储键前缀和 PDF 水印。

水印默认关闭。开启后，PDF 导出弹窗会读取配置文字，并允许本次导出临时修改；临时修改不会写回文件或浏览器存储。

如需显式指定端口、文档目录或监听地址：

```bash
npx docnest serve --port 3000 --docs-dir docs --host 127.0.0.1
```

`--host 0.0.0.0` 只应由项目自己的生产启动适配层显式使用；DocNest 不提供远程发布、SSH、Docker、云厂商流水线、SSO、Redis 或对象存储能力。

若宿主项目需要固定生产端口，可在适配层设置 `DOCS_PORT_FALLBACK=false`；普通本地启动保持从起始端口向后查找空闲端口。

## 嵌入现有 Node 服务

需要接入项目自己的鉴权或文档来源时，在加载 `docnest/server` 前注入中间件和文档存储适配器，然后使用导出的 Express/Socket.IO 实例：

```js
globalThis.__DOCNEST_BEFORE_DOCUMENT_ROUTES__ = [projectAuthMiddleware]
globalThis.__DOCNEST_DOCUMENT_STORE__ = projectDocumentStore
process.env.DOCS_AUTOSTART = 'false'

const { app, io, startServer } = require('docnest/server')
io.use(projectSocketAuth)
startServer(3000)
```

存储适配器实现 `name`、`readDir`、`fileExists`、`readFile`、`readAsset`，可选实现 `ready`；这样文档内容仍由宿主项目提供，DocNest 只负责展示和交互。

## 开发

```bash
npm install
npm test
npm run pack:check
```

最低支持 Node.js 20，验证 Node.js 20 和 22。
