export interface IotIngress {
  start?(): Promise<void>;
  stop?(): Promise<void>;
}
