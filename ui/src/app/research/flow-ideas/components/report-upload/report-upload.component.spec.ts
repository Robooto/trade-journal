import { validateFlowPatrolPdf } from './report-upload.component';

describe('validateFlowPatrolPdf', () => {
  it('requires a dated filename and a nonempty PDF within the proxy limit', () => {
    expect(
      validateFlowPatrolPdf(
        new File(['x'], 'report.txt', { type: 'text/plain' }),
      ),
    ).toContain('PDF');
    expect(
      validateFlowPatrolPdf(
        new File(['pdf'], 'report.pdf', { type: 'application/pdf' }),
      ),
    ).toContain('report date');
    expect(
      validateFlowPatrolPdf(
        new File([], 'flowpatrol_2026_07_13.pdf', {
          type: 'application/pdf',
        }),
      ),
    ).toContain('empty');
    expect(
      validateFlowPatrolPdf(
        new File(
          [new Uint8Array(20 * 1024 * 1024 + 1)],
          'flowpatrol_2026-07-13.pdf',
          { type: 'application/pdf' },
        ),
      ),
    ).toContain('20 MB');
    expect(
      validateFlowPatrolPdf(
        new File(['pdf'], 'flowpatrol_2026_07_13.pdf', {
          type: 'application/pdf',
        }),
      ),
    ).toBeNull();
  });
});

describe('validateFlowPatrolPdf filename flexibility', () => {
  it('accepts any PDF name that carries a report date', () => {
    for (const name of ['2026-10-21-flowpatrol.pdf', 'FlowPatrol 2026_10_21.PDF', 'flowpatrol_2026-10-21.pdf']) {
      expect(validateFlowPatrolPdf(new File(['pdf'], name, { type: 'application/pdf' }))).toBeNull();
    }
    expect(validateFlowPatrolPdf(new File(['pdf'], 'flowpatrol-20261021.pdf', { type: 'application/pdf' }))).toContain('report date');
  });
});
