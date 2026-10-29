# Prompt2Rig 研究与测试记录

后续已新增 GLB 导入、减面/压缩、提示词动作方案和 API 设置，当前使用方式与验证边界以 [WORKFLOW.md](WORKFLOW.md) 为准。下文保留初次研究记录。

日期：2026-10-29。上游：[blendi-remade/prompt2rig](https://github.com/blendi-remade/prompt2rig)，提交 `fe3d3eec992772b538992374ca933020ed517938`。宿主仓库原始 main：`98e9b345c9f309e59263cbc36fb4fc596e741dcb`。本记录的技术判断来自读取该版本源码，不是对营销演示的推测。

## 它实际做什么

`server.mjs` 是零运行依赖的 Node HTTP 服务：静态页面、fal 图片/视频代理、HQ worker 代理、保存 GLB。`public/app.js` 负责生成队列、MediaPipe 推理、实时重定向、等待 HQ、动作交叉混合、GLB 导出。`public/retarget.js` 把 MediaPipe 的 33 个全身关键点或 GVHMR 的 SMPL 旋转映射到 Mixamo 骨骼，保存局部四元数和根节点世界位置；`Track` 做时间插值，`trackToClip` 烘焙成 Three AnimationClip。

完整流程：提示词 → fal 视频 → 浏览器 MediaPipe 即时预览；本地 GVHMR 并行提取全片身体运动，WiLoR / MediaPipe Hands 补手，HQ 结果完成后替换实时预览 → GLB。它不是直接从文字预测骨骼的轻量本地模型，也不是 2D 立绘的分层动画工具。

上游 README 的耗时来自作者 RTX 4090，不是本次实测。fal 模型端点来自该提交，未用真实密钥调用验证。

## 对 Lucky Break 的判断

适合先试 NPC 招呼、鼓掌/庆祝、失败反应、伸展、简单站立动作。固定镜头、单人、全身完整入画、四肢分离、低遮挡，是上游建议的素材条件。复杂转身、翻滚、交叉手臂和被球桌遮住的手脚，单视角恢复更容易出错。

俯身出杆是较难场景：人物横向伸臂、双手与细杆的接触、身体遮挡、桥手指型和脚部稳定，无法靠“看起来在出杆”的视频保证。建议把提取结果作为初稿，再加球杆独立插槽、桥手/握杆手目标约束、肘部方向、足底锁定和动作清理。本轮出杆样例只是验证流程；已从侧面检查并修正“躯干前倾导致双手一起下坠”的问题，使用上游 `Rig.aim` 将桥臂方向保持在世界坐标的出杆方向。

本实验没有把现有二维动画工具或 CharaBuilder 强行混入该流程。正式角色需要另做骨骼与比例适配。

## 本轮已完成

- 将上游可运行网页、服务、HQ 脚本和工具置于独立 `experiments/prompt2rig`；保留来源和许可。
- 制作原创低模 SkinnedMesh 样机，24 骨骼、Mixamo 命名、米制、面向 +Z。
- 制作挥手 4 秒、庆祝 5 秒、俯身出杆 6 秒，30 fps 采样；流程使用上游 Rig、Track、trackToClip。
- 播放器具备动作切换、暂停、时间轴、调速、三视角、骨架显示、GLB 和动画 JSON 导出；本地化 Three.js 依赖。
- 无 WebGL 时使用 CPU 蒙皮和 Canvas 投影预览；这项兼容只用于样机实验室，不宣称原版 MediaPipe / HQ 已有无 WebGL 兼容。
- 缺少 FAL_KEY 时明确返回失败；增加状态接口；服务默认只在本机监听。
- 提供 3 个实际 GLB 样本及可重新生成的脚本。

## 验证边界

| 项目 | 状态 | 证据 / 限制 |
| --- | --- | --- |
| 原创样机与三段动作 | 已验证 | Node 检查非零手部位移、有限数值、单位四元数、循环闭合、脚部高度；浏览器实际观察动作与切换 |
| GLB 结构 | 已验证 | 检查 glTF 2.0 二进制头、骨骼、蒙皮权重、24 个旋转通道 + 根位置通道 |
| AnimationMixer 播放 | 已验证 | 真实 Mixer 在动作中段使右手产生明显位移 |
| 浏览器导出 | 已验证页面反馈 | 页面显示导出成功；自动下载事件等待超时，未把浏览器下载副本作为验证依据，交付样本由 Node 同一导出器生成 |
| 浏览器预览 | Canvas 已验证 | 云浏览器创建 WebGL context 失败；新增兼容预览可观察人物，保存庆祝截图；WebGL 渲染路径未在本环境完成视觉验证 |
| 本地视频 → MediaPipe | 入口保留，未端到端验证 | 需联网下载运行组件、模型、角色；本轮没有合适源视频，且原版页面受本环境 WebGL 限制 |
| 文本 → fal 视频 | 未验证 | 无 FAL_KEY；未产生视频生成费用 |
| HQ 身体 / 手指提取 | 未验证 | 无 NVIDIA GPU / 本地权重 / 授权身体模型 |
| 正式游戏角色与道具 | 未实现 | 不含现有角色绑定、道具接触、游戏接入 |

## 下一步推荐顺序

1. 在本机运行，先确认三段样例和 GLB 导入结果。
2. 录制一段 4–6 秒单人全身挥手 / 庆祝视频，通过原版 MediaPipe 验证真实视频提取；先减少变量。
3. 配置 fal，在同样背景/机位下试相同动作；保留源视频与导出动画，比较手臂、腿、根运动和抖动。
4. 如要研究 HQ，在有 GPU 的电脑安装依赖和授权模型，再比较同一视频的 Live/HQ，记录实际耗时与显存。
5. 检查正式游戏用途的许可，再做 Lucky Break 角色重定向和持杆动作约束。

## 上游保留与本地改动

核心 `retarget.js` 未修改。新增 `public/lab/`、`public/vendor/`、`samples/`、`tests/` 与本说明。修改 `server.mjs`：实验室默认入口、目录首页、状态接口、密钥缺失提示、静态路径边界、本机监听和开发端口参数。修改 package 的名称与开发/测试命令。上游原文保存为 `UPSTREAM_README.md`；上游品牌仍只在保留的原版界面中使用。

参考：[README 与许可说明](https://github.com/blendi-remade/prompt2rig/blob/fe3d3eec992772b538992374ca933020ed517938/README.md)、[重定向源码](https://github.com/blendi-remade/prompt2rig/blob/fe3d3eec992772b538992374ca933020ed517938/public/retarget.js)、[HQ worker](https://github.com/blendi-remade/prompt2rig/blob/fe3d3eec992772b538992374ca933020ed517938/hq/worker.py)。
