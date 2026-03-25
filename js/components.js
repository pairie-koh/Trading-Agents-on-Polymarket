// DOM rendering for each dashboard section

// === Header ===
function renderHeader(leaderboard) {
  if (!leaderboard) return;

  document.getElementById('last-updated').textContent =
    `Updated ${timeAgo(leaderboard.last_updated)}`;
  document.getElementById('total-cycles').textContent =
    `${leaderboard.total_cycles} forecast cycles`;

  // Freshness indicator
  const hoursOld = (Date.now() - new Date(leaderboard.last_updated).getTime()) / 3600000;
  let dotClass, label;
  if (hoursOld < 8) { dotClass = 'fresh'; label = 'Fresh'; }
  else if (hoursOld < 24) { dotClass = 'stale'; label = 'Stale'; }
  else { dotClass = 'old'; label = 'Old'; }

  document.getElementById('freshness-indicator').innerHTML =
    `<span class="freshness"><span class="freshness-dot ${dotClass}"></span>${label}</span>`;
}

// === Leaderboard ===
function renderLeaderboard(leaderboard) {
  const container = document.querySelector('#leaderboard .section-content');
  if (!container || !leaderboard) return;

  // Build a merged lookup: agent -> { mse, mse_rank, dir_acc, dir_rank }
  const agents = {};
  for (const r of leaderboard.rankings_by_mse) {
    agents[r.agent] = { mse: r.mse, mse_rank: r.rank };
  }
  for (const r of leaderboard.rankings_by_directional) {
    if (!agents[r.agent]) agents[r.agent] = {};
    agents[r.agent].dir_acc = r.directional_accuracy;
    agents[r.agent].dir_rank = r.rank;
  }

  // Sort by MSE rank
  const sorted = Object.entries(agents).sort((a, b) => (a[1].mse_rank || 99) - (b[1].mse_rank || 99));

  let html = `<table>
    <thead><tr>
      <th>Rank</th><th>Agent</th><th>MSE</th><th>Dir. Accuracy</th>
    </tr></thead><tbody>`;

  for (const [name, data] of sorted) {
    const isNaive = name === 'naive_baseline';
    const rowClass = isNaive ? ' class="naive-row"' : '';
    const rankClass = data.mse_rank <= 3 ? ` rank-${data.mse_rank}` : '';

    html += `<tr${rowClass}>
      <td><span class="rank-badge${rankClass}">${data.mse_rank}</span></td>
      <td><span class="agent-dot ${name}"></span>${agentLabel(name)}</td>
      <td>${fmtMSE(data.mse)}</td>
      <td>${data.dir_acc != null ? fmtPct(data.dir_acc) : '—'}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

// === Agent Cards ===
function renderAgentCards(scorecards) {
  const container = document.querySelector('#agent-cards .cards-grid');
  if (!container) return;

  const agentOrder = ['momentum', 'historian', 'game_theorist', 'quant'];
  let html = '';

  for (const name of agentOrder) {
    const sc = scorecards[name];
    if (!sc) continue;

    const beatsNaive = sc.overall.mse < sc.overall.naive_baseline_mse;
    const badgeClass = beatsNaive ? 'yes' : 'no';
    const badgeText = beatsNaive ? 'Beats Naive' : 'Below Naive';
    const color = agentColor(name);

    html += `
    <div class="agent-card" style="border-top: 3px solid ${color}">
      <div class="card-header">
        <span class="agent-name" style="color:${color}">${agentLabel(name)}</span>
        <span class="version-badge">v${sc.methodology_version}</span>
      </div>
      <div class="metric">
        <div class="metric-label">MSE</div>
        <div class="metric-value">${fmtMSE(sc.overall.mse)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Directional Accuracy</div>
        <div class="metric-value">${fmtPct(sc.overall.directional_accuracy)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Predictions</div>
        <div class="metric-value">${sc.total_predictions}</div>
      </div>
      <div style="margin-top:0.5rem">
        <span class="badge-beats-naive ${badgeClass}">${badgeText}</span>
      </div>
      <div class="sparkline-container">
        <div class="sparkline-label">MSE Trend (Last 5)</div>
        <div class="sparkline" data-agent="${name}"></div>
      </div>
    </div>`;
  }

  container.innerHTML = html;

  // Render sparklines after DOM is ready
  for (const name of agentOrder) {
    const sc = scorecards[name];
    if (!sc) continue;
    const el = container.querySelector(`.sparkline[data-agent="${name}"]`);
    if (el) renderSparkline(el, sc.mse_trend_last_5, agentColor(name));
  }
}

// === Per-Market Breakdown ===
function renderMarketBreakdown(leaderboard) {
  const container = document.querySelector('#market-breakdown .section-content');
  if (!container || !leaderboard) return;

  const markets = Object.keys(leaderboard.per_market_mse || {});
  if (markets.length === 0) {
    container.innerHTML = '<div class="loading">No per-market data available</div>';
    return;
  }

  const agentNames = ['momentum', 'historian', 'game_theorist', 'quant'];

  let html = '<table><thead><tr><th>Market</th>';
  for (const a of agentNames) {
    html += `<th><span class="agent-dot ${a}"></span>${agentLabel(a)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const market of markets) {
    const mseData = leaderboard.per_market_mse[market];
    html += `<tr><td style="text-transform:capitalize">${market.replace(/_/g, ' ')}</td>`;
    for (const a of agentNames) {
      const val = mseData[a];
      html += `<td>${fmtMSE(val)}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

// === Prediction History Table ===
function renderPredictionTable(scoresHistory) {
  const container = document.querySelector('#prediction-history .prediction-table');
  if (!container || !scoresHistory) return;

  // Show last 30 predictions (non-naive)
  const rows = scoresHistory
    .filter(r => r.agent !== 'naive_baseline')
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 30);

  let html = `<table>
    <thead><tr>
      <th>Time</th><th>Agent</th><th>Predicted</th><th>Actual</th><th>Error</th><th>Direction</th>
    </tr></thead><tbody>`;

  for (const r of rows) {
    const dirIcon = r.direction_correct === true || r.direction_correct === 'True'
      ? '<span style="color:var(--accent-green)">Correct</span>'
      : '<span style="color:var(--accent-red)">Wrong</span>';

    html += `<tr>
      <td>${fmtTimestamp(r.timestamp)}</td>
      <td><span class="agent-dot ${r.agent}"></span>${agentLabel(r.agent)}</td>
      <td>${r.predicted?.toFixed(4) || '—'}</td>
      <td>${r.actual?.toFixed(4) || '—'}</td>
      <td>${fmtMSE(r.squared_error)}</td>
      <td>${dirIcon}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

// === Contract Overview ===
function renderContracts(contractsData) {
  const container = document.querySelector('#contracts .contracts-grid');
  const countBadge = document.getElementById('contract-count');
  if (!container || !contractsData) return;

  const contracts = contractsData.contracts || [];
  if (countBadge) countBadge.textContent = contracts.length;

  // Group by category
  const byCategory = {};
  for (const c of contracts) {
    const cat = c.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(c);
  }

  const categoryOrder = ['geopolitics', 'economics', 'politics', 'sports', 'tech', 'entertainment'];
  let html = '';

  for (const cat of categoryOrder) {
    const items = byCategory[cat];
    if (!items) continue;

    html += `<div class="contracts-by-category">
      <div class="category-header">${cat} (${items.length})</div>`;

    for (const c of items) {
      let priceStr = '';
      if (c.contract_type === 'binary' && c.current_prices) {
        const yesPrice = c.current_prices.yes || c.current_prices.Yes || 0;
        priceStr = `<span style="color:var(--accent-green)">${(yesPrice * 100).toFixed(0)}%</span> Yes`;
      } else if (c.outcomes) {
        // Multi-outcome: show top outcome
        const sorted = [...c.outcomes].sort((a, b) => (b.price || 0) - (a.price || 0));
        if (sorted[0]) {
          priceStr = `${sorted[0].name}: ${((sorted[0].price || 0) * 100).toFixed(0)}%`;
        }
      }

      html += `<div class="contract-row">
        <span class="contract-name">${c.contract_name}</span>
        <span class="contract-freq">${(c.prediction_frequency || '').replace(/_/g, ' ')}</span>
        <span class="contract-price">${priceStr}</span>
        <span class="contract-volume">$${fmtVolume(c.volume || 0)}</span>
      </div>`;
    }

    html += '</div>';
  }

  container.innerHTML = html;
}

// === Latest Briefing ===
function renderBriefing(briefing, stateData) {
  const container = document.querySelector('#briefing .briefing-content');
  if (!container) return;

  let html = '';

  // State summary
  if (stateData && stateData.markets) {
    for (const [market, data] of Object.entries(stateData.markets)) {
      html += `<div class="state-summary">
        <strong style="text-transform:capitalize">${market.replace(/_/g, ' ')}</strong>
        <p style="margin-top:0.5rem;color:var(--text-secondary)">${data.current_status || 'No status available'}</p>
        <div class="intensity-badges">`;

      const intensityFields = ['military_pressure', 'internal_stability', 'succession_dynamics',
        'diplomatic_signals', 'economic_collapse', 'international_response'];
      for (const field of intensityFields) {
        const level = data[field] || 'none';
        html += `<span class="intensity-badge ${level}">${field.replace(/_/g, ' ')}: ${level}</span>`;
      }

      html += '</div></div>';
    }
  }

  // Facts
  if (briefing && briefing.fresh_facts && briefing.fresh_facts.length > 0) {
    html += '<div class="facts-list">';
    for (const fact of briefing.fresh_facts.slice(0, 15)) {
      html += `<div class="fact-item">
        <div>${fact.claim}</div>
        <div class="fact-meta">
          <span class="fact-tag">${fact.source || 'Unknown'}</span>
          <span class="fact-tag">${(fact.source_category || '').replace(/_/g, ' ')}</span>
          <span class="fact-tag">${(fact.indicator_category || '').replace(/_/g, ' ')}</span>
          <span class="fact-tag">${fact.confidence || ''}</span>
        </div>
      </div>`;
    }
    html += '</div>';
  } else {
    html += '<div class="loading">No recent facts available</div>';
  }

  container.innerHTML = html;
}

// === LLM Predictions ===
function renderLLMPredictions(llmData) {
  const container = document.querySelector('#llm-predictions .section-content');
  if (!container) return;

  if (!llmData || !llmData.predictions) {
    container.innerHTML = '<div class="loading">No LLM predictions available</div>';
    return;
  }

  const predictions = llmData.predictions;

  let html = `<p style="color:var(--text-secondary);font-size:0.8rem;margin-bottom:1rem">
    Latest run: ${fmtDate(llmData.timestamp)} &middot; ${predictions.length} contracts
  </p>
  <table>
    <thead><tr>
      <th>Contract</th><th>Tier</th><th>Market</th><th>Prediction</th><th>Shrunk</th><th>Divergence</th>
    </tr></thead><tbody>`;

  // Sort by absolute divergence descending
  const sorted = [...predictions].sort((a, b) => Math.abs(b.divergence || 0) - Math.abs(a.divergence || 0));

  for (const p of sorted) {
    const divPct = Math.abs(p.divergence || 0) * 100;
    const divColor = divPct > 10 ? 'var(--accent-red)' : divPct > 5 ? 'var(--accent-orange)' : 'var(--accent-green)';
    const tierColor = p.tier === 'sonnet' ? 'var(--accent-purple)' : 'var(--accent-blue)';

    html += `<tr>
      <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.question}</td>
      <td><span style="color:${tierColor};font-weight:600;text-transform:capitalize">${p.tier || '—'}</span></td>
      <td>${p.market_price != null ? (typeof p.market_price === 'number' ? (p.market_price * 100).toFixed(0) + '%' : '—') : '—'}</td>
      <td>${p.prediction != null ? (typeof p.prediction === 'number' ? (p.prediction * 100).toFixed(0) + '%' : '—') : '—'}</td>
      <td>${p.shrunk_prediction != null ? (typeof p.shrunk_prediction === 'number' ? (p.shrunk_prediction * 100).toFixed(0) + '%' : '—') : '—'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <div class="divergence-bar">
            <div class="divergence-fill" style="width:${Math.min(divPct * 2, 100)}%;background:${divColor}"></div>
          </div>
          <span style="color:${divColor};font-weight:600;font-size:0.8rem">${divPct.toFixed(1)}%</span>
        </div>
      </td>
    </tr>`;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}
