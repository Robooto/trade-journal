import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';

import {
  FlowContractEvidenceGroup,
  FlowContractEvidenceRow,
  FlowContractsResponse,
} from '../../flow-ideas.models';

@Component({
  selector: 'app-contract-evidence',
  templateUrl: './contract-evidence.component.html',
  styleUrls: ['./contract-evidence.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class ContractEvidenceComponent implements OnChanges {
  @Input() contracts: FlowContractsResponse | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;

  groups: readonly FlowContractEvidenceGroup[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['contracts']) {
      this.groups = groupContractEvidence(this.contracts?.rows ?? []);
    }
  }

  formatMeasure(row: FlowContractEvidenceRow): string {
    if (row.measure_value_usd == null) {
      return row.measure_name || 'Measure unavailable';
    }

    return `${row.measure_name || 'Measure'}: ${new Intl.NumberFormat(
      'en-US',
      { style: 'currency', currency: 'USD', maximumFractionDigits: 0 },
    ).format(row.measure_value_usd)}`;
  }
}

export function groupContractEvidence(
  rows: readonly FlowContractEvidenceRow[],
): readonly FlowContractEvidenceGroup[] {
  const groups = new Map<string, FlowContractEvidenceGroup>();

  rows.forEach((row, index) => {
    // Only a supplied SpotGamma spread_id can create a multi-row group.
    const key = row.spread_id?.trim() || `unspread-${index}`;
    const label = row.spread_id?.trim() || 'Ungrouped contract evidence';
    const existing = groups.get(key);

    groups.set(key, {
      key,
      label,
      rows: existing ? [...existing.rows, row] : [row],
    });
  });

  return [...groups.values()];
}
