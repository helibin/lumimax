import assert from 'node:assert/strict';
import test from 'node:test';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { validateDto } from './validation.util';

class SampleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(1)
  age!: number;
}

test('validateDto transforms and validates payload', async () => {
  const dto = await validateDto(SampleDto, { name: 'alice', age: '18' });
  assert.equal(dto.name, 'alice');
  assert.equal(dto.age, 18);
});

test('validateDto allows unknown fields while keeping required validation', async () => {
  const dto = await validateDto(
    SampleDto,
    { name: 'alice', age: 18, extra: true } as SampleDto & { extra: boolean },
  );
  assert.equal(dto.name, 'alice');
  assert.equal(dto.age, 18);
  assert.equal((dto as SampleDto & { extra?: boolean }).extra, true);
});

test('validateDto rejects non-object payload', async () => {
  await assert.rejects(
    () => validateDto(SampleDto, 'bad-input'),
    (error: any) => {
      assert.equal(error?.getStatus?.(), 400);
      return true;
    },
  );
});
