// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { GET } from '../route';
import { auth } from '@/auth';
import { GetWeatherUseCase } from '@/application/farm/GetWeatherUseCase';
import { ValidationError, DomainError } from '@/domain/errors';

// Mock the dependencies
jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));



jest.mock('next/server', () => {
  return {
    NextResponse: {
      json: jest.fn((body: any, init?: any) => ({
        status: init?.status || 200,
        json: async () => body,
      })),
    },
  };
});

describe('GET /api/weather', () => {
  const mockAuth = auth as jest.Mock;
  let mockExecute: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute = jest.spyOn(GetWeatherUseCase.prototype, 'execute');
  });

  afterEach(() => {
    mockExecute.mockRestore();
  });

  const createRequest = (url: string) => {
    return {
      url,
      method: 'GET',
    } as unknown as Request;
  };

  it('should return 401 if unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce(null);

    const req = createRequest('http://localhost:3000/api/weather?date=2026-08-14&parcelId=cln3qkx7p000008l41234abcd');
    const res = await GET(req, { params: {} });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ error: 'Unauthorized' });
  });

  it('should return 400 if validation fails', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1', role: 'FARMER' } });

    // Missing parcelId and invalid date
    const req = createRequest('http://localhost:3000/api/weather?date=invalid');
    const res = await GET(req, { params: {} });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation Error');
  });

  it('should return 200 and weather data on success', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1', role: 'FARMER' } });
    
    const mockWeatherData = {
      condition: 'Nắng',
      temperature_c: 32,
      precipitation_mm: 0,
      humidity_pct: 60,
    };
    mockExecute.mockResolvedValueOnce(mockWeatherData);

    const req = createRequest('http://localhost:3000/api/weather?date=2026-08-14&parcelId=cln3qkx7p000008l41234abcd');
    const res = await GET(req, { params: {} });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual(mockWeatherData);
    expect(mockExecute).toHaveBeenCalledWith('cln3qkx7p000008l41234abcd', '2026-08-14');
  });

  it('should return 400 if parcel has no coordinates (DomainError/ValidationError)', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1', role: 'FARMER' } });
    
    mockExecute.mockRejectedValueOnce(new ValidationError('Parcel has no centroid coordinates'));

    const req = createRequest('http://localhost:3000/api/weather?date=2026-08-14&parcelId=cln3qkx7p000008l41234abcd');
    const res = await GET(req, { params: {} });

    // withErrorHandler maps ValidationError to 400
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.message).toBe('Parcel has no centroid coordinates');
  });
  
  it('should return 422 if parcel is not found (DomainError)', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1', role: 'FARMER' } });
    
    mockExecute.mockRejectedValueOnce(new DomainError('Parcel not found'));

    const req = createRequest('http://localhost:3000/api/weather?date=2026-08-14&parcelId=cln3qkx7p000008l41234abcd');
    const res = await GET(req, { params: {} });

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe('DOMAIN_ERROR');
    expect(json.error.message).toBe('Parcel not found');
  });
});
