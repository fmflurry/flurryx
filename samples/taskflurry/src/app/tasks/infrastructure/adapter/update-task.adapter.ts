import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Task, UpdateTaskPayload } from '../../domain/models/task.model';
import { UpdateTaskPort } from '../../domain/ports/update-task.port';
import { TasksEndpoint } from '../api/endpoints/tasks.endpoint';

@Injectable()
export class UpdateTaskAdapter extends UpdateTaskPort {
  private readonly endpoint = inject(TasksEndpoint);

  execute(id: string, payload: UpdateTaskPayload): Observable<Task> {
    return this.endpoint.update(id, payload);
  }
}
