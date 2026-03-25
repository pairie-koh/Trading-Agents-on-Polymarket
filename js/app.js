// Main entry point — orchestrate data loading, tab switching, and rendering

// Tab switching
function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      buttons.forEach(b => b.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById('tab-' + tabId).classList.add('active');

      // Lazy-render charts when tab is shown (Chart.js needs visible canvas)
      if (tabId === 'deterministic' && !window._detChartsRendered && window._dashboardData) {
        const d = window._dashboardData;
        if (d.scoresHistory && d.scoresHistory.length > 0) {
          renderMSEChart(d.scoresHistory);
          renderScatterChart(d.scoresHistory);
        }
        window._detChartsRendered = true;
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();

  // Show loading state in all sections
  document.querySelectorAll('.section-content, .cards-grid, .contracts-grid, .briefing-content, .prediction-table').forEach(el => {
    el.innerHTML = '<div class="loading">Loading...</div>';
  });

  try {
    const data = await loadAllData();
    window._dashboardData = data;

    // === Header ===
    renderHeader(data.leaderboard);

    // === Tab 1: Deterministic Agents ===
    renderLeaderboard(data.leaderboard);
    renderAgentCards(data.scorecards);
    renderMarketBreakdown(data.leaderboard);

    if (data.scoresHistory && data.scoresHistory.length > 0) {
      renderPredictionTable(data.scoresHistory);
      // MSE and scatter charts are lazy-rendered when Deterministic tab is clicked
    }

    // === Tab 2: LLM Forecaster (default tab) ===
    renderLLMOverview(data.llmPredictions, data.rollingScores);
    renderLLMPredictions(data.llmPredictions);
    renderDivergenceChart(data.llmPredictions);
    renderRollingScores(data.rollingScores);
    window._llmChartsRendered = true;

    // === Tab 3: Contracts & Intel ===
    renderContracts(data.contracts);
    renderBriefing(data.briefing, data.state);

  } catch (err) {
    console.error('Dashboard load error:', err);
    document.querySelector('.tab-content.active').innerHTML =
      `<div class="error-message" style="margin:2rem">
        Failed to load dashboard data. Make sure you've run <code>python update_data.py</code> first.
        <br><br>Error: ${err.message}
      </div>`;
  }
});
