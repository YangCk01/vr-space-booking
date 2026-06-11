# Domain Docs

本项目使用单上下文领域文档布局。工程技能在分析、拆 issue、写 PRD、诊断问题或重构前，应优先读取根目录的 `CONTEXT.md`。

## 读取顺序

1. `CONTEXT.md`
2. 与当前任务相关的 `docs/*.md`
3. `docs/adr/` 下相关 ADR

如果某个文件不存在，继续工作即可，不需要因为缺失而中断。

## 文档布局

```text
/
├── CONTEXT.md
├── docs/
│   ├── agents/
│   │   ├── issue-tracker.md
│   │   ├── triage-labels.md
│   │   └── domain.md
│   └── adr/
└── app/
└── server/
```

## 领域语言约定

输出 issue、PRD、测试用例、代码注释或重构建议时，优先使用 `CONTEXT.md` 中定义的业务词汇。不要随意替换同义词，尤其是订单状态、会员权益、退款、对账、作废、爽约、核销等核心概念。

## ADR 冲突处理

如果建议或实现与 `docs/adr/` 中已有决策冲突，应明确指出冲突点，并说明为什么需要重新讨论。
