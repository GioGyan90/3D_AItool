# 二次元波波头女性：来源与改造

核对日期：2026-10-31。人物为独立新方案，保留原双束发运动女性、少年与西装青年。

## 成年身体与运动服

成年身体来自 Quaternius **Universal Base Characters — Standard / Superhero Female FullBody**，CC0-1.0。沿用本项目已完成的运动背心、瑜伽长裤、运动鞋、指骨蒙皮和跑步适配，身体比例、服装几何及 71 个关节位置不变。新角色不使用 VRoid 供体的身体或服装。

- [作者套装页](https://quaternius.com/packs/universalbasecharacters.html)、[作者下载页](https://quaternius.itch.io/universal-base-characters)。
- 具体作者文件、固定镜像提交 `a928cfa67684352b75a65c510d8751d1f3f2489c`、原样许可及全部改造范围见 [原运动女性来源](../running-woman/SOURCES.md)。
- 使用的 `../running-woman/assembled-running-woman.glb`：SHA-256 `e0cd65a169eab175529882c2fcf71abd115f433ea0376313ce1d800776cc0847`。
- 完整未遮挡成年基础继续保存在 `../running-woman/complete-source.glb`：SHA-256 `d1cb9716d0b0267f96775eac460c38d370da0f586277e2c425742d4173f6e45f`。本目录的 `source-reference.glb` 是穿衣装配的优化前对比，不能冒充完整基础体。

## 二次元头脸与波波短发

作者为 **pixiv / VRoid Project**，使用 **VRoid Studio beta** 样本中的 CC0 组件：

| 组件 | 具体样本 | 使用范围 |
| --- | --- | --- |
| 头脸 | `HairSample_Female` | 面部、后脑、眼白、虹膜、眉眼与口腔；保留原几何、UV 和彩绘五官 |
| 短发 | `Sendagaya Shibu`（beta AvatarSample） | 波波发束与发底，省略发夹；不使用人物身体或制服 |

[VRoid 官方样本许可说明](https://vroid.pixiv.help/hc/en-us/articles/4402614652569) 列明 beta HairSample 及 beta AvatarSample 的 CC0 身份；[Sendagaya Shibu 官方页面](https://vroid.pixiv.help/hc/en-us/articles/360012381793) 同样明确 CC0。该供体原角色的年龄设定不用于本项目成年身体的来源声明。这里没有使用许可条件不同的新版正式版预设。

先复用用户仓库 [GioGyan90/CharaBuilder](https://github.com/GioGyan90/CharaBuilder) 中已有的打包组件，固定提交 **`6ff7fa5c7b451c7318cf445038f1514a646343ea`**，路径 `dist/assets/anime/`。构建器核对 Git blob 与固定提交一致，再保存逐文件 SHA-256 至 [manifest.json](manifest.json)。使用 `female-manifest.json`、`female-0..3.b64`、`female-0..7.png`，以及 `bob-manifest.json`、`bob-0..2.b64`、`bob-14.png`、`bob-15.png`。源包自身也声明 CC0。

## 本项目改造

1. 移除新装配中的旧头脸、眉眼与双束发；保留真实成年颈部下段。以实际 Neck / Head 锚点校准新头，面部横向和深度统一缩放；没有从零雕刻脸，也没有新建独立成女基础。
2. 新颈上段按真实成年颈截面拟合；脸部最低顶点以上不受颈部加宽影响。两个边界圈用 94 个三角面真实连接，共享位置、法线和权重。跑步时逐点核对接合边界。
3. 采用源包针对 female 头型的发底拟合，齐下巴波波发束与发底分件；栗棕色调为本次制作选择。按 UV / 材质 / 蒙皮边界简化：发束 19,436 → 5,812 面，发底 394 → 388 面；整体 35,729 → 22,099 面。
4. 保留作者的薄片发束、透明裁切与必要双面语义；没有用双面材质遮盖头颈接缝。材质采用可携带的 basic / 高粗糙度材质与源贴图，未移植完整 MToon 或自定义赛璐璐渲染器。
5. 头脸与头发跟随 Head，表情中性。没有制作眨眼、口型、头发动力学。成年身体和服装沿用原装配，仅统一外露肤色。
6. 跑步使用项目已有的 4 秒 `motion-plan v1` 循环与双手 `looseFist`，重新对新角色运行独立变形、接缝、鞋底与完整导出检查。

源素材继续保留 CC0 身份；本项目新增构建、适配与检查代码采用工程 Apache-2.0 许可。详见工程 `docs/ANIME_BOB_WOMAN.md`。
