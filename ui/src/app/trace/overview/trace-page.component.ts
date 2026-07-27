import { ChangeDetectionStrategy, Component, HostListener, OnInit } from '@angular/core';

import { TraceFacade } from './data-access/trace.facade';
import { TraceContractStatus } from './trace.models';

@Component({
  selector: 'app-trace-page',
  templateUrl: './trace-page.component.html',
  styleUrls: ['./trace-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class TracePageComponent implements OnInit {
  readonly legacyTraceUrl = '/research-api/';

  constructor(readonly facade: TraceFacade) {}

  ngOnInit(): void {
    this.facade.loadSessions();
  }

  readonly sessionDateFilter = (date: Date | null): boolean => {
    const sessionDate = formatSessionDate(date);
    return Boolean(sessionDate && this.facade.sessions().some(session => session.date === sessionDate));
  };

  selectedSessionDate(): Date | null {
    return parseSessionDate(this.facade.selectedDate());
  }

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
