import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TasksFacade } from '../../application/facades/tasks.facade';
import { Task, TaskPriority, TaskStatus, UpdateTaskPayload } from '../../domain/models/task.model';

@Component({
  selector: 'app-task-detail',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './task-detail.component.html',
  styleUrl: './task-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDetailComponent implements OnInit {
  private readonly facade = inject(TasksFacade);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  private readonly taskId = this.route.snapshot.paramMap.get('id') ?? '';
  private readonly detailState = this.facade.getTaskDetail();

  protected readonly editing = signal(false);
  protected readonly priorities: readonly TaskPriority[] = ['low', 'medium', 'high'] as const;
  protected readonly statuses: readonly TaskStatus[] = ['todo', 'in-progress', 'done'] as const;

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    priority: ['medium' as TaskPriority, [Validators.required]],
    status: ['todo' as TaskStatus, [Validators.required]],
  });

  protected readonly task = computed(() => {
    const state = this.detailState();
    const data = state.data;
    if (!data) {
      return undefined;
    }
    return data.entities[this.taskId];
  });

  protected readonly isLoading = computed(() => {
    const state = this.detailState();
    const data = state.data;
    if (!data) {
      return state.isLoading ?? false;
    }
    return data.isLoading[this.taskId] ?? false;
  });

  protected readonly hasError = computed(() => {
    const state = this.detailState();
    const data = state.data;
    if (!data) {
      return state.status === 'Error';
    }
    return data.status[this.taskId] === 'Error';
  });

  protected readonly errors = computed(() => {
    const state = this.detailState();
    const data = state.data;
    if (!data) {
      return state.errors ?? [];
    }
    return data.errors[this.taskId] ?? [];
  });

  ngOnInit(): void {
    if (!this.taskId) {
      this.router.navigate(['/tasks/list']);
      return;
    }
    this.facade.loadTaskDetail(this.taskId);
  }

  protected startEditing(task: Task): void {
    this.form.setValue({
      title: task.title,
      description: task.description ?? '',
      priority: task.priority,
      status: task.status,
    });
    this.editing.set(true);
  }

  protected cancelEditing(): void {
    this.editing.set(false);
  }

  protected saveChanges(): void {
    if (this.form.invalid) {
      return;
    }

    const values = this.form.getRawValue();
    const payload: UpdateTaskPayload = {
      title: values.title,
      description: values.description || undefined,
      priority: values.priority,
      status: values.status,
    };

    this.facade.updateTask(this.taskId, payload);
    this.editing.set(false);
  }

  protected deleteTask(): void {
    this.facade.deleteTask(this.taskId);
    this.router.navigate(['/tasks/list']);
  }
}
