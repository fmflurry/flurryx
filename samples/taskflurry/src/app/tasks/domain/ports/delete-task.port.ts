import { Observable } from 'rxjs';

export abstract class DeleteTaskPort {
  abstract execute(id: string): Observable<void>;
}
