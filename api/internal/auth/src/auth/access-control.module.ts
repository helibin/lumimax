import { Module } from '@nestjs/common';
import { JwtModule } from '../jwt/jwt.module';
import { InternalPrincipalGuard } from './internal-principal.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PolicyGuard } from './policy.guard';
import { PermissionsGuard } from './permissions.guard';
import { UserTypeGuard } from './user-type.guard';

@Module({
  imports: [JwtModule.forRoot()],
  providers: [
    JwtAuthGuard,
    PermissionsGuard,
    PolicyGuard,
    InternalPrincipalGuard,
    UserTypeGuard,
  ],
  exports: [
    JwtModule,
    JwtAuthGuard,
    PermissionsGuard,
    PolicyGuard,
    InternalPrincipalGuard,
    UserTypeGuard,
  ],
})
export class AccessControlModule {}
