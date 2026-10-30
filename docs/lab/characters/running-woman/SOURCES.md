# 成年女性跑步角色：来源与改造

## 先查现有素材

核对了 GioGyan90/CharaBuilder 的最新 main：`6ff7fa5c7b451c7318cf445038f1514a646343ea`。其 AGENTS 明确记录成女独立基础尚未建立；没有复用少女并改称成年女性。本角色使用独立的成年女性作者模型，保留已认可的少年与西装男士。

## 作者与具体许可

- 作者：**Quaternius**。
- 套装：**Universal Base Characters — Standard**，2025 年 8 月。
- 原模型：`Superhero_Female_FullBody`；发型：`Hair_Buns`。
- [作者套装页](https://quaternius.com/packs/universalbasecharacters.html)：明确区分 Superhero / Regular / Teen，展示独立成年男女和 Teen；该具体套装页标注 CC0。
- [作者下载页](https://quaternius.itch.io/universal-base-characters)。使用免费 Standard 中的文件，没有引入付费 Source 文件。
- 许可：**CC0-1.0**。原包的 [License_Standard.txt](License_Standard.txt) 原样保留，逐文件 SHA-256 见 `manifest.json.source.hashes`。作者页及许可于 2026-10-30 核对。

## 固定源文件

镜像用于取得作者资产，不代替作者许可依据：

- 仓库：https://github.com/kirbycope/godot-3d-player-controller-v2
- 固定提交：`a928cfa67684352b75a65c510d8751d1f3f2489c`
- 目录：[`assets/universal_base_characters`](https://github.com/kirbycope/godot-3d-player-controller-v2/tree/a928cfa67684352b75a65c510d8751d1f3f2489c/assets/universal_base_characters)
- 使用的 7 个文件：身体 glTF / bin、身体颜色贴图、棕色眼睛贴图、束发 glTF / bin 和 Standard 许可。构建器逐文件核对 SHA-256；下载脚本 `tools/fetch-running-woman-source.py` 固定同一提交。
- 原身体是米制，包含完整躯干、双臂、手指、腿和脚，以及头脸、眉毛、眼睛；未遮挡基础原地高约 1.77505m，65 个源关节。身体与眉眼合计 15,060 面，加源发型为 18,344 面。原发型节点有 0.01 缩放和轴向变换，构建时实际烘焙，不将原缓冲坐标直接当米制。

## 保留与自建范围

1. 成年身体、脸、眉眼、原始关节比例和双束发来自作者。整体统一缩放为赤足 1.68m，身体整体抬高 28mm 给运动鞋底留空间；没有从少女放大，也没有重新雕刻成年身体。
2. `complete-source.glb` 保存**未遮挡完整基础**及源发型，已统一坐标、骨名和绑定姿势；源皮肤颜色图自带内衣。它是可复用的装配对比，不冒充未经改动的原文件。原始 glTF/bin 由上面的固定链接和哈希追溯。
3. 运动背心和瑜伽裤由**同一完整成年身体表面拓扑**裁出、拟合。背心有实体裁切的前后领口和袖窿，保留真实外露肩腋；裤子沿连续腰胯、裆部和腿部表面形成贴身长裤。服装不用原身体颜色图。
4. 背心重设髋部、脊柱、胸和少量锁骨权重，避免无袖衣物被上臂拉扯。覆盖的裤腰留在背心内，不外扩背心成桶形；装配体实际删除衣内躯干和腿部皮肤，外露肩臂和手保留。完整未遮挡基础另存。
5. 膝窝用每侧一根独立半角弯曲辅助骨，沿约 28cm 的过渡范围分配；裆部正中连续分配左右大腿及髋部权重。裸露肩臂重新适配；每侧两根肘部 / 前臂辅助骨分散弯曲和轴向变化。6 根辅助骨全部写入导出轨道，共 **71 个实际节点 / 58 根动作骨骼**。
6. 运动鞋面按原脚表面拟合，鞋底沿原脚的 XZ 凸包生成；对应 Foot 刚性绑定。裤脚过渡跟随脚骨，避免鞋领随踝关节运动而裤脚不跟随。鞋、背心、瑜伽裤均为本轮构建的服装和配件，不是购买或下载的运动服素材。
7. 发型保守简化，实际减面量单独记录；服装裁切和新鞋会增加面数。成品面数高于含发源对比，不将文件压缩或移除缓冲重复值称为几何减面。
8. 跑步为本轮编写的 `motion-plan v1` 数据：4 秒、5 个周期、61 个关键姿态，原地循环。不是从原素材复制的动画，也不是动作捕捉或付费 API 返回。

新增构建、适配和动作代码采用本工程 Apache-2.0 许可，保留原作者 CC0 身份。没有移植换装编辑器、表情系统、头发动力学或完整足部 IK。制作与检查记录见工程 `docs/RUNNING_WOMAN.md`。
