# AI Prediction Market Trading Agent — Implementation Plan

An AI-powered recommendation system for political prediction markets on Kalshi. Built on the architecture described in Andy Hall's [original agent](https://freesystems.substack.com/p/can-ai-reason-about-politics-i-built), with targeted improvements to address the five core failure modes identified in that work.

## Background

The original agent pulls political contracts from Kalshi, searches for relevant news via GDELT, and uses tiered LLM analysis (Haiku → Sonnet → Opus) with an optional multi-model council debate to estimate probabilities and recommend trades. It works, but has five documented problems:

1. **Temporal confusion** — models think past events are future, confuse years, buy wrong-period contracts
2. **Probability inconsistency** — mutually exclusive outcomes don't sum to 100%, systematic overconfidence
3. **Missing political nuance** — shallow interpretation of news without engaging structural/institutional factors
4. **Lacking context + hallucination** — models fabricate "historical data" when they lack real evidence
5. **Cost** — running frontier models on hundreds of contracts is expensive

This plan describes 8 improvements: 7 fixes for the problems above, plus 1 new feature. Each was selected for high impact relative to implementation effort. Everything over-engineered or speculative was cut.

---

## Improvement 1: Overconfidence Shrinkage + Fee-Adjusted Edge

**Problem solved**: #2 (overconfidence)

**Priority**: 1st — highest impact, trivial to implement, no dependencies.

LLMs are systematically overconfident when estimating probabilities. Academic research on Kalshi prediction data confirms "systematic overconfidence across all models." This is the single highest-impact fix.

### Implementation

```python
def compute_adjusted_edge(
    agent_estimate: float,
    market_price: float,
    fee_rate: float = 0.03,
    shrinkage: float = 0.5,
    max_edge: float = 0.25
) -> dict:
    """
    Shrink the agent's estimate toward the market price, then subtract
    fees to get the real edge. A 3pp edge that costs 4pp in fees is a
    losing trade — this prevents that.
    """
    shrunk = market_price + shrinkage * (agent_estimate - market_price)
    raw_edge = shrunk - market_price
    fee_adjusted_edge = abs(raw_edge) - fee_rate

    # Flag unreasonably large edges for human review
    flagged = abs(raw_edge) > max_edge

    return {
        "raw_estimate": agent_estimate,
        "shrunk_estimate": round(shrunk, 3),
        "raw_edge": round(raw_edge, 3),
        "fee_adjusted_edge": round(fee_adjusted_edge, 3),
        "direction": "YES" if raw_edge > 0 else "NO",
        "profitable_after_fees": fee_adjusted_edge > 0,
        "flagged_for_review": flagged
    }
```

### Rules
- Default shrinkage factor: 0.5 (halve the distance to market price)
- Subtract Kalshi's fee from the claimed edge — only recommend trades where `fee_adjusted_edge > 0`
- Cap maximum raw edge at 25pp — anything larger is flagged for human review
- The shrinkage factor becomes tunable once calibration data accumulates (Improvement 3)

### Why 0.5?
Conservative starting point. If the agent is well-calibrated, shrinkage can be relaxed. If it's overconfident (likely), shrinkage should be tightened. The prediction log (Improvement 3) will tell us which.

---

## Improvement 2: Prompt Overhaul

**Problems solved**: #1 (temporal confusion), #2 (overconfidence), #3 (shallow reasoning), #4 (hallucination)

**Priority**: 2nd — addresses 4 of 5 problems with zero infrastructure.

Five changes to the analysis prompt. Zero extra API calls — just text.

### 2A. Temporal Context Block

Injected into every analysis prompt to prevent temporal confusion.

```
TODAY'S DATE: {date}
CONTRACT RESOLUTION DATE: {resolution_date}
DAYS UNTIL RESOLUTION: {days}
CONTRACT STATUS: ACTIVE — NOT YET RESOLVED

Any knowledge you have about this outcome from training data may be
outdated or reflect a different time period. Reason ONLY from the
evidence provided below.
```

### 2B. Market-Price Anchoring

Replaces the current open-ended "what's the probability?" with structured elicitation that anchors on the market price.

```
The current market price is {market_price}%. This reflects the aggregated
view of many informed participants.

1. List specific evidence the market is WRONG. For each piece:
   - What is the evidence?
   - Where does it come from? (provided data vs. your training knowledge)
   - How strong is it? (would a professional forecaster find this compelling?)
2. List evidence that SUPPORTS the current market price.
3. Given all evidence, provide your adjusted probability estimate.

IMPORTANT: If you cannot identify concrete evidence the market is wrong,
your estimate should be VERY CLOSE to the market price. Beating an
informed market requires genuine informational advantage, not vibes.
```

### 2C. Epistemic Humility Rules

Prevents the model from fabricating "historical data" it doesn't actually have.

```
EVIDENCE RULES:
- Never say "historical data shows X" unless that data was provided to you
  in the evidence below. If drawing on training knowledge, say: "Based on
  my general knowledge (which may be outdated): ..."
- If you lack specific evidence on this contract, say so explicitly. State
  what information you would need and how it would change your estimate.
```

### 2D. Resolution Rule Emphasis

Prevents misinterpretation of what triggers contract resolution.

```
RESOLUTION CRITERIA: This contract resolves YES if and only if:
{resolution_rule}

Pay close attention to the EXACT criteria. What specifically must happen
for YES? What is the source of truth for resolution?
```

### 2E. Longshot Bias Note

Corrects for a known prediction market inefficiency.

```
Note: Markets tend to underprice longshots (events at 5% resolve ~7-8%
of the time) and overprice favorites (events at 95% resolve ~92-93%).
Factor this into your analysis.
```

---

## Improvement 3: Prediction Logging

**Problem solved**: Enables measurement of all other improvements.

**Priority**: 3rd — produces no immediate value but everything downstream depends on it. Start collecting data as early as possible.

Without logging, every improvement is guesswork. This writes every prediction to SQLite so we can compute calibration metrics once contracts resolve.

### Schema

```sql
CREATE TABLE predictions (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL,
    contract_title TEXT,
    category TEXT,
    resolution_date TEXT,
    market_price REAL NOT NULL,
    raw_agent_estimate REAL NOT NULL,
    shrunk_estimate REAL NOT NULL,
    raw_edge REAL NOT NULL,
    fee_adjusted_edge REAL NOT NULL,
    model_used TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    reasoning TEXT,
    evidence_sources TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE resolutions (
    contract_id TEXT PRIMARY KEY,
    outcome TEXT NOT NULL,  -- 'YES' or 'NO'
    resolution_date TEXT NOT NULL,
    final_market_price REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_predictions_contract ON predictions(contract_id);
CREATE INDEX idx_predictions_model ON predictions(model_used);
CREATE INDEX idx_predictions_category ON predictions(category);
```

### Usage
- Log every prediction at analysis time
- Poll Kalshi periodically for resolved contracts and populate `resolutions`
- After 100+ resolved predictions: compute Brier scores, plot calibration curves, identify systematic biases in a Jupyter notebook
- Use results to tune the shrinkage factor (Improvement 1) and assess model-level performance

### What we're NOT building
No calibration dashboard yet. The data needs months to accumulate before charts are meaningful. Analyze in a notebook when the time comes.

---

## Improvement 4: Contract ID Verification

**Problem solved**: #1 (temporal confusion — specifically, recommending the wrong contract)

**Priority**: 4th — simple guard, no dependencies, prevents expensive mistakes from day one.

A programmatic guard that prevents the agent from recommending trades on the wrong contract. Prevents the class of error where a bot lost $100K buying the wrong week's contract.

### Implementation

```python
from datetime import datetime

def verify_contract(kalshi_client, contract_id: str, expected_period: str = None) -> bool:
    """
    Verify a contract is valid before surfacing a recommendation.
    Returns True if safe to recommend, False otherwise.
    """
    contract = kalshi_client.get_contract(contract_id)

    if contract.status != "active":
        return False

    if contract.resolution_date <= datetime.now():
        return False

    # For weekly/monthly contract families, verify correct period
    if expected_period and hasattr(contract, 'period'):
        if contract.period != expected_period:
            return False

    return True
```

### Rules
- Every recommendation must pass verification before being surfaced to the dashboard
- Log verification failures — they indicate the analysis pipeline targeted the wrong contract
- This is pure code, no AI involved

---

## Improvement 5: Mutually Exclusive Contract Consistency

**Problem solved**: #2 (probability inconsistency — the "40% + 70% in a two-candidate race" problem)

**Priority**: 5th — needs the pipeline running to have multiple estimates per event. Simple once it's there.

Shrinkage fixes overconfidence but doesn't enforce logical constraints across related contracts. If the model estimates 40% for Candidate A and 70% for Candidate B in a two-candidate race, those numbers are incoherent regardless of shrinkage.

### Implementation

```python
def enforce_consistency(estimates: dict[str, float]) -> dict[str, float]:
    """
    For mutually exclusive contracts in the same Kalshi event,
    normalize estimates to sum to 1.0.
    """
    total = sum(estimates.values())
    if abs(total - 1.0) > 0.05:  # more than 5pp off
        return {k: v / total for k, v in estimates.items()}
    return estimates
```

### How it works
- Kalshi groups contracts into events (e.g., "Who wins the House?" contains "Dem wins" + "GOP wins")
- After the model estimates probabilities for contracts in the same event, check if they sum to ~100%
- If not, normalize proportionally
- Log every normalization — high-frequency normalization for a specific model suggests that model handles joint probabilities poorly

### Scope
Only applies to contracts Kalshi explicitly groups together. We don't try to auto-detect hidden correlations across unrelated contracts — that's where the complexity explodes for minimal gain.

---

## Improvement 6: Web Search for Top Contracts

**Problems solved**: #3 (missing nuance), #4 (hallucination / lacking context)

**Priority**: 6th — the biggest quality improvement but requires integration work. Build after the core pipeline is stable.

The root cause of most analysis errors in the original agent was the model lacking current, relevant information and filling the gap with confident fabrication. The fix is giving top-tier contracts access to web search.

### Implementation
- Tier 2+ contracts (top ~50 after Haiku triage): use a web-search-enabled model or a tool-use agent to fetch current information before analysis
- The search results are summarized and injected as evidence into the analysis prompt
- This directly addresses errors like "Sleigh Ride is never in the top 10" (factual error) and "Labour has no chance" (missing structural context about FPTP)

### Why this instead of specialized data pipelines
The original plan proposed building 5 separate data pipelines (Congress.gov, FiveThirtyEight, Federal Register, etc.). Web search gets ~90% of the benefit at ~10% of the engineering effort. One integration instead of five. If a specific data source proves critical later, it can be added then.

### Cost consideration
Web search adds cost per contract. Reserve for Tier 2+ only (~50 contracts per run, not all 675).

---

## Improvement 7: Trigger-Based Re-Analysis

**Problem solved**: #5 (cost management)

**Priority**: 7th — cost optimization for sustained daily operation. Depends on prediction logging (Improvement 3) to know what was last analyzed.

Instead of re-analyzing every contract on a fixed daily schedule, only re-analyze when something has changed.

### Triggers for re-analysis
- **Market movement**: Market price moved >5 percentage points since last analysis
- **News spike**: GDELT detects a significant volume increase on keywords related to the contract
- **Time-based floor**: Re-analyze at most weekly for long-horizon contracts (>60 days to resolution)

### Incremental context
When re-analyzing, show the model its previous reasoning:
```
PREVIOUS ANALYSIS ({date}):
You estimated {prev_estimate}%. Market was {prev_market}%, now {curr_market}%.
New evidence since then: {new_evidence_summary}
Has anything changed that should update your estimate?
```

This is cheaper than a full re-analysis and produces more focused updates.

---

## Improvement 8: Resolution Countdown

**New feature** — increases monitoring intensity as contracts approach resolution.

**Priority**: 8th — extends trigger-based re-analysis (Improvement 7). Only matters once the system is operational with active recommendations.

Near-resolution contracts are where the sharpest edges exist. A contract resolving Friday that the agent last checked Monday is a missed opportunity. The final 48-72 hours before resolution are when information asymmetry is highest and the market is most likely to be stale.

### Implementation

Extend the trigger-based re-analysis (Improvement 7) with a time-to-resolution multiplier:

```python
def get_reanalysis_priority(contract, last_analysis_date) -> float:
    """
    Higher priority = more urgently needs re-analysis.
    """
    days_to_resolution = (contract.resolution_date - datetime.now()).days
    days_since_analysis = (datetime.now() - last_analysis_date).days

    # Base priority from market movement
    price_change = abs(contract.current_price - contract.price_at_last_analysis)
    base_priority = price_change

    # Resolution countdown multiplier
    if days_to_resolution <= 2:
        multiplier = 5.0    # check multiple times per day
    elif days_to_resolution <= 7:
        multiplier = 2.0    # check daily
    elif days_to_resolution <= 30:
        multiplier = 1.0    # check when triggered
    else:
        multiplier = 0.5    # check weekly at most

    # Staleness factor
    staleness = min(days_since_analysis / 7, 2.0)

    return base_priority * multiplier * staleness
```

### Rules
- Contracts resolving within 48 hours: re-analyze every few hours if the agent has a position or recommendation
- Contracts resolving within 7 days: re-analyze daily
- Contracts resolving within 30 days: re-analyze on triggers only
- Contracts resolving in 30+ days: re-analyze weekly at most
- The countdown applies to Tier 2+ contracts only

---

## What We're NOT Doing

| Idea | Why It Was Cut |
|---|---|
| Calibration dashboard | No data yet. Defer until 100+ resolved predictions accumulate. |
| LLM-based temporal validation layer | A regex catches obvious cases. A full LLM post-processor is overkill. |
| Causal event graphs | High engineering effort, unclear payoff over the temporal context prompt. |
| 5 specialized data pipelines | Web search (Improvement 6) gets 90% of the benefit at 10% of the effort. |
| Market inconsistency scanner | Doesn't improve the agent's analysis. Arbitrage scanning is a separate concern. |
| Decision tree reasoning templates | Requires domain expertise to build per contract type, constant maintenance. |
| Hierarchical reasoning model | The combination of shrinkage + market anchoring + web search already addresses shallow reasoning. HRM adds prompt bloat and checkbox-ticking risk for marginal gain. |
| Council restructuring | The original debate mechanism demonstrably helped (Sleigh Ride). Keep as-is, evaluate empirically. |
| Resolution rule parser module | Prompt emphasis (Improvement 2D) achieves the same thing without infrastructure. |
| Automated trade execution | Premature. The analysis layer is unproven. Keep human-in-the-loop. |
| Cost tracking dashboard | Use a spreadsheet until running at scale. |
| Portfolio correlation warnings | Nice to have, not material. Add later if needed. |
| News summarization before expensive models | Saves <$1/day. May lose important details that expensive models would catch. Not worth the complexity. |
| Price movement detector | Human-in-the-loop delay kills the speed advantage. Only suits fully automated systems. |
| Cross-contract conditional reasoning | Model struggles with basic probability; conditional dependencies are harder, unreliable output. |

---

## Implementation Order

| Priority | Improvement | Effort | What It Fixes | Dependencies |
|---|---|---|---|---|
| **1** | Overconfidence shrinkage + fee adjustment | ~15 LOC | Overconfidence, unprofitable recommendations | None |
| **2** | Prompt overhaul (temporal, anchoring, humility, resolution, longshot) | Text changes | Temporal confusion, overconfidence, hallucination, shallow reasoning | None |
| **3** | Prediction logging (SQLite) | ~50 LOC | Enables measurement of everything | None |
| **4** | Contract ID verification | ~10 LOC | Wrong-contract mistakes | None |
| **5** | Consistency enforcement | ~20 LOC | Probability incoherence across related contracts | Pipeline running |
| **6** | Web search for top contracts | Medium | Context gap, hallucination | Integration work |
| **7** | Trigger-based re-analysis | Medium | Cost optimization for daily operation | Prediction logging (3) |
| **8** | Resolution countdown | ~30 LOC | (New) Near-resolution edge capture | Trigger re-analysis (7) |

**Session 1** (items 1–4): Core fixes. No dependencies between these — all can be built independently.

**Session 2** (items 5–6): Consistency enforcement + web search. Requires the core pipeline from Session 1 to be running.

**Session 3** (items 7–8): Operational optimizations. Only matter once the system is running daily with active recommendations.

---

## Architecture Overview

```
Kalshi API ──→ Contract Fetcher ──→ All ~675 contracts
                                          │
                                          ▼
                                   Tier 0: Haiku
                                   (quick triage, rank all)
                                          │
                                    Top 50 by edge
                                          │
                                          ▼
                                   Tier 2: Sonnet
                                   (+ web search for context)
                                          │
                                    Top 15 by edge
                                          │
                                          ▼
                                   Tier 3: Opus
                                   (deep analysis)
                                          │
                                    Top 5 candidates
                                          │
                                          ▼
                              ┌── Council (optional) ────────┐
                              │   Multi-model debate          │
                              │   (user-initiated)            │
                              └──────────┬──────────────────┘
                                         │
                                         ▼
                              ┌── Validation ────────────────┐
                              │   Overconfidence shrinkage    │
                              │   Fee-adjusted edge calc      │
                              │   Consistency enforcement     │
                              │   Contract ID verification    │
                              │   Temporal regex check        │
                              │   Edge cap (25pp max)         │
                              └──────────┬──────────────────┘
                                         │
                                         ▼
                              ┌── Output ────────────────────┐
                              │   Dashboard recommendations   │
                              │   Prediction log (SQLite)     │
                              │   Resolution countdown alerts │
                              └──────────────────────────────┘
```

---

## Problem → Improvement Mapping

| Blog Problem | Improvements That Fix It | Coverage |
|---|---|---|
| #1 Temporal confusion | Prompt 2A + Contract ID verification (4) + regex check | Full |
| #2 Overconfidence | Shrinkage (1) + fee adjustment (1) + market anchoring (2B) + longshot bias (2E) | Full |
| #2b Probability incoherence | Consistency enforcement (5) | Full |
| #3 Missing political nuance | Web search (6) + shrinkage (1) + anchoring (2B) | Adequate |
| #4 Hallucination / no context | Web search (6) + epistemic humility (2C) | Full |
| #5 Cost | Trigger re-analysis (7) + resolution countdown (8) | Adequate |
| (New) Unprofitable recommendations | Fee-adjusted edge (1) | New fix |
| (New) Near-resolution edge | Resolution countdown (8) | New capability |

---

## Success Criteria

After 3+ months of operation with 100+ resolved predictions:

- **Calibration**: Agent's shrunk estimates should be better calibrated than raw estimates (Brier score comparison)
- **Edge detection**: When the agent claims >10pp fee-adjusted edge, it should be right more often than wrong
- **Consistency**: Zero instances of mutually exclusive contract estimates summing to >110% or <90%
- **Error reduction**: Zero wrong-contract recommendations (Improvement 4). Temporal confusion errors reduced by >80% vs baseline (Improvement 2A).
- **Profitability**: No recommendations where fee-adjusted edge is negative (Improvement 1)
- **Cost**: Daily operating cost under $50 for full pipeline run
