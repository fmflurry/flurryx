import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateTaskPayload } from '../../domain/models/task.model';
import { CreateTaskPort } from '../../domain/ports/create-task.port';

@Injectable()
export class CreateTaskUseCase {
  private readonly port = inject(CreateTaskPort);

  execute(payload: CreateTaskPayload): Observable<string> {
    return this.port.execute(payload);
  }
}
