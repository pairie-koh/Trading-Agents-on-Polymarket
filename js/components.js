// DOM rendering for each dashboard section

// === Header ===
function renderHeaderFromLLM(llmData) {
  if (!llmData) return;

  const ts = llmData.timestamp;
  if (ts) {
    document.getElementById('last-updated').textContent = `Updated ${timeAgo(ts)}`;
  }

  const count = llmData.predictions ? llmData.predictions.length : 0;
  document.getElementById('total-cycles').textContent = `${count} contracts tracked`;

  // Freshness indicator
  if (ts) {
    const hoursOld = (Date.now() - new Date(ts).getTime()) / 3600000;
    let dotClass, label;
    if (hoursOld < 8) { dotClass = 'fresh'; label = 'Fresh'; }
    else if (hoursOld < 24) { dotClass = 'stale'; label = 'Stale'; }
    else { dotClass = 'old'; label = 'Old'; }

    document.getElementById('freshness-indicator').innerHTML =
      `<span class="freshness"><span class="freshness-dot ${dotClass}"></span>${label}</span>`;
  }
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
      } else if (c.outcomes && c.outcomes.length > 0) {
        // Multi-outcome: show top 2 outcomes by yes_price
        const sorted = [...c.outcomes].sort((a, b) => (b.yes_price || 0) - (a.yes_price || 0));
        const top = sorted.slice(0, 2);
        priceStr = top.map(o => {
          // Extract a short label from the outcome question
          let label = o.question || '';
          // Try to extract just the distinguishing part (e.g., date, name, amount)
          // Remove common prefixes like "Will X" that match the parent contract name
          const parentName = (c.contract_name || '').toLowerCase();
          const words = parentName.split(/\s+/).filter(w => w.length > 3);
          // If the outcome question shares most words with parent, try to extract the unique part
          if (words.length > 2) {
            // Find last common word position, show everything after
            for (const suffix of ['by ', 'before ', 'in ', 'at ', 'reach ', 'increase by ']) {
              const idx = label.toLowerCase().lastIndexOf(suffix);
              if (idx > 0) {
                label = label.substring(idx).replace(/\?$/, '');
                break;
              }
            }
          }
          if (label.length > 45) label = label.substring(0, 42) + '...';
          const pct = ((o.yes_price || 0) * 100).toFixed(0);
          return `<span style="color:var(--accent-green)">${pct}%</span> ${label}`;
        }).join('<br>');
        if (sorted.length > 2) {
          priceStr += `<br><span style="color:var(--text-secondary);font-size:0.7rem">+${sorted.length - 2} more</span>`;
        }
      }

      html += `<div class="contract-row">
        <span class="contract-name">${c.contract_name}${c.contract_type === 'multi-outcome' ? ' <span style="font-size:0.65rem;color:var(--text-muted)">[' + c.num_outcomes + ' outcomes]</span>' : ''}</span>
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

// === LLM Performance Summary ===
function renderPerformanceSummary(summaryData) {
  const container = document.querySelector('#llm-summary .section-content');
  if (!container) return;

  if (!summaryData || !summaryData.summary) {
    container.innerHTML = '<div class="loading">No performance summary available. Run <code>python update_data.py</code> with OPENROUTER_API_KEY set.</div>';
    return;
  }

  const paragraphs = summaryData.summary.split('\n\n').filter(p => p.trim());
  const generatedAt = summaryData.generated_at ? fmtDate(summaryData.generated_at) : 'Unknown';

  let html = `<div class="summary-block">`;
  for (const p of paragraphs) {
    html += `<p style="margin-bottom:0.8rem;line-height:1.6;color:var(--text-primary)">${p.trim()}</p>`;
  }
  html += `</div>
    <p style="margin-top:1rem;font-size:0.7rem;color:var(--text-secondary)">
      Generated by Claude Haiku &middot; Based on data from ${generatedAt}
    </p>`;

  container.innerHTML = html;
}

// === LLM Overview Stats ===
function renderLLMOverview(llmData, rollingScores) {
  const container = document.querySelector('#llm-overview .section-content');
  if (!container) return;

  const predictions = llmData?.predictions || [];
  const scores = rollingScores || [];

  // Count tiers
  const sonnetCount = predictions.filter(p => p.tier === 'sonnet').length;
  const haikuCount = predictions.filter(p => p.tier === 'haiku').length;

  // Average divergence
  const divValues = predictions.map(p => Math.abs(p.divergence || 0)).filter(v => !isNaN(v));
  const avgDiv = divValues.length > 0 ? divValues.reduce((s, v) => s + v, 0) / divValues.length : 0;

  // Max divergence
  const maxDiv = divValues.length > 0 ? Math.max(...divValues) : 0;

  // Rolling scores stats
  const scored = scores.length;
  const correct = scores.filter(r => r.correct === true || r.correct === 'True').length;
  const avgSE = scored > 0 ? scores.reduce((s, r) => s + (r.squared_error || 0), 0) / scored : 0;

  // Timestamp
  const lastRun = llmData?.timestamp ? fmtDate(llmData.timestamp) : '—';

  let html = `
    <p style="color:var(--text-secondary);font-size:0.8rem;margin-bottom:1rem">Last forecast run: ${lastRun}</p>
    <div class="llm-stats-grid">
      <div class="llm-stat-card">
        <div class="stat-value" style="color:var(--text-primary)">${predictions.length}</div>
        <div class="stat-label">Contracts Predicted</div>
      </div>
      <div class="llm-stat-card">
        <div class="stat-value" style="color:var(--accent-purple)">${sonnetCount}</div>
        <div class="stat-label">Sonnet (Deep Dive)</div>
      </div>
      <div class="llm-stat-card">
        <div class="stat-value" style="color:var(--accent-blue)">${haikuCount}</div>
        <div class="stat-label">Haiku (Triage)</div>
      </div>
      <div class="llm-stat-card">
        <div class="stat-value" style="color:${avgDiv > 0.1 ? 'var(--accent-red)' : 'var(--accent-orange)'}">${(avgDiv * 100).toFixed(1)}%</div>
        <div class="stat-label">Avg Divergence</div>
      </div>
      <div class="llm-stat-card">
        <div class="stat-value" style="color:var(--accent-red)">${(maxDiv * 100).toFixed(1)}%</div>
        <div class="stat-label">Max Divergence</div>
      </div>
      <div class="llm-stat-card">
        <div class="stat-value" style="color:var(--text-primary)">${scored}</div>
        <div class="stat-label">Scored Predictions</div>
      </div>
      <div class="llm-stat-card">
        <div class="stat-value" style="color:${scored > 0 && correct/scored > 0.5 ? 'var(--accent-green)' : 'var(--accent-orange)'}">${scored > 0 ? fmtPct(correct / scored) : '—'}</div>
        <div class="stat-label">Accuracy (Rolling)</div>
      </div>
      <div class="llm-stat-card">
        <div class="stat-value">${scored > 0 ? fmtMSE(avgSE) : '—'}</div>
        <div class="stat-label">Avg Squared Error</div>
      </div>
    </div>`;

  container.innerHTML = html;
}

// === Helper: parse array string into array of numbers ===
function parseArrayStr(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.startsWith('[')) {
    try { return JSON.parse(val); } catch (e) { return null; }
  }
  return null;
}

// === Helper: find winning outcome index from outcome array ===
function findWinnerIdx(outcomeArr) {
  if (!outcomeArr) return -1;
  let maxIdx = 0, maxVal = -1;
  for (let i = 0; i < outcomeArr.length; i++) {
    if (outcomeArr[i] > maxVal) { maxVal = outcomeArr[i]; maxIdx = i; }
  }
  return maxIdx;
}

// === Rolling Scores (Scored LLM Predictions) ===
function renderRollingScores(rollingScores) {
  const container = document.querySelector('#llm-rolling-scores .section-content');
  if (!container) return;

  if (!rollingScores || rollingScores.length === 0) {
    container.innerHTML = '<div class="loading">No scored rolling predictions yet. Scores appear after daily contracts resolve.</div>';
    return;
  }

  let html = `<table>
    <thead><tr>
      <th>Date</th><th>Contract</th><th>LLM Call</th><th>Market Call</th><th>Actual</th><th>Result</th><th>Brier Score</th><th>Tier</th>
    </tr></thead><tbody>`;

  for (const r of rollingScores) {
    const isMulti = r.contract_type === 'multi-outcome';
    const isCorrect = r.correct === true || r.correct === 'True';

    let predStr = '—', marketStr = '—', outcomeStr = '—', resultStr = '—';

    if (isMulti) {
      // Parse arrays
      const predArr = parseArrayStr(r.prediction);
      const mktArr = parseArrayStr(r.market_price);
      const outArr = parseArrayStr(r.outcome);

      if (predArr && outArr) {
        const llmTopIdx = findWinnerIdx(predArr);
        const mktTopIdx = mktArr ? findWinnerIdx(mktArr) : -1;
        const actualIdx = findWinnerIdx(outArr);

        // Show as "Bucket #X @ YY%"
        predStr = `#${llmTopIdx + 1} @ ${(predArr[llmTopIdx] * 100).toFixed(0)}%`;
        if (mktArr) marketStr = `#${mktTopIdx + 1} @ ${(mktArr[mktTopIdx] * 100).toFixed(0)}%`;
        outcomeStr = `#${actualIdx + 1}`;

        const llmCorrect = llmTopIdx === actualIdx;
        const mktCorrect = mktTopIdx === actualIdx;
        if (llmCorrect && !mktCorrect) resultStr = '<span style="color:var(--accent-green);font-weight:600">LLM correct</span>';
        else if (!llmCorrect && mktCorrect) resultStr = '<span style="color:var(--accent-red)">Market correct</span>';
        else if (llmCorrect && mktCorrect) resultStr = '<span style="color:var(--text-secondary)">Both correct</span>';
        else resultStr = '<span style="color:var(--accent-red)">Both wrong</span>';
      }
    } else {
      // Binary
      const pred = typeof r.prediction === 'number' ? r.prediction : null;
      const mkt = typeof r.market_price === 'number' ? r.market_price : null;
      const outcome = typeof r.outcome === 'number' ? r.outcome : null;

      if (pred != null) {
        const call = pred > 0.5 ? 'Yes' : 'No';
        const callColor = pred > 0.5 ? 'var(--accent-green)' : 'var(--accent-red)';
        predStr = `<span style="color:${callColor};font-weight:600">${call}</span> <span style="color:var(--text-secondary)">(${(pred * 100).toFixed(0)}%)</span>`;
      }
      if (mkt != null) {
        const call = mkt > 0.5 ? 'Yes' : 'No';
        const callColor = mkt > 0.5 ? 'var(--accent-green)' : 'var(--accent-red)';
        marketStr = `<span style="color:${callColor};font-weight:600">${call}</span> <span style="color:var(--text-secondary)">(${(mkt * 100).toFixed(0)}%)</span>`;
      }
      if (outcome != null) {
        outcomeStr = outcome >= 0.5
          ? '<span style="color:var(--accent-green);font-weight:600">Yes</span>'
          : '<span style="color:var(--accent-red);font-weight:600">No</span>';
      }

      // Result: who was closer?
      if (pred != null && mkt != null && outcome != null) {
        const llmErr = Math.pow(pred - outcome, 2);
        const mktErr = Math.pow(mkt - outcome, 2);
        if (llmErr < mktErr) resultStr = '<span style="color:var(--accent-green);font-weight:600">LLM closer</span>';
        else if (mktErr < llmErr) resultStr = '<span style="color:var(--accent-red)">Market closer</span>';
        else resultStr = '<span style="color:var(--text-secondary)">Tie</span>';
      }
    }

    html += `<tr>
      <td>${r.date || '—'}</td>
      <td>${r.contract_name || r.contract_key || '—'}</td>
      <td>${predStr}</td>
      <td>${marketStr}</td>
      <td>${outcomeStr}</td>
      <td>${resultStr}</td>
      <td>${r.squared_error != null ? Number(r.squared_error).toFixed(4) : '—'}</td>
      <td><span class="tier-badge ${r.tier || ''}">${r.tier || '—'}</span></td>
    </tr>`;
  }

  html += '</tbody></table>';
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
      <th>Contract</th><th>Tier</th><th>Top Pick</th><th>Market</th><th>Prediction</th><th>Shrunk</th><th>Divergence</th>
    </tr></thead><tbody>`;

  // Sort by absolute divergence descending
  const sorted = [...predictions].sort((a, b) => Math.abs(b.divergence || 0) - Math.abs(a.divergence || 0));

  for (const p of sorted) {
    const divPct = Math.abs(p.divergence || 0) * 100;
    const divColor = divPct > 10 ? 'var(--accent-red)' : divPct > 5 ? 'var(--accent-orange)' : 'var(--accent-green)';
    const tierColor = p.tier === 'sonnet' ? 'var(--accent-purple)' : p.tier === 'opus' ? 'var(--accent-orange)' : 'var(--accent-blue)';
    const isMulti = p.type === 'multi-outcome';

    // For multi-outcome: find the top predicted outcome
    let marketStr = '—', predStr = '—', shrunkStr = '—', topPickStr = '—';
    if (isMulti && p.outcome_questions && p.shrunk_outcome_predictions) {
      // Find index of highest shrunk prediction
      let topIdx = 0;
      let topVal = -1;
      for (let i = 0; i < p.shrunk_outcome_predictions.length; i++) {
        if (p.shrunk_outcome_predictions[i] > topVal) {
          topVal = p.shrunk_outcome_predictions[i];
          topIdx = i;
        }
      }
      // Extract a short label from the outcome question
      const fullQ = p.outcome_questions[topIdx] || '';
      let pickLabel = '';
      // Priority 1: Dollar amounts ("$200,000", "$3.25")
      const dollarMatch = fullQ.match(/\$[\d,]+(?:\.\d+)?/);
      // Priority 2: Temperature ranges ("82-83°F", "66°F or higher")
      const tempMatch = fullQ.match(/be\s+((?:between\s+)?\d+[^?]*?)(?:\s+on\s|\?)/i);
      // Priority 3: Percentage thresholds ("≥2.8%", "2.5-3.0%")
      const pctMatch = fullQ.match(/[≥≤><]?\s*\d+\.?\d*\s*%/);
      // Priority 4: Named entity (person/party as subject — "Will X be/do...")
      const namedMatch = fullQ.match(/^Will\s+(.+?)\s+(?:be |reach|hit|dip|control|close|win)/i);
      // Priority 5: Key phrase after "will there be" or "will the"
      const phraseMatch = fullQ.match(/Will there be\s+(.*?)(?:\s+(?:in|after|by|before)\s)/i);

      if (dollarMatch) {
        pickLabel = dollarMatch[0];
      } else if (tempMatch) {
        pickLabel = tempMatch[1].replace(/^between\s+/i, '');
      } else if (pctMatch) {
        pickLabel = pctMatch[0].trim();
      } else if (phraseMatch) {
        pickLabel = phraseMatch[1];
        if (pickLabel.length > 25) pickLabel = pickLabel.substring(0, 22) + '...';
      } else if (namedMatch) {
        pickLabel = namedMatch[1];
        if (pickLabel.length > 25) pickLabel = pickLabel.substring(0, 22) + '...';
      } else {
        pickLabel = fullQ.length > 25 ? fullQ.substring(0, 22) + '...' : fullQ;
      }
      topPickStr = `<span style="font-weight:600;color:var(--accent-purple)">${pickLabel}</span>`;

      const mktVal = p.outcome_market_prices ? p.outcome_market_prices[topIdx] : null;
      const rawVal = p.outcome_predictions ? p.outcome_predictions[topIdx] : null;

      marketStr = mktVal != null ? `${(mktVal * 100).toFixed(0)}%` : '—';
      predStr = rawVal != null ? `${(rawVal * 100).toFixed(0)}%` : '—';
      shrunkStr = `${(topVal * 100).toFixed(0)}%`;
    } else {
      marketStr = p.market_price != null && typeof p.market_price === 'number' ? (p.market_price * 100).toFixed(0) + '%' : '—';
      predStr = p.prediction != null && typeof p.prediction === 'number' ? (p.prediction * 100).toFixed(0) + '%' : '—';
      shrunkStr = p.shrunk_prediction != null && typeof p.shrunk_prediction === 'number' ? (p.shrunk_prediction * 100).toFixed(0) + '%' : '—';

      // Binary contract pick: derive from shrunk_prediction (>0.5 = Yes, <0.5 = No)
      const sp = p.shrunk_prediction;
      if (sp != null && typeof sp === 'number') {
        const q = (p.question || '').toLowerCase();
        // Use contextual labels for known contract patterns
        let yesLabel = 'Yes', noLabel = 'No';
        if (q.includes('up or down')) { yesLabel = 'Up'; noLabel = 'Down'; }
        else if (q.includes('over or under') || q.includes('higher or lower')) { yesLabel = 'Over'; noLabel = 'Under'; }
        const pick = sp > 0.5 ? yesLabel : noLabel;
        const conf = Math.abs(sp - 0.5) * 200;  // 0-100% confidence away from 50/50
        const pickColor = sp > 0.5 ? 'var(--accent-green)' : 'var(--accent-red)';
        topPickStr = `<span style="font-weight:600;color:${pickColor}">${pick}</span> <span style="font-size:0.65rem;color:var(--text-muted)">${conf.toFixed(0)}%</span>`;
      }
    }

    const typeLabel = isMulti ? '<span style="font-size:0.6rem;color:var(--text-muted);margin-left:4px">[multi]</span>' : '';

    html += `<tr>
      <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.question}${typeLabel}</td>
      <td><span style="color:${tierColor};font-weight:600;text-transform:capitalize">${p.tier || '—'}</span></td>
      <td>${topPickStr}</td>
      <td>${marketStr}</td>
      <td>${predStr}</td>
      <td>${shrunkStr}</td>
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

// === LLM vs Market ===
function renderLLMvsMarket(rollingScores, contractsData) {
  const container = document.querySelector('#llm-vs-market .section-content');
  if (!container) return;

  if (!rollingScores || rollingScores.length === 0) {
    container.innerHTML = '<div class="loading">Need scored predictions to compare LLM vs Market. Scores appear after contracts resolve.</div>';
    return;
  }

  let llmWins = 0, marketWins = 0, ties = 0;
  let llmBrier = 0, marketBrier = 0;
  let count = 0;

  for (const r of rollingScores) {
    if (r.outcome == null || r.prediction == null || r.market_price == null) continue;

    let llmErr, mktErr;

    if (typeof r.prediction === 'number' && typeof r.market_price === 'number' && typeof r.outcome === 'number') {
      // Binary prediction
      llmErr = Math.pow(r.prediction - r.outcome, 2);
      mktErr = Math.pow(r.market_price - r.outcome, 2);
    } else {
      // Multi-outcome: parse arrays and compute mean squared error across all buckets
      const predArr = parseArrayStr(r.prediction);
      const mktArr = parseArrayStr(r.market_price);
      const outArr = parseArrayStr(r.outcome);
      if (!predArr || !mktArr || !outArr || predArr.length !== outArr.length || mktArr.length !== outArr.length) continue;

      llmErr = 0; mktErr = 0;
      for (let i = 0; i < outArr.length; i++) {
        llmErr += Math.pow(predArr[i] - outArr[i], 2);
        mktErr += Math.pow(mktArr[i] - outArr[i], 2);
      }
      llmErr /= outArr.length;
      mktErr /= outArr.length;
    }

    llmBrier += llmErr;
    marketBrier += mktErr;
    count++;

    if (llmErr < mktErr) llmWins++;
    else if (mktErr < llmErr) marketWins++;
    else ties++;
  }

  const llmAvg = count > 0 ? llmBrier / count : 0;
  const mktAvg = count > 0 ? marketBrier / count : 0;
  const llmBetter = llmAvg < mktAvg;

  let html = `
    <div class="llm-stats-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="llm-stat-card">
        <div class="stat-value" style="color:var(--accent-green)">${llmWins}</div>
        <div class="stat-label">LLM Wins</div>
      </div>
      <div class="llm-stat-card">
        <div class="stat-value" style="color:var(--accent-red)">${marketWins}</div>
        <div class="stat-label">Market Wins</div>
      </div>
      <div class="llm-stat-card">
        <div class="stat-value" style="color:var(--text-secondary)">${ties}</div>
        <div class="stat-label">Ties</div>
      </div>
      <div class="llm-stat-card">
        <div class="stat-value">${count}</div>
        <div class="stat-label">Scored</div>
      </div>
    </div>
    <div style="margin-top:1rem;display:flex;gap:1.5rem;flex-wrap:wrap">
      <div style="flex:1;min-width:180px;padding:1rem;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border)">
        <div style="font-size:0.75rem;color:var(--text-secondary)">LLM Avg Brier Score</div>
        <div style="font-size:1.4rem;font-weight:700;color:${llmBetter ? 'var(--accent-green)' : 'var(--accent-red)'}">${llmAvg.toFixed(4)}</div>
      </div>
      <div style="flex:1;min-width:180px;padding:1rem;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border)">
        <div style="font-size:0.75rem;color:var(--text-secondary)">Market Avg Brier Score</div>
        <div style="font-size:1.4rem;font-weight:700;color:${!llmBetter ? 'var(--accent-green)' : 'var(--accent-red)'}">${mktAvg.toFixed(4)}</div>
      </div>
      <div style="flex:1;min-width:180px;padding:1rem;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border)">
        <div style="font-size:0.75rem;color:var(--text-secondary)">Verdict</div>
        <div style="font-size:1.2rem;font-weight:700;color:${llmBetter ? 'var(--accent-green)' : 'var(--accent-orange)'}">
          ${count === 0 ? 'Awaiting data' : llmBetter ? 'LLM beats market' : 'Market leads'}
        </div>
      </div>
    </div>`;

  container.innerHTML = html;
}

// === Per-Category Performance ===
function renderCategoryPerformance(rollingScores, llmPredictions, contractsData) {
  const container = document.querySelector('#llm-categories .section-content');
  if (!container) return;

  const catLookup = buildCategoryLookup(contractsData);

  const predsByCategory = {};
  if (llmPredictions && llmPredictions.predictions) {
    for (const p of llmPredictions.predictions) {
      const cat = catLookup[p.key] || 'other';
      if (!predsByCategory[cat]) predsByCategory[cat] = { count: 0, totalDiv: 0, sonnet: 0, haiku: 0 };
      predsByCategory[cat].count++;
      predsByCategory[cat].totalDiv += Math.abs(p.divergence || 0);
      if (p.tier === 'sonnet') predsByCategory[cat].sonnet++;
      else predsByCategory[cat].haiku++;
    }
  }

  const scoresByCategory = {};
  if (rollingScores) {
    for (const r of rollingScores) {
      const cat = catLookup[r.contract_key] || 'other';
      if (!scoresByCategory[cat]) scoresByCategory[cat] = { scored: 0, correct: 0, totalSE: 0 };
      scoresByCategory[cat].scored++;
      if (r.correct === true || r.correct === 'True') scoresByCategory[cat].correct++;
      scoresByCategory[cat].totalSE += (r.squared_error || 0);
    }
  }

  const allCats = new Set([...Object.keys(predsByCategory), ...Object.keys(scoresByCategory)]);

  if (allCats.size === 0) {
    container.innerHTML = '<div class="loading">No category data available yet.</div>';
    return;
  }

  let html = '<table><thead><tr><th>Category</th><th>Contracts</th><th>Avg Divergence</th><th>Sonnet / Haiku</th><th>Scored</th><th>Accuracy</th></tr></thead><tbody>';

  for (const cat of allCats) {
    const pred = predsByCategory[cat] || { count: 0, totalDiv: 0, sonnet: 0, haiku: 0 };
    const score = scoresByCategory[cat] || { scored: 0, correct: 0, totalSE: 0 };
    const avgDiv = pred.count > 0 ? (pred.totalDiv / pred.count * 100).toFixed(1) + '%' : '—';
    const acc = score.scored > 0 ? fmtPct(score.correct / score.scored) : '—';
    const catColor = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;

    html += `<tr>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${catColor};margin-right:6px;vertical-align:middle"></span>${cat}</td>
      <td>${pred.count}</td>
      <td>${avgDiv}</td>
      <td>${pred.sonnet} / ${pred.haiku}</td>
      <td>${score.scored}</td>
      <td>${acc}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

// === P&L Simulator ===
function renderPnLSimulator(rollingScores) {
  const container = document.querySelector('#llm-pnl .section-content');
  if (!container) return;

  if (!rollingScores || rollingScores.length === 0) {
    container.innerHTML = '<div class="loading">Need scored predictions to simulate P&L. Scores appear after contracts resolve.</div>';
    return;
  }

  const thresholds = [0.02, 0.05, 0.10, 0.15];
  const results = {};

  for (const threshold of thresholds) {
    let totalPnL = 0, bets = 0, wins = 0;

    for (const r of rollingScores) {
      // Only simulate P&L on binary contracts (multi-outcome betting is more complex)
      if (typeof r.prediction !== 'number' || typeof r.market_price !== 'number' || typeof r.outcome !== 'number') continue;

      const div = r.prediction - r.market_price;
      if (Math.abs(div) < threshold) continue;

      bets++;
      const betYes = div > 0;
      const price = betYes ? r.market_price : (1 - r.market_price);
      const won = betYes ? (r.outcome >= 0.5) : (r.outcome < 0.5);

      if (won) {
        totalPnL += (1 / price) - 1;
        wins++;
      } else {
        totalPnL -= 1;
      }
    }

    results[threshold] = { totalPnL, bets, wins };
  }

  let html = `
    <p style="color:var(--text-secondary);font-size:0.8rem;margin-bottom:1rem">
      Simulates $1 bets when LLM diverges from market by at least the threshold.
    </p>
    <table>
      <thead><tr>
        <th>Threshold</th><th>Bets Placed</th><th>Wins</th><th>Win Rate</th><th>Total P&L</th><th>ROI</th>
      </tr></thead><tbody>`;

  for (const t of thresholds) {
    const r = results[t];
    const winRate = r.bets > 0 ? fmtPct(r.wins / r.bets) : '—';
    const roi = r.bets > 0 ? fmtPct(r.totalPnL / r.bets) : '—';
    const pnlColor = r.totalPnL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

    html += `<tr>
      <td>${(t * 100).toFixed(0)}%</td>
      <td>${r.bets}</td>
      <td>${r.wins}</td>
      <td>${winRate}</td>
      <td style="color:${pnlColor};font-weight:600">$${r.totalPnL.toFixed(2)}</td>
      <td style="color:${pnlColor}">${roi}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}
