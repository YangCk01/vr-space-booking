# Issue tracker: GitHub

本项目的需求、缺陷、PRD 和待办事项统一跟踪在 GitHub Issues：

- 仓库：`YangCk01/vr-space-booking`
- 远程地址：`https://github.com/YangCk01/vr-space-booking.git`
- 推荐工具：`gh` CLI

## 操作约定

- 创建 issue：`gh issue create --title "..." --body "..."`
- 查看 issue：`gh issue view <number> --comments`
- 列出 issue：`gh issue list --state open --json number,title,body,labels,comments`
- 评论 issue：`gh issue comment <number> --body "..."`
- 添加标签：`gh issue edit <number> --add-label "..."`
- 移除标签：`gh issue edit <number> --remove-label "..."`
- 关闭 issue：`gh issue close <number> --comment "..."`

在仓库目录内执行 `gh` 命令时，默认从 `git remote` 推断仓库。

## 当技能要求发布到 issue tracker

创建 GitHub Issue，并使用中文标题和中文正文。正文应包含背景、现象、期望结果、验收标准和相关文件路径。

## 当技能要求读取相关 ticket

使用 `gh issue view <number> --comments` 读取 issue 正文、评论和标签。
