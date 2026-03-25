"""
Copy data files from local oracle-lab repo into dashboard data/ folder.
Run this before committing to update the dashboard with fresh data.

Usage: python update_data.py
"""
import shutil
import json
import glob
import os

ORACLE_LAB = os.path.join(os.path.dirname(__file__), '..', 'oracle-lab')
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')

os.makedirs(DATA_DIR, exist_ok=True)

COPIES = {
    'scoreboard/latest.json': 'leaderboard.json',
    'agents/momentum/scorecard.json': 'momentum_scorecard.json',
    'agents/historian/scorecard.json': 'historian_scorecard.json',
    'agents/game_theorist/scorecard.json': 'game_theorist_scorecard.json',
    'agents/quant/scorecard.json': 'quant_scorecard.json',
    'scores_history.csv': 'scores_history.csv',
    'contracts/active_contracts.json': 'active_contracts.json',
    'briefings/latest.json': 'briefing.json',
    'state/current.json': 'state.json',
    'price_history/prices.csv': 'prices.csv',
    'rolling_scores_history.csv': 'rolling_scores.csv',
}

copied = 0
for src_rel, dst_name in COPIES.items():
    src = os.path.join(ORACLE_LAB, src_rel)
    dst = os.path.join(DATA_DIR, dst_name)
    if os.path.exists(src):
        shutil.copy2(src, dst)
        print(f"  {src_rel} -> data/{dst_name}")
        copied += 1
    else:
        print(f"  SKIP (not found): {src_rel}")

# Copy latest LLM predictions file
pred_files = sorted(glob.glob(os.path.join(ORACLE_LAB, 'llm_predictions', 'predictions_*.json')))
if pred_files:
    latest = pred_files[-1]
    dst = os.path.join(DATA_DIR, 'llm_predictions.json')
    shutil.copy2(latest, dst)
    print(f"  {os.path.basename(latest)} -> data/llm_predictions.json")
    copied += 1

print(f"\nDone. Copied {copied} files to data/")
