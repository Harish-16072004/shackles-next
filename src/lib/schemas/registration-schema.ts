import { z } from 'zod';

const indianMobileRegex = /^[6-9]\d{9}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const registrationStep1Schema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50, 'First name is too long'),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name is too long'),
  email: z.string().min(1, 'Email is required').regex(emailRegex, 'Enter a valid email address'),
  phone: z.string().min(1, 'Mobile number is required').regex(indianMobileRegex, 'Enter a valid 10-digit mobile number starting with 6-9'),
  collegeName: z.string().min(1, 'College name is required'),
  collegeLoc: z.string().min(1, 'College location is required'),
  department: z.string().min(1, 'Department is required'),
  yearOfStudy: z.enum(['I', 'II', 'III', 'IV']),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Confirm your password'),
});

export const registrationStep2Schema = z.object({
  registrationType: z.enum(['GENERAL', 'WORKSHOP', 'COMBO'], { message: 'Select a pass type' }),
  amount: z.number().min(0).default(500),
  transactionId: z.string().min(4, 'Transaction ID must be at least 4 characters').default(''),
  proofUrl: z.string().min(1, 'Payment proof is required').default(''),
  proofPath: z.string().optional().default(''),
  acceptedTerms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms and conditions',
  }),
});

export type RegistrationStep1 = z.infer<typeof registrationStep1Schema>;
export type RegistrationStep2 = z.infer<typeof registrationStep2Schema>;

// Merge the schemas and add the password refinement at the end
export const fullRegistrationSchema = registrationStep1Schema.merge(registrationStep2Schema).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type FullRegistrationData = z.infer<typeof fullRegistrationSchema>;
