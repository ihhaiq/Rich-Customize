export class AppError extends Error {
  constructor(message = '') {
    super(message);
    this.name = new.target.name;
  }
}

export class EditorLimitError extends AppError {
  constructor(code, limit, actual) {
    super(`${code}: ${actual} > ${limit}`);
    this.code = code;
    this.limit = limit;
    this.actual = actual;
  }
}

export class PageLimitError extends AppError {
  constructor(limit = 12) {
    super(`saved page limit reached: ${limit}`);
    this.limit = limit;
  }
}

export class UnsafeMediaError extends AppError {}
export class MissingShowcaseMedia extends AppError {}
export class DataImportError extends AppError {}
export class RichMessageRenderError extends AppError {}
