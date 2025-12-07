import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface PivotDialogResult {
  price: number;
  date: Date | null;
  index: string;
}

export interface PivotLevelDialogData {
  price: number | null;
  date: string | Date | null;
  index: string;
}

@Component({
  selector: 'app-pivot-level-dialog',
  templateUrl: './pivot-level-dialog.component.html',
  styleUrls: ['./pivot-level-dialog.component.scss'],
  standalone: false,
})
export class PivotLevelDialogComponent {
  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<PivotLevelDialogComponent, PivotDialogResult | undefined>,
    @Inject(MAT_DIALOG_DATA) public data: PivotLevelDialogData
  ) {
    this.form = this.fb.group({
      price: [this.data?.price ?? null, [Validators.required, Validators.min(0)]],
      date: [this.parseDate(this.data?.date)],
      index: [this.data?.index ?? 'SPX', [Validators.required]],
    });
  }

  submit(): void {
    if (this.form.valid) {
      this.dialogRef.close(this.form.value as PivotDialogResult);
    }
  }

  private parseDate(value: string | Date | null | undefined): Date | null {
    if (!value) {
      return new Date();
    }

    if (value instanceof Date) {
      return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }

    return parsed;
  }
}
