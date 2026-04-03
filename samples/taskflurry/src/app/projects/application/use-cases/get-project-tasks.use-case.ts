import { inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GetTasksPort } from '../../../tasks/public-api';
import { ProjectTask } from '../../domain/models/project-task.model';

@Injectable()
export class GetProjectTasksUseCase {
  private readonly getTasksPort = inject(GetTasksPort);

  execute(): Observable<ProjectTask[]> {
    return this.getTasksPort.execute().pipe(
      map((tasks) =>
        tasks.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          status: t.status,
          projectId: t.projectId,
        }))
      )
    );
  }
}
