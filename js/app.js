// Main entry point — orchestrate data loading and rendering

document.addEventListener('DOMContentLoaded', async () => {
  // Show loading state in all sections
  document.querySelectorAll('.section-content, .cards-grid, .contracts-grid, .briefing-content, .prediction-table').forEach(el => {
    el.innerHTML = '<div class="loading">Loading...</div>';
  });

  try {
    const data = await loadAllData();

    // Header
    renderHeader(data.leaderboard);

    // Leaderboard
    renderLeaderboard(data.leaderboard);

    // Agent cards
    renderAgentCards(data.scorecards);

    // Per-market breakdown
    renderMarketBreakdown(data.leaderboard);

    // Charts (need chart.js date adapter for time scale)
    if (data.scoresHistory && data.scoresHistory.length > 0) {
      renderMSEChart(data.scoresHistory);
      renderScatterChart(data.scoresHistory);
      renderPredictionTable(data.scoresHistory);
    }

    // Contracts
    renderContracts(data.contracts);

    // Briefing
    renderBriefing(data.briefing, data.state);

    // LLM Predictions
    renderLLMPredictions(data.llmPredictions);

  } catch (err) {
    console.error('Dashboard load error:', err);
    document.querySelector('main').innerHTML =
      `<div class="error-message" style="margin:2rem">
        Failed to load dashboard data. Make sure you've run <code>python update_data.py</code> first.
        <br><br>Error: ${err.message}
      </div>`;
  }
});
