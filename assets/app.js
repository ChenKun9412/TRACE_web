(function () {
  "use strict";

  const form = document.getElementById("trace-form");
  const errorBox = document.getElementById("form-error");
  const results = document.getElementById("results");
  const preResult = document.getElementById("pre-result");
  const phenotypeGrid = document.getElementById("phenotype-grid");
  const volumeInput = document.getElementById("lung-volume");
  const volumeUnit = document.getElementById("lung-volume-unit");

  const PHENOTYPE_META = {
    TLTI: { name: "气管长细指数", rawDigits: 4 },
    TLHI: { name: "气管长度-身高指数", rawDigits: 4 },
    TCDI: { name: "气管口径不足指数", rawDigits: 4 },
  };
  const GROUP_META = {
    Low: { zh: "低位", riskZh: "低风险", range: "TRACE score 0–2" },
    Intermediate: { zh: "中间位", riskZh: "中风险", range: "TRACE score 3–4" },
    High: { zh: "高位", riskZh: "高风险", range: "TRACE score 5–6" },
  };

  function formatPercentile(value) {
    if (value < 0.05) return "<0.1%";
    if (value > 99.95) return ">99.9%";
    return `${value.toFixed(1)}%`;
  }

  function phenotypeCard(item) {
    const meta = PHENOTYPE_META[item.name];
    const group = GROUP_META[item.group];
    const width = Math.max(0.5, Math.min(100, item.percentile));
    return `
      <article class="phenotype-card">
        <div class="phenotype-top">
          <div>
            <h3 class="phenotype-title">${item.name}</h3>
            <span class="phenotype-name">${meta.name}</span>
          </div>
          <span class="group-badge group-${item.group}">${group.zh}</span>
        </div>
        <div class="phenotype-metrics">
          <div><span>原始表型值</span><strong>${item.raw.toFixed(meta.rawDigits)}</strong></div>
          <div><span>Winsorized Z-score</span><strong>${item.z.toFixed(3)}</strong></div>
        </div>
        <div class="percentile-row">
          <span>Discovery 相对百分位</span>
          <strong>${formatPercentile(item.percentile)}</strong>
        </div>
        <div class="percentile-track" aria-label="${item.name} 百分位 ${formatPercentile(item.percentile)}">
          <i style="width:${width}%"></i>
        </div>
        <p class="points">tail10 分值 <strong>+${item.score}</strong></p>
      </article>`;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.textContent = "";
    errorBox.hidden = true;
  }

  function readInputs() {
    const rawVolume = Number(volumeInput.value);
    return {
      tracheaLengthMm: document.getElementById("trachea-length").value,
      tracheaRadiusMm: document.getElementById("trachea-radius").value,
      lungVolumeMl: volumeUnit.value === "mm3" ? rawVolume / 1000 : rawVolume,
      heightCm: document.getElementById("height").value,
    };
  }

  function render(calculation) {
    const riskMeta = GROUP_META[calculation.riskGroup];
    document.getElementById("score-value").textContent = calculation.score;
    document.getElementById("risk-value").textContent = riskMeta.riskZh;
    document.getElementById("risk-range").textContent = riskMeta.range;
    phenotypeGrid.innerHTML = ["TLTI", "TLHI", "TCDI"]
      .map((name) => phenotypeCard(calculation.phenotypes[name]))
      .join("");
    document.getElementById("score-marker").style.left = `${((calculation.score + 0.5) / 7) * 100}%`;
    preResult.hidden = true;
    results.hidden = false;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    clearError();
    if (!form.checkValidity()) {
      showError("请填写全部四项测量值，并确认每项均大于 0。");
      form.reportValidity();
      return;
    }
    try {
      const calculation = window.TRACECalculator.calculate(
        readInputs(),
        window.TRACE_REFERENCE,
      );
      render(calculation);
    } catch (error) {
      showError(error instanceof Error ? error.message : "计算失败，请检查输入。");
      results.hidden = true;
      preResult.hidden = false;
    }
  });

  form.addEventListener("reset", function () {
    window.setTimeout(function () {
      clearError();
      results.hidden = true;
      preResult.hidden = false;
    }, 0);
  });

  volumeUnit.addEventListener("change", function () {
    volumeInput.placeholder = volumeUnit.value === "mm3" ? "例如 3854105" : "例如 3854";
  });
})();
