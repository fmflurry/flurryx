import { inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { CreateTaskPayload } from '../../domain/models/task.model';
import { CreateTaskPort } from '../../domain/ports/create-task.port';
import { TasksEndpoint } from '../api/endpoints/tasks.endpoint';

@Injectable()
export class CreateTaskAdapter extends CreateTaskPort {
  private readonly endpoint = inject(TasksEndpoint);

  execute(payload: CreateTaskPayload): Observable<string> {
    return this.endpoint.create(payload).pipe(map((response) => response.id));
  }
}
