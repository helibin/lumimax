import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  pageSize!: number;

  @ApiProperty({ example: 57 })
  total!: number;

  @ApiProperty({ example: 6 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasMore!: boolean;
}

export class PagedDataDto<T = unknown> {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  data!: T[];

  @ApiProperty({ type: PaginationMetaDto })
  pagination!: PaginationMetaDto;
}
