#!/usr/bin/env python3
"""Build the public TRACE web reference without exporting participant rows.

The generated JavaScript contains fixed Discovery-cohort parameters and a
0.1-percentile quantile grid for each phenotype. It deliberately excludes
participant identifiers, outcomes, and row-level geometry measurements.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd


WEB_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = WEB_DIR.parent
INPUT_CSV = PROJECT_DIR / "datasets/input_data/wenling_all_with_subgroup_tail.csv"
SUMMARY_FILE = (
    PROJECT_DIR
    / "datasets/input_data/wenling_standardization_tail_threshold_summary_Discovery.xlsx"
)
OUTPUT_JS = WEB_DIR / "assets/reference-data.js"
VALIDATION_REPORT = WEB_DIR / "validation/reference-build-report.json"

PHENOTYPES = ("TLTI", "TLHI", "TCDI")
SCORE_MAP = {"Low": 0, "Intermediate": 1, "High": 2}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def calculate_raw(df: pd.DataFrame) -> dict[str, pd.Series]:
    length = pd.to_numeric(df["trachea_length"], errors="raise")
    radius = pd.to_numeric(df["trachea_radius_avg"], errors="raise")
    lung_volume_ml = pd.to_numeric(
        df["total_lung_volume_mm3"], errors="raise"
    ) / 1000.0
    height_mm = pd.to_numeric(df["身高"], errors="raise") * 10.0
    if (
        length.le(0).any()
        or radius.le(0).any()
        or lung_volume_ml.le(0).any()
        or height_mm.le(0).any()
    ):
        raise ValueError("Discovery reference inputs must all be positive.")
    return {
        "TLTI": np.log(length / radius),
        "TLHI": np.log(length / height_mm),
        "TCDI": np.log(lung_volume_ml / radius),
    }


def assign_group(z: pd.Series, lower: float, upper: float) -> pd.Series:
    return pd.Series(
        np.where(z.le(lower), "Low", np.where(z.lt(upper), "Intermediate", "High")),
        index=z.index,
        dtype="string",
    )


def build() -> tuple[dict[str, object], dict[str, object]]:
    df = pd.read_csv(INPUT_CSV, low_memory=False)
    # Despite its .xlsx suffix, this project artifact is CSV text.
    summary = pd.read_csv(SUMMARY_FILE)
    raw_values = calculate_raw(df)
    probabilities = np.linspace(0.0, 1.0, 1001)

    reference: dict[str, object] = {
        "version": 1,
        "cohort": "Wenling Discovery all participants",
        "n": int(len(df)),
        "tailScheme": "tail10",
        "percentileMethod": (
            "Linear interpolation over a 0.1-percentile quantile grid derived "
            "from the Discovery raw phenotype distribution"
        ),
        "quantileStep": 0.001,
        "sourceHashes": {
            INPUT_CSV.name: sha256(INPUT_CSV),
            SUMMARY_FILE.name: sha256(SUMMARY_FILE),
        },
        "phenotypes": {},
        "score": {
            "phenotypeGroups": {"Low": 0, "Intermediate": 1, "High": 2},
            "riskGroups": {
                "Low": {"min": 0, "max": 2},
                "Intermediate": {"min": 3, "max": 4},
                "High": {"min": 5, "max": 6},
            },
        },
    }
    report: dict[str, object] = {
        "referenceCohortN": int(len(df)),
        "sourceHashes": reference["sourceHashes"],
        "phenotypes": {},
    }

    calculated_groups: dict[str, pd.Series] = {}
    for phenotype in PHENOTYPES:
        selected = summary.loc[
            summary["cohort"].eq("all")
            & summary["phenotype"].eq(phenotype)
            & summary["scheme"].eq("tail10")
        ]
        if len(selected) != 1:
            raise ValueError(
                f"Expected one all/tail10 summary row for {phenotype}, got {len(selected)}."
            )
        row = selected.iloc[0]
        raw = raw_values[phenotype]
        saved_raw = pd.to_numeric(df[f"{phenotype}_raw"], errors="raise")
        raw_error = float((raw - saved_raw).abs().max())

        winsor_lower = float(raw.quantile(float(row["winsor_lower_q"])))
        winsor_upper = float(raw.quantile(float(row["winsor_upper_q"])))
        winsor_mean = float(row["winsor_mean"])
        winsor_sd = float(row["winsor_sd"])
        z = (raw.clip(winsor_lower, winsor_upper) - winsor_mean) / winsor_sd
        saved_z = pd.to_numeric(df[f"{phenotype}_z"], errors="raise")
        z_error = float((z - saved_z).abs().max())

        lower_z = float(row["lower_value"])
        upper_z = float(row["upper_value"])
        groups = assign_group(z, lower_z, upper_z)
        calculated_groups[phenotype] = groups
        saved_groups = df[f"{phenotype}_tail10"].astype("string")
        group_mismatches = int(groups.ne(saved_groups).sum())

        quantiles = raw.quantile(probabilities, interpolation="linear").to_numpy()
        reference["phenotypes"][phenotype] = {
            "winsorLowerRaw": winsor_lower,
            "winsorUpperRaw": winsor_upper,
            "winsorMean": winsor_mean,
            "winsorSd": winsor_sd,
            "tail10LowerZ": lower_z,
            "tail10UpperZ": upper_z,
            "tail10LowerRaw": winsor_mean + winsor_sd * lower_z,
            "tail10UpperRaw": winsor_mean + winsor_sd * upper_z,
            "quantiles": [float(value) for value in quantiles],
        }
        report["phenotypes"][phenotype] = {
            "rawFormulaMaxAbsoluteError": raw_error,
            "zScoreMaxAbsoluteError": z_error,
            "tail10GroupMismatches": group_mismatches,
            "quantileGridPoints": int(len(quantiles)),
        }

    calculated_score = sum(
        calculated_groups[phenotype].map(SCORE_MAP).astype(int)
        for phenotype in PHENOTYPES
    )
    saved_score = pd.to_numeric(df["tail10_sum"], errors="raise").astype(int)
    score_mismatches = int(calculated_score.ne(saved_score).sum())
    report["tail10ScoreMismatches"] = score_mismatches
    report["validationPassed"] = bool(
        score_mismatches == 0
        and all(
            values["rawFormulaMaxAbsoluteError"] < 1e-12
            and values["zScoreMaxAbsoluteError"] < 1e-12
            and values["tail10GroupMismatches"] == 0
            for values in report["phenotypes"].values()
        )
    )
    if not report["validationPassed"]:
        raise ValueError(f"Reference validation failed: {report}")
    return reference, report


def main() -> None:
    reference, report = build()
    OUTPUT_JS.parent.mkdir(parents=True, exist_ok=True)
    VALIDATION_REPORT.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(reference, ensure_ascii=False, separators=(",", ":"))
    javascript = (
        "/* Generated by scripts/build_reference_data.py; do not edit manually. */\n"
        "(function(root,factory){const data=factory();"
        "if(typeof module==='object'&&module.exports){module.exports=data;}"
        "root.TRACE_REFERENCE=data;})(typeof globalThis!=='undefined'?globalThis:this,"
        f"function(){{return {payload};}});\n"
    )
    OUTPUT_JS.write_text(javascript, encoding="utf-8")
    VALIDATION_REPORT.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Wrote {OUTPUT_JS}")
    print(f"Wrote {VALIDATION_REPORT}")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
