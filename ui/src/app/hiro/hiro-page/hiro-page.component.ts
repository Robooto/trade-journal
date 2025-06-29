import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-hiro-page',
  templateUrl: './hiro-page.component.html',
  styleUrls: ['./hiro-page.component.scss'],
  standalone: false,
})
export class HiroPageComponent {
  images: string[] = [];
  loading = false;

  constructor(private http: HttpClient) {}

  getScreens() {
    this.loading = true;
    this.http.get<{images: string[]}>(`${environment.apiUrl}/spotgamma/hiro`).subscribe({
      next: res => {
        this.images.push(...res.images.map(img => 'data:image/png;base64,' + img));
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }
}
