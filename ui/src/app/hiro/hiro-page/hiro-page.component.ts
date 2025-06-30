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

interface ScreenImage {
  name: string;
  url: string;
  crossing?: boolean;
}

interface ScreenSet {
  timestamp: string;
  images: ScreenImage[];
  checking?: boolean;
}

export class HiroPageComponent {
  screens: ScreenSet[] = [];
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

  downloadImage(img: ScreenImage) {
    const link = document.createElement('a');
    link.href = img.url;
    link.download = img.name;
    link.click();
  }

  async detectCross(screen: ScreenSet) {
    screen.checking = true;
    const [img1, img2] = screen.images;
    const blob1 = await fetch(img1.url).then(r => r.blob());
    const blob2 = await fetch(img2.url).then(r => r.blob());
    const form = new FormData();
    form.append('img1', blob1, img1.name);
    form.append('img2', blob2, img2.name);

    this.http.post<Record<string, boolean>>(
      `${environment.apiUrl}/spotgamma/detect-crossing`,
      form
    ).subscribe({
      next: res => {
        for (const img of screen.images) {
          img.crossing = res[img.name];
        }
        screen.checking = false;
      },
      error: () => {
        screen.checking = false;
      }
    });
  }
}
