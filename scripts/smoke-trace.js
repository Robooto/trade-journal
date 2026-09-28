async page => {
  // Invoked by playwright-cli run-code, not by the application or unit-test runner.
  const errors = [];
  const onPageError = error => errors.push(error.message);
  const onConsole = message => { if (message.type() === 'error') errors.push(message.text()); };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  page.setDefaultTimeout(30000);
  try {
    await page.reload();
    await page.getByRole('heading', { name: 'TRACE', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Session timeline', exact: true }).waitFor();
    const trends = page.locator('app-trace-session-trends');
    const price = trends.getByRole('img', { name: 'TRACE price, wall, and shelf trends', exact: true });
    const hiro = trends.getByRole('img', { name: 'TRACE SPX and equities HIRO pressure with spot', exact: true });
    await price.waitFor();
    await hiro.waitFor();
    for (const mode of ['Full range', 'Near price', 'Pressure', 'Change']) {
      const button = trends.getByRole('button', { name: mode, exact: true });
      await button.click();
      if (!(await button.getAttribute('class') || '').split(' ').includes('active')) {
        throw new Error(`Chart mode did not activate: ${mode}`);
      }
      for (const chart of [price, hiro]) {
        const lines = await chart.locator('polyline').evaluateAll(elements => elements.map(el => el.getAttribute('points')));
        if (!lines.length || lines.some(points => !points || /NaN|Infinity/.test(points))) {
          throw new Error(`Invalid trend geometry in ${mode}`);
        }
      }
    }
    if (await price.locator('.trend-active-line').getAttribute('x1') !== await hiro.locator('.trend-active-line').getAttribute('x1')) {
      throw new Error('Price and HIRO capture cursors are misaligned');
    }
    await page.getByRole('tab', { name: 'Paper trading', exact: true }).click();
    const paper = page.locator('#paper-workspace-panel');
    await paper.getByRole('heading', { name: 'Paper trading now', exact: true }).waitFor();
    await paper.getByText('Historical policies and session detail', { exact: true }).click();
    const from = paper.getByRole('textbox', { name: 'From', exact: true });
    const originalFrom = await from.inputValue();
    const to = await paper.getByRole('textbox', { name: 'To', exact: true }).inputValue();
    if (!originalFrom || !to) throw new Error('Historical range did not initialize');
    // Exercise user input and component lifetime without submitting the range.
    await from.fill(to);
    await page.getByRole('tab', { name: 'Trace', exact: true }).click();
    await page.getByRole('tab', { name: 'Paper trading', exact: true }).click();
    if (await from.inputValue() !== to) throw new Error('Paper range lost across tab switch');
    await from.fill(originalFrom);

    const replayButton = paper.getByRole('button', { name: 'Replay through selected capture', exact: true });
    // An absent sample must not be reported as a successful replay check.
    await page.waitForFunction(() => {
      const panel = document.querySelector('#paper-workspace-panel');
      return panel && !panel.textContent.includes('Loading recorded entries');
    });
    if (await replayButton.isDisabled()) throw new Error('Replay smoke incomplete: latest session has no eligible recorded entry');
    await replayButton.click();
    const chart = paper.getByRole('img', { name: 'SPX sampled replay path', exact: true });
    await chart.waitFor();
    if (await chart.locator('polyline').count() === 0) throw new Error('Replay has no drawable recorded path');

    await paper.locator('.paper-ledger-disclosure > summary').click();
    const ledger = paper.locator('app-paper-ledger');
    await ledger.getByText(/matching opportunities · dates/).waitFor();
    if (await ledger.getByRole('alert').count()) throw new Error('Ledger reported unavailable evidence');
    if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
    return { status: 'passed', checks: ['trace', 'trend modes and cursors', 'paper', 'range persistence', 'recorded replay', 'ledger'], from: originalFrom, to };
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
  }
}
