import {
  BaseEntity as TypeOrmBaseEntity,
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { instanceToPlain } from 'class-transformer';
import { getCurrentUserId } from '@lumimax/runtime';
import { ulid } from 'ulid';

export abstract class EntityBase extends TypeOrmBaseEntity {
  constructor(partial?: Partial<EntityBase>) {
    super();
    Object.assign(this, partial ?? {});
  }

  @PrimaryColumn({
    name: 'id',
    type: 'char',
    length: 36,
    comment: '主键ID',
  })
  id!: string;

  @Column({
    name: 'creator_id',
    type: 'char',
    length: 36,
    nullable: true,
    comment: '创建者ID',
  })
  creatorId?: string | null;

  @Column({
    name: 'editor_id',
    type: 'char',
    length: 36,
    nullable: true,
    comment: '编辑者ID',
  })
  editorId?: string | null;

  @Column({
    name: 'is_disabled',
    type: 'boolean',
    default: false,
    comment: '是否已禁用',
  })
  isDisabled!: boolean;

  @Column({
    name: 'remark',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '备注',
  })
  remark?: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 3,
    comment: '创建时间',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    precision: 3,
    nullable: true,
    comment: '更新时间',
  })
  updatedAt?: Date | null;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamp',
    precision: 3,
    nullable: true,
    comment: '删除时间',
  })
  deletedAt?: Date | null;

  @BeforeInsert()
  protected assignId(): void {
    if (!this.id) {
      this.id = ulid().toLowerCase();
    }
    if (!this.creatorId) {
      this.creatorId = getCurrentUserId() ?? null;
    }
  }

  @BeforeUpdate()
  protected assignEditor(): void {
    this.editorId = getCurrentUserId() ?? this.editorId ?? null;
  }

  toJSON(): Record<string, unknown> {
    return instanceToPlain(this);
  }
}

export { EntityBase as BaseEntity };