import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { delay, of } from 'rxjs';

interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  taskCount: number;
}

interface Task {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  projectId: string;
  createdAt: string;
}

const MOCK_PROJECTS: readonly Project[] = [
  {
    id: 'p1',
    name: 'Website Redesign',
    description: 'Redesign the company website with modern UI',
    color: '#6366f1',
    taskCount: 4,
  },
  {
    id: 'p2',
    name: 'Mobile App',
    description: 'Build cross-platform mobile application',
    color: '#ec4899',
    taskCount: 3,
  },
  {
    id: 'p3',
    name: 'API Migration',
    description: 'Migrate REST API to GraphQL',
    color: '#14b8a6',
    taskCount: 2,
  },
];

const mockTasks: Task[] = [
  {
    id: 't1',
    title: 'Design homepage mockup',
    description: 'Create Figma mockups for the new homepage',
    priority: 'high',
    status: 'in-progress',
    projectId: 'p1',
    createdAt: '2024-01-15',
  },
  {
    id: 't2',
    title: 'Set up CI/CD pipeline',
    description: 'Configure GitHub Actions for automated deployment',
    priority: 'medium',
    status: 'todo',
    projectId: 'p1',
    createdAt: '2024-01-16',
  },
  {
    id: 't3',
    title: 'Implement auth flow',
    description: 'Add login and registration screens',
    priority: 'high',
    status: 'todo',
    projectId: 'p2',
    createdAt: '2024-01-17',
  },
  {
    id: 't4',
    title: 'Write API tests',
    description: 'Add integration tests for all endpoints',
    priority: 'low',
    status: 'done',
    projectId: 'p3',
    createdAt: '2024-01-18',
  },
  {
    id: 't5',
    title: 'Update dependencies',
    description: 'Bump all packages to latest versions',
    priority: 'medium',
    status: 'in-progress',
    projectId: 'p1',
    createdAt: '2024-01-19',
  },
  {
    id: 't6',
    title: 'Design system tokens',
    description: 'Define color, spacing, typography tokens',
    priority: 'high',
    status: 'todo',
    projectId: 'p1',
    createdAt: '2024-01-20',
  },
  {
    id: 't7',
    title: 'Push notifications',
    description: 'Implement push notification service',
    priority: 'medium',
    status: 'todo',
    projectId: 'p2',
    createdAt: '2024-01-21',
  },
  {
    id: 't8',
    title: 'Schema migration script',
    description: 'Create database migration for GraphQL schema',
    priority: 'high',
    status: 'in-progress',
    projectId: 'p3',
    createdAt: '2024-01-22',
  },
  {
    id: 't9',
    title: 'Offline mode',
    description: 'Add offline-first capability with local storage sync',
    priority: 'low',
    status: 'todo',
    projectId: 'p2',
    createdAt: '2024-01-23',
  },
];

let nextTaskId = 10;

export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  const url = req.url;

  if (req.method === 'GET' && url === '/api/projects') {
    return of(new HttpResponse({ status: 200, body: MOCK_PROJECTS })).pipe(delay(300));
  }

  if (req.method === 'GET' && url === '/api/tasks') {
    return of(new HttpResponse({ status: 200, body: mockTasks })).pipe(delay(300));
  }

  if (req.method === 'GET' && url.match(/^\/api\/tasks\/[\w-]+$/)) {
    const id = url.split('/').pop();
    const task = mockTasks.find((t) => t.id === id);
    if (task) {
      return of(new HttpResponse({ status: 200, body: task })).pipe(delay(300));
    }
    return of(new HttpResponse({ status: 404, body: { error: 'Task not found' } })).pipe(
      delay(300)
    );
  }

  if (req.method === 'PUT' && url.match(/^\/api\/tasks\/[\w-]+$/)) {
    const id = url.split('/').pop();
    const index = mockTasks.findIndex((t) => t.id === id);
    if (index === -1) {
      return of(new HttpResponse({ status: 404, body: { error: 'Task not found' } })).pipe(
        delay(300)
      );
    }
    const body = req.body as Record<string, unknown>;
    const updated: Task = {
      ...mockTasks[index],
      ...(body['title'] !== undefined && { title: body['title'] as string }),
      ...(body['description'] !== undefined && { description: body['description'] as string }),
      ...(body['priority'] !== undefined && { priority: body['priority'] as string }),
      ...(body['status'] !== undefined && { status: body['status'] as string }),
    };
    mockTasks[index] = updated;
    return of(new HttpResponse({ status: 200, body: updated })).pipe(delay(300));
  }

  if (req.method === 'DELETE' && url.match(/^\/api\/tasks\/[\w-]+$/)) {
    const id = url.split('/').pop();
    const index = mockTasks.findIndex((t) => t.id === id);
    if (index === -1) {
      return of(new HttpResponse({ status: 404, body: { error: 'Task not found' } })).pipe(
        delay(300)
      );
    }
    mockTasks.splice(index, 1);
    return of(new HttpResponse({ status: 204, body: null })).pipe(delay(300));
  }

  if (req.method === 'POST' && url === '/api/tasks') {
    const newId = `t${nextTaskId++}`;
    const body = req.body as Record<string, unknown>;
    const newTask: Task = {
      id: newId,
      title: body['title'] as string,
      description: (body['description'] as string) ?? '',
      priority: (body['priority'] as string) ?? 'medium',
      status: 'todo',
      projectId: body['projectId'] as string,
      createdAt: new Date().toISOString().split('T')[0],
    };
    mockTasks.push(newTask);
    return of(new HttpResponse({ status: 201, body: { id: newId } })).pipe(delay(300));
  }

  return next(req);
};
