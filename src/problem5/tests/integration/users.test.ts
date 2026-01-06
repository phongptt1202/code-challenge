import request from 'supertest';
import app from '../../src/app';

describe('Users API', () => {
  let authToken: string;

  beforeEach(async () => {
    // Register and get auth token
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
      });

    authToken = response.body.token;
  });

  describe('POST /api/users', () => {
    it('should create a new user successfully', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: 'John',
          lastName: 'Doe',
          age: 30,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.firstName).toBe('John');
      expect(response.body.lastName).toBe('Doe');
      expect(response.body.age).toBe(30);
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          age: 30,
        });

      expect(response.status).toBe(401);
    });

    it('should fail with invalid data', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: '',
          lastName: 'Doe',
          age: 200,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/users', () => {
    beforeEach(async () => {
      // Create test users
      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ firstName: 'John', lastName: 'Doe', age: 30 });

      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ firstName: 'Jane', lastName: 'Smith', age: 25 });

      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ firstName: 'Bob', lastName: 'Johnson', age: 40 });
    });

    it('should list all users', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('total');
      expect(response.body.users).toHaveLength(3);
      expect(response.body.total).toBe(3);
    });

    it('should filter by firstName', async () => {
      const response = await request(app)
        .get('/api/users?firstName=John')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.users).toHaveLength(1);
      expect(response.body.users[0].firstName).toBe('John');
    });

    it('should filter by lastName', async () => {
      const response = await request(app)
        .get('/api/users?lastName=Smith')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.users).toHaveLength(1);
      expect(response.body.users[0].lastName).toBe('Smith');
    });

    it('should filter by age range', async () => {
      const response = await request(app)
        .get('/api/users?minAge=25&maxAge=35')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.users).toHaveLength(2);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/users?limit=2&offset=1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.users).toHaveLength(2);
      expect(response.body.total).toBe(3);
    });
  });

  describe('GET /api/users/:id', () => {
    let userId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ firstName: 'John', lastName: 'Doe', age: 30 });

      userId = response.body.id;
    });

    it('should get user by id', async () => {
      const response = await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(userId);
      expect(response.body.firstName).toBe('John');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/users/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/users/:id', () => {
    let userId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ firstName: 'John', lastName: 'Doe', age: 30 });

      userId = response.body.id;
    });

    it('should update user completely', async () => {
      const response = await request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: 'Jane',
          lastName: 'Smith',
          age: 25,
        });

      expect(response.status).toBe(200);
      expect(response.body.firstName).toBe('Jane');
      expect(response.body.lastName).toBe('Smith');
      expect(response.body.age).toBe(25);
    });

    it('should fail with missing fields', async () => {
      const response = await request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: 'Jane',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/users/:id', () => {
    let userId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ firstName: 'John', lastName: 'Doe', age: 30 });

      userId = response.body.id;
    });

    it('should partially update user', async () => {
      const response = await request(app)
        .patch(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          age: 31,
        });

      expect(response.status).toBe(200);
      expect(response.body.firstName).toBe('John');
      expect(response.body.lastName).toBe('Doe');
      expect(response.body.age).toBe(31);
    });

    it('should update multiple fields', async () => {
      const response = await request(app)
        .patch(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: 'Jane',
          age: 25,
        });

      expect(response.status).toBe(200);
      expect(response.body.firstName).toBe('Jane');
      expect(response.body.lastName).toBe('Doe');
      expect(response.body.age).toBe(25);
    });
  });

  describe('DELETE /api/users/:id', () => {
    let userId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ firstName: 'John', lastName: 'Doe', age: 30 });

      userId = response.body.id;
    });

    it('should delete user', async () => {
      const response = await request(app)
        .delete(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(204);

      // Verify user is deleted
      const getResponse = await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .delete('/api/users/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });
});
