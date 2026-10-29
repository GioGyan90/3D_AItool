# 少年模型来源与改造范围

- 用户仓库：GioGyan90/CharaBuilder，固定提交 `6ff7fa5c7b451c7318cf445038f1514a646343ea`。
- 人物：正式 `boy` 基础；`faceSource=vroid`、`bodySource=vroid`、层次斜刘海与短后发 / 侧发、短袖参数、衣裤。
- 基础身体、脸部、眼睛、眉毛、原鞋：pixiv / VRoid Project 的 **beta HairSample_Male**。官方 CC0 说明：https://vroid.pixiv.help/hc/en-us/articles/4402614652569 。不含受限的新版 VRoidPreset A–Z。
- 原上衣与长裤：pixiv 的 **Sakurada Fumiriya**，CC0。官方说明：https://vroid.pixiv.help/hc/en-us/articles/360014788554 。原始对比体保留其上衣；装配体保留其长裤和权重，不重新下载替换基础体。
- 装配体 T 恤：以同一 **HairSample_Male** 少年基础体的连续上身 / 肩腋拓扑放松拟合，沿原上衣衣长与袖口裁切，重新设置衣物肩袖权重并重算法线，下摆根据原裤腰外包拟合并协调骨盆权重；非新下载模型。
- 前发和帽内发底：复用 **Sakurada Fumiriya** 的 CC0 现成前发 / 头皮，按仓库的 `swept` 模块拆分拟合，非新生成发型。
- 短后发 / 侧发：**Micket / Side parting hairstyle for male model**，CC0-1.0：https://opengameart.org/content/side-parting-hairstyle-for-male-model 。保留原 201 三角面发型的后发和侧发区域；仅裁掉帽内部分。
- 原始转换和许可记录：https://github.com/GioGyan90/CharaBuilder/blob/6ff7fa5c7b451c7318cf445038f1514a646343ea/THIRD_PARTY.md 。源数据清单：同提交的 `dist/assets/anime/{male,uniform,sidepart}-manifest.json`。

原始少年统一等比缩放至含原发型约 1.70 米，骨骼间比例保持。以该预设为结构基准；此前生成的概念图不作为几何拟合目标。改造模型增加反戴帽的帽冠、后帽檐、青绿前调节带、黄铜带扣和顶扣；原鞋增加鞋底；去掉纽扣和立领，以同一少年身体拓扑重建连续 T 恤，并按实际颈口补圆领；删除服装内残留的肩部和上臂皮肤。面部、头身和现有权重不以新建灰模替换。

`source-preset.glb` 是同参数、同颜色的减面前对比体，保留原短袖衬衫与鞋；`reassembled-boy.glb` 是减面和补件后的装配体。脸部着色逻辑离线烘焙成嵌入 PNG，使浏览器、GLB 导出和普通 glTF 播放器都能显示眉眼，而不依赖原项目的自定义 shader。

新增代码及配件随本实验目录的 Apache-2.0 许可；原 CC0 来源及作者身份保留。本模型没有移植完整捏人参数或表情编辑器。
