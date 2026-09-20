"use strict";

const assert = require("node:assert/strict");
const reference = require("../assets/reference-data.js");
const calculator = require("../assets/calculator.js");

function almostEqual(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

const medianLike = {
  tracheaLengthMm: 76.393482,
  tracheaRadiusMm: 6.366434,
  lungVolumeMl: 3773.749,
  heightCm: 163,
};
const result = calculator.calculate(medianLike, reference);
almostEqual(result.phenotypes.TLTI.raw, Math.log(76.393482 / 6.366434));
almostEqual(result.phenotypes.TLHI.raw, Math.log(76.393482 / 1630));
almostEqual(result.phenotypes.TCDI.raw, Math.log(3773.749 / 6.366434));
assert.equal(result.score, 3);
assert.equal(result.riskGroup, "Intermediate");

const low = calculator.calculate(
  { tracheaLengthMm: 50, tracheaRadiusMm: 10, lungVolumeMl: 1200, heightCm: 190 },
  reference,
);
assert.deepEqual(
  Object.values(low.phenotypes).map((item) => item.group),
  ["Low", "Low", "Low"],
);
assert.equal(low.score, 0);
assert.equal(low.riskGroup, "Low");

const high = calculator.calculate(
  { tracheaLengthMm: 130, tracheaRadiusMm: 3.5, lungVolumeMl: 9900, heightCm: 133 },
  reference,
);
assert.deepEqual(
  Object.values(high.phenotypes).map((item) => item.group),
  ["High", "High", "High"],
);
assert.equal(high.score, 6);
assert.equal(high.riskGroup, "High");

assert.throws(
  () => calculator.calculate({ ...medianLike, heightCm: 0 }, reference),
  /Height must be a valid number greater than 0/,
);

const csvFeature = calculator.parseFeatureFile(
  "subject_id,trachea_length,trachea_radius_avg,total_lung_volume_mm3\nA001,76.393482,6.366434,3773749",
  "features.csv",
);
assert.deepEqual(csvFeature, {
  tracheaLengthMm: 76.393482,
  tracheaRadiusMm: 6.366434,
  lungVolumeMl: 3773.749,
});
const fileResult = calculator.calculate({ ...csvFeature, heightCm: 163 }, reference);
assert.equal(fileResult.score, result.score);
assert.equal(fileResult.riskGroup, result.riskGroup);

const jsonFeature = calculator.parseFeatureFile(JSON.stringify({
  trachea_length: 76.393482,
  trachea_radius_avg: 6.366434,
  total_lung_volume_mm3: 3773749,
}), "features.json");
assert.deepEqual(jsonFeature, csvFeature);

assert.throws(
  () => calculator.parseFeatureFile(
    "trachea_length,trachea_radius_avg,total_lung_volume_mm3\n76,6,3700000\n77,7,3800000",
    "features.csv",
  ),
  /exactly one subject record/,
);
assert.throws(
  () => calculator.parseFeatureFile("trachea_length,trachea_radius_avg\n76,6", "features.csv"),
  /total_lung_volume_mm3/,
);
assert.equal(calculator.estimatePercentile(-Infinity, [1, 2, 3], 0.5), 0);
assert.equal(calculator.estimatePercentile(Infinity, [1, 2, 3], 0.5), 100);

console.log("calculator.test.js: all assertions passed");
