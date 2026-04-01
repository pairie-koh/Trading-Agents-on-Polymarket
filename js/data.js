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
    fetchJSON(DATA.contracts),                       // 0
    fetchJSON(DATA.briefing),                        // 1
    fetchJSON(DATA.state),                           // 2
    fetchJSON(DATA.llmPredictions),                  // 3
    fetchCSV(DATA.rollingScores),                    // 4
    fetchJSON(DATA.performanceSummary),              // 5
    fetchJSON(DATA.iterationLog),                     // 6
    fetchJSON(DATA.scoreboard),                        // 7
    fetchCSV(DATA.scoresHistory),                      // 8
  ]);

  const get = (i) => results[i].status === 'fulfilled' ? results[i].value : null;

  // Deduplicate rolling scores — the source CSV accumulates duplicates
  // across GitHub Actions runs. Key on (date, contract_key, timestamp).
  let rollingScores = get(4);
  if (rollingScores && rollingScores.length > 0) {
    const seen = new Set();
    rollingScores = rollingScores.filter(r => {
      const key = `${r.date}|${r.contract_key}|${r.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return {
    contracts: get(0),
    briefing: get(1),
    state: get(2),
    llmPredictions: get(3),
    rollingScores,
    performanceSummary: get(5),
    iterationLog: get(6),
    scoreboard: get(7),
    scoresHistory: get(8),
  };
}
