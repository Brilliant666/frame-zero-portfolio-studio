# Impeccable 来源与执行说明

本项目已有产品和设计基线，本轮采用官方技能的有界人工辅助评审，不运行初始化采访或创建新的产品真相。

| 项目 | 本轮实际值 |
| --- | --- |
| 官方来源 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| 技能发行版 | [skill-v4.5.0](https://github.com/pbakaus/impeccable/releases/tag/skill-v4.5.0) |
| 对应源码 | `508d7e8955de3b3caf2d8676e85206723d41a887` |
| 官方 universal.zip SHA256 | `a6877c158ec90c63560728553d2e737081afa8a79b86c507fa8d15a81fffd475` |
| 固定引擎发行版／握手 | `engine-v0.1.11`／`impeccable-engine 0.1.11` |
| 二进制实际 --version | `4.0.0`；与技能版本分别记录，不混称 |
| Windows x64 引擎 SHA256 | `605b5b442d2a65d270ef989de13371444849526249f511d397ca7424c184db49` |
| 许可 | [Apache-2.0](https://github.com/pbakaus/impeccable/blob/508d7e8955de3b3caf2d8676e85206723d41a887/LICENSE)；官方技能原件及许可保留在本机工具目录，未复制第三方源码进本 PR |

## 接入与权限

项目开始前未发现可用的项目级 Impeccable 安装。使用固定官方发行包手动加载 Codex `SKILL.md`、`reference/critique.md`、`reference/audit.md` 和必要 Operate 参考。官方 Windows launcher 将固定版本引擎下载到本轮私有缓存，并按发行 sidecar 校验；不使用未固定版本的 npx 安装器。

没有安装项目或全局 hooks，没有编辑网站 package.json／lockfile、生产依赖、构建或 CI。原始技能、二进制、扫描缓存、原始截图和网络记录不提交。之后重用本说明也不意味着自动更新工具或启用持续检测。

`context --target app/site-editor/flow-gallery-admin.tsx` 已执行一次。它报告缺少 PRODUCT.md／DESIGN.md，但确认已有实现，允许按现有代码与约束作评审；产品依据映射在[评审 brief](IMPECCABLE_REVIEW_BRIEF.md)。没有用缺文件推导空白项目，也没有执行 init、shape 或页面生成。

`critique-storage slug` 实际返回 `app-site-editor-flow-gallery-admin-tsx`。最终报告按用户指定存入 docs/design；不把 Impeccable 默认快照目录当作公开报告或自动实施清单。原始详细报告保留本机。

`critique`／`audit` 是技能工作流，不作为终端命令运行。A 作独立设计判断，B 按官方 `detect --json` 执行确定性源码检测，并人工复核提示。检测器退出码 2 代表有提示，不是网站构建失败；实际数字、误报与覆盖限制见[报告](IMPECCABLE_REVIEW.md)。

浏览器原图优先。只读 evaluate 不允许可变脚本注入；没有执行叠层或 live-server，也不绕过限制。源码检测确实执行，但不宣称已完成浏览器叠层检测。没有执行 polish 或任何修复链。

## 使用约束优先级

用户本轮的停止点和隐私要求优先于技能中的快照持久化、后续 polish 推荐及通用初始化流程。方案仅供确认，报告提交后停止。模式按页面区分，检测器偏好不构成取消拍立得相框、Flow 半透明导航、有意义序号或后台定位高亮的理由。
