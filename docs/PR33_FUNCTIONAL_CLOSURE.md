# PR33 功能收口记录

授权：`PR33_UNATTENDED_FUNCTIONAL_CLOSURE`，2026-09-28 16:56:45 +08:00 开始，首轮预算 8 小时。
分支 `codex/premium-photo-picker`；起始 Head `e4f20b9e9e207bf970e853a9b4bdb4281e57f4aa`，
base `69f0c6be64a961f9af96481f54f6e98f8b192af6`。
[PR #33](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/33) 保持 OPEN + DRAFT。

本次授权替代原“只做选片”范围，连续补齐基础发布、保存并发布、同地址展示切换、
联系卡、预览与基础图库元信息，并复检模板功能。允许提交、推送、更新当前 PR；
不允许合并、切换日常 3001、业务库迁移、发布日常站点或远程部署。

## 切片与证据

### 1. 基础发布和唯一公开地址

- 新迁移 `0004_basic_publications.sql` 仅扩展发布空间；保留不可变快照、单 Site 指针。
- 基础发布检查所有者；高级发布和目标为高级的回退继续检查高级授权。
- 摘要包含空间、派生模板身份与草稿版本；基础内容投影只冻结实际布局、启用套餐和有效联系项。
- 显式空布局不回退；缺少布局按现有槽位兼容规则分配，再于事务内核验全部展示资源。
- 公开页按 Published.space 复用基础或高级 Renderer，私人已保存基础预览共享基础渲染器。
- 隔离库迁移前已备份，备份及 SHA 留在本机私有运维目录。
- 隔离 PG 分阶段升级验证通过；完整 HTTP 套件 27/27，通过全部 11 基础模板、跨空间、授权和资源边界。
- 投影/schema/兼容布局 focused tests 11/11；Next 构建、定向 lint 通过。

以上是开发中切片证据，不能代替最终 Head 的完整门禁、浏览器验收和人工视觉接受。

## 当前边界

`HUMAN_VISUAL_APPROVAL = PENDING`；`DAILY_3001 = UNCHANGED`；
`DAILY_DATA_AND_PUBLISHED = UNCHANGED`；`REMOTE_DEPLOYMENT = NOT_AUTHORIZED`；`V1_LAUNCHED = NO`。
所有写入验证仅用 `frame_zero_accounts_test`、3004 和匿名合成图片。
私人照片、凭据、备份和会话不入 Git。历史 site-content-integration 未提交修改保留。

后续完成保存并发布、联系卡与预览接线，运行完整 UI 操作链及 11 模板复检；
最终更新此记录和单一检查点，不把局部通过标成全部完成。
