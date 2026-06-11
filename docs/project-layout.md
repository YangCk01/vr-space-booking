# 项目结构说明

## 根目录

- `dev.bat` - 启动本地开发环境。
- `stop-dev.bat` - 停止本地开发环境。
- `test.bat` - 构建并启动局域网测试环境。
- `stop-test.bat` - 停止局域网测试环境。
- `sync-to-test.bat` - 使用当前代码重新构建并重启局域网测试环境。
- `start-pg.bat` - 启动项目内置 PostgreSQL。
- `stop-all.bat` - 停止开发环境、测试环境和 PostgreSQL。
- `README.md` / `CHANGELOG.md` - 项目说明和版本变更记录。

## 源码目录

- `app/` - B 端管理后台前端。
- `app/reservation/` - C 端用户预约前端。
- `server/` - 后端 API 服务，包含 Prisma 模型、定时任务、路由、控制器和脚本。
- `tools/` - 本地开发工具，包括项目内置 PostgreSQL。

## 文档目录

- `docs/project-overview.md` - 项目总览、目录结构、主要模块说明。
- `docs/development-roadmap-v2.md` - 当前保留的开发路线图。
- `docs/no-show-handling-design.md` - 爽约/超时未到场处理方案。
- `docs/reconciliation-design.md` - 财务对账和风控设计方案。
- `docs/agents/` - Agent 技能配置，包括 issue tracker、triage 标签和领域文档读取规则。
- `docs/adr/` - 架构决策记录目录，后续新增 ADR 时使用。

已删除旧版路线图、一次性验收报告和过期发布核对清单，避免继续引用已取消或已迁移的页面。

## 本地产物

- `artifacts/playwright/screenshots/` - 本地页面截图。
- `artifacts/playwright/snapshots/` - 本地 Playwright/YAML 页面快照。
- `logs/legacy/` - 历史临时运行日志。
- `server/logs/legacy/` - 后端历史运行日志。

`artifacts/`、`logs/`、构建产物、本地环境变量文件和依赖目录均已加入 git 忽略。
