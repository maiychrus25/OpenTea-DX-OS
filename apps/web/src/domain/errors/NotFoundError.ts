import { DomainError } from './DomainError'

export class NotFoundError extends DomainError {
  constructor(message: string = 'Resource not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}
