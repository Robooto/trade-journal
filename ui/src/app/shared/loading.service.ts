import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private count = 0;
  private _loading$ = new BehaviorSubject<boolean>(false);
  readonly loading$ = this._loading$.asObservable();

  show() {
    this.count++;
    if (!this._loading$.value) {
      this._loading$.next(true);
    }
  }

  hide() {
    if (this.count > 0) {
      this.count--;
    }
    if (this.count === 0 && this._loading$.value) {
      this._loading$.next(false);
    }
  }
}
