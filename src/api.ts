const API_BASE_URL = (
  import.meta.env.VITE_API_URL || ""
).replace(/\/+$/, "")

const TOKEN_STORAGE_KEY = "health-records-token"

const USER_STORAGE_KEY = "health-records-user"

export interface AuthUser {
  id: string

  name: string

  email: string

  role: Role
}

export type Role = "Admin" | "Records Officer" | "Physician" | "Nurse"

export interface LoginResponse {
  token: string

  user: AuthUser
}

interface ApiErrorBody {
  error?: {
    code?: string

    message?: string

    details?: unknown

    fields?: Record<string, string>
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown

  authenticated?: boolean
}

export class ApiError extends Error {
  code: string

  status: number

  details?: unknown

  fields?: Record<string, string>

  constructor(
    message: string,
    status: number,
    code = "API_ERROR",
    details?: unknown,
    fields?: Record<string, string>,
  ) {
    super(message)

    this.name = "ApiError"

    this.status = status

    this.code = code

    this.details = details

    this.fields = fields
  }
}

let token =
  typeof window === "undefined"
    ? null
    : window.sessionStorage.getItem(TOKEN_STORAGE_KEY)

let unauthorizedHandler: (() => void) | null = null

function isAuthUser(value: unknown): value is AuthUser {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "email" in value &&
    typeof value.email === "string" &&
    "role" in value &&
    isRole(value.role)
  )
}

export function isRole(role: unknown): role is Role {
  return (
    typeof role === "string" &&
    ["Admin", "Records Officer", "Physician", "Nurse"].includes(role)
  )
}

export function setAuthSession(authToken: string, user: AuthUser) {
  token = authToken

  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, authToken)

  window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
}

export function clearAuthSession() {
  token = null

  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY)

    window.sessionStorage.removeItem(USER_STORAGE_KEY)
  }
}

export function getStoredAuthUser(): AuthUser | null {
  if (!token || typeof window === "undefined") return null

  try {
    const value: unknown = JSON.parse(
      window.sessionStorage.getItem(USER_STORAGE_KEY) || "null",
    )

    if (isAuthUser(value)) return value
  } catch {
    clearAuthSession()
  }

  return null
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    body,
    authenticated = true,
    headers: requestHeaders,
    ...requestOptions
  } = options

  const headers = new Headers(requestHeaders)

  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  if (authenticated && token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestOptions,

      headers,

      body:
        body === undefined
          ? undefined
          : headers.get("Content-Type")?.includes("application/json")
            ? JSON.stringify(body)
            : body as BodyInit,
    })
  } catch {
    throw new ApiError(
      "Cannot reach the API. Check that the backend is running at the configured URL.",

      0,

      "NETWORK_ERROR",
    )
  }

  if (response.status === 401) {
    clearAuthSession()

    unauthorizedHandler?.()
  }

  const responseBody = await parseResponseBody(response)

  if (!response.ok) {
    const errorBody = responseBody as ApiErrorBody | null

    throw new ApiError(
      errorBody?.error?.message ||
        `The request failed with status ${response.status}.`,

      response.status,

      errorBody?.error?.code,

      errorBody?.error?.details,

      errorBody?.error?.fields,
    )
  }

  return responseBody as T
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null

  const contentType = response.headers.get("content-type") || ""

  if (!contentType.includes("application/json")) {
    if (response.ok) return null

    throw new ApiError(
      "The server returned an unexpected response.",
      response.status,
    )
  }

  try {
    return await response.json()
  } catch {
    throw new ApiError("The server returned invalid JSON.", response.status)
  }
}
