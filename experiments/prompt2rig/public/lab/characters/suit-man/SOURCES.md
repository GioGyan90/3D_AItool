# 青年西装男士：来源与改造

## 已核对的结构依据

- 作者：**Quaternius**；资产：**Business Man**，来自 **Ultimate Modular Men Pack**。
- 作者素材页：https://poly.pizza/m/JFrLIKqvCH 。该具体条目标注 2022-02-22、Public Domain (CC0)。
- 作者套装页：https://quaternius.com/packs/ultimatemodularcharacters.html ，该套装明确链接 CC0。页面中的套装预览图已作为结构与造型对照，西装人物位于左起第二位。
- 许可：**CC0-1.0**，https://creativecommons.org/publicdomain/zero/1.0/ 。这里依据的是具体资产和具体套装的许可，不把作者网站其他新产品的条款套到本素材上。
- 已先检查用户的 CharaBuilder：现有 Stone C 主要是成熟肌肉体型；此次选择独立的成年基础，不用少年头脸的大范围变形冒充成男。

## 固定的未修改源文件

公开镜像仅用于取得二进制；作者与许可依据以上作者发布页。

- 仓库：https://github.com/nishit47/Blender-Pre-vis-Pipeline---Screenplay-to-Animatic
- 固定提交：`6d6de54a1d7143cf5487462d147bbef039de4837`
- 文件：`assets/Ultimate Modular Men Pack-glb/Business Man.glb`
- [未经改动的原 GLB](https://raw.githubusercontent.com/nishit47/Blender-Pre-vis-Pipeline---Screenplay-to-Animatic/6d6de54a1d7143cf5487462d147bbef039de4837/assets/Ultimate%20Modular%20Men%20Pack-glb/Business%20Man.glb)
- 字节数：1,529,248；SHA-256：`82b81257c1e94cd9ee48cb1dcbe5ff506e81c9ce67cd0c5af542d8712dca546e`。

## 保留与改造

原来的成年脸、侧分短发、头身比例、西装、衬衫、领带、长裤、皮鞋和双手均来自该素材。此次是现成 CC0 人物的装配适配，不声称整个人物或西装由零雕刻。

1. 从逆绑定矩阵恢复作者的 T 姿势，烘焙到共同装配坐标，等比归一化到 1.80 米；不沿用导入文件打开时的非对称动画姿势。多个皮肤共享骨骼，只恢复一次姿势，并分别使用各自的逆绑定矩阵处理网格。
2. 保留关节实际位置，整理为标准人形名称。源脚骨独立于腿链，接回对应小腿；真实指根使用源 `Index/Middle/Ring/Pinky 2`，不把同点的 `*1` 掌部辅助骨当指根。
3. 源模型已有明确衣物和外露手、头；衣内没有完整身体，不添加多余一层皮肤。保留原服装轮廓，衣身不外扩成宽松桶形，裤腿不重新塑形。
4. 拆解前保守简化。源网格为分面法线，先在保留 UV 和蒙皮边界的前提下焊接可重建的法线，再减面、重建分面法线。肩腋和肘部根据动作检查局部细分并重设权重；这些必要细分会增加最终面数。实际阶段统计见 `manifest.json`，不以请求的保留比例冒充实际减面量。
5. 西装长袖增加四根肘部 / 前臂辅助骨，将弯曲和轴向旋转分配到袖管；辅助骨也进入烘焙导出轨道，不能只在页面里临时修正。
6. 衣身、左右衣袖、内搭衬衫、领口、左右袖口、领带、裤腰、左右裤腿、左右皮鞋、头颈、头发、眉毛、眼睛、左右手，共 19 个零件。改为藏蓝西装、暖白衬衫、酒红领带和深色鞋发；布料与皮肤的金属度改为 0。

`source-reference.glb` 是未减面、原配色的形体对比，已经统一单位、静止姿势、骨名和脚部层级，因此不等于上面的原文件。`assembled-suit-man.glb` 是修正装配体。原文件的 24 段动画仍保留在固定源链接；重映射后的资产由 Motion Lab 生成自己的动作，不把旧轨道硬套到新骨名和层级上。

文件大小对比包含移除未使用源动画、缓冲紧凑化及 Meshopt 压缩等因素，不能全部归因于减面。源对比和装配体之间，局部细分可能使装配体更大。完整裸身体、布料模拟、表情编辑和任意动作无穿模均不在本资产能力范围内。

来源 CC0 身份保留；适配代码采用本工程 Apache-2.0 许可。重建及验证见工程的 `docs/SUIT_MAN.md`。
