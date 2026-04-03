import { inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Task } from '../../domain/models/task.model';
import { GetTaskDetailPort } from '../../domain/ports/get-task-detail.port';
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
export class GetTaskDetailAdapter extends GetTaskDetailPort {
  private readonly endpoint = inject(TasksEndpoint);

  execute(taskId: string): Observable<Task> {
    return this.endpoint.getById(taskId).pipe(map(toTask));
  }
}
