# TRACE Research Calculator

A static research calculator with no backend dependency. Height is always entered manually. Tracheal length, mean tracheal radius, and total lung volume can either be entered manually or loaded from a local feature file. The webpage calculates:

- Raw TLTI, TLHI, and TCDI phenotypes;
- Winsorized Z-scores based on fixed parameters from the full Wenling Discovery cohort;
- Approximate percentiles within the Discovery reference distribution;
- Tail10 phenotype groups, a 0–6 TRACE score, and low-, intermediate-, or high-risk groups.

## Input Methods

- Manual entry accepts tracheal length in mm, mean tracheal radius in mm, and total lung volume in mL or mm³.
- Feature-file entry accepts a CSV, TSV, or JSON file containing exactly one subject record. Required fields are `trachea_length` in mm, `trachea_radius_avg` in mm, and `total_lung_volume_mm3` in mm³.
- Height in cm is required for both input methods and is not read from the feature file.
- All inputs and files are processed locally in the browser; they are not uploaded or stored.

## Definitions and Interpretation

- Fixed reference population: all participants in the Wenling Discovery cohort, n=42,796.
- The TRACE score uses tail10 groups: Low=0, Intermediate=1, and High=2. Total scores of 0–2 indicate low risk, 3–4 intermediate risk, and 5–6 high risk.
- Percentiles indicate relative position within the reference population, not the probability of developing lung cancer.
- This calculator is for research use only and cannot replace clinical diagnosis or treatment decisions.
