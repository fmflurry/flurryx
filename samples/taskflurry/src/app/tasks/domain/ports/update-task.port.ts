import { Observable } from 'rxjs';
import { Task, UpdateTaskPayload } from '../models/task.model';

export abstract class UpdateTaskPort {
  abstract execute(id: string, payload: UpdateTaskPayload): Observable<Task>;
}
