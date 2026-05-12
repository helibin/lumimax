export enum UserType {
  CUSTOMER = 0,
  INTERNAL = 1,
}

export interface AuthenticatedUser {
  userId: string;
  type: UserType;
  tenantId?: string | null;
  roles?: string[];
  permissions?: string[];
  policies?: string[];
}
