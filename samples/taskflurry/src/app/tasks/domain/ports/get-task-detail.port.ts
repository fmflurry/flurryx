import { Observable } from 'rxjs';
import { Task } from '../models/task.model';

export abstract class GetTaskDetailPort {
  abstract execute(taskId: string): Observable<Task>;
}
