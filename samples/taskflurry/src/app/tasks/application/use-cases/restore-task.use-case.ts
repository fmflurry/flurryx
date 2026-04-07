import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Task } from '../../domain/models/task.model';
import { RestoreTaskPayload, RestoreTaskPort } from '../../domain/ports/restore-task.port';

@Injectable()
export class RestoreTaskUseCase {
  private readonly port = inject(RestoreTaskPort);

  execute(task: RestoreTaskPayload): Observable<Task> {
    return this.port.execute(task);
  }
}
