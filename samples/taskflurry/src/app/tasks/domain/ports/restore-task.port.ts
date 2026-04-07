import { Observable } from 'rxjs';
import { Task } from '../models/task.model';

export type RestoreTaskPayload =
  | Task
  | Pick<Task, 'id' | 'title' | 'priority' | 'status' | 'projectId'>;

export abstract class RestoreTaskPort {
  abstract execute(task: RestoreTaskPayload): Observable<Task>;
}
