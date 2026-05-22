import type { ApiErrorKind, ApiErrorShape } from './types';

export class ApiError extends Error implements ApiErrorShape {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export function statusToErrorKind(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  if (status >= 500) return 'server';
  return 'unknown';
}

export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.kind) {
      case 'network':
        return '无法连接 Server，请检查网络或 Server URL';
      case 'unauthorized':
        return 'Token 无效或已过期，请重新登录';
      case 'forbidden':
        return 'Token 没有访问权限';
      case 'notFound':
        return '请求的资源不存在';
      case 'conflict':
        return '该操作与当前状态冲突，请稍后重试';
      case 'server':
        return 'Server 内部错误，请稍后重试';
      default:
        return err.message || '未知错误';
    }
  }
  if (err instanceof Error) return err.message;
  return '未知错误';
}
