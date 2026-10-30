# 成年女性：运动背心、瑜伽裤与循环跑步

制作日期：2026-10-30（北京时间）。

入口：[直接打开女性跑步方案](https://giogyan90.github.io/3D_AItool/lab/?model=runner)。该入口默认播放跑步；点“形体检查”可以切回源绑定姿势，查看原材质 / 灰模、正侧背、前后俯视、单件和分块装配。少年和西装青年保留。

## 造型与来源

先核对 CharaBuilder，确认成女基础仍待建立；改用 Quaternius 的独立成年 **Superhero Female FullBody**，而非 Teen。具体作者页、CC0 证据、固定提交和逐文件哈希见 [SOURCES.md](../public/lab/characters/running-woman/SOURCES.md)。头脸、成年身体、眉眼和双束发来自作者；背心、瑜伽裤和运动鞋按同一基础构建，不声称整个人物从零雕刻。

本轮自行选择：赤足 1.68m、稳定双束发、青绿运动背心、深蓝贴身瑜伽长裤和浅色运动鞋；保留作者运动型成年比例。上衣为正常衣长，不是短款运动内衣。以上为可调整的制作选择，不写成用户确认的细节。

完整未遮挡基础保存为 `complete-source.glb`，可与装配体比较；身体原颜色图带内衣。该对比已统一坐标、骨名、单位和绑定姿势，不等于原始 glTF/bin。成品的面数 / 顶点 / 字节数及逐件清单在 [构建报告](RUNNING_WOMAN_BUILD.json) 中，裁衣、鞋和动作结构增加的面数如实计入，不能把压缩体积下降当减面。

## 衣物和骨架

- 背心沿实际胸背表面拟合，几何裁切前后领口、肩带、袖窿和下摆；按新覆盖范围删除衣内皮肤，肩峰、肩臂、腋窝与领口皮肤仍存在。背心不沿用裸上臂权重，否则垂臂时袖窿被拉折。
- 瑜伽裤使用连续腰胯、裆部、臀腿拓扑，保留贴身轮廓；隐藏裤腰内收，背心不撑大。裆部正中连续混合髋部与左右大腿，避免在 X=0 突然换侧。
- 约 100° 的屈膝暴露了原膝窝权重折叠；每膝新增半角弯曲辅助骨，并拓宽连续过渡。跑步掌面向身体内侧，通过前臂弯曲后绕轴校正得到，不强行翻手腕。裸露肩膀和手肘也要采样，不能只验证服装：肩部重分胸 / 锁骨 / 上臂权重，肘部用两根辅助骨分摊弯曲与前臂轴向变化。
- 65 个作者源关节加 6 根辅助骨，共 **71 个实际骨骼节点**；52 根标准动作骨骼加 6 根辅助骨，共 **58 根动作骨骼**。辅助骨实时与导出共用。
- 鞋面贴合实际脚型，鞋底依实际脚投影形成凸包；左右鞋底跟随对应 Foot。鞋带交叉路径沿鞋面实际高度采样，不能用一根悬空或埋入鞋面的直条代替。裤脚权重过渡至脚骨；预览地面也按实际鞋底高度贴合。

## 跑步与接地

动作走 `planToTake → applyRetarget / retargetTake → GLB`，没有付费 API 调用。4 秒内包含五个 0.8 秒步态周期（150 步/分钟），61 个关键姿态符合原有协议，不修改 1–20 秒 / 64 姿态限制。左右腿相差半周期，对侧摆臂，肘部保持弯曲，骨盆与躯干克制反转；踝部局部角度控制在约 45° 内。

标准驱动骨架按接触 / 承重 / 支撑 / 腾空的足部高度校准 root；目标再以**实际左右鞋底表面的最低点**修正整体高度，保留驱动的腾空量。这样不会把“脚骨没入地”误当成“鞋底已接地”，同时烘焙导出相同修正。此为垂直接触校正，不是完整足部 IK。原地跑的支撑脚相对虚拟地面后移；支撑速度范围如实记在报告中，不保证恒定跑速或完全无滑步。需要接入有位移的游戏角色时，应另行匹配 root 速度、步幅和支撑相位。

## 本轮验证

工程新增 4 项女性专用测试，原有 36 项保留。女性检查每次重新读取真实资产与实际跑步，不复用少年 / 西装的通过数字：

- 242 个表面姿势（静止 + 4 秒的 60Hz 采样），覆盖背心、瑜伽裤、鞋面 / 鞋底及外露左右肩臂；检查法线、三角面积和边长变化。
- 腰部截面按真实背心和裤腰检查，断言零件存在、样本非零且数值有限；没有用旧少年衣名做空检查。
- 241 个烘焙旋转采样，检查前臂轴向范围、腕部局部角、膝踝相邻帧连续性和首尾接缝。
- 完整人物与动作导出重载，对多个时刻的所有顶点逐点比较；灰模、单件、线框和拆解状态不污染输出。原嵌入身体 / 眼睛贴图的字节也单独比较。

本轮数值结果：最小法线对齐约 0.27570、最小面积比约 0.24108、最大边伸长约 1.79763 倍；46,464 个腰部径向样本最小间距约 1.62mm，无采样穿入。腕部最大局部角约 4.65°，踝部约 45°；导出重载比较 170,410 个顶点，最大误差约 0.00000031m。

详细数值与范围：[RUNNING_WOMAN_VALIDATION.json](RUNNING_WOMAN_VALIDATION.json)。数值验证不等同于美术验收；浏览器多视角与动作复查状态将在发布检查后补充。

## 重建与检查

从 `experiments/prompt2rig` 执行：

```sh
python tools/fetch-running-woman-source.py /path/to/runner-source
RUNNER_SOURCE=/path/to/runner-source node --experimental-loader ./tests/vendor-loader.mjs tools/build-running-woman.mjs
node --experimental-loader ./tests/vendor-loader.mjs tools/check-running-woman.mjs --write
npm test
```

PowerShell 先用 `$env:RUNNER_SOURCE="C:\path\to\runner-source"` 设置路径，再运行 Node 构建命令。构建器核对每个源文件哈希；检查不通过时不会保存有效交付的动作文件。

输出：

- `public/lab/characters/running-woman/assembled-running-woman.glb`：静止人物。
- `public/lab/characters/running-woman/running-woman-run.glb`：人物、完整骨架、跑步动画和嵌入贴图。
- `public/lab/characters/running-woman/running-plan.json`：可导入网页的动作方案。
- `public/lab/characters/running-woman/complete-source.glb`：完整基础对比。

网页内也可以导出人物 + 当前动作；Meshopt 版在游戏端要配置 MeshoptDecoder。运行时与输出文件的检查限制相同。

从仓库根运行 `node experiments/prompt2rig/tools/build-pages.mjs`，源码和根 `docs/` 网站一起提交，核对 Pages 部署及公开文件哈希。
