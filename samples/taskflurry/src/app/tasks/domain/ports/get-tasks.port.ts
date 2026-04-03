import { Observable } from 'rxjs';
import { Task } from '../models/task.model';

export abstract class GetTasksPort {
  abstract execute(): Observable<Task[]>;
}
