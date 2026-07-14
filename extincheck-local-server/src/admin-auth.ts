import { NextFunction, Request, Response } from 'express';

// Punto central para añadir autenticación al panel en una fase posterior.
export function requireLocalAdmin(_request: Request, _response: Response, next: NextFunction) {
  next();
}
