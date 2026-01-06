import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserFilters } from '../types';
import {
  userService,
  CreateUserDto,
  UpdateUserDto,
  PatchUserDto,
} from '../services/user.service';

export const userController = {
  async create(
    req: AuthenticatedRequest<{}, {}, CreateUserDto>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const user = await userService.create(req.body);
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  },

  async list(
    req: AuthenticatedRequest<{}, {}, {}, any>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const filters = req.query;
      const result = await userService.list(filters);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  async getById(
    req: AuthenticatedRequest<{ id: string }>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const user = await userService.getById(req.params.id);
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  },

  async update(
    req: AuthenticatedRequest<{ id: string }, {}, UpdateUserDto>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const user = await userService.update(req.params.id, req.body);
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  },

  async patch(
    req: AuthenticatedRequest<{ id: string }, {}, PatchUserDto>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const user = await userService.patch(req.params.id, req.body);
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  },

  async delete(
    req: AuthenticatedRequest<{ id: string }>,
    res: Response,
    next: NextFunction
  ) {
    try {
      await userService.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
