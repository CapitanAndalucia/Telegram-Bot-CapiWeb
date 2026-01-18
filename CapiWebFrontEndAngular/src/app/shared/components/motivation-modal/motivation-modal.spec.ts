import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MotivationModal } from './motivation-modal';

describe('MotivationModal', () => {
  let component: MotivationModal;
  let fixture: ComponentFixture<MotivationModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MotivationModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MotivationModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
