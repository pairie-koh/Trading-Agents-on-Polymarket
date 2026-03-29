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

      // Lazy-render LLM charts when tab is first shown (Chart.js needs visible canvas)
      if (tabId === 'llm' && !window._llmChartsRendered && window._dashboardData) {
        const d = window._dashboardData;
        renderDivergenceChart(d.llmPredictions);
        renderCalibrationChart(d.rollingScores);
        window._llmChartsRendered = true;
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();

  // Show loading state in all sections
  document.querySelectorAll('.section-content, .contracts-grid, .briefing-content').forEach(el => {
    el.innerHTML = '<div class="loading">Loading...</div>';
  });

  try {
    const data = await loadAllData();
    window._dashboardData = data;

    // === Header ===
    renderHeaderFromLLM(data.llmPredictions);

    // === LLM Forecaster ===
    renderPerformanceSummary(data.performanceSummary, data.iterationLog);
    renderLLMOverview(data.llmPredictions, data.rollingScores);
    renderLLMPredictions(data.llmPredictions);
    renderLLMvsMarket(data.rollingScores, data.contracts);
    renderCategoryPerformance(data.rollingScores, data.llmPredictions, data.contracts);
    renderPnLSimulator(data.rollingScores);
    renderRollingScores(data.rollingScores);
    // Charts are lazy-rendered when LLM tab is clicked (canvas must be visible)

    // === Contracts & Intel ===
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
