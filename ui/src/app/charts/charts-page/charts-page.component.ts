import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, UTCTimestamp } from 'lightweight-charts';
import { ChartsApiService } from '../charts-api.service';
import { ChartParams, Bar, PriceLine, LineStyle, LineColor } from '../charts.models';

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
  
  private destroy$ = new Subject<void>();
  private formChange$ = new Subject<void>();
  private lastRequestParams: ChartParams | null = null;

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

  constructor(
    private fb: FormBuilder,
    private chartsApi: ChartsApiService
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
      this.chart.remove();
    }

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
}