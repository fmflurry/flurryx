import { inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Task } from '../../domain/models/task.model';
import { GetTasksPort } from '../../domain/ports/get-tasks.port';
import { TasksEndpoint } from '../api/endpoints/tasks.endpoint';
import { TaskResponse } from '../api/response/task.response';

function toTask(response: TaskResponse): Task {
  return {
    id: response.id,
    title: response.title,
    description: response.description,
    priority: response.priority,
    status: response.status,
    projectId: response.projectId,
    createdAt: response.createdAt,
  };
}

@Injectable()
export class GetTasksAdapter extends GetTasksPort {
  private readonly endpoint = inject(TasksEndpoint);

  execute(): Observable<Task[]> {
    return this.endpoint.getAll().pipe(map((responses) => responses.map(toTask)));
  }
}
