import type { PaperResearchScorecard } from './generated/research-contracts';

const base: PaperResearchScorecard = {
  "schema_version": "paper-research-scorecard.v1",
  "date": "2026-10-13",
  "as_of": "2026-10-13T06:00:05-07:00",
  "status": "not_scheduled",
  "attention_reasons": [],
  "session_ended": false,
  "sources": {
    "width_candidates": "missing_store",
    "width_cycles": "missing_store",
    "observations": "missing_store",
    "width_gaps": "missing_store",
    "research_requests": "missing_store",
    "research_request_state": "missing_store",
    "research_runs": "missing_store"
  },
  "source_signal_coverage": {
    "expected_elapsed_slots": 0,
    "missing_slots": 0,
    "invalid_slots": 0,
    "complete_session": false
  },
  "paired_common_entries": 0,
  "widths": [],
  "capacity_gap_count": 0,
  "runtime": {
    "last_tick_started_at": null,
    "maximum_tick_seconds": null
  },
  "requests": {
    "used": 0,
    "maximum_daily_requests": 500,
    "failed": 0,
    "pending": 0,
    "maximum_duration_seconds": null,
    "maximum_quote_symbols": null,
    "blocked_reasons": []
  },
  "config_sha256": "fcf23c8a79d3d865e6688551400268261f5d3c3b5ff7ba760d312c17822cf23b",
  "input_rows_sha256": "a176806690f3c229bf513fd57a4fd6d4f654e06635e0c84d5ac57b4aeba0a07f",
  "automatic_promotion": false,
  "order_submission_enabled": false,
  "health_definition": "Capture and quote integrity only. Trading profits and losses do not set collection health."
};

export function researchScorecardForTest(date = base.date, changes: Partial<PaperResearchScorecard> = {}): PaperResearchScorecard {
  return { ...base, date, ...changes };
}
