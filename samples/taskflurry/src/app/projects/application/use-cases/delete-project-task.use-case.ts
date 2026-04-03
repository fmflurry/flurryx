import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DeleteTaskPort } from '../../../tasks/public-api';

@Injectable()
export class DeleteProjectTaskUseCase {
  private readonly deleteTaskPort = inject(DeleteTaskPort);

  execute(taskId: string): Observable<void> {
    return this.deleteTaskPort.execute(taskId);
  }
}
