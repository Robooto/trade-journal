import { Component, OnInit } from '@angular/core';
import { JournalApiService } from '../../journal/journal-api.service';
import { JournalEntry } from '../../journal/journal.models';
import type { PaperArm } from '../../trace/overview/data-access/generated/research-contracts';
import { TraceApiService } from '../../trace/overview/data-access/trace-api.service';
import { dailyOverviewAnalysis, spotGammaToolLinks, ResourceLink, dailyGuidelines, tradeGuidelines } from '../dashboard-data';

const CHECKLIST_KEY = 'dashboard-checklist:';

/** Pacific calendar date as YYYY-MM-DD; trading days follow the exchange's local session. */
export function pacificDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now);
}

/** Monday of the week containing a YYYY-MM-DD date. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}

@Component({
  selector: 'app-dashboard-page',
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss'],
  standalone: false,
})
export class DashboardPageComponent implements OnInit {
  dailyOverview: ResourceLink[] = dailyOverviewAnalysis;
  spotGammaTools: ResourceLink[] = spotGammaToolLinks;
  readonly dailyGuidelines = dailyGuidelines;
  readonly tradeGuidelines = tradeGuidelines;
  recentEntries: JournalEntry[] = [];
  researchHeadline: string | null = null;
  deskArms: PaperArm[] = [];
  deskTrackedCount = 0;
  deskStatus: 'loading' | 'ready' | 'unavailable' = 'loading';
  readonly today = pacificDate();
  readonly weekFrom = weekStart(this.today);
  private checked = new Set<number>();

  constructor(private journalApi: JournalApiService, private traceApi: TraceApiService) {}

  ngOnInit(): void {
    this.checked = this.loadChecklist();
    this.journalApi.list(0, 3).subscribe({
      next: result => (this.recentEntries = result.items),
      error: () => (this.recentEntries = []),
    });
    this.traceApi.researchStatus().subscribe({
      next: status => (this.researchHeadline = status.headline ?? null),
      error: () => (this.researchHeadline = null),
    });
    this.traceApi.paperArms(this.today, this.weekFrom).subscribe({
      next: card => {
        this.deskTrackedCount = card.arms.length;
        this.deskArms = card.arms.filter(arm => arm.kind === 'baseline' || arm.arm_id === 'negative-pocket-shadow');
        this.deskStatus = 'ready';
      },
      error: () => (this.deskStatus = 'unavailable'),
    });
  }

  openAll(links: ResourceLink[]): void {
    links.slice().reverse().forEach(link => window.open(link.url, '_blank'));
  }

  isChecked(index: number): boolean {
    return this.checked.has(index);
  }

  toggleCheck(index: number): void {
    if (this.checked.has(index)) this.checked.delete(index);
    else this.checked.add(index);
    try {
      localStorage.setItem(CHECKLIST_KEY + this.today, JSON.stringify([...this.checked]));
    } catch {
      // Storage can be unavailable (private windows); the checklist still works for this visit.
    }
  }

  get checkedCount(): number {
    return this.checked.size;
  }

  /** First line of an entry's notes as plain text. */
  notePreview(entry: JournalEntry): string {
    const text = (entry.notes ?? '').replace(/<[^>]*>/g, ' ').replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim();
    return text.length > 90 ? `${text.slice(0, 89)}…` : text;
  }

  private loadChecklist(): Set<number> {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(CHECKLIST_KEY) && key !== CHECKLIST_KEY + this.today) localStorage.removeItem(key);
      }
      const stored = JSON.parse(localStorage.getItem(CHECKLIST_KEY + this.today) ?? '[]');
      return new Set(Array.isArray(stored) ? stored.filter((value): value is number => Number.isInteger(value)) : []);
    } catch {
      return new Set();
    }
  }
}
