import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export type FlowUploadState = 'idle' | 'pending' | 'success' | 'conflict' | 'validation' | 'error';

const MAX_REPORT_BYTES = 20 * 1024 * 1024;
// Any .pdf name carrying the report date, e.g. flowpatrol_2026_10_21.pdf or 2026-10-21-flowpatrol.pdf.
const REPORT_FILENAME = /(^|\D)\d{4}[-_]\d{2}[-_]\d{2}(\D.*)?\.pdf$/i;

@Component({
  selector: 'app-flow-report-upload',
  templateUrl: './report-upload.component.html',
  styleUrls: ['./report-upload.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class ReportUploadComponent {
  @Input() state: FlowUploadState = 'idle';
  @Input() message: string | null = null;
  @Output() readonly reportUpload = new EventEmitter<File>();

  file: File | null = null;
  validationMessage: string | null = null;

  get pending(): boolean {
    return this.state === 'pending';
  }

  onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.item(0) ?? null;
    this.file = file;
    this.validationMessage = file ? validateFlowPatrolPdf(file) : null;
  }

  upload(): void {
    if (!this.file || this.validationMessage || this.pending) {
      return;
    }
    this.reportUpload.emit(this.file);
  }
}

export function validateFlowPatrolPdf(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    return 'Choose a PDF report.';
  }
  if (!REPORT_FILENAME.test(file.name)) {
    return 'Include the report date in the filename, e.g. 2026-10-21-flowpatrol.pdf.';
  }
  if (file.size <= 0) {
    return 'The report file is empty.';
  }
  if (file.size > MAX_REPORT_BYTES) {
    return 'The report must be 20 MB or smaller.';
  }
  return null;
}
