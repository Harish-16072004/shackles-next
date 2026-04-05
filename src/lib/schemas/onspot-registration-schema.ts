import { z } from 'zod';

const indianMobileRegex = /^[6-9]\d{9}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const onspotRegistrationSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50, 'First name is too long'),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name is too long'),
  email: z.string().min(1, 'Email is required').regex(emailRegex, 'Enter a valid email address'),
  phone: z.string().min(1, 'Mobile number is required').regex(indianMobileRegex, 'Enter a valid 10-digit mobile number'),
  collegeName: z.string().min(1, 'College name is required'),
  collegeLoc: z.string().min(1, 'College location is required'),
  department: z.string().min(1, 'Department is required'),
  yearOfStudy: z.enum(['I', 'II', 'III', 'IV']),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Confirm your password'),
  registrationType: z.enum(['GENERAL', 'WORKSHOP', 'COMBO']),
  amount: z.number().min(0),
  paymentChannel: z.enum(['CASH', 'ONLINE']),
  transactionId: z.string().optional().default(''),
  proofUrl: z.string().optional().default(''),
  proofPath: z.string().optional().default(''),
  referralSource: z.string().optional().default(''),
  acceptedTerms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms and conditions',
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
}).refine(
  (data) => {
    if (data.paymentChannel === 'ONLINE') {
      return !!(data.transactionId || data.proofUrl || data.proofPath);
    }
    return true;
  },
  {
    message: 'For online payment, add a transaction ID or upload payment proof',
    path: ['transactionId'],
  }
);

// We use .input to get the type that includes optional fields for defaultValues
export type OnspotRegistrationData = z.infer<typeof onspotRegistrationSchema>;
