# 3D_AItool · 布线建模功能交接（2026-11-20）

仓库：https://github.com/GioGyan90/3D_AItool
主编辑器：`src/App.tsx`
顶点 / 正交参考编辑器：`src/components/ReferenceTracing.tsx`
网格拓扑算法：`src/components/meshTopology.ts`
拓扑测试：`tests/meshTopology.test.ts`

## 本轮目标

让用户从简单的立方体、球体、圆柱开始，通过少量有意义的拓扑布线和顶点编辑逐渐获得复杂造型。解决 Codex 经常把人脸生成规则密集矩形网格、对五官缺乏实际拓扑理解的问题。

## 已写入源码（main）

- 主编辑器顶部新增「布线建模」入口：无选中时创建带控制网格的立方体，选中 box/sphere/cylinder 时转换为低面控制网格；已有 csg 控制网格直接打开。
- 保留图层的变换、颜色和材质；禁止将已有倒角、自定义锚点或形变无损地误当作低面基础形。
- ReferenceTracing 正交视图可点击共享边，选中起始四边面和边序号。
- 右侧 Edge Loop 操作面板可调切割比例，新增连续环线并保留共享顶点。
- 四边面带环传播采用与控制面顶点编号独立的数据结构；检测非四边面、异常重用与非流形边；切割不应导致 T 形悬空端点。
- 使用既有顶点拖拽、3D TransformControls、JSON/GLB 保存能力。
- 增加 `npm run test:topology` 回归测试，覆盖立方体所有切割方向、球体/圆柱环线、跨非四边面拒绝逻辑。
- README 加入使用指引与当前限制。

## 必须验证

- `npm ci`
- `npm run lint` （TypeScript）
- `npm run test:topology`
- `npm run build:pages`
- 实际启动浏览器观察：按钮与面板出现、正交视图点击橙色边线、切线后点数/面数变化、三维预览更新、拖动新顶点、应用到场景、保存重开项目。
- **本轮 GitHub Actions 已运行 `npm ci`、`lint`、`test:topology`、`build:pages` 全部通过，并自动提交最新 `docs/studio/` 构建产物（提交 `f77932f`）。Pages 对该提交的构建与部署记录已成功；仍需在真实浏览器中进行交互视觉验收。**

## 下一阶段优先顺序

1. 在真实浏览器中完成 QA，补齐局部撤销 / 重做，增强边线可点击区域。
2. 正交与 3D 视图同步高亮边环；支持 3D 直接点选边。
3. 扩展单边切割、面内插（Inset）、面挤出（Extrude）、镜像拓扑与桥接。
4. 对半脸拓扑添加参照图对齐、顶点标签与形态约束；之后再考虑投射到 RoomBoy 的 GLB 母版。
5. 在确认视觉效果后才增加复杂度，避免回归无约束的规则长方形密集布线。

## 设计原则

- 明确保存 `vertices` 和 `faces` 两套数据；不在用户调整形态时偷偷重排拓扑。
- 先拓扑、后曲面坐标、再细分；控制新面数。
- 多机位截图复查，发现结构错误应修订边线与节点关系，而非盲目增加密度。
- 用户默认授权常规代码修改、提交、合并；不要就这些步骤重复确认。

## 2026-11-20 后续：局部造型与交互回归

实现分支：`feat/topology-local-tools-20261120`。

- `meshTopology.ts`：新增 `validateControlTopology`（共享边、绕序、非流形和硬限制）、`splitQuadLocally`（一面切割并自动重构相邻面的共享边）、`insetControlFace`（围绕所选面添加四边面环）、`extrudeControlFace`（沿 Newell 法线添加盖面和侧壁）、`mirrorControlMeshX`（X=0 半模型焊接，删中线封盖）。
- `TracePreview.tsx`：允许真实 3D 场景选面、选边，高亮面与选中边；捕获 TransformControls 拖拽开始用于撤销栈。
- `ReferenceTracing.tsx`：增加五项可执行操作入口、50 条历史、键盘与按钮撤销/重做；正交边线加粗便于选取。
- `tests/meshTopology.test.ts`：新增闭合/定向流形、欧拉示性数、三角化一致性和各项造型组合断言。
- `scripts/topology-visual-qa.mjs`：启动 Chromium / WebGL，在真实 UI 中完成环切、撤销、重做、局部切割、内插、挤出，并输出多角度截图；CI 上传 screenshot artifact。

**使用限制**：局部切割会在邻接面引入三角面（而非强制传播全局四边面环）。X 镜像只接受在 X=0 存在中线顶点的单侧网格。当前还未添加多边面自由刀切、Bridge/Loop Connect、独立侧边微调、局部化模型细分与对称编辑约束。后续应优先补足交互式鼠标局部布线和法线视觉验收，避免规则密集重网格化。

**发布验收**：必须核对对应 PR 的 CI 和 Playwright 截图工件；只有类型检查、拓扑/页面测试通过且 Pages 已实际部署后才能声称线上版本更新。
