import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DeleteTaskPort } from '../../domain/ports/delete-task.port';
import { TasksEndpoint } from '../api/endpoints/tasks.endpoint';

@Injectable()
export class DeleteTaskAdapter extends DeleteTaskPort {
  private readonly endpoint = inject(TasksEndpoint);

  execute(id: string): Observable<void> {
    return this.endpoint.delete(id);
  }
}
