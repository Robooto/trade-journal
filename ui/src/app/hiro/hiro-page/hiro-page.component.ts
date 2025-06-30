import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface HiroImage {
  name: string;
  data: string;
}

interface HiroResponse {
  timestamp: string;
  images: HiroImage[];
}

@Component({
  selector: 'app-hiro-page',
  templateUrl: './hiro-page.component.html',
  styleUrls: ['./hiro-page.component.scss'],
  standalone: false,
})

export class HiroPageComponent {
  screens: { timestamp: string; images: { name: string; url: string }[] }[] = [];
  loading = false;

  constructor(private http: HttpClient) {}

  getScreens() {
    this.loading = true;
    this.http.get<HiroResponse>(`${environment.apiUrl}/spotgamma/hiro`).subscribe({
      next: res => {
        this.screens.unshift({
          timestamp: res.timestamp,
          images: res.images.map(img => ({
            name: img.name,
            url: 'data:image/png;base64,' + img.data
          }))
        });
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  downloadImage(img: { name: string; url: string }) {
    const link = document.createElement('a');
    link.href = img.url;
    link.download = img.name;
    link.click();
  }
}
