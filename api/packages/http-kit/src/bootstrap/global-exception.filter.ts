import { Catch } from '@nestjs/common';
import { AllExceptionFilter } from '../response/exception.filter';

@Catch()
export class GlobalExceptionFilter extends AllExceptionFilter {}
