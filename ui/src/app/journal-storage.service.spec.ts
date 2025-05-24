import { TestBed } from '@angular/core/testing';

import { JournalStorageService } from './journal-storage.service';

describe('JournalStorageService', () => {
  let service: JournalStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(JournalStorageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
