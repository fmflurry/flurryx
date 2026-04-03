import { inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GetProjectsPort } from '../../../projects/public-api';
import { TaskProject } from '../../domain/models/task-project.model';

@Injectable()
export class GetTaskProjectsUseCase {
  private readonly getProjectsPort = inject(GetProjectsPort);

  execute(): Observable<TaskProject[]> {
    return this.getProjectsPort.getAll().pipe(
      map((projects) =>
        projects.map((p) => ({
          id: p.id,
          name: p.name,
        }))
      )
    );
  }
}
