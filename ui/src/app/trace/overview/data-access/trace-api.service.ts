import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { PaperLedgerResponse } from '../components/paper-ledger/paper-ledger.component';

import {
  TraceGammaContextResponse,
  TraceGammaProfileResponse,
  TraceHistogramResponse,
  TraceIntradayContextResponse,
  TracePaperReplayResponse,
  TracePaperReplayEntriesResponse,
  TracePaperScorecardResponse,
  TraceRealizedVolatilityResponse,
  TraceResearchStatusResponse,
  TraceSessionsResponse,
  TraceSnapshotResponse,
  TraceSummaryResponse,
  TraceTimeseriesResponse,
} from '../trace.models';
import {
  Spx0DteDecisionJournalResponse,
  Spx0DteHumanDecision,
  Spx0DteHumanDecisionCreate,
  Spx0DteHumanDecisionList,
} from '../components/decision-journal/decision-journal.models';

@Injectable({ providedIn: 'root' })
export class TraceApiService {
  private readonly baseUrl = '/research-api/api/trace';

  constructor(private readonly http: HttpClient) {}

  sessions(): Observable<TraceSessionsResponse> {
    return this.http.get<TraceSessionsResponse>(`${this.baseUrl}/sessions`);
  }

  researchStatus(): Observable<TraceResearchStatusResponse> {
    return this.http.get<TraceResearchStatusResponse>(`${this.baseUrl}/research-status`);
  }

  summary(date: string): Observable<TraceSummaryResponse> {
    return this.http.get<TraceSummaryResponse>(`${this.sessionUrl(date)}/summary`);
  }

  timeseries(date: string): Observable<TraceTimeseriesResponse> {
    return this.http.get<TraceTimeseriesResponse>(`${this.sessionUrl(date)}/timeseries`);
  }

  histogram(date: string): Observable<TraceHistogramResponse> {
    return this.http.get<TraceHistogramResponse>(`${this.sessionUrl(date)}/histogram-map`);
  }

  gammaContext(date: string): Observable<TraceGammaContextResponse> {
    return this.http.get<TraceGammaContextResponse>(`${this.sessionUrl(date)}/gamma-context`);
  }

  realizedVolatility(date: string): Observable<TraceRealizedVolatilityResponse> {
    return this.http.get<TraceRealizedVolatilityResponse>(
      `${this.sessionUrl(date)}/realized-volatility`,
    );
  }

  paperScorecard(fromDate?: string, toDate?: string, limit = 90): Observable<TracePaperScorecardResponse> {
    let params = new HttpParams().set('limit', String(limit));
    if (fromDate) params = params.set('from_date', fromDate);
    if (toDate) params = params.set('to_date', toDate);
    return this.http.get<TracePaperScorecardResponse>(`${this.baseUrl}/paper-scorecard`, { params });
  }

  paperTrades(fromDate: string, toDate: string, filters: Record<string, string>): Observable<PaperLedgerResponse> {
    let params = new HttpParams().set('from_date', fromDate).set('to_date', toDate);
    for (const [key, value] of Object.entries(filters)) if (value) params = params.set(key, value);
    return this.http.get<PaperLedgerResponse>(`${this.baseUrl}/paper-trades`, { params });
  }

  paperReplay(date: string, captureId: string, entryCaptureId?: string, strategyId?: string): Observable<TracePaperReplayResponse> {
    let params = new HttpParams().set('capture_id', captureId);
    if (entryCaptureId) params = params.set('entry_capture_id', entryCaptureId);
    if (strategyId) params = params.set('strategy_id', strategyId);
    return this.http.get<TracePaperReplayResponse>(`${this.sessionUrl(date)}/paper-replay`, { params });
  }

  paperReplayEntries(date: string): Observable<TracePaperReplayEntriesResponse> {
    return this.http.get<TracePaperReplayEntriesResponse>(`${this.sessionUrl(date)}/paper-replay-entries`);
  }

  gammaProfile(
    date: string,
    ts: string,
    windowPoints = 60,
  ): Observable<TraceGammaProfileResponse> {
    const params = new HttpParams()
      .set('ts', ts)
      .set('window_points', String(windowPoints));
    return this.http.get<TraceGammaProfileResponse>(
      `${this.sessionUrl(date)}/gamma-profile`,
      { params },
    );
  }

  snapshot(date: string, ts: string): Observable<TraceSnapshotResponse> {
    const params = new HttpParams().set('ts', ts);
    return this.http.get<TraceSnapshotResponse>(
      `${this.sessionUrl(date)}/snapshot`,
      { params },
    );
  }

  intradayContext(
    date: string,
    ts: string | null = null,
    windowRows = 6,
  ): Observable<TraceIntradayContextResponse> {
    let params = new HttpParams().set('window_rows', String(windowRows));
    if (ts) params = params.set('ts', ts);
    return this.http.get<TraceIntradayContextResponse>(
      `${this.sessionUrl(date)}/intraday-context`,
      { params },
    );
  }

  decisionJournal(date: string, ts: string): Observable<Spx0DteDecisionJournalResponse> {
    const params = new HttpParams().set('ts', ts);
    return this.http.get<Spx0DteDecisionJournalResponse>(
      this.sessionUrl(date) + '/0dte-decision-journal', { params },
    );
  }

  human0DteDecision(date: string, captureId: string): Observable<Spx0DteHumanDecisionList> {
    const params = new HttpParams()
      .set('session_date', date)
      .set('capture_id', captureId);
    return this.http.get<Spx0DteHumanDecisionList>('/v1/0dte-decisions', { params });
  }

  createHuman0DteDecision(payload: Spx0DteHumanDecisionCreate): Observable<Spx0DteHumanDecision> {
    return this.http.post<Spx0DteHumanDecision>('/v1/0dte-decisions', payload);
  }

  private sessionUrl(date: string): string {
    return `${this.baseUrl}/${encodeURIComponent(date.trim())}`;
  }
}
