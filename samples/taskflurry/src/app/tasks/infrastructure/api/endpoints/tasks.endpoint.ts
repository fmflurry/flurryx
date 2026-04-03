import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TaskResponse } from '../response/task.response';
import { CreateTaskPayload, UpdateTaskPayload } from '../../../domain/models/task.model';

const BASE_URL = '/api/tasks';

@Injectable()
export class TasksEndpoint {
  private readonly http = inject(HttpClient);

  getAll(): Observable<TaskResponse[]> {
    return this.http.get<TaskResponse[]>(BASE_URL);
  }

  getById(id: string): Observable<TaskResponse> {
    return this.http.get<TaskResponse>(`${BASE_URL}/${id}`);
  }

  create(payload: CreateTaskPayload): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(BASE_URL, payload);
  }

  update(id: string, payload: UpdateTaskPayload): Observable<TaskResponse> {
    return this.http.put<TaskResponse>(`${BASE_URL}/${id}`, payload);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE_URL}/${id}`);
  }
}
