# 易读书架 · easy-book

把 `book-to-skills` 生成的书籍精读笔记，变成一个可以在局域网里随手翻阅的本地电子书架。

- 📚 书架首页：按主题展示书目，支持全文搜索
- ⚡ 快速浏览：每本书有「概览 / 章节 / 速查 / 术语 / 模式」五个入口
- 📖 舒适阅读：章节按「核心观点 · 框架 · 概念 · 心智模型 · 案例 · 要点」组织，可一键跳到任意小节
- 🗂️ 本地原文：局域网模式下可读 PDF / EPUB 原始电子书（原文不会进入公开站点）
- 📱 移动端友好：两列书架、粘性导航、字号调节、深色模式、可添加到主屏幕
- 🔒 完全本地：静态资源随项目构建，不依赖任何在线服务

## 快速开始

需要 Node.js 22.13+（PDF.js 的构建要求）。

```bash
npm install
npm run dev
```

终端会输出本机和局域网地址，例如：

```
Local:   http://localhost:5173/
Network: http://192.168.1.23:5173/
```

手机连同一个 Wi-Fi，直接打开 `Network` 地址即可。首次运行时 Windows 可能弹出防火墙提示，请允许 Node.js 访问「专用网络」。

## 稳定访问（构建后启动）

```bash
npm run build
npm start
```

`npm start` 会先同步书稿、构建，再用本地静态服务器监听 `0.0.0.0:4173`，并直接打印可访问的局域网地址。

换端口：

```bash
PORT=8080 npm start
```

## 发布到 GitHub Pages

构建产物（`dist/`）是纯静态文件，不依赖本机目录，可以直接托管。项目已使用相对路径构建（`base: './'`），所以仓库叫什么都行，站点地址是：

```
https://<用户名>.github.io/<仓库名>/
```

步骤：

1. 在 GitHub 新建仓库并推送本项目。注意 `public/library/` 要一起提交——它是书稿的静态快照；GitHub Actions 里没有 `E:/personal/book-to-skills`，构建时会自动沿用这份快照。
2. 打开仓库 **Settings → Pages → Build and deployment**，把 **Source** 设为 **GitHub Actions**。
3. 之后每次推送到 `main`，`.github/workflows/deploy.yml` 会自动构建并发布；也可以手动运行这个 workflow。

几点说明：

- 免费账号的 GitHub Pages 需要公开仓库，站点和书稿摘要也会公开；如果只想自己看，建议继续用局域网方式。
- 如果不想把生成内容放进 `main`，也可以本地 `npm run build` 后把 `dist/` 推到 `gh-pages` 分支，Pages 选择从分支发布。
- 更新本地书稿后，先运行 `npm run sync`（或 `npm run build`），再把 `public/library/` 的变化一起提交。

## 内容从哪来

默认读取 `E:/personal/book-to-skills`，每次 `npm run dev` / `npm run build` 都会自动同步：

- `SKILL.md` → 书名、作者、简介、核心框架、主题索引、章节索引
- `chapters/*.md` → 章节正文
- `cheatsheet.md` / `glossary.md` / `patterns.md` → 速查表 / 术语表 / 模式库

同步结果写入 `public/library/`，并作为书稿快照随仓库提交（这样在 GitHub Actions 或没有源目录的机器上也能直接构建）：

- `index.json`：书架、章节、主题索引
- `search.json`：全文搜索索引

源目录不同时：

```bash
BOOK_SOURCE="D:/books/my-skills" npm run dev
```

同步脚本只会读取源目录，不会修改原文件。空目录或缺少 `SKILL.md` 的子目录会被自动跳过。

## 本地原文阅读（仅局域网）

原始电子书不会发布到 GitHub Pages，只在本机服务运行时按需读取：

```bash
npm run dev     # 开发模式，http://localhost:5173
# 或
npm start       # 构建后启动，http://localhost:4173
```

启动后首页会出现「原文书架」，书籍详情页会多一个「原文」标签。支持：

- **PDF**：PDF.js 阅读器，页码、目录、缩放、阅读进度
- **EPUB**：epub.js 重排阅读，目录、字号、阅读进度
- **MOBI / AZW3 等**：暂只提供下载，可用 Calibre 转成 EPUB 后再看

默认扫描 `E:/personal/ebook`：

```text
E:/personal/ebook/
├─ 已转换skill/                  # 已转换的精读原文
│  ├─ .book-library.json         # 原文 → 书架 slug 的映射
│  └─ _未转换-直接归档/
└─ 其他顶层电子书
```

- 能在 `.book-library.json` 里匹配到 slug 的书，会出现在对应书籍的「原文」Tab
- 没有匹配到精读笔记的书，会出现在「原文书架」的「待整理原文」分组
- 原文始终从源目录流式读取，不会复制到 `public/`，也不会进入 Git

源目录不同时：

```bash
EBOOK_ROOT="D:/books" npm start
```

GitHub Pages 上没有 `/api/originals`，前端会自动隐藏原文入口，直接访问 `#/originals` 会提示「仅本地可用」。默认只监听局域网；如果要在外网阅读，建议使用 Tailscale 或 Cloudflare Access，不要把原文服务直接暴露到公网。

## 新增一本书

1. 用 `book-to-skills` 在源目录生成新的 skill 目录（包含 `SKILL.md` 与 `chapters/`）；
2. 重新运行 `npm run dev` 或 `npm run build`；
3. 如需自定义封面配色、分类和一句话推荐语，在 `scripts/sync-library.mjs` 的 `META` 中加一项；否则自动使用兜底配色。

## 项目结构

```
easy-book/
├─ .github/workflows/     # GitHub Pages 自动发布
├─ scripts/
│  ├─ sync-library.mjs    # 扫描 book-to-skills → public/library/*
│  ├─ originals.mjs       # 本地原文清单 + Range 流式读取
│  └─ serve.mjs           # 构建产物的局域网静态服务器
├─ public/
│  ├─ icon.svg
│  ├─ manifest.webmanifest
│  └─ library/            # 生成的书稿与索引快照（随仓库提交）
├─ src/
│  ├─ components/         # 首页、书籍页、阅读器
│  │  └─ viewer/          # PDF.js / epub.js 原文阅读器
│  ├─ lib/                # 数据加载、路由、存储、Markdown 辅助
│  ├─ App.tsx
│  ├─ styles.css
│  └─ originals.css       # 原文书架与阅读器样式
└─ vite.config.ts
```

## 小提示

- 阅读进度、字号、深浅色偏好都保存在浏览器 `localStorage` 中，换设备不会同步。
- 手机上可用浏览器菜单「添加到主屏幕」，获得接近原生 App 的全屏阅读体验。
- 内容渲染使用 `react-markdown`，不会执行书稿中的原始 HTML。
