export default class NotFoundError extends Error {
  code: number;
  constructor(message: string) {
    super(message);
    this.code = 404;
  }
}
