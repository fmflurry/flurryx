import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { type Task, type RestoreTaskPayload, RestoreTaskPort } from '../../../tasks/public-api';

@Injectable()
export class RestoreProjectTaskUseCase {
  private readonly port = inject(RestoreTaskPort);

  execute(task: RestoreTaskPayload): Observable<Task> {
    return this.port.execute(task);
  }
}
