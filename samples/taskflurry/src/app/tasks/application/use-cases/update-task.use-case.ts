import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Task, UpdateTaskPayload } from '../../domain/models/task.model';
import { UpdateTaskPort } from '../../domain/ports/update-task.port';

@Injectable()
export class UpdateTaskUseCase {
  private readonly port = inject(UpdateTaskPort);

  execute(id: string, payload: UpdateTaskPayload): Observable<Task> {
    return this.port.execute(id, payload);
  }
}
