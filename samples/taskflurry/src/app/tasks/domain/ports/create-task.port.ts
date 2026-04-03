import { Observable } from 'rxjs';
import { CreateTaskPayload } from '../models/task.model';

export abstract class CreateTaskPort {
  abstract execute(payload: CreateTaskPayload): Observable<string>;
}
