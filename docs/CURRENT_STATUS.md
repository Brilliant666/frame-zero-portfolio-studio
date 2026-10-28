# 当前检查点

更新：2026-10-28。本页只记录当前事实和执行边界；历史验收不构成新授权。

## 代码与交付

| 项目 | 当前事实 |
| --- | --- |
| 已合并基线 | main `d3b172c5658c738fba8d4d19c4b870a12d7f9656`；PR48、PR47依次Squash，各自实际main push五项检查成功 |
| 生产差距审计 | [PR47](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/47)已合并；原产品审计基线`58a92d2`与技术结论保留，不代表计划已实施 |
| 工程流程整理 | [PR48](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/48)已合并；短入口、历史追溯和严格CI分流生效 |
| 当前实施 | `codex/production-dependency-security-baseline`，生产依赖安全基线；[范围与证据](PRODUCTION_DEPENDENCY_SECURITY_BASELINE.md)，最终Head检查见对应Draft PR |

当前产品已有账号／Site授权、三类独立内容空间、Site素材、私人草稿、受保护预览、发布与回退。
十一套基础模板和两类高级空间的证据范围见README及对应验收记录；不等于真实设备、全部内容组合或生产全链已验收。

## 本轮允许与禁止

- 用户已授权生产依赖安全基线：最小兼容补丁、相关构建／测试适配、普通提交／推送及新Draft PR；不修改产品业务或Accepted ADR。
- 保留真实权限、资源归属、CAS／409、Published-only及原失败断言；历史状态词只约束对应历史记录。
- 不自动Ready、合并、部署、迁移、开户、保存发布或删除文件／回退；审计PR的计划不能替代实施授权。
- 日常3001与PostgreSQL保持Windows独立管理，不启停或升级；精确目录、BUILD、任务控制及配置位置只在仓库外本机交接。
- 同仓库的旧工作区可能仍停在历史分支。先核对Git、未提交／ignored内容和进程，再决定用途；不凭“项目主目录”名称直接覆盖或运行。

## 操作入口

稳定规则见[AGENTS](../AGENTS.md)，运行场景与验证矩阵见[开发与交付工作流](DEVELOPMENT_WORKFLOW.md)。
本轮续接只读[SESSION_HANDOFF](SESSION_HANDOFF.md)，再按任务查相关模块，不通读历史全集。
正常启动不初始化数据库、不重新迁移／开户／导图；不同端口不构成数据或会话隔离。

## 保留风险

`PREVIEW_RETURN = UNRESOLVED`；`RISK_DISPOSITION = ACCEPTED_FOR_LOCAL_STAGE`。
手机拍立得内嵌预览返回位置可能不准确；[首次失败与诊断](design/PR35_OCT15_CLOSEOUT.md)、原±2px／焦点／后台滚动断言和超时继续保留。
无新增证据不重复复现或猜测式修复。本机接受不等于生产接受。

## 下一步与历史

本轮交付安全依赖候选，保持Draft；不自动Ready、合并、部署或接通生产业务。
用户另行指定目标后再实施；路线图的旧Mission和旧Ready文字不是当前恢复命令。

- [截至2026-10-27的完整检查点历史](CURRENT_STATUS_HISTORY_2026-10-27.md)
- [截至2026-10-27的完整会话历史](SESSION_HANDOFF_HISTORY_2026-10-27.md)
- [PR46合并及main检查记录](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/46#issuecomment-6446680957)
