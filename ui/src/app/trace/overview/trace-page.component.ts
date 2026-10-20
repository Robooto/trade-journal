import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, computed, effect, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';

import { TraceFacade } from './data-access/trace.facade';
import { TraceContractStatus } from './trace.models';
import {
  PRICE_LEVEL_LABELS,
  TracePriceLevelProximity,
  TracePriceLevelsStore,
  calculatePriceLevelProximities,
} from './trace-price-levels';

const ALERT_COOLDOWN_MS = 30 * 60 * 1000;
/** How often the page asks the pipeline whether a new TRACE capture has landed. */
const LIVE_CHECK_MS = 30_000;
/** Pacific hours with captures, padded for the first capture and the 13:00 close. */
const SESSION_START = '06:15';
const SESSION_END = '13:20';

@Component({
  selector: 'app-trace-page',
  templateUrl: './trace-page.component.html',
  styleUrls: ['./trace-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class TracePageComponent implements OnInit, OnDestroy {
  activeWorkspaceTab: 'trace' | 'paper' | 'research' = 'trace';
  priceLevelPrice: number | null = null;
  editingPriceLevelId: string | null = null;
  priceLevelLabel: string = PRICE_LEVEL_LABELS[0];
  priceLevelColor = '#fbbf24';

  private readonly alertState = new Map<string, { armed: boolean; lastAlertedAt: number | null }>();
  private liveTimer: ReturnType<typeof setTimeout> | null = null;
  private liveRequest?: Subscription;

  readonly lastRefreshRequestedAt = signal<Date | null>(null);
  readonly lastCheckedAt = signal<Date | null>(null);
  /** live: checking every 30 s; paused: tab hidden; closed: outside session hours. */
  readonly liveState = signal<'live' | 'paused' | 'closed'>('live');
  readonly latestCapture = computed(() => {
    const rows = this.facade.captureRows();
    return rows.length ? rows[rows.length - 1] : null;
  });
  readonly behindLatest = computed(() => {
    const rows = this.facade.captureRows();
    return rows.length > 0 && this.facade.selectedCaptureIndex() < rows.length - 1;
  });

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
    this.liveState.set(isTraceSessionHours(new Date()) ? 'live' : 'closed');
    this.scheduleLiveCheck();
  }

  ngOnDestroy(): void {
    this.clearLiveTimer();
    this.liveRequest?.unsubscribe();
  }

  refreshNow(): void {
    this.requestRefresh();
    this.scheduleLiveCheck();
  }

  jumpToLatest(): void {
    this.facade.selectCapture(this.facade.captureRows().length - 1);
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
    if (this.editingPriceLevelId) {
      if (!this.priceLevels.update(this.editingPriceLevelId, price, this.priceLevelLabel, this.priceLevelColor)) return;
      this.alertState.delete(this.editingPriceLevelId);
    } else {
      this.priceLevels.add(price, this.priceLevelLabel, this.priceLevelColor);
    }
    this.cancelPriceLevelEdit();
  }

  editPriceLevel(id: string): void {
    const level = this.priceLevels.levels().find(item => item.id === id);
    if (!level) return;
    this.editingPriceLevelId = id;
    this.priceLevelPrice = level.price;
    this.priceLevelLabel = level.label;
    this.priceLevelColor = level.color;
  }

  /** Support and Resistance, plus an older saved label while it is being edited. */
  priceLevelLabelOptions(): readonly string[] {
    const options: readonly string[] = PRICE_LEVEL_LABELS;
    return options.includes(this.priceLevelLabel) ? options : [...options, this.priceLevelLabel];
  }

  cancelPriceLevelEdit(): void {
    this.editingPriceLevelId = null;
    this.priceLevelPrice = null;
    this.priceLevelLabel = PRICE_LEVEL_LABELS[0];
  }

  removePriceLevel(id: string): void {
    if (this.editingPriceLevelId === id) this.cancelPriceLevelEdit();
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
    // Coming back to the tab checks right away instead of waiting for the next tick.
    this.liveCheck();
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

  asDate(value: string): Date {
    return new Date(value);
  }

  liveLabel(): string {
    const state = this.liveState();
    if (state === 'paused') return 'Paused while this tab is hidden';
    if (state === 'closed') return 'Market closed · checks resume at 6:15 AM PT';
    return 'Live · checking for new captures every 30 s';
  }

  formatRefreshTime(value: Date | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }).format(value);
  }

  proximityStateLabel(level: TracePriceLevelProximity): string {
    if (level.proximityState === 'touch') return 'Touch';
    if (level.proximityState === 'near') return 'Near';
    return 'Watch';
  }

  approachLabel(level: TracePriceLevelProximity): string {
    return level.approachDirection.replace('_', ' ');
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
        + ' · ' + level.distancePoints.toFixed(1) + ' pts ' + this.approachLabel(level);
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

  /** Asks the pipeline for the session's latest capture and reloads only when it changed. */
  liveCheck(now = new Date()): void {
    this.clearLiveTimer();
    if (document.visibilityState === 'hidden') {
      this.liveState.set('paused');
      return;  // handleVisibilityChange resumes.
    }
    if (!isTraceSessionHours(now)) {
      this.liveState.set('closed');
      this.scheduleLiveCheck();
      return;
    }
    this.liveState.set('live');
    const date = this.facade.selectedDate();
    if (!date || date < pacificDate(now)) {
      // A past session gets no new captures; reload only the catalog, so the page moves to
      // today's session once its first capture lands (if the latest session was selected).
      this.facade.loadSessions();
      this.scheduleLiveCheck();
      return;
    }
    this.liveRequest?.unsubscribe();
    this.liveRequest = this.facade.latestCaptureTs(date).subscribe({
      next: latest => {
        this.lastCheckedAt.set(new Date());
        if (latest && latest !== this.latestCapture()?.ts) this.requestRefresh();
        this.scheduleLiveCheck();
      },
      error: () => this.scheduleLiveCheck(),
    });
  }

  private scheduleLiveCheck(): void {
    this.clearLiveTimer();
    this.liveTimer = setTimeout(() => this.liveCheck(), LIVE_CHECK_MS);
  }

  private clearLiveTimer(): void {
    if (this.liveTimer !== null) clearTimeout(this.liveTimer);
    this.liveTimer = null;
  }
}

/** Weekdays, 6:15 AM to 1:20 PM Pacific. */
export function isTraceSessionHours(now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const clock = `${part('hour').replace('24', '00')}:${part('minute')}`;
  return !['Sat', 'Sun'].includes(part('weekday')) && clock >= SESSION_START && clock <= SESSION_END;
}

function pacificDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now);
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
