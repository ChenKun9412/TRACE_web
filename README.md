# TRACE Research Calculator

一个无后端依赖的静态研究计算器。用户输入气管长度、气管平均半径、双肺总体积和身高后，页面计算：

- TLTI、TLHI、TCDI 原始表型；
- 基于温岭 Discovery 全人群固定参数的 Winsorized Z-score；
- Discovery 参考分布中的近似百分位；
- tail10 表型分组、0–6 分 TRACE score 和低/中/高风险组。

## 本地预览

在本目录执行：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。

## 参考数据生成与验证

网页发布的是固定参数和每 0.1 百分点一个值的聚合分位网格，不包含 SID、结局或患者级输入记录。源数据更新后，在本目录执行（默认从相邻的 `TRACE_TLDH` 目录读取源数据）：

```bash
/home/chenkun/miniconda3/envs/hlbp/bin/python scripts/build_reference_data.py
```

脚本会重建 `assets/reference-data.js`，并将全量回算结果保存到 `validation/reference-build-report.json`。只有三个表型公式、Z-score、tail10 分组和 TRACE score 全部通过一致性检查时才会生成网页参考数据。

## GitHub Pages

`.github/workflows/deploy-pages.yml` 会在 `main` 分支发生推送时部署本站。首次使用时，需要在 GitHub 仓库的 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**。

## 口径说明

- 固定参考人群：Wenling Discovery all participants，n=42,796。
- TLTI 实际公式沿用项目运行代码，为 `ln(trachea_length / trachea_radius_avg)`。
- TRACE score 使用 tail10：Low=0、Intermediate=1、High=2；0–2 为低风险、3–4 为中风险、5–6 为高风险。
- 百分位是参考人群中的相对位置，不是肺癌发生概率。
- 仅供研究使用，不能替代临床诊断或治疗决策。
