import { ChangeDetectionStrategy, Component, HostListener, OnInit } from '@angular/core';

import { TraceFacade } from './data-access/trace.facade';
import { TraceContractStatus, TraceResourceStatus } from './trace.models';

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

  selectDate(date: string): void {
    this.facade.selectDate(date);
  }

  selectCapture(value: string | number): void {
    this.facade.selectCapture(Number(value));
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

  resourceMessage(resource: TraceResourceStatus): string {
    if (resource.status === 'unavailable') return 'Unavailable';
    if (resource.warningCount) {
      return `${resource.warningCount} warning${resource.warningCount === 1 ? '' : 's'}`;
    }
    return resource.status === 'ready' ? 'Ready' : resource.status;
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
