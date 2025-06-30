import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface HiroResponse {
  timestamp: string;
  images: string[];
}

@Component({
  selector: 'app-hiro-page',
  templateUrl: './hiro-page.component.html',
  styleUrls: ['./hiro-page.component.scss'],
  standalone: false,
})

export class HiroPageComponent {
  screens: { timestamp: string; images: string[] }[] = [];
  loading = false;

  constructor(private http: HttpClient) {}

  getScreens() {
    this.loading = true;
    this.http.get<HiroResponse>(`${environment.apiUrl}/spotgamma/hiro`).subscribe({
      next: res => {
        this.screens.unshift({
          timestamp: res.timestamp,
          images: res.images.map(img => 'data:image/png;base64,' + img)
        });
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }
}
