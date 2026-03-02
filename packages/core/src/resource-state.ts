export interface ResourceState<T> {
  isLoading?: boolean;
  data?: T;
  status?: 'Success' | 'Error';
  errors?: Array<{
    code: string;
    message: string;
  }>;
}

export type StoreEnum = string | number | symbol;
