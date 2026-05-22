/**
 * 业务错误统一定义。
 *
 * `code` 字段用于客户端识别，`status` 用于 HTTP；HTTP 之外（如 WebSocket）只关心 code。
 */
export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "bad_request"
  | "conflict"
  | "machine_deleted"
  | "machine_not_online"
  | "internal";

export function unauthorized(message = "鉴权失败"): ApiError {
  return new ApiError("unauthorized", 401, message);
}

export function forbidden(message = "无权访问"): ApiError {
  return new ApiError("forbidden", 403, message);
}

export function notFound(message = "资源不存在"): ApiError {
  return new ApiError("not_found", 404, message);
}

export function badRequest(
  message = "请求参数无效",
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError("bad_request", 400, message, details);
}

export function conflict(message = "状态冲突"): ApiError {
  return new ApiError("conflict", 409, message);
}
