/**
 * Errors raised by the service layer. The message is in French and safe to
 * show to the user or to return to the chef as is.
 */
export type ServiceErrorCode =
  | 'validation'
  | 'introuvable'
  | 'interdit'
  | 'conflit'
  | 'jeton_invalide';

const STATUS_BY_CODE: Record<ServiceErrorCode, number> = {
  validation: 400,
  introuvable: 404,
  interdit: 403,
  conflit: 409,
  jeton_invalide: 400,
};

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  /** HTTP status that matches the error. */
  readonly status: number;

  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

/**
 * Runs database statements and turns constraint failures into clear errors
 * instead of leaking raw SQLite messages.
 */
export async function withConstraintErrors<Result>(run: () => Promise<Result>): Promise<Result> {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('FOREIGN KEY constraint failed')) {
      throw new ServiceError(
        'conflit',
        "Action impossible : un élément lié n'existe pas, ou d'autres éléments dépendent encore de celui-ci.",
      );
    }
    if (message.includes('UNIQUE constraint failed')) {
      throw new ServiceError('conflit', 'Action impossible : cet élément existe déjà.');
    }
    throw error;
  }
}
