(function (root, factory) {
  const calculator = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = calculator;
  }
  root.TRACECalculator = calculator;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FIELD_LABELS = {
    tracheaLengthMm: "Tracheal length",
    tracheaRadiusMm: "Mean tracheal radius",
    lungVolumeMl: "Total lung volume",
    heightCm: "Height",
  };

  function positiveNumber(value, field) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      throw new Error(`${FIELD_LABELS[field]} must be a valid number greater than 0.`);
    }
    return number;
  }

  function estimatePercentile(value, quantiles, step) {
    if (!Array.isArray(quantiles) || quantiles.length < 2) {
      throw new Error("The percentile reference data are unavailable.");
    }
    if (value <= quantiles[0]) return 0;
    const lastIndex = quantiles.length - 1;
    if (value >= quantiles[lastIndex]) return 100;

    let left = 0;
    let right = lastIndex;
    while (left + 1 < right) {
      const middle = Math.floor((left + right) / 2);
      if (quantiles[middle] < value) {
        left = middle;
      } else {
        right = middle;
      }
    }
    const lowValue = quantiles[left];
    const highValue = quantiles[right];
    const fraction = highValue === lowValue ? 0.5 : (value - lowValue) / (highValue - lowValue);
    const percentile = (left + fraction) * step * 100;
    return Math.max(0, Math.min(100, percentile));
  }

  function phenotypeResult(name, raw, reference) {
    const parameters = reference.phenotypes[name];
    if (!parameters) throw new Error(`Reference parameters for ${name} are missing.`);
    const winsorizedRaw = Math.max(
      parameters.winsorLowerRaw,
      Math.min(parameters.winsorUpperRaw, raw),
    );
    const z = (winsorizedRaw - parameters.winsorMean) / parameters.winsorSd;
    let group;
    if (z <= parameters.tail10LowerZ) {
      group = "Low";
    } else if (z < parameters.tail10UpperZ) {
      group = "Intermediate";
    } else {
      group = "High";
    }
    return {
      name,
      raw,
      winsorizedRaw,
      z,
      percentile: estimatePercentile(
        raw,
        parameters.quantiles,
        reference.quantileStep,
      ),
      group,
      score: reference.score.phenotypeGroups[group],
    };
  }

  function riskGroup(score, reference) {
    for (const [group, bounds] of Object.entries(reference.score.riskGroups)) {
      if (score >= bounds.min && score <= bounds.max) return group;
    }
    throw new Error("The TRACE score is outside the expected 0–6 range.");
  }

  function calculate(inputs, reference) {
    if (!reference || !reference.phenotypes || !reference.score) {
      throw new Error("The TRACE Discovery reference parameters have not loaded.");
    }
    const length = positiveNumber(inputs.tracheaLengthMm, "tracheaLengthMm");
    const radius = positiveNumber(inputs.tracheaRadiusMm, "tracheaRadiusMm");
    const volumeMl = positiveNumber(inputs.lungVolumeMl, "lungVolumeMl");
    const heightCm = positiveNumber(inputs.heightCm, "heightCm");
    const raw = {
      TLTI: Math.log(length / radius),
      TLHI: Math.log(length / (heightCm * 10)),
      TCDI: Math.log(volumeMl / radius),
    };
    const phenotypes = {
      TLTI: phenotypeResult("TLTI", raw.TLTI, reference),
      TLHI: phenotypeResult("TLHI", raw.TLHI, reference),
      TCDI: phenotypeResult("TCDI", raw.TCDI, reference),
    };
    const score = Object.values(phenotypes).reduce((sum, item) => sum + item.score, 0);
    return {
      inputs: {
        tracheaLengthMm: length,
        tracheaRadiusMm: radius,
        lungVolumeMl: volumeMl,
        heightCm,
      },
      phenotypes,
      score,
      riskGroup: riskGroup(score, reference),
    };
  }

  return { calculate, estimatePercentile };
});
