import { TestBed } from '@angular/core/testing';

import { ResearchModule } from '../research.module';
import { FlowIdeasPageComponent } from './flow-ideas-page.component';

describe('FlowIdeasPageComponent', () => {
  it('uses an accessible, same-origin Trace handoff', async () => {
    await TestBed.configureTestingModule({
      imports: [ResearchModule],
    }).compileComponents();

    const fixture = TestBed.createComponent(FlowIdeasPageComponent);
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    const main = page.querySelector('main');
    const traceLink = page.querySelector(
      'a[aria-describedby="trace-on-mini-description"]',
    );

    expect(main?.getAttribute('aria-labelledby')).toBe('flow-ideas-title');
    expect(traceLink?.getAttribute('href')).toBe('/research-api/');
    expect(traceLink?.getAttribute('target')).toBe('_blank');
    expect(traceLink?.getAttribute('rel')).toContain('noopener');
    expect(
      page.querySelector('#trace-on-mini-description')?.textContent,
    ).toContain('existing Trace dashboard on the mini');
  });
});
