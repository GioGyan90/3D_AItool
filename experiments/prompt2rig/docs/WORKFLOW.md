# 自建人物优先 → 提示词动作：可复用工作流

在线入口：https://giogyan90.github.io/3D_AItool/lab/

## 先检查自建人物

网页默认进入截面灰模 A 姿态。先看正面、侧面、背面和斜侧的比例体积，再用线框、零件选择和拆解距离检查结构。此人物由代码独立生成，没有导入现成模型；29 件、2,572 个三角面、52 根骨骼。点击“动作预览”可检查挥手、庆祝等变形，然后继续下面的提示词或聊天 JSON 流程。建模方法与限制见 [PROCEDURAL_CHARACTER.md](PROCEDURAL_CHARACTER.md)。

完整导出会恢复装配、显示全部零件；单件导出保持 T 姿态原始装配坐标，无拆解位移。新人物仍是第一轮基础体，先修轮廓，效果持续不佳再用下面的现成模型方案。

## GLB 导入后备方案

1. **导入人物 GLB**：可点击、拖入，或用“试用 GLB 样本”。单个文件上限 100 MB。支持嵌入资源的普通 GLB、Meshopt 和 Draco 几何压缩；当前不支持 KTX2 必选贴图扩展，也不加载 GLB 引用的外部文件。
2. **自动优化**：默认尝试保留 70% 面数、贴图长边不超过 1024 像素。可选 85%、50%、100% 和其他贴图尺寸。减面使用 Meshoptimizer 属性感知简化，按材质分区保留 UV、法线、骨骼索引、权重与 morph 数据；参与 morph 的顶点被锁定。拓扑边界、材质与变形约束可能使实际面数高于目标。
3. **压缩**：嵌入的贴图在浏览器中重采样；不透明颜色贴图使用 JPEG，透明或数据贴图保留 PNG。几何、蒙皮、动画的二进制数据通过 EXT_meshopt_compression 无损压缩，解码前后数据逐字节一致。减面与贴图缩放本身会损失细节。界面显示实测大小，不承诺固定压缩比或必定小于已高度压缩的输入。
4. **骨骼映射**：自动识别 Mixamo 和若干常见 Blender / VRM 名称，无法唯一识别时手工选择。需要躯干、双臂、双腿和颈部等人形骨架。导入角色归一化为约 1.8 米、面向 +Z 的预览；导出含此根变换。T/A 姿态通过实际肢体方向做校正。没有骨架的模型可以优化和导出，但工具不会自动生成骨骼与蒙皮。
5. **制作动作**：描述动作、选择时长，点击“生成并绑定动作”。API 返回数据方案，经检查后在标准骨架上烘焙，再重定向到当前人物。支持 1–20 秒、2–64 个关键姿态；手指未单独生成，桥手/球杆接触和精确足底仍需后续校正。
6. **导出**：默认下载人物、骨骼和当前动作的 Meshopt 压缩 GLB；可切换通用 GLB。原有动画默认保留，也可取消。无需骨架的模型只导出优化后的模型。Meshopt 文件在游戏中要用 `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)`；通用版不依赖此压缩扩展。

没有 WebGL 的浏览器使用 Canvas CPU 蒙皮预览，贴图简化显示，导出保留贴图；复杂模型的预览性能取决于设备。用户导入文件、密钥和新动作不在刷新后自动恢复，请导出需要保留的结果。

## API 设置

未选择提供商时默认 **OpenAI**，默认 Base URL `https://api.openai.com/v1`，模型 `gpt-4.1-mini`，Responses 协议与 JSON Schema Structured Outputs。模型 ID 可自行修改。自定义 OpenAI 兼容服务可选择 Chat Completions，或按服务能力选择 Responses。

API Key 只保留当前页面内存，刷新清空；非密钥设置保存在浏览器。更换提供商或地址会清空密钥输入，避免沿用到其他地址。请求只发送动作描述、时长和固定动作格式，不发送 GLB、贴图或网格数据。自定义服务必须允许该网页来源的 CORS；连接、权限、限流、无效 JSON、截断输出或方案校验失败都会明确显示，不会伪装成成功。

**网页不能借用此聊天窗口的 OpenAI 凭据。** 在网页调用 API 时需使用自己的 Key；在聊天里制作动作可使用下面的 JSON 流程，不需要在网页另行调用模型。

## 在此聊天或后续助手中使用

统一协议是 `motion-plan v1`，由 `public/lab/motion-plan.js` 导出，完整 JSON Schema 和示例同时随网页发布：

- [JSON Schema](../public/lab/examples/motion-plan.schema.json)
- [示例动作方案](../public/lab/examples/chat-motion-example.json)

复用步骤：

1. 在工具写好动作描述，点击 **导出聊天制作任务**，得到 `luckybreak-motion-request.json`。任务文件含默认提供商 `openai`、提示词、动作坐标约定、输出 Schema，不含密钥或人物文件。
2. 将任务文件交给此聊天。也可在“导入 / 粘贴动作方案”窗口点击 **复制聊天制作指令**，直接粘贴给助手。
3. 助手按 `instructions` 与 `schema` 制作 JSON，不生成可执行 JS；首帧为 0，末帧等于 duration；若 loop=true，首尾姿态须一致。
4. 网页导入 / 粘贴方案，点击 **检查并绑定动作**。界面会新增一段动作，并在当前人物上播放。随后导出 GLB 或方案 JSON。
5. 通过浏览器自动化操作时，先检查默认自建人物（需要时才导入 GLB），再通过 JSON 文件输入或粘贴窗口传入方案，观察骨架就绪、动作库条目和实际姿态，最后点击导出。不要将 API Key 写进任务文件、仓库或动作方案。

`frames[].rotations` 是标准 Mixamo T-pose 参考空间的局部 XYZ 欧拉角（度），`root` 是相对标准人物静止髋部的位置偏移（米）。角色左侧 +X、向上 +Y、向前 +Z。未指定关节使用自然垂臂默认姿态，不继承上一帧。方案在标准骨架上插值后测量肢体方向，重定向到目标骨架；实际输出动画绑定的是导入角色自己的骨骼名称。

这是提示词到程序关键帧的链路。上游 fal → 视频 → MediaPipe / GVHMR 链路继续保留在本地原版入口，与本功能分别使用；API 设置中的 OpenAI Key 不替代 fal Key。

## 本次验证

- 16 项 Node 检查通过：新增自建人物拓扑、镜像、权重、动作接缝、拆解导出与单件坐标检查；原有检查包括无损压缩/解码、减面属性保留、GLB 导入导出、原有与新动画、Mixer 播放、A/T 姿态修正、动作校验、默认 OpenAI 请求和模拟错误。
- 浏览器实际导入带骨架 GLB，减面后骨架仍匹配；将示例 JSON 绑定后可观察挥手；无密钥时正确打开 API 设置。
- 用临时贴图测试 GLB 检查了不透明/透明材质处理，约 6.88 MB 输入处理为约 1.92 MB。此为测试数据，不是其他人物的压缩承诺。
- 没有使用真实 API Key 调用付费模型；API 请求与解析用模拟响应验证，实际模型服务、账号额度和 CORS 需用自己的配置验证。

参考：[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)、[Meshoptimizer](https://github.com/zeux/meshoptimizer)、[EXT_meshopt_compression](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_meshopt_compression)。
