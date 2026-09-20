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
  const FEATURE_FIELDS = {
    trachea_length: "Tracheal length",
    trachea_radius_avg: "Mean tracheal radius",
    total_lung_volume_mm3: "Total lung volume",
  };

  function positiveNumber(value, field) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      throw new Error(`${FIELD_LABELS[field]} must be a valid number greater than 0.`);
    }
    return number;
  }

  function parseDelimitedRows(text, delimiter) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character === '"' && text[index + 1] === '"') {
          value += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          value += character;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === delimiter) {
        row.push(value.trim());
        value = "";
      } else if (character === "\n") {
        row.push(value.trim());
        if (row.some((cell) => cell !== "")) rows.push(row);
        row = [];
        value = "";
      } else if (character !== "\r") {
        value += character;
      }
    }
    if (quoted) throw new Error("The feature file contains an unclosed quoted value.");
    row.push(value.trim());
    if (row.some((cell) => cell !== "")) rows.push(row);
    return rows;
  }

  function featureRecordFromText(text, fileName) {
    const cleaned = String(text).replace(/^\uFEFF/, "").trim();
    if (!cleaned) throw new Error("The selected feature file is empty.");

    const looksLikeJson = /\.json$/i.test(fileName || "") || /^[{\[]/.test(cleaned);
    if (looksLikeJson) {
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (error) {
        throw new Error("The feature file is not valid JSON.");
      }
      const records = Array.isArray(parsed) ? parsed : [parsed];
      if (records.length !== 1 || !records[0] || typeof records[0] !== "object" || Array.isArray(records[0])) {
        throw new Error("The feature file must contain exactly one subject record.");
      }
      return records[0];
    }

    const delimiter = cleaned.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
    const rows = parseDelimitedRows(cleaned, delimiter);
    if (rows.length < 2) {
      throw new Error("The feature file must contain a header and one subject record.");
    }
    if (rows.length !== 2) {
      throw new Error("The feature file must contain exactly one subject record.");
    }
    const headers = rows[0].map((header) => header.trim().toLowerCase());
    if (new Set(headers).size !== headers.length) {
      throw new Error("The feature file contains duplicate column names.");
    }
    return Object.fromEntries(headers.map((header, index) => [header, rows[1][index]]));
  }

  function parseFeatureFile(text, fileName = "") {
    const record = featureRecordFromText(text, fileName);
    const normalized = Object.fromEntries(
      Object.entries(record).map(([key, value]) => [String(key).trim().toLowerCase(), value]),
    );
    const missing = Object.keys(FEATURE_FIELDS).filter(
      (field) => normalized[field] === undefined || String(normalized[field]).trim() === "",
    );
    if (missing.length) {
      throw new Error(`Missing required feature field${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
    }

    const length = positiveNumber(normalized.trachea_length, "tracheaLengthMm");
    const radius = positiveNumber(normalized.trachea_radius_avg, "tracheaRadiusMm");
    const volumeMm3 = Number(normalized.total_lung_volume_mm3);
    if (!Number.isFinite(volumeMm3) || volumeMm3 <= 0) {
      throw new Error(`${FEATURE_FIELDS.total_lung_volume_mm3} must be a valid number greater than 0.`);
    }
    return {
      tracheaLengthMm: length,
      tracheaRadiusMm: radius,
      lungVolumeMl: volumeMm3 / 1000,
    };
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

  return { calculate, estimatePercentile, parseFeatureFile };
});
