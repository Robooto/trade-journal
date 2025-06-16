import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FuturesService {
  private months = [2, 5, 8, 11]; // March, June, Sept, Dec
  private codes = ['H', 'M', 'U', 'Z'];

  getCurrentESContract(today: Date = new Date(), rollDays = 7): string {
    const year = today.getFullYear();
    for (let i = 0; i < this.months.length; i++) {
      const thirdFri = this.thirdFriday(year, this.months[i]);
      const rollDate = new Date(thirdFri);
      rollDate.setDate(rollDate.getDate() - rollDays);
      if (today <= rollDate) {
        return `/ES${this.codes[i]}${year % 10}`;
      }
    }
    return `/ES${this.codes[0]}${(year + 1) % 10}`;
  }

  private thirdFriday(year: number, month: number): Date {
    const date = new Date(year, month, 1);
    let count = 0;
    while (true) {
      if (date.getDay() === 5) {
        count++;
        if (count === 3) {
          return new Date(date);
        }
      }
      date.setDate(date.getDate() + 1);
    }
  }
}
