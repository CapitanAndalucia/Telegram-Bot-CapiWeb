import { TestBed } from '@angular/core/testing';

import { Motivation } from './motivation';

describe('Motivation', () => {
  let service: Motivation;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Motivation);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
