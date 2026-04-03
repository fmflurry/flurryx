import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DeleteTaskPort } from '../../domain/ports/delete-task.port';

@Injectable()
export class DeleteTaskUseCase {
  private readonly port = inject(DeleteTaskPort);

  execute(id: string): Observable<void> {
    return this.port.execute(id);
  }
}
