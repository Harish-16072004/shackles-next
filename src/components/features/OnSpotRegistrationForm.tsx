'use client'

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerOnSpotParticipant } from '@/server/actions/onspot-user-registration';
import { compressImage } from '@/lib/compress-image';
import { onspotRegistrationSchema, type OnspotRegistrationData } from '@/lib/schemas/onspot-registration-schema';

type PaymentUploadResponse = {
  proofUrl?: string;
  proofPath?: string;
  error?: string;
};

const YEARS = ['I', 'II', 'III', 'IV'] as const;
const PASS_TYPES = [
  { id: 'GENERAL', label: 'General', price: 500 },
  { id: 'WORKSHOP', label: 'Workshop', price: 300 },
  { id: 'COMBO', label: 'Combo', price: 800 },
] as const;

export default function OnSpotRegistrationForm() {
  const [loading, setLoading] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [compressingProof, setCompressingProof] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<OnspotRegistrationData>({
    resolver: zodResolver(onspotRegistrationSchema) as any,
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      collegeName: '',
      collegeLoc: '',
      department: '',
      yearOfStudy: 'I',
      password: '',
      confirmPassword: '',
      registrationType: 'GENERAL',
      amount: 500,
      paymentChannel: 'CASH',
      transactionId: '',
      proofUrl: '',
      proofPath: '',
      referralSource: '',
      acceptedTerms: false,
    },
  });

  const registrationType = watch('registrationType');
  const paymentChannel = watch('paymentChannel');
  const proofUrl = watch('proofUrl');

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCompressingProof(true);
      const compressed = await compressImage(file);
      setCompressingProof(false);

      setUploadingProof(true);
      setError('');

      const payload = new FormData();
      payload.append('file', compressed);

      const response = await fetch('/api/upload/payment-proof', {
        method: 'POST',
        body: payload,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as PaymentUploadResponse;
        throw new Error(body?.error || 'Failed to upload proof');
      }

      const body = (await response.json()) as PaymentUploadResponse;
      setValue('proofUrl', body.proofUrl || '', { shouldValidate: true });
      setValue('proofPath', body.proofPath || '', { shouldValidate: true });
    } catch (uploadError: unknown) {
      const message = uploadError instanceof Error ? uploadError.message : 'Unknown error';
      setError(`Upload failed: ${message}`);
    } finally {
      setCompressingProof(false);
      setUploadingProof(false);
    }
  };

  const handlePassSelect = (typeId: (typeof PASS_TYPES)[number]['id']) => {
    const selected = PASS_TYPES.find((type) => type.id === typeId);
    if (!selected) return;

    setValue('registrationType', selected.id, { shouldValidate: true });
    setValue('amount', selected.price, { shouldValidate: true });
  };

  const onValidSubmit = async (data: OnspotRegistrationData) => {
    setLoading(true);
    setError('');
    setSuccessMessage('');

    const result = await registerOnSpotParticipant({
      ...data,
      amount: Number(data.amount),
    });

    if (!result.success) {
      setError(result.error || 'Failed to submit on-spot registration.');
      setLoading(false);
      return;
    }

    setSuccessMessage('Registration submitted. Your account will be activated after admin payment verification.');
    reset();
    setLoading(false);
  };

  if (successMessage) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center shadow-xs">
        <h2 className="text-2xl font-bold text-green-800">Submission Received</h2>
        <p className="mt-3 text-sm text-green-700">{successMessage}</p>
        <p className="mt-2 text-xs text-green-700">You can log in after an admin verifies your payment.</p>
        <a href="/login" className="mt-5 inline-block rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800">
          Go to Login
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onValidSubmit)} className="rounded-2xl border bg-white p-6 shadow-lg space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <input {...register('firstName')} placeholder="First name" className="input-field" />
          {errors.firstName && <p className="mt-1 text-xs text-red-500">{errors.firstName.message}</p>}
        </div>
        <div>
          <input {...register('lastName')} placeholder="Last name" className="input-field" />
          {errors.lastName && <p className="mt-1 text-xs text-red-500">{errors.lastName.message}</p>}
        </div>
        <div>
          <input {...register('email')} type="email" placeholder="Email" className="input-field" />
          {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
        </div>
        <div>
          <input {...register('phone')} placeholder="Mobile (+91XXXXXXXXXX)" className="input-field" />
          {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>}
        </div>
        <div>
          <input {...register('collegeName')} placeholder="College name" className="input-field" />
          {errors.collegeName && <p className="mt-1 text-xs text-red-500">{errors.collegeName.message}</p>}
        </div>
        <div>
          <input {...register('collegeLoc')} placeholder="College location" className="input-field" />
          {errors.collegeLoc && <p className="mt-1 text-xs text-red-500">{errors.collegeLoc.message}</p>}
        </div>
        <div>
          <input {...register('department')} placeholder="Department" className="input-field" />
          {errors.department && <p className="mt-1 text-xs text-red-500">{errors.department.message}</p>}
        </div>
        <div>
          <select {...register('yearOfStudy')} className="input-field">
            {YEARS.map((year) => (
              <option key={year} value={year}>
                Year {year}
              </option>
            ))}
          </select>
          {errors.yearOfStudy && <p className="mt-1 text-xs text-red-500">{errors.yearOfStudy.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="relative">
          <input
            {...register('password')}
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            className="input-field pr-10"
          />
          <button
            type="button"
            className="absolute inset-y-0 right-3 flex items-center text-gray-500"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
        </div>

        <div className="relative">
          <input
            {...register('confirmPassword')}
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="Confirm password"
            className="input-field pr-10"
          />
          <button
            type="button"
            className="absolute inset-y-0 right-3 flex items-center text-gray-500"
            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            onClick={() => setShowConfirmPassword((v) => !v)}
          >
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-semibold text-gray-700">Pass Type</label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {PASS_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => handlePassSelect(type.id)}
              className={`rounded-xl border-2 p-4 text-left transition ${registrationType === type.id
                  ? 'border-black bg-black text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
            >
              <p className="font-semibold">{type.label}</p>
              <p className={`mt-1 text-sm ${registrationType === type.id ? 'text-green-300' : 'text-gray-500'}`}>
                Rs {type.price}
              </p>
            </button>
          ))}
        </div>
        {errors.registrationType && <p className="mt-1 text-xs text-red-500">{errors.registrationType.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <select {...register('paymentChannel')} className="input-field">
          <option value="CASH">CASH</option>
          <option value="ONLINE">ONLINE</option>
        </select>
        <div>
          <input
            {...register('transactionId')}
            placeholder={paymentChannel === 'ONLINE' ? 'Transaction ID / UTR (recommended)' : 'Transaction reference (optional)'}
            className="input-field"
          />
          {errors.transactionId && <p className="mt-1 text-xs text-red-500">{errors.transactionId.message}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <label className="block text-sm font-medium text-gray-700">Upload Payment Proof (optional for CASH)</label>
        {proofUrl ? (
          <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <p>Proof uploaded successfully.</p>
            <a href={proofUrl} target="_blank" rel="noreferrer" className="underline">
              View uploaded proof
            </a>
          </div>
        ) : null}

        <input
          type="file"
          accept="image/*"
          onChange={handleProofUpload}
          className="mt-3 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-gray-800"
        />
        {compressingProof ? <p className="mt-2 text-xs text-gray-500">Compressing image...</p> : null}
        {uploadingProof ? <p className="mt-2 text-xs text-gray-500">Uploading proof...</p> : null}
        {errors.proofUrl && <p className="mt-1 text-xs text-red-500">{errors.proofUrl.message}</p>}
      </div>

      <div>
        <input
          {...register('referralSource')}
          placeholder="How did you hear about us? (optional)"
          className="input-field"
        />
        {errors.referralSource && <p className="mt-1 text-xs text-red-500">{errors.referralSource.message}</p>}
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3">
          <input id="onspot-terms" {...register('acceptedTerms')} type="checkbox" className="h-4 w-4" />
          <label htmlFor="onspot-terms" className="text-sm text-gray-700">
            I agree to the <a href="/terms-and-conditions" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">terms and conditions</a> here.
          </label>
        </div>
        {errors.acceptedTerms && <p className="ml-1 text-xs text-red-500">{errors.acceptedTerms.message}</p>}
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <button
        type="submit"
        disabled={loading || uploadingProof}
        className="w-full rounded-lg bg-black px-4 py-3 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Submitting...' : 'Submit On-Spot Registration'}
      </button>
    </form>
  );
}

