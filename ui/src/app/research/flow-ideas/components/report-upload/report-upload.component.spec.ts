import { validateFlowPatrolPdf } from './report-upload.component';

describe('validateFlowPatrolPdf', () => {
  it('requires the backend-compatible FlowPatrol filename and a nonempty PDF within the proxy limit', () => {
    expect(
      validateFlowPatrolPdf(
        new File(['x'], 'report.txt', { type: 'text/plain' }),
      ),
    ).toContain('PDF');
    expect(
      validateFlowPatrolPdf(
        new File(['pdf'], 'report.pdf', { type: 'application/pdf' }),
      ),
    ).toContain('flowpatrol_');
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
