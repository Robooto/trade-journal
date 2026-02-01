import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';
import { PositionsApiService } from '../positions-api.service';
import { BracketOrderRequest, BracketOrderResponse } from '../positions.models';

export interface BracketOrderDialogData {
  accountNumber: string;
  position: Record<string, any>;
}

type CostEffect = 'Credit' | 'Debit' | string;

@Component({
  selector: 'app-bracket-order-dialog',
  templateUrl: './bracket-order-dialog.component.html',
  styleUrls: ['./bracket-order-dialog.component.scss'],
  standalone: false,
})
export class BracketOrderDialogComponent {
  takeProfitPercent = 50;
  stopLossPercent = 150;
  reviewMode = false;
  isReviewLoading = false;
  isSending = false;
  apiError = '';
  serverPreview?: BracketOrderResponse;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: BracketOrderDialogData,
    private dialogRef: MatDialogRef<BracketOrderDialogComponent>,
    private api: PositionsApiService,
    private snackBar: MatSnackBar
  ) {}

  get position(): Record<string, any> {
    return this.data.position;
  }

  get symbol(): string {
    return this.position['symbol'] || this.position['instrument-symbol'] || 'Unknown';
  }

  get quantity(): number {
    const qty = this.toNumber(this.position['quantity']);
    return Number.isFinite(qty) ? Math.abs(qty) : 1;
  }

  get multiplier(): number {
    const mult = this.toNumber(this.position['multiplier']);
    return Number.isFinite(mult) ? mult : 100;
  }

  get costEffect(): CostEffect {
    return this.position['cost-effect'] || 'Credit';
  }

  get isShort(): boolean {
    const direction = (this.position['quantity-direction'] || '').toLowerCase();
    return direction === 'short';
  }

  get isCreditTrade(): boolean {
    if (this.isShort) {
      return true;
    }
    return this.costEffect === 'Credit';
  }

  get displayCostEffect(): 'Credit' | 'Debit' {
    return this.isCreditTrade ? 'Credit' : 'Debit';
  }

  get quantityDirection(): string {
    return this.position['quantity-direction'] || '';
  }

  get entryPrice(): number {
    const candidates = [
      this.position['average-open-price'],
      this.position['average-daily-market-close-price'],
      this.position['close-price'],
      this.position['market_data']?.mark,
      this.position['market_data']?.mid,
      this.position['market_data']?.last,
    ];
    for (const candidate of candidates) {
      const value = this.toNumber(candidate);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    return 0;
  }

  get entryDollar(): number {
    return this.entryPrice * this.multiplier * this.quantity;
  }

  get takeProfitPrice(): number {
    if (!this.isCreditTrade) {
      return this.entryPrice * (1 + this.takeProfitPercent / 100);
    }
    return this.entryPrice * (1 - this.takeProfitPercent / 100);
  }

  get stopLossPrice(): number {
    if (!this.isCreditTrade) {
      return Math.max(0.01, this.entryPrice * (1 - this.stopLossPercent / 100));
    }
    return this.entryPrice * (1 + this.stopLossPercent / 100);
  }

  get takeProfitAmount(): number {
    if (this.isCreditTrade) {
      return Math.max(0, this.entryPrice - this.takeProfitPrice);
    }
    return Math.max(0, this.takeProfitPrice - this.entryPrice);
  }

  get stopLossAmount(): number {
    if (this.isCreditTrade) {
      return Math.max(0, this.stopLossPrice - this.entryPrice);
    }
    return Math.max(0, this.entryPrice - this.stopLossPrice);
  }

  get takeProfitDollar(): number {
    return this.takeProfitAmount * this.multiplier * this.quantity;
  }

  get stopLossDollar(): number {
    return this.stopLossAmount * this.multiplier * this.quantity;
  }

  setTakeProfitPercent(value: number | string): void {
    const parsed = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(parsed)) {
      return;
    }
    this.takeProfitPercent = Math.min(Math.max(parsed, 5), 95);
  }

  setStopLossPercent(value: number | string): void {
    const parsed = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(parsed)) {
      return;
    }
    this.stopLossPercent = parsed;
  }

  close(): void {
    this.dialogRef.close();
  }

  toggleReview(): void {
    if (this.reviewMode) {
      this.reviewMode = false;
      this.serverPreview = undefined;
      this.apiError = '';
      return;
    }
    this.apiError = '';
    this.isReviewLoading = true;
    this.api
      .submitBracketOrder(this.buildRequest(true))
      .pipe(finalize(() => (this.isReviewLoading = false)))
      .subscribe({
        next: res => {
          this.serverPreview = res;
          this.reviewMode = true;
        },
        error: err => {
          this.apiError = err?.error?.detail || 'Failed to preview order.';
        },
      });
  }

  submitOrder(): void {
    if (this.isSending || this.isReviewLoading) {
      return;
    }
    this.apiError = '';
    this.isSending = true;
    this.api
      .submitBracketOrder(this.buildRequest(false))
      .pipe(finalize(() => (this.isSending = false)))
      .subscribe({
        next: res => {
          this.snackBar.open('Bracket order submitted', 'Close', { duration: 3000 });
          this.dialogRef.close(res);
        },
        error: err => {
          this.apiError = err?.error?.detail || 'Failed to submit order.';
        },
      });
  }

  get action(): string {
    const direction = (this.position['quantity-direction'] || '').toLowerCase();
    return direction === 'short' ? 'Buy to Close' : 'Sell to Close';
  }

  get previewPayload(): Record<string, any> {
    if (this.serverPreview?.payload) {
      return this.serverPreview.payload;
    }
    return {
      type: 'OCO',
      orders: [
        {
          'order-type': 'Limit',
          price: this.roundPrice(this.takeProfitPrice),
          'price-effect': this.isCreditTrade ? 'Debit' : 'Credit',
          'time-in-force': 'GTC',
          legs: [
            {
              symbol: this.position['symbol'] || this.position['instrument-symbol'],
              'instrument-type': this.position['instrument-type'],
              action: this.action,
              quantity: this.quantity,
            },
          ],
        },
        {
          'order-type': 'Stop',
          'time-in-force': 'GTC',
          'stop-trigger': this.roundPrice(this.stopLossPrice),
          legs: [
            {
              symbol: this.position['symbol'] || this.position['instrument-symbol'],
              'instrument-type': this.position['instrument-type'],
              action: this.action,
              quantity: this.quantity,
            },
          ],
        },
      ],
    };
  }

  get previewTakeProfitPrice(): number {
    return this.serverPreview?.['take-profit-price'] ?? this.takeProfitPrice;
  }

  get previewStopLossPrice(): number {
    return this.serverPreview?.['stop-loss-price'] ?? this.stopLossPrice;
  }

  buildRequest(dryRun: boolean): BracketOrderRequest {
    return {
      'account-number': this.data.accountNumber,
      symbol: this.position['symbol'] || this.position['instrument-symbol'],
      'instrument-type': this.position['instrument-type'],
      quantity: this.quantity,
      multiplier: this.multiplier,
      'quantity-direction': this.quantityDirection,
      'cost-effect': this.costEffect,
      'entry-price': this.entryPrice,
      'take-profit-percent': this.takeProfitPercent,
      'stop-loss-percent': this.stopLossPercent,
      'dry-run': dryRun,
    };
  }

  roundPrice(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.round(value * 100) / 100;
  }

  toNumber(value: unknown): number {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : NaN;
    }
    if (typeof value === 'object' && value !== null) {
      const parsedValue = (value as { parsedValue?: number }).parsedValue;
      if (typeof parsedValue === 'number') {
        return parsedValue;
      }
    }
    return NaN;
  }
}
