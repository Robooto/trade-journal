import { Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { TraceApiService } from './trace-api.service';
import { TracePaperState } from './trace-paper.state';

function harness() {
  const catalogs = [new Subject<any>(), new Subject<any>()];
  const scorecards = [new Subject<any>(), new Subject<any>()];
  const entries = new Subject<any>();
  const replay = new Subject<any>();
  const api = {
    paperCatalog: vi.fn().mockReturnValueOnce(catalogs[0]).mockReturnValueOnce(catalogs[1]),
    paperScorecard: vi.fn().mockReturnValueOnce(scorecards[0]).mockReturnValueOnce(scorecards[1]),
    paperReplayEntries: vi.fn(() => entries),
    paperReplay: vi.fn(() => replay),
  };
  const state = new TracePaperState(api as unknown as TraceApiService);
  return { state, api, catalogs, scorecards, entries, replay };
}

describe('TracePaperState', () => {
  it('keeps the latest range and catalog when earlier requests complete or fail late', () => {
    const { state, catalogs, scorecards } = harness();
    state.loadPaperScorecard('2026-09-14', '2026-09-18');
    state.loadPaperScorecard('2026-09-21', '2026-09-25');
    catalogs[1].next({ as_of: '2026-09-25' });
    scorecards[1].next({ from_date: '2026-09-21' });
    scorecards[1].complete();
    catalogs[0].next({ as_of: '2026-09-18' });
    scorecards[0].error(new HttpErrorResponse({ status: 503 }));
    expect(state.paperCatalog()?.as_of).toBe('2026-09-25');
    expect(state.paperScorecard()?.from_date).toBe('2026-09-21');
    expect(state.paperScorecardError()).toBeNull();
    expect(state.paperScorecardLoading()).toBe(false);
    state.destroy();
  });

  it('retains the chosen scorecard range when session discovery refreshes', () => {
    const { state, api } = harness();
    state.loadPaperScorecard('2026-09-14', '2026-09-18');
    state.loadForSessions(['2026-09-21', '2026-09-25']);
    expect(api.paperScorecard).toHaveBeenLastCalledWith('2026-09-14', '2026-09-18');
    state.destroy();
  });

  it('ignores old entries and replay after a session reset and releases requests on destruction', () => {
    const { state, catalogs, scorecards, entries, replay } = harness();
    state.loadPaperScorecard('2026-09-21', '2026-09-25');
    state.loadPaperReplayEntries('2026-09-25');
    state.loadPaperReplay('2026-09-25', 'capture');
    state.resetPaperReplay();
    entries.next({ entries: [{ capture_id: 'old' }] });
    replay.next({ entry_capture_id: 'old' });
    expect(state.paperReplayEntries()).toBeNull();
    expect(state.paperReplay()).toBeNull();
    state.destroy();
    for (const source of [catalogs[0], scorecards[0], entries, replay]) expect(source.observed).toBe(false);
    expect(state.paperScorecardLoading()).toBe(false);
  });
});
