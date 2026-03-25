// Data paths (relative to index.html)
const DATA = {
  leaderboard: 'data/leaderboard.json',
  scorecards: {
    momentum: 'data/momentum_scorecard.json',
    historian: 'data/historian_scorecard.json',
    game_theorist: 'data/game_theorist_scorecard.json',
    quant: 'data/quant_scorecard.json',
  },
  scoresHistory: 'data/scores_history.csv',
  contracts: 'data/active_contracts.json',
  briefing: 'data/briefing.json',
  state: 'data/state.json',
  prices: 'data/prices.csv',
  rollingScores: 'data/rolling_scores.csv',
  llmPredictions: 'data/llm_predictions.json',
};

// Agent display config
const AGENTS = {
  momentum: { label: 'Momentum', color: '#58a6ff', fill: 'rgba(88,166,255,0.15)' },
  historian: { label: 'Historian', color: '#3fb950', fill: 'rgba(63,185,80,0.15)' },
  game_theorist: { label: 'Game Theorist', color: '#d29922', fill: 'rgba(210,153,34,0.15)' },
  quant: { label: 'Quant', color: '#bc8cff', fill: 'rgba(188,140,255,0.15)' },
  naive_baseline: { label: 'Naive Baseline', color: '#8b949e', fill: 'rgba(139,148,158,0.1)' },
};

// Formatting utilities
function fmtMSE(val) {
  if (val == null || isNaN(val)) return '—';
  if (val < 0.001) return val.toExponential(2);
  return val.toFixed(6);
}

function fmtPct(val) {
  if (val == null || isNaN(val)) return '—';
  return (val * 100).toFixed(1) + '%';
}

function fmtVolume(vol) {
  if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
  if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
  return vol.toFixed(0);
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtTimestamp(epoch) {
  return new Date(epoch * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

function agentLabel(name) {
  return AGENTS[name]?.label || name.replace(/_/g, ' ');
}

function agentColor(name) {
  return AGENTS[name]?.color || '#8b949e';
}
