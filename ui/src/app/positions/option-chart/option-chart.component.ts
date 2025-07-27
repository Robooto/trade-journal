import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, OnChanges, SimpleChanges } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, UTCTimestamp } from 'lightweight-charts';
import { ChartsApiService } from '../../charts/charts-api.service';
import { ChartParams, Bar } from '../../charts/charts.models';
import { PositionGroup, Position } from '../positions.models';

export interface OptionPriceLine {
  id: string;
  price: number;
  color: string;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  label: string;
  optionType: 'C' | 'P';
  quantityDirection: 'Long' | 'Short';
  quantity: number;
}

@Component({
  selector: 'app-option-chart',
  templateUrl: './option-chart.component.html',
  styleUrls: ['./option-chart.component.scss'],
  standalone: false,
})
export class OptionChartComponent implements OnInit, OnDestroy, OnChanges {
  @ViewChild('chartContainer', { static: false }) chartContainer!: ElementRef;
  @Input() positionGroup!: PositionGroup;
  
  chart: IChartApi | null = null;
  candlestickSeries: any = null;
  isLoading = false;
  error: string | null = null;
  optionLines: OptionPriceLine[] = [];
  priceLineRefs: Map<string, any> = new Map();
  
  private destroy$ = new Subject<void>();

  constructor(private chartsApi: ChartsApiService) {}

  ngOnInit() {
    if (this.positionGroup && this.isValidSymbol(this.positionGroup.underlying_symbol)) {
      this.loadChart();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['positionGroup'] && !changes['positionGroup'].firstChange) {
      if (this.positionGroup && this.isValidSymbol(this.positionGroup.underlying_symbol)) {
        this.loadChart();
      }
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    
    if (this.chart) {
      this.chart.remove();
    }
  }

  private isValidSymbol(symbol: string): boolean {
    // Exclude symbols with "/" (like spread symbols)
    return !symbol.includes('/');
  }

  private loadChart() {
    if (!this.positionGroup || !this.isValidSymbol(this.positionGroup.underlying_symbol)) {
      this.error = 'Invalid symbol for charting';
      return;
    }

    // Set up 1-month date range with 1-hour resolution
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    const params: ChartParams = {
      symbol: this.positionGroup.underlying_symbol,
      resolution: '1h',
      from_ts: Math.floor(oneMonthAgo.getTime() / 1000),
      to_ts: Math.floor(now.getTime() / 1000)
    };

    this.isLoading = true;
    this.error = null;

    this.chartsApi.getHistory(params).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.s === 'ok') {
          this.generateOptionLines();
          this.renderChart(response.bars);
        } else {
          this.error = 'Failed to load chart data';
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.error = err.error?.detail || 'Failed to load chart data';
        console.error('Chart loading error:', err);
      }
    });
  }

  private generateOptionLines() {
    this.optionLines = [];
    
    this.positionGroup.positions.forEach((position: Position, index: number) => {
      if (position['instrument-type'] === 'Equity Option' && position['strike']) {
        const strikePrice = typeof position['strike'] === 'object' ? 
          position['strike'].parsedValue : position['strike'];
        
        const isShort = position['quantity-direction'] === 'Short';
        const optionType = position['option-type'] as 'C' | 'P';
        
        const optionLine: OptionPriceLine = {
          id: `option_${index}_${strikePrice}`,
          price: strikePrice,
          color: isShort ? '#f44336' : '#4caf50', // Red for short, green for long
          lineStyle: 'solid',
          label: `${strikePrice}${optionType} ${position['quantity-direction']} (${Math.abs(position['quantity'])})`,
          optionType: optionType,
          quantityDirection: position['quantity-direction'] as 'Long' | 'Short',
          quantity: Math.abs(position['quantity'])
        };
        
        this.optionLines.push(optionLine);
      }
    });
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
        height: 300, // Smaller height for embedded chart
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

      // Add candlestick series
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
      
      // Draw option price lines
      this.drawOptionLines();
    }, 100);
  }

  private drawOptionLines() {
    if (!this.candlestickSeries) return;

    // Clear existing price line references
    this.priceLineRefs.clear();
    
    // Draw all option lines
    this.optionLines.forEach(optionLine => {
      this.drawOptionLine(optionLine);
    });
  }

  private drawOptionLine(optionLine: OptionPriceLine) {
    if (!this.candlestickSeries) return;

    // Convert line style to TradingView format
    let lineStyle = 0; // Solid
    if (optionLine.lineStyle === 'dashed') lineStyle = 2;
    if (optionLine.lineStyle === 'dotted') lineStyle = 1;

    const priceLineRef = this.candlestickSeries.createPriceLine({
      price: optionLine.price,
      color: optionLine.color,
      lineWidth: 2,
      lineStyle: lineStyle,
      axisLabelVisible: true,
      title: optionLine.label,
    });

    // Store reference for later removal
    this.priceLineRefs.set(optionLine.id, priceLineRef);
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