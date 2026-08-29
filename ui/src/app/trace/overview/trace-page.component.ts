import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, computed, effect, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { TraceFacade } from './data-access/trace.facade';
import { TraceContractStatus } from './trace.models';
import {
  TracePriceLevelKind,
  TracePriceLevelProximity,
  TracePriceLevelsStore,
  calculatePriceLevelProximities,
} from './trace-price-levels';

const ALERT_COOLDOWN_MS = 30 * 60 * 1000;
const TRACE_CAPTURE_INTERVAL_MINUTES = 10;
const TRACE_CAPTURE_MINUTE_OFFSET = 1;
const TRACE_REFRESH_DELAY_MINUTES = 1;

@Component({
  selector: 'app-trace-page',
  templateUrl: './trace-page.component.html',
  styleUrls: ['./trace-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class TracePageComponent implements OnInit, OnDestroy {
  priceLevelPrice: number | null = null;
  priceLevelLabel = '';
  priceLevelColor = '#fbbf24';
  priceLevelKind: TracePriceLevelKind = 'unclassified';

  private readonly alertState = new Map<string, { armed: boolean; lastAlertedAt: number | null }>();
  private autoRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private autoRefreshPending = false;

  readonly lastRefreshRequestedAt = signal<Date | null>(null);
  readonly nextAutoRefreshAt = signal<Date | null>(null);

  constructor(
    readonly facade: TraceFacade,
    readonly priceLevels: TracePriceLevelsStore,
    private readonly snackBar: MatSnackBar,
  ) {
    effect(() => this.updateProximityAlerts(this.priceLevelProximities()));
  }

  ngOnInit(): void {
    this.facade.loadSessions();
    this.lastRefreshRequestedAt.set(new Date());
    this.scheduleNextAutoRefresh();
  }

  ngOnDestroy(): void {
    this.clearAutoRefreshTimer();
  }

  refreshNow(): void {
    this.requestRefresh();
    this.scheduleNextAutoRefresh();
  }

  readonly selectedSessionDate = computed(() => parseSessionDate(this.facade.selectedDate()));

  readonly priceLevelProximities = computed<readonly TracePriceLevelProximity[]>(() => {
    const rows = this.facade.captureRows();
    const index = this.facade.selectedCaptureIndex();
    return calculatePriceLevelProximities(
      this.priceLevels.levels(),
      this.facade.selectedCapture()?.spot,
      rows[index - 1]?.spot,
    );
  });

  readonly displayedPriceLevels = computed(() => {
    const proximityById = new Map(this.priceLevelProximities().map(level => [level.id, level]));
    return this.priceLevels.levels().map(level => proximityById.get(level.id) ?? level);
  });

  readonly nearbyPriceLevels = computed(() =>
    this.priceLevelProximities().filter(level => level.proximityState !== 'far'),
  );

  readonly sessionDateFilter = (date: Date | null): boolean => {
    const sessionDate = formatSessionDate(date);
    return Boolean(sessionDate && this.facade.sessions().some(session => session.date === sessionDate));
  };

  selectSessionDate(date: Date | null): void {
    const sessionDate = formatSessionDate(date);
    if (sessionDate && this.facade.sessions().some(session => session.date === sessionDate)) {
      this.facade.selectDate(sessionDate);
    }
  }

  selectCapture(value: string | number): void {
    this.facade.selectCapture(Number(value));
  }

  selectCaptureTimestamp(timestamp: string): void {
    const index = this.facade.captureRows().findIndex(row => row.ts === timestamp);
    if (index >= 0) this.facade.selectCapture(index);
  }

  addPriceLevel(): void {
    const price = Number(this.priceLevelPrice);
    if (!Number.isFinite(price) || price <= 0) return;
    this.priceLevels.add(price, this.priceLevelLabel, this.priceLevelColor, this.priceLevelKind);
    this.priceLevelPrice = null;
    this.priceLevelLabel = '';
  }

  removePriceLevel(id: string): void {
    this.priceLevels.remove(id);
  }

  @HostListener('document:keydown', ['$event'])
  handleTimelineKeydown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') ||
      isInteractiveTarget(event.target) ||
      !this.facade.captureRows().length
    ) {
      return;
    }

    event.preventDefault();
    this.facade.stepCapture(event.key === 'ArrowLeft' ? -1 : 1);
  }

  @HostListener('document:visibilitychange')
  handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') return;
    const nextRefresh = this.nextAutoRefreshAt();
    if (this.autoRefreshPending || !nextRefresh || Date.now() >= nextRefresh.getTime()) {
      this.autoRefreshPending = false;
      this.requestRefresh();
      this.scheduleNextAutoRefresh();
    }
  }

  statusClass(status: TraceContractStatus | 'unavailable'): string {
    return `trace-status--${status.replace('_', '-')}`;
  }


  formatTimestamp(value: string | null | undefined): string {
    if (!value) return 'Unavailable';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(parsed);
  }

  formatRefreshTime(value: Date | null): string {
    if (!value) return 'Waiting for tab';
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }).format(value);
  }

  priceLevelKindLabel(kind: TracePriceLevelKind): string {
    if (kind === 'positive_gamma') return 'Positive gamma';
    if (kind === 'negative_gamma') return 'Negative gamma';
    return 'Unclassified';
  }

  proximityStateLabel(level: TracePriceLevelProximity): string {
    if (level.proximityState === 'touch') return 'Touch';
    if (level.proximityState === 'near') return 'Near';
    return 'Watch';
  }

  approachLabel(level: TracePriceLevelProximity): string {
    return level.approachDirection.replace('_', ' ');
  }

  proximityContext(kind: TracePriceLevelKind): string {
    if (kind === 'positive_gamma') return 'Potential pause / rejection zone';
    if (kind === 'negative_gamma') return 'Elevated breach / acceleration risk';
    return 'Marked gamma structure nearby';
  }

  private updateProximityAlerts(levels: readonly TracePriceLevelProximity[]): void {
    const rows = this.facade.captureRows();
    if (!rows.length || this.facade.selectedCaptureIndex() !== rows.length - 1) return;

    const activeIds = new Set(levels.map(level => level.id));
    for (const id of this.alertState.keys()) {
      if (!activeIds.has(id)) this.alertState.delete(id);
    }

    const now = Date.now();
    for (const level of levels) {
      const state = this.alertState.get(level.id) ?? { armed: true, lastAlertedAt: null };
      if (level.distancePoints > 8) {
        this.alertState.set(level.id, { ...state, armed: true });
        continue;
      }
      if (level.distancePoints > 5 || !state.armed) {
        this.alertState.set(level.id, state);
        continue;
      }
      if (state.lastAlertedAt !== null && now - state.lastAlertedAt < ALERT_COOLDOWN_MS) {
        this.alertState.set(level.id, { ...state, armed: false });
        continue;
      }

      this.alertState.set(level.id, { armed: false, lastAlertedAt: now });
      const message = level.label + ' ' + formatLevelPrice(level.price)
        + ' · ' + level.distancePoints.toFixed(1) + ' pts · ' + this.proximityContext(level.kind);
      this.snackBar.open(
        message,
        'Dismiss',
        { duration: 7000, politeness: 'polite', panelClass: ['gamma-proximity-snackbar'] },
      );
    }
  }

  private requestRefresh(now = new Date()): void {
    this.lastRefreshRequestedAt.set(now);
    this.facade.reload();
  }

  private scheduleNextAutoRefresh(now = new Date()): void {
    this.clearAutoRefreshTimer();
    const nextRefresh = nextTraceAutoRefreshAt(now);
    this.nextAutoRefreshAt.set(nextRefresh);
    this.autoRefreshTimer = setTimeout(() => {
      this.autoRefreshTimer = null;
      if (document.visibilityState === 'hidden') {
        this.autoRefreshPending = true;
        this.nextAutoRefreshAt.set(null);
        return;
      }
      this.requestRefresh();
      this.scheduleNextAutoRefresh();
    }, Math.max(0, nextRefresh.getTime() - now.getTime()));
  }

  private clearAutoRefreshTimer(): void {
    if (this.autoRefreshTimer !== null) clearTimeout(this.autoRefreshTimer);
    this.autoRefreshTimer = null;
  }
}

export function nextTraceAutoRefreshAt(now: Date): Date {
  const next = new Date(now);
  next.setMilliseconds(0);
  next.setSeconds(0);
  const refreshMinuteOffset = TRACE_CAPTURE_MINUTE_OFFSET + TRACE_REFRESH_DELAY_MINUTES;
  const minutesSinceRefreshOffset = next.getMinutes() - refreshMinuteOffset;
  const intervalsElapsed = Math.floor(minutesSinceRefreshOffset / TRACE_CAPTURE_INTERVAL_MINUTES);
  next.setMinutes(refreshMinuteOffset + (intervalsElapsed + 1) * TRACE_CAPTURE_INTERVAL_MINUTES);
  return next;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, select, textarea, button, a, [contenteditable="true"]'));
}

function parseSessionDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function formatSessionDate(value: Date | null): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLevelPrice(price: number): string {
  return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
