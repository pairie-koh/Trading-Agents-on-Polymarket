// Data fetching and parsing layer

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function fetchCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const text = await res.text();
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => resolve(results.data),
      error: (err) => reject(err),
    });
  });
}

async function loadAllData() {
  const results = await Promise.allSettled([
    fetchJSON(DATA.leaderboard),                   // 0
    fetchJSON(DATA.scorecards.momentum),            // 1
    fetchJSON(DATA.scorecards.historian),            // 2
    fetchJSON(DATA.scorecards.game_theorist),        // 3
    fetchJSON(DATA.scorecards.quant),                // 4
    fetchCSV(DATA.scoresHistory),                    // 5
    fetchJSON(DATA.contracts),                       // 6
    fetchJSON(DATA.briefing),                        // 7
    fetchJSON(DATA.state),                           // 8
    fetchCSV(DATA.prices),                           // 9
    fetchJSON(DATA.llmPredictions),                  // 10
    fetchCSV(DATA.rollingScores),                     // 11
  ]);

  const get = (i) => results[i].status === 'fulfilled' ? results[i].value : null;

  return {
    leaderboard: get(0),
    scorecards: {
      momentum: get(1),
      historian: get(2),
      game_theorist: get(3),
      quant: get(4),
    },
    scoresHistory: get(5),
    contracts: get(6),
    briefing: get(7),
    state: get(8),
    prices: get(9),
    llmPredictions: get(10),
    rollingScores: get(11),
  };
}

// Group scores_history rows by agent
function groupByAgent(rows) {
  const groups = {};
  for (const row of rows) {
    const agent = row.agent;
    if (!groups[agent]) groups[agent] = [];
    groups[agent].push(row);
  }
  // Sort each group by timestamp
  for (const agent of Object.keys(groups)) {
    groups[agent].sort((a, b) => a.timestamp - b.timestamp);
  }
  return groups;
}

// Compute rolling average MSE
function rollingMSE(rows, window = 5) {
  const result = [];
  for (let i = 0; i < rows.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = rows.slice(start, i + 1);
    const avg = slice.reduce((s, r) => s + r.squared_error, 0) / slice.length;
    result.push({ timestamp: rows[i].timestamp, mse: avg });
  }
  return result;
}
