# Tencent Q4 真实数据版说明

这个文件夹是从 `Claude demo` 复制出来的真实数据接入版，原始 demo 原型仍保留不动。

## 当前状态

- 当前网页只接入腾讯真实数据，不再使用原 demo 里的多公司假数据。
- `data.js` 由脚本自动生成，不建议手工编辑。
- 数据来源是 `Obsidian Vault/01 Areas/Work/GameIntel/Tencent_0700HK/` 下的季度 md 和 `2025Q4_Briefing_阶段一.md`。
- 金额单位为 `Million CNY`，比例字段仍为小数形式，`0.21` 表示 `21%`。

## 更新数据的方法

在 vault 根目录运行：

```powershell
python "Obsidian Vault\01 Areas\Work\短期项目\260418 财报网页设计\260420 Tencent Q4真实数据版\scripts\build_data_from_md.py"
```

脚本会重新读取腾讯 md 文件，并覆盖生成本文件夹下的 `data.js`。

## 第一版抽取范围

- 公司基础信息：腾讯、ticker、tier、货币、市场、产品关键词。
- 季度财务字段：游戏收入、公司收入、YoY、QoQ、毛利率、营业利润率、计算利润率、三费率。
- 游戏收入拆分：Domestic、Overseas。
- 公司收入拆分：VAS、Marketing Services、FinTech and Business Services、Others。
- Briefing 字段：核心判断、关键词、游戏业务解读、公司整体解读、盈利能力解读、费用结构解读。

## 重要口径

- `Social Networks` 是腾讯 VAS 子项，不会被放进公司收入堆叠图，避免与 VAS 重复计算。
- 未披露或无法从 md 中稳定抽取的字段不会由脚本补造。
- 季度总结页目前是“单公司真实数据汇总”，不是完整行业横向总结；等更多公司接入后再恢复真正的横向比较。
