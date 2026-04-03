import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TasksFacade } from '../../application/facades/tasks.facade';
import { CreateTaskPayload, TaskPriority } from '../../domain/models/task.model';

@Component({
  selector: 'app-task-create',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './task-create.component.html',
  styleUrl: './task-create.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskCreateComponent implements OnInit {
  private readonly facade = inject(TasksFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly creationState = this.facade.getTaskCreation();
  protected readonly isSubmitting = computed(() => this.creationState().isLoading ?? false);
  protected readonly hasError = computed(() => this.creationState().status === 'Error');
  protected readonly errors = computed(() => this.creationState().errors ?? []);
  protected readonly isCreated = computed(() => this.creationState().status === 'Success');
  protected readonly createdTaskId = computed(() => this.creationState().data ?? null);

  private readonly projectsState = this.facade.getAllProjects();
  protected readonly projects = computed(() => this.projectsState().data ?? []);
  protected readonly isLoadingProjects = computed(() => this.projectsState().isLoading ?? false);

  protected readonly projectId = computed(() => this.route.snapshot.queryParamMap.get('projectId'));
  protected readonly cameFromProject = computed(() => !!this.projectId());

  protected readonly priorities: readonly TaskPriority[] = ['low', 'medium', 'high'] as const;

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    priority: ['medium' as TaskPriority, [Validators.required]],
    projectId: ['', [Validators.required]],
  });

  ngOnInit(): void {
    this.facade.clearTaskCreation();
    this.facade.loadProjects();

    const projectId = this.projectId();
    if (projectId) {
      this.form.controls.projectId.setValue(projectId);
    }
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      return;
    }

    const payload: CreateTaskPayload = {
      title: this.form.getRawValue().title,
      description: this.form.getRawValue().description || undefined,
      priority: this.form.getRawValue().priority,
      projectId: this.form.getRawValue().projectId,
    };

    this.facade.createTask(payload);
  }
}
