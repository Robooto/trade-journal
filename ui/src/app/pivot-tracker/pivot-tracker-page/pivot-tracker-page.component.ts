import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize, Observable, Subject, takeUntil } from 'rxjs';

import {
  PivotLevel,
  PivotLevelCreate,
  PivotTrackerService,
} from '../pivot-tracker.service';
import {
  PivotDialogResult,
  PivotLevelDialogComponent,
} from '../pivot-level-dialog/pivot-level-dialog.component';

@Component({
  selector: 'app-pivot-tracker-page',
  templateUrl: './pivot-tracker-page.component.html',
  styleUrls: ['./pivot-tracker-page.component.scss'],
  standalone: false,
})
export class PivotTrackerPageComponent implements OnInit, OnDestroy {
  latest$!: Observable<PivotLevel | null>;
  latestPivot: PivotLevel | null = null;

  latestLoading = false;
  latestError: string | null = null;

  history: PivotLevel[] = [];
  historyLoading = false;
  historyError: string | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private pivotTracker: PivotTrackerService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.latest$ = this.pivotTracker.latest$;
    this.latest$
      .pipe(takeUntil(this.destroy$))
      .subscribe(pivot => (this.latestPivot = pivot));
  }

  ngOnInit(): void {
    this.refreshLatest();
    this.refreshHistory();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refreshLatest(): void {
    this.latestError = null;
    this.latestLoading = true;
    this.pivotTracker
      .loadLatest()
      .pipe(finalize(() => (this.latestLoading = false)))
      .subscribe({
        error: err => {
          if (err?.status === 404) {
            this.pivotTracker.setLatest(null);
            this.latestError = 'No pivot level recorded yet.';
          } else {
            this.latestError = 'Unable to load the current pivot level.';
            this.snackBar.open('Failed to load pivot level', 'Dismiss', {
              duration: 4000,
            });
          }
        },
      });
  }

  refreshHistory(): void {
    this.historyError = null;
    this.historyLoading = true;
    this.pivotTracker
      .getHistory()
      .pipe(finalize(() => (this.historyLoading = false)))
      .subscribe({
        next: history => (this.history = history),
        error: () => {
          this.historyError = 'Unable to load pivot history.';
        },
      });
  }

  openEditor(): void {
    const dialogRef = this.dialog.open(PivotLevelDialogComponent, {
      width: '360px',
      data: {
        price: this.latestPivot?.price ?? null,
        date: this.latestPivot?.date ?? null,
        index: this.latestPivot?.index ?? 'SPX',
      },
    });

    dialogRef.afterClosed().subscribe((result?: PivotDialogResult) => {
      if (!result) {
        return;
      }

      this.savePivot(result);
    });
  }

  private savePivot(data: PivotDialogResult): void {
    const payload: PivotLevelCreate = {
      price: data.price,
      index: data.index?.trim() || 'SPX',
      date: this.formatDate(data.date),
    };

    this.pivotTracker.recordPivot(payload).subscribe({
      next: () => {
        this.snackBar.open('Pivot level updated', 'Dismiss', {
          duration: 3000,
        });
        this.refreshHistory();
      },
      error: () => {
        this.snackBar.open('Failed to save pivot level', 'Dismiss', {
          duration: 4000,
        });
      },
    });
  }

  private formatDate(date: Date | string | null | undefined): string | undefined {
    if (!date) {
      return undefined;
    }
    const parsed = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return parsed.toISOString().slice(0, 10);
  }
}
