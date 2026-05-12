import { SetMetadata } from '@nestjs/common';

export const POLICIES_KEY = 'required_policies';

export const RequirePolicies = (...policies: string[]) =>
  SetMetadata(POLICIES_KEY, policies);
