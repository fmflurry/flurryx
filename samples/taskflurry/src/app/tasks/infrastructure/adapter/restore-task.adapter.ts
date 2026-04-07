import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Task } from '../../domain/models/task.model';
import { RestoreTaskPayload, RestoreTaskPort } from '../../domain/ports/restore-task.port';
import { TasksEndpoint } from '../api/endpoints/tasks.endpoint';

@Injectable()
export class RestoreTaskAdapter extends RestoreTaskPort {
  private readonly endpoint = inject(TasksEndpoint);

  execute(task: RestoreTaskPayload): Observable<Task> {
    return this.endpoint.restore(task);
  }
}
