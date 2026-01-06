import { Request, Response, NextFunction } from 'express';
import { authService, LoginDto, RegisterDto } from '../services/auth.service';

export const authController = {
  async register(req: Request<{}, {}, RegisterDto>, res: Response, next: NextFunction) {
    try {
      const result = await authService.register(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },

  async login(req: Request<{}, {}, LoginDto>, res: Response, next: NextFunction) {
    try {
      const result = await authService.login(req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
};
