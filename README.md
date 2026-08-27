# TRACE Research Calculator

A static research calculator with no backend dependency. After the user enters tracheal length, mean tracheal radius, total lung volume, and height, the webpage calculates:

- Raw TLTI, TLHI, and TCDI phenotypes;
- Winsorized Z-scores based on fixed parameters from the full Wenling Discovery cohort;
- Approximate percentiles within the Discovery reference distribution;
- Tail10 phenotype groups, a 0–6 TRACE score, and low-, intermediate-, or high-risk groups.

## Definitions and Interpretation

- Fixed reference population: all participants in the Wenling Discovery cohort, n=42,796.
- The implemented TLTI formula follows the project code: `ln(trachea_length / trachea_radius_avg)`.
- The TRACE score uses tail10 groups: Low=0, Intermediate=1, and High=2. Total scores of 0–2 indicate low risk, 3–4 intermediate risk, and 5–6 high risk.
- Percentiles indicate relative position within the reference population, not the probability of developing lung cancer.
- This calculator is for research use only and cannot replace clinical diagnosis or treatment decisions.
