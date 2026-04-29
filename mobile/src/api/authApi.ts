import { apiRequest } from '../utils/api';

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthLoginResponse {
  access: string;
  refresh?: string;
  user: any;
}

export interface AuthRegisterRequest {
  email: string;
  password: string;
  fullName: string;
  university: string;
  faculty: string;
  filiere?: string;
  year: number;
  referralCode?: string;
}

export interface AuthRegisterResponse {
  pending: boolean;
}

export const authApi = {
  login: (body: AuthLoginRequest) =>
    apiRequest<AuthLoginResponse>('/auth/login', { method: 'POST', body }),

  register: (body: AuthRegisterRequest) =>
    apiRequest<AuthRegisterResponse>('/auth/register', { method: 'POST', body }),

  refresh: (refreshToken: string) =>
    apiRequest<{ access: string; refresh?: string }>('/auth/refresh', { method: 'POST', body: { refreshToken } }),
};

