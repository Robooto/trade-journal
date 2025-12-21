import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, Subscription, takeUntil } from 'rxjs';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, UTCTimestamp } from 'lightweight-charts';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ChartsApiService } from '../charts-api.service';
import { ChartParams, Bar, PriceLine, LineStyle, LineColor, RawVolatilityData, VolatilityData, RawMarketData } from '../charts.models';

type MarketDataValue = string | number | boolean | null | undefined;

interface MarketDataEntry {
  key: string;
  label: string;
  value: string;
}

@Component({
  selector: 'app-charts-page',
  templateUrl: './charts-page.component.html',
  styleUrls: ['./charts-page.component.scss'],
  standalone: false,
})
export class ChartsPageComponent implements OnInit, OnDestroy {
  @ViewChild('chartContainer', { static: false }) chartContainer!: ElementRef;
  
  chartForm: FormGroup;
  priceLineForm: FormGroup;
  chart: IChartApi | null = null;
  isLoading = false;
  error: string | null = null;
  priceLines: PriceLine[] = [];
  priceLineRefs: Map<string, any> = new Map();
  candlestickSeries: any = null;
  showPriceLineForm = false;
  volatilityData: VolatilityData | null = null;
  volatilityLoading = false;
  volatilityError: string | null = null;
  marketDataHighlights: MarketDataEntry[] = [];
  marketDataDetails: MarketDataEntry[] = [];
  marketDataLoading = false;
  marketDataError: string | null = null;
  
  private destroy$ = new Subject<void>();
  private formChange$ = new Subject<void>();
  private lastRequestParams: ChartParams | null = null;
  private volatilityRequestSub: Subscription | null = null;
  private marketDataRequestSub: Subscription | null = null;
  private yearHighPriceLineRef: any = null;
  private yearLowPriceLineRef: any = null;
  private yearHighValue: number | null = null;
  private yearLowValue: number | null = null;
  private readonly marketHighlightKeys = [
    'bid',
    'ask',
    'mid',
    'last',
    'open',
    'close',
    'volume',
    'day-high-price',
    'day-low-price',
    'year-high-price',
    'year-low-price',
    'beta'
  ];

  resolutionOptions = [
    { value: '5m', label: '5 Minutes' },
    { value: '15m', label: '15 Minutes' },
    { value: '30m', label: '30 Minutes' },
    { value: '1h', label: '1 Hour' },
    { value: '1d', label: '1 Day' },
    { value: '1wk', label: '1 Week' }
  ];

  colorOptions = [
    { value: '#f44336', label: 'Red', name: 'red' },
    { value: '#4caf50', label: 'Green', name: 'green' },
    { value: '#ffeb3b', label: 'Yellow', name: 'yellow' },
    { value: '#2196f3', label: 'Blue', name: 'blue' },
    { value: '#9c27b0', label: 'Purple', name: 'purple' },
    { value: '#ff9800', label: 'Orange', name: 'orange' }
  ];

  lineStyleOptions = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' }
  ];

  lastVolatilityRawData: RawVolatilityData | null = null;
  lastMarketDataRaw: RawMarketData | null = null;
  
  constructor(
    private fb: FormBuilder,
    private chartsApi: ChartsApiService,
    private snackBar: MatSnackBar
  ) {
    // Set default date range (30 days)
    const defaultDateRange = this.getSimpleDefaultDateRange();

    this.chartForm = this.fb.group({
      symbol: ['SPY', [Validators.required, Validators.pattern(/^[A-Za-z]{1,10}$/)]],
      resolution: ['1h', Validators.required],
      fromDate: [defaultDateRange.from, Validators.required],
      toDate: [defaultDateRange.to, Validators.required]
    });

    this.priceLineForm = this.fb.group({
      price: ['', [Validators.required, Validators.min(0.01)]],
      color: ['#f44336', Validators.required],
      lineStyle: ['solid', Validators.required],
      label: ['']
    });
  }

  ngOnInit() {
    // Set up form change monitoring with debouncing
    this.setupFormChangeMonitoring();
    
    // Load initial chart
    this.loadChart();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    
    if (this.chart) {
      this.chart.remove();
    }

    if (this.volatilityRequestSub) {
      this.volatilityRequestSub.unsubscribe();
    }

    if (this.marketDataRequestSub) {
      this.marketDataRequestSub.unsubscribe();
    }
  }

  onSubmit() {
    if (this.chartForm.valid) {
      this.loadChart();
    }
  }

  private setupFormChangeMonitoring() {
    // Monitor form changes with debouncing to prevent excessive requests
    this.formChange$.pipe(
      debounceTime(500), // Wait 500ms after last change
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      if (this.chartForm.valid) {
        this.loadChart();
      }
    });

    // Subscribe to symbol changes for auto-loading
    this.chartForm.get('symbol')?.valueChanges.pipe(
      debounceTime(1000), // Wait 1 second for symbol changes
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe((value) => {
      if (value && this.chartForm.get('symbol')?.valid) {
        this.formChange$.next();
      }
    });

    // No automatic date range updates - user controls both symbol, resolution, and date range
  }

  private loadChart() {
    const formValue = this.chartForm.value;
    
    const params: ChartParams = {
      symbol: formValue.symbol.toUpperCase(),
      resolution: formValue.resolution,
      from_ts: Math.floor(formValue.fromDate.getTime() / 1000),
      to_ts: Math.floor(formValue.toDate.getTime() / 1000)
    };

    // Check if this is the same request as the last one to avoid duplicate calls
    if (this.lastRequestParams && this.areParamsEqual(params, this.lastRequestParams)) {
      console.log('Skipping duplicate request');
      return;
    }

    // Validate date range
    if (params.from_ts >= params.to_ts) {
      this.error = 'End date must be after start date';
      return;
    }

    // Check for maximum 60-day range
    const daysDiff = (params.to_ts - params.from_ts) / (24 * 60 * 60);
    
    if (daysDiff > 60) {
      this.error = 'Date range cannot exceed 60 days. Please select a shorter range.';
      return;
    }

    this.lastRequestParams = { ...params };
    this.isLoading = true;
    this.error = null;
    this.fetchVolatilityData(params.symbol);
    this.fetchMarketData(params.symbol);

    this.chartsApi.getHistory(params).subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.s === 'ok') {
          this.renderChart(response.bars);
        } else {
          this.error = 'Failed to load chart data';
        }
      },
      error: (err) => {
        this.isLoading = false;
        
        // Handle specific error cases
        if (err.status === 429) {
          this.error = 'Too many requests. Please wait a moment and try again.';
        } else if (err.status === 404) {
          this.error = `Symbol '${params.symbol}' not found. Please check the symbol and try again.`;
        } else {
          this.error = err.error?.detail || 'Failed to load chart data';
        }
        
        console.error('Chart loading error:', err);
      }
    });
  }

  private areParamsEqual(params1: ChartParams, params2: ChartParams): boolean {
    return params1.symbol === params2.symbol &&
           params1.resolution === params2.resolution &&
           params1.from_ts === params2.from_ts &&
           params1.to_ts === params2.to_ts;
  }


  private getSimpleDefaultDateRange(): { from: Date; to: Date } {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    return {
      from: thirtyDaysAgo,
      to: now
    };
  }



  private renderChart(bars: Bar[]) {
    // Remove existing chart if any
    if (this.chart) {
      this.removeYearRangePriceLines();
      this.chart.remove();
    }
    this.candlestickSeries = null;

    // Wait for the view to update
    setTimeout(() => {
      if (!this.chartContainer) {
        console.error('Chart container not found');
        return;
      }

      // Create the chart
      this.chart = createChart(this.chartContainer.nativeElement, {
        width: this.chartContainer.nativeElement.clientWidth,
        height: 400,
        layout: {
          background: { color: '#ffffff' },
          textColor: '#333',
        },
        grid: {
          vertLines: { color: '#f0f0f0' },
          horzLines: { color: '#f0f0f0' },
        },
        rightPriceScale: {
          borderColor: '#cccccc',
        },
        timeScale: {
          borderColor: '#cccccc',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      // Add candlestick series (v5.x API)
      this.candlestickSeries = this.chart.addSeries(CandlestickSeries, {
        upColor: '#4caf50',
        downColor: '#f44336',
        borderDownColor: '#f44336',
        borderUpColor: '#4caf50',
        wickDownColor: '#f44336',
        wickUpColor: '#4caf50',
      });

      // Convert bars to candlestick data
      const candlestickData = bars.map(bar => ({
        time: Math.floor(bar.time / 1000) as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close
      }));

      // Set the data
      this.candlestickSeries.setData(candlestickData);

      // Fit content
      this.chart.timeScale().fitContent();
      
      // Re-add any existing price lines
      this.redrawPriceLines();
      this.applyYearRangePriceLines();
    }, 100);
  }

  // Price Line Management Methods
  togglePriceLineForm() {
    this.showPriceLineForm = !this.showPriceLineForm;
    if (this.showPriceLineForm) {
      this.priceLineForm.reset({
        price: '',
        color: '#f44336',
        lineStyle: 'solid',
        label: ''
      });
    }
  }

  addPriceLine() {
    if (this.priceLineForm.valid && this.chart) {
      const formValue = this.priceLineForm.value;
      const newPriceLine: PriceLine = {
        id: this.generatePriceLineId(),
        price: parseFloat(formValue.price),
        color: formValue.color,
        lineStyle: formValue.lineStyle,
        label: formValue.label || `$${formValue.price}`
      };

      this.priceLines.push(newPriceLine);
      this.drawPriceLine(newPriceLine);
      this.showPriceLineForm = false;
      
      // Reset form for next price line
      this.priceLineForm.reset({
        price: '',
        color: '#f44336',
        lineStyle: 'solid',
        label: ''
      });
    }
  }

  removePriceLine(priceLineId: string) {
    const index = this.priceLines.findIndex(pl => pl.id === priceLineId);
    if (index > -1) {
      // Remove from chart if reference exists
      const priceLineRef = this.priceLineRefs.get(priceLineId);
      if (priceLineRef && this.candlestickSeries) {
        this.candlestickSeries.removePriceLine(priceLineRef);
      }
      
      // Remove from arrays
      this.priceLines.splice(index, 1);
      this.priceLineRefs.delete(priceLineId);
    }
  }

  private drawPriceLine(priceLine: PriceLine) {
    if (!this.candlestickSeries) return;

    // Convert line style to TradingView format
    let lineStyle = 0; // Solid
    if (priceLine.lineStyle === 'dashed') lineStyle = 2;
    if (priceLine.lineStyle === 'dotted') lineStyle = 1;

    const priceLineRef = this.candlestickSeries.createPriceLine({
      price: priceLine.price,
      color: priceLine.color,
      lineWidth: 2,
      lineStyle: lineStyle,
      axisLabelVisible: true,
      title: priceLine.label || `$${priceLine.price}`,
    });

    // Store reference for later removal
    this.priceLineRefs.set(priceLine.id, priceLineRef);
  }

  private redrawPriceLines() {
    if (!this.chart) return;
    
    // Clear existing price line references since chart was recreated
    this.priceLineRefs.clear();
    
    // Redraw all price lines
    this.priceLines.forEach(priceLine => {
      this.drawPriceLine(priceLine);
    });
  }

  private generatePriceLineId(): string {
    return 'pl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Handle window resize
  onResize() {
    if (this.chart && this.chartContainer) {
      this.chart.applyOptions({
        width: this.chartContainer.nativeElement.clientWidth
      });
    }
  }

  private fetchVolatilityData(symbol: string) {
    if (!symbol) {
      return;
    }

    if (this.volatilityRequestSub) {
      this.volatilityRequestSub.unsubscribe();
    }

    this.volatilityLoading = true;
    this.volatilityError = null;
    this.volatilityData = null;
    this.lastVolatilityRawData = null;

    this.volatilityRequestSub = this.chartsApi.getVolatilityData(symbol).subscribe({
      next: (data: RawVolatilityData[]) => {
        this.volatilityLoading = false;
        const upper = symbol.toUpperCase();
        const match = data.find(item => item.symbol?.toUpperCase() === upper);
        if (match) {
          this.lastVolatilityRawData = match;
          this.volatilityData = this.transformVolatilityData(match);
        } else {
          this.volatilityError = 'No volatility data available for this symbol.';
          this.lastVolatilityRawData = null;
        }
      },
      error: (err) => {
        this.volatilityLoading = false;
        this.volatilityError = err.error?.detail || 'Failed to load volatility data';
        this.lastVolatilityRawData = null;
        console.error('Volatility data loading error:', err);
      }
    });
  }

  private fetchMarketData(symbol: string) {
    if (!symbol) {
      return;
    }

    if (this.marketDataRequestSub) {
      this.marketDataRequestSub.unsubscribe();
    }

    this.marketDataLoading = true;
    this.marketDataError = null;
    this.marketDataHighlights = [];
    this.marketDataDetails = [];
    this.lastMarketDataRaw = null;
    this.yearHighValue = null;
    this.yearLowValue = null;
    this.removeYearRangePriceLines();

    this.marketDataRequestSub = this.chartsApi.getMarketData(symbol).subscribe({
      next: (data: RawMarketData[]) => {
        this.marketDataLoading = false;
        const upper = symbol.toUpperCase();
        const match = data.find(item => item.symbol?.toUpperCase() === upper);
        if (match) {
          this.lastMarketDataRaw = match;
          this.computeMarketDataDisplay(match);
          this.yearHighValue = this.toNumber(match['year-high-price'] as string | number | null | undefined);
          this.yearLowValue = this.toNumber(match['year-low-price'] as string | number | null | undefined);
          this.applyYearRangePriceLines();
        } else {
          this.marketDataError = 'No market data available for this symbol.';
        }
      },
      error: (err) => {
        this.marketDataLoading = false;
        this.marketDataError = err.error?.detail || 'Failed to load market data';
        console.error('Market data loading error:', err);
      }
    });
  }

  private transformVolatilityData(raw: RawVolatilityData): VolatilityData {
    const optionExpirationImpliedVolatilities = (raw['option-expiration-implied-volatilities'] || []).map(exp => ({
      expirationDate: exp['expiration-date'],
      impliedVolatility: this.toNumber(exp['implied-volatility']),
      optionChainType: exp['option-chain-type'],
      settlementType: exp['settlement-type'],
    }));

    return {
      symbol: raw.symbol,
      impliedVolatilityIndex: this.toNumber(raw['implied-volatility-index']),
      impliedVolatilityIndex15Day: this.toNumber(raw['implied-volatility-index-15-day']),
      impliedVolatilityIndex5DayChange: this.toNumber(raw['implied-volatility-index-5-day-change']),
      impliedVolatilityIndexRank: this.toNumber(raw['implied-volatility-index-rank']),
      impliedVolatilityPercentile: this.toNumber(raw['implied-volatility-percentile']),
      corrSpy3Month: this.toNumber(raw['corr-spy-3month']),
      liquidityRating: this.toNumber(raw['liquidity-rating'] as any),
      optionExpirationImpliedVolatilities,
    };
  }

  private toNumber(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return isFinite(value) ? value : null;
    }

    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }

  formatPercent(value: number | null): string {
    if (value === null || value === undefined) {
      return 'N/A';
    }

    return `${(value * 100).toFixed(2)}%`;
  }

  formatDecimal(value: number | null, digits: number = 2): string {
    if (value === null || value === undefined) {
      return 'N/A';
    }

    return value.toFixed(digits);
  }

  copyVolatilityJson(event: MouseEvent) {
    event.stopPropagation();

    if (!this.lastVolatilityRawData) {
      this.snackBar.open('No volatility data to copy yet.', 'Dismiss', { duration: 2500 });
      return;
    }

    const json = JSON.stringify(this.lastVolatilityRawData, null, 2);

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(json).then(() => {
        this.snackBar.open('Volatility JSON copied to clipboard', 'Dismiss', { duration: 2500 });
      }).catch(() => {
        this.fallbackCopy(json, 'Volatility JSON copied to clipboard', 'Unable to copy volatility JSON.');
      });
    } else {
      this.fallbackCopy(json, 'Volatility JSON copied to clipboard', 'Unable to copy volatility JSON.');
    }
  }

  copyMarketDataJson(event: MouseEvent) {
    event.stopPropagation();

    if (!this.lastMarketDataRaw) {
      this.snackBar.open('No market data to copy yet.', 'Dismiss', { duration: 2500 });
      return;
    }

    const json = JSON.stringify(this.lastMarketDataRaw, null, 2);

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(json).then(() => {
        this.snackBar.open('Market data JSON copied to clipboard', 'Dismiss', { duration: 2500 });
      }).catch(() => {
        this.fallbackCopy(json, 'Market data JSON copied to clipboard', 'Unable to copy market data JSON.');
      });
    } else {
      this.fallbackCopy(json, 'Market data JSON copied to clipboard', 'Unable to copy market data JSON.');
    }
  }

  private fallbackCopy(text: string, successMessage: string, failureMessage: string) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.snackBar.open(successMessage, 'Dismiss', { duration: 2500 });
    } catch (error) {
      this.snackBar.open(failureMessage, 'Dismiss', { duration: 3000 });
      console.error('Clipboard copy failed', error);
    }
  }

  private computeMarketDataDisplay(raw: RawMarketData) {
    const highlightSet = new Set(this.marketHighlightKeys);
    this.marketDataHighlights = this.marketHighlightKeys
      .map(key => ({
        key,
        label: this.toTitleCase(key),
        value: this.formatMarketValue(raw[key])
      }))
      .filter(entry => entry.value !== 'N/A');

    this.marketDataDetails = Object.entries(raw)
      .filter(([key]) => !highlightSet.has(key))
      .map(([key, value]) => ({
        key,
        label: this.toTitleCase(key),
        value: this.formatMarketValue(value as MarketDataValue)
      }));
  }

  private formatMarketValue(value: MarketDataValue): string {
    if (value === null || value === undefined || value === '') {
      return 'N/A';
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    if (typeof value === 'number') {
      return this.formatNumberValue(value);
    }

    const numeric = Number(value);
    if (!isNaN(numeric)) {
      return this.formatNumberValue(numeric);
    }

    const date = new Date(value);
    if (!isNaN(date.getTime()) && `${value}`.includes('T')) {
      return date.toLocaleString();
    }

    return `${value}`;
  }

  private formatNumberValue(value: number): string {
    const absValue = Math.abs(value);
    if (absValue >= 1000) {
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return value % 1 === 0 ? value.toString() : value.toFixed(2);
  }

  private toTitleCase(value: string): string {
    return value
      .replace(/[-_]/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private applyYearRangePriceLines() {
    if (!this.candlestickSeries) {
      return;
    }

    this.removeYearRangePriceLines();

    if (this.yearHighValue !== null) {
      this.yearHighPriceLineRef = this.candlestickSeries.createPriceLine({
        price: this.yearHighValue,
        color: '#ff9800',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `52W High (${this.yearHighValue.toFixed(2)})`,
      });
    }

    if (this.yearLowValue !== null) {
      this.yearLowPriceLineRef = this.candlestickSeries.createPriceLine({
        price: this.yearLowValue,
        color: '#2196f3',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `52W Low (${this.yearLowValue.toFixed(2)})`,
      });
    }
  }

  private removeYearRangePriceLines() {
    if (this.yearHighPriceLineRef && this.candlestickSeries) {
      this.candlestickSeries.removePriceLine(this.yearHighPriceLineRef);
    }

    if (this.yearLowPriceLineRef && this.candlestickSeries) {
      this.candlestickSeries.removePriceLine(this.yearLowPriceLineRef);
    }

    this.yearHighPriceLineRef = null;
    this.yearLowPriceLineRef = null;
  }
}
