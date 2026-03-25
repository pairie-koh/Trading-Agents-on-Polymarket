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
