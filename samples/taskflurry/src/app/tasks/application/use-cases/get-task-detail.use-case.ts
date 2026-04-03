import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Task } from '../../domain/models/task.model';
import { GetTaskDetailPort } from '../../domain/ports/get-task-detail.port';

@Injectable()
export class GetTaskDetailUseCase {
  private readonly port = inject(GetTaskDetailPort);

  execute(taskId: string): Observable<Task> {
    return this.port.execute(taskId);
  }
}
