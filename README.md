# Shape3D Studio

[在线打开 Shape3D Studio](https://giogyan90.github.io/3D_AItool/studio/)

Shape3D Studio 是一个浏览器 3D 编辑器，支持参考图描线、顶点编辑、材质调整和场景项目保存。通过 **项目 → 打开项目文件** 载入自己的 `.shape3d.json` 工程。选中带控制网格的图层后，点击 **编辑顶点**。

## 本地运行

需要 Node.js。在仓库根目录运行：

```sh
npm ci
npm run dev
```

本地使用 AI 功能时，在 `.env.local` 中配置 `GEMINI_API_KEY`。

## 构建在线版

运行 `npm run build:pages`，产物生成在 `docs/studio/`。公开构建关闭需要 API 密钥的 AI 功能。
