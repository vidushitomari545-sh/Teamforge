import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z
    .string({ message: 'Full name is required' })
    .trim()
    .min(1, 'Full name must not be empty')
    .max(100, 'Full name must not exceed 100 characters'),
  email: z
    .string({ message: 'Email is required' })
    .trim()
    .email('Invalid email address format')
    .max(255, 'Email must not exceed 255 characters')
    .toLowerCase(),
  password: z
    .string({ message: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password must not exceed 128 characters'),
});

export const loginSchema = z.object({
  email: z
    .string({ message: 'Email is required' })
    .trim()
    .email('Invalid email address format')
    .toLowerCase(),
  password: z
    .string({ message: 'Password is required' })
    .min(1, 'Password is required'),
});
