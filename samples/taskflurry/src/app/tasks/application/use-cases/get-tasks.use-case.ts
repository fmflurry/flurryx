import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Task } from '../../domain/models/task.model';
import { GetTasksPort } from '../../domain/ports/get-tasks.port';

@Injectable()
export class GetTasksUseCase {
  private readonly port = inject(GetTasksPort);

  execute(): Observable<Task[]> {
    return this.port.execute();
  }
}
