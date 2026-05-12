export interface DomainEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: string;
  occurredAt: string;
  requestId?: string;
  payload: TPayload;
}
