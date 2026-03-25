// Chart.js configuration and chart rendering

// Set dark theme defaults
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#30363d';
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif";
Chart.defaults.font.size = 12;

// MSE over time line chart
function renderMSEChart(scoresHistory) {
  const canvas = document.getElementById('mse-canvas');
  if (!canvas || !scoresHistory) return;

  const grouped = groupByAgent(scoresHistory);
  const datasets = [];

  for (const [agent, rows] of Object.entries(grouped)) {
    if (!AGENTS[agent]) continue;
    const rolling = rollingMSE(rows, 5);
    datasets.push({
      label: agentLabel(agent),
      data: rolling.map(r => ({
        x: new Date(r.timestamp * 1000),
        y: r.mse,
      })),
      borderColor: agentColor(agent),
      backgroundColor: AGENTS[agent].fill,
      borderWidth: agent === 'naive_baseline' ? 1 : 2,
      borderDash: agent === 'naive_baseline' ? [5, 5] : [],
      pointRadius: 2,
      pointHoverRadius: 5,
      tension: 0.3,
      fill: false,
    });
  }

  new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'day', tooltipFormat: 'MMM d, HH:mm' },
          grid: { color: '#21262d' },
        },
        y: {
          title: { display: true, text: 'MSE (rolling avg)', color: '#8b949e' },
          grid: { color: '#21262d' },
          beginAtZero: true,
        },
      },
      plugins: {
        legend: {
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 16 },
        },
        tooltip: {
          backgroundColor: '#1c2129',
          borderColor: '#30363d',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmtMSE(ctx.parsed.y)}`,
          },
        },
      },
    },
  });
}

// Prediction scatter chart (predicted vs actual)
function renderScatterChart(scoresHistory) {
  const canvas = document.getElementById('scatter-canvas');
  if (!canvas || !scoresHistory) return;

  const datasets = [];
  const grouped = groupByAgent(scoresHistory);

  for (const [agent, rows] of Object.entries(grouped)) {
    if (!AGENTS[agent] || agent === 'naive_baseline') continue;
    datasets.push({
      label: agentLabel(agent),
      data: rows.map(r => ({ x: r.actual, y: r.predicted })),
      backgroundColor: agentColor(agent),
      borderColor: agentColor(agent),
      pointRadius: 4,
      pointHoverRadius: 7,
    });
  }

  // Find data range for diagonal line
  const allActual = scoresHistory.map(r => r.actual).filter(v => v != null);
  const minVal = Math.min(...allActual) - 0.02;
  const maxVal = Math.max(...allActual) + 0.02;

  new Chart(canvas, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: 'Actual Price', color: '#8b949e' },
          grid: { color: '#21262d' },
          min: minVal,
          max: maxVal,
        },
        y: {
          title: { display: true, text: 'Predicted Price', color: '#8b949e' },
          grid: { color: '#21262d' },
          min: minVal,
          max: maxVal,
        },
      },
      plugins: {
        legend: {
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 16 },
        },
        annotation: {
          annotations: {
            perfectLine: {
              type: 'line',
              xMin: minVal,
              xMax: maxVal,
              yMin: minVal,
              yMax: maxVal,
              borderColor: 'rgba(139,148,158,0.4)',
              borderWidth: 1,
              borderDash: [6, 4],
              label: {
                display: true,
                content: 'Perfect prediction',
                position: 'end',
                backgroundColor: 'transparent',
                color: '#6e7681',
                font: { size: 10 },
              },
            },
          },
        },
        tooltip: {
          backgroundColor: '#1c2129',
          borderColor: '#30363d',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: pred=${ctx.parsed.y.toFixed(4)}, actual=${ctx.parsed.x.toFixed(4)}`,
          },
        },
      },
    },
  });
}

// LLM Divergence horizontal bar chart (market price vs prediction)
function renderDivergenceChart(llmData) {
  const canvas = document.getElementById('divergence-canvas');
  if (!canvas || !llmData || !llmData.predictions) return;

  // Filter to binary predictions with numeric values, sort by divergence
  const preds = llmData.predictions
    .filter(p => typeof p.market_price === 'number' && typeof p.shrunk_prediction === 'number')
    .sort((a, b) => Math.abs(b.divergence || 0) - Math.abs(a.divergence || 0))
    .slice(0, 15); // Top 15 by divergence

  const labels = preds.map(p => {
    const q = p.question || p.key || '';
    return q.length > 40 ? q.substring(0, 37) + '...' : q;
  });

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Market Price',
          data: preds.map(p => p.market_price * 100),
          backgroundColor: 'rgba(139, 148, 158, 0.6)',
          borderColor: '#8b949e',
          borderWidth: 1,
        },
        {
          label: 'LLM Prediction (shrunk)',
          data: preds.map(p => p.shrunk_prediction * 100),
          backgroundColor: 'rgba(188, 140, 255, 0.6)',
          borderColor: '#bc8cff',
          borderWidth: 1,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: 'Probability (%)', color: '#8b949e' },
          grid: { color: '#21262d' },
          min: 0,
          max: 100,
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 11 } },
        },
      },
      plugins: {
        legend: {
          labels: { usePointStyle: true, pointStyle: 'rect', padding: 16 },
        },
        tooltip: {
          backgroundColor: '#1c2129',
          borderColor: '#30363d',
          borderWidth: 1,
        },
      },
    },
  });
}

// LLM Calibration plot (predicted probability vs actual frequency)
function renderCalibrationChart(rollingScores) {
  const canvas = document.getElementById('calibration-canvas');
  if (!canvas) return;

  if (!rollingScores || rollingScores.length === 0) {
    canvas.parentElement.innerHTML = '<div class="loading" style="height:400px;display:flex;align-items:center;justify-content:center">Need more scored predictions for calibration. Scores appear after contracts resolve.</div>';
    return;
  }

  // Bucket predictions into 10 bins: 0-10%, 10-20%, ..., 90-100%
  const bins = Array.from({ length: 10 }, () => ({ predictions: [], outcomes: [] }));

  for (const r of rollingScores) {
    if (typeof r.prediction !== 'number' || typeof r.outcome !== 'number') continue;
    const binIdx = Math.min(Math.floor(r.prediction * 10), 9);
    bins[binIdx].predictions.push(r.prediction);
    bins[binIdx].outcomes.push(r.outcome);
  }

  const labels = bins.map((_, i) => `${i * 10}-${(i + 1) * 10}%`);
  const avgPredicted = bins.map(b => b.predictions.length > 0
    ? b.predictions.reduce((s, v) => s + v, 0) / b.predictions.length * 100
    : null);
  const avgActual = bins.map(b => b.outcomes.length > 0
    ? b.outcomes.reduce((s, v) => s + v, 0) / b.outcomes.length * 100
    : null);
  const counts = bins.map(b => b.predictions.length);

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Count',
          data: counts,
          backgroundColor: 'rgba(139,148,158,0.2)',
          borderColor: '#8b949e',
          borderWidth: 1,
          yAxisID: 'yCount',
          order: 2,
        },
        {
          type: 'line',
          label: 'Avg Predicted',
          data: avgPredicted,
          borderColor: '#bc8cff',
          backgroundColor: 'rgba(188,140,255,0.15)',
          borderWidth: 2,
          pointRadius: 4,
          spanGaps: true,
          yAxisID: 'yPct',
          order: 1,
        },
        {
          type: 'line',
          label: 'Avg Actual Outcome',
          data: avgActual,
          borderColor: '#3fb950',
          backgroundColor: 'rgba(63,185,80,0.15)',
          borderWidth: 2,
          pointRadius: 4,
          spanGaps: true,
          yAxisID: 'yPct',
          order: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: '#21262d' } },
        yPct: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Probability (%)', color: '#8b949e' },
          grid: { color: '#21262d' },
          min: 0,
          max: 100,
        },
        yCount: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Count', color: '#8b949e' },
          grid: { display: false },
          beginAtZero: true,
        },
      },
      plugins: {
        legend: {
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 16 },
        },
        tooltip: {
          backgroundColor: '#1c2129',
          borderColor: '#30363d',
          borderWidth: 1,
        },
        annotation: {
          annotations: {
            perfectLine: {
              type: 'line',
              xMin: -0.5,
              xMax: 9.5,
              yMin: 5,
              yMax: 95,
              yScaleID: 'yPct',
              borderColor: 'rgba(139,148,158,0.3)',
              borderWidth: 1,
              borderDash: [6, 4],
              label: {
                display: true,
                content: 'Perfect calibration',
                position: 'end',
                backgroundColor: 'transparent',
                color: '#6e7681',
                font: { size: 10 },
              },
            },
          },
        },
      },
    },
  });
}

// Inline SVG sparkline for agent cards
function renderSparkline(container, values, color) {
  if (!values || values.length < 2) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:0.7rem">No trend data</span>';
    return;
  }

  const w = 120, h = 30, pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (w - 2 * pad),
    y: h - pad - ((v - min) / range) * (h - 2 * pad),
  }));

  const points = coords.map(c => `${c.x},${c.y}`).join(' ');
  const last = coords[coords.length - 1];

  container.innerHTML = `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last.x}" cy="${last.y}" r="3" fill="${color}"/>
    </svg>`;
}
