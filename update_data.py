"""
Copy data files from local oracle-lab repo into dashboard data/ folder,
then generate an LLM performance summary using Claude Haiku via OpenRouter.

Usage: python update_data.py
       OPENROUTER_API_KEY=... python update_data.py  (if not already set)
"""
import shutil
import json
import glob
import csv
import os
import requests

ORACLE_LAB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'oracle-lab')
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

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


def copy_data():
    """Copy data files from oracle-lab into the dashboard data/ folder."""
    os.makedirs(DATA_DIR, exist_ok=True)

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


# ── Generate LLM Performance Summary ─────────────────────────────────────────

def generate_summary():
    """Call Claude Haiku via OpenRouter to write a narrative performance summary."""
    os.makedirs(DATA_DIR, exist_ok=True)

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("\n  SKIP summary: OPENROUTER_API_KEY not set")
        return

    print("\nGenerating LLM performance summary...")

    # Load available data
    metrics = {}
    pred_timestamp = ""

    # LLM predictions
    pred_path = os.path.join(DATA_DIR, "llm_predictions.json")
    if os.path.exists(pred_path):
        with open(pred_path) as f:
            pred_data = json.load(f)
        preds = pred_data.get("predictions", [])
        metrics["total_predictions"] = len(preds)
        metrics["timestamp"] = pred_data.get("timestamp", "unknown")
        pred_timestamp = pred_data.get("timestamp", "")

        sonnet = [p for p in preds if p.get("tier") == "sonnet"]
        haiku = [p for p in preds if p.get("tier") == "haiku"]
        metrics["sonnet_count"] = len(sonnet)
        metrics["haiku_count"] = len(haiku)

        divs = [abs(p.get("divergence", 0)) for p in preds if isinstance(p.get("divergence"), (int, float))]
        if divs:
            metrics["avg_divergence"] = round(sum(divs) / len(divs), 4)
            metrics["max_divergence"] = round(max(divs), 4)

        # Top divergent contracts
        sorted_preds = sorted(preds, key=lambda p: abs(p.get("divergence", 0)), reverse=True)
        metrics["top_divergent"] = [
            {"question": p.get("question", ""), "divergence": round(p.get("divergence", 0), 4),
             "market": round(p.get("market_price", 0), 4), "prediction": round(p.get("shrunk_prediction", 0), 4),
             "tier": p.get("tier", "")}
            for p in sorted_preds[:5]
        ]

    # Rolling scores
    scores_path = os.path.join(DATA_DIR, "rolling_scores.csv")
    if os.path.exists(scores_path):
        with open(scores_path, newline="") as f:
            rows = list(csv.DictReader(f))
        metrics["scored_count"] = len(rows)
        correct = sum(1 for r in rows if r.get("correct") in ("True", "true", True))
        metrics["correct_count"] = correct
        if rows:
            metrics["accuracy"] = round(correct / len(rows), 4)
            ses = [float(r["squared_error"]) for r in rows if r.get("squared_error")]
            if ses:
                metrics["avg_brier"] = round(sum(ses) / len(ses), 4)

    # Contracts
    contracts_path = os.path.join(DATA_DIR, "active_contracts.json")
    if os.path.exists(contracts_path):
        with open(contracts_path) as f:
            contracts_data = json.load(f)
        contracts = contracts_data.get("contracts", [])
        metrics["total_contracts"] = len(contracts)
        cats = {}
        for c in contracts:
            cat = c.get("category", "other")
            cats[cat] = cats.get(cat, 0) + 1
        metrics["categories"] = cats

    prompt = f"""You are the performance analyst for Oracle Lab, an AI geopolitical forecasting system.
Write a concise, insightful 3-5 paragraph performance summary based on the metrics below.

METRICS:
{json.dumps(metrics, indent=2)}

GUIDELINES:
- Write in first person plural ("we", "our system")
- Be analytical and honest — highlight both strengths and weaknesses
- Reference specific numbers (divergence %, accuracy, Brier scores)
- If scored predictions are few or zero, acknowledge the system is early-stage and focus on the prediction profile
- Comment on the tier split (Sonnet vs Haiku) and what it implies about contract complexity
- Mention the most divergent contracts by name — these represent our biggest bets against the market
- Keep it under 300 words
- Use a professional but engaging tone — imagine you're writing for a research lab blog
- Do NOT use markdown headers or bullet points. Just flowing paragraphs.
- End with a forward-looking sentence about what to watch for next."""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/oracle-lab-dashboard",
        "X-Title": "Oracle Lab Dashboard",
    }
    payload = {
        "model": "anthropic/claude-haiku-4.5",
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": prompt}],
    }

    try:
        resp = requests.post("https://openrouter.ai/api/v1/chat/completions",
                             headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        summary_text = resp.json()["choices"][0]["message"]["content"]

        summary_obj = {
            "summary": summary_text,
            "generated_at": pred_timestamp,
            "metrics_snapshot": metrics,
        }

        out_path = os.path.join(DATA_DIR, "performance_summary.json")
        with open(out_path, "w") as f:
            json.dump(summary_obj, f, indent=2)
        print(f"  Summary saved to data/performance_summary.json ({len(summary_text)} chars)")

    except Exception as e:
        print(f"  ERROR generating summary: {e}")
        # Write a fallback so dashboard still renders
        fallback = {
            "summary": "Performance summary unavailable — LLM call failed. Run update_data.py with OPENROUTER_API_KEY set to generate.",
            "generated_at": "",
            "metrics_snapshot": metrics,
        }
        out_path = os.path.join(DATA_DIR, "performance_summary.json")
        with open(out_path, "w") as f:
            json.dump(fallback, f, indent=2)


if __name__ == "__main__":
    copy_data()
    generate_summary()
