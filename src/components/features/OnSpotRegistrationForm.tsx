'use client'

import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { registerOnSpotParticipant } from '@/server/actions/onspot-user-registration';

type PaymentUploadResponse = {
  proofUrl?: string;
  proofPath?: string;
  error?: string;
};

const YEARS = ['I', 'II', 'III', 'IV'];
const PASS_TYPES = [
  { id: 'GENERAL', label: 'General', price: 500 },
  { id: 'WORKSHOP', label: 'Workshop', price: 300 },
  { id: 'COMBO', label: 'Combo', price: 800 },
] as const;

function isValidIndianMobile(value: string) {
  const normalized = value.replace(/[\s-]/g, '');
  return /^(?:\+91|91)?[6-9]\d{9}$/.test(normalized);
}

function getDefaultFormData() {
  return {
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
  };
}

export default function OnSpotRegistrationForm() {
  const [loading, setLoading] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState(getDefaultFormData());
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const nextValue = e.target instanceof HTMLInputElement && e.target.type === 'checkbox' ? e.target.checked : value;
    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
  };

  const handleProofUpload = async (file: File) => {
    try {
      setUploadingProof(true);
      setError('');

      const payload = new FormData();
      payload.append('file', file);

      const response = await fetch('/api/upload/payment-proof', {
        method: 'POST',
        body: payload,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as PaymentUploadResponse;
        throw new Error(body?.error || 'Failed to upload proof');
      }

      const body = (await response.json()) as PaymentUploadResponse;
      setFormData((prev) => ({
        ...prev,
        proofUrl: body.proofUrl || '',
        proofPath: body.proofPath || '',
      }));
    } catch (uploadError: unknown) {
      const message = uploadError instanceof Error ? uploadError.message : 'Unknown error';
      setError(`Upload failed: ${message}`);
    } finally {
      setUploadingProof(false);
    }
  };

  const handlePassSelect = (typeId: (typeof PASS_TYPES)[number]['id']) => {
    const selected = PASS_TYPES.find((type) => type.id === typeId);
    if (!selected) return;

    setFormData((prev) => ({
      ...prev,
      registrationType: selected.id,
      amount: selected.price,
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!isValidIndianMobile(formData.phone)) {
      setError('Enter a valid Indian mobile number (10 digits, optional +91).');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!formData.acceptedTerms) {
      setError('You must accept terms before submitting.');
      return;
    }

    if (formData.paymentChannel === 'ONLINE' && !formData.transactionId && !formData.proofUrl && !formData.proofPath) {
      setError('For online payment, add a transaction ID or upload payment proof.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMessage('');

    const result = await registerOnSpotParticipant({
      ...formData,
      amount: Number(formData.amount),
    });

    if (!result.success) {
      setError(result.error || 'Failed to submit on-spot registration.');
      setLoading(false);
      return;
    }

    setSuccessMessage('Registration submitted. Your account will be activated after admin payment verification.');
    setFormData(getDefaultFormData());
    setLoading(false);
  };

  if (successMessage) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center shadow-sm">
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
    <form onSubmit={handleSubmit} className="rounded-2xl border bg-white p-6 shadow-lg space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <input name="firstName" placeholder="First name" className="input-field" value={formData.firstName} onChange={handleChange} required />
        <input name="lastName" placeholder="Last name" className="input-field" value={formData.lastName} onChange={handleChange} required />
        <input name="email" type="email" placeholder="Email" className="input-field" value={formData.email} onChange={handleChange} required />
        <input name="phone" placeholder="Mobile (+91XXXXXXXXXX)" className="input-field" value={formData.phone} onChange={handleChange} required />
        <input name="collegeName" placeholder="College name" className="input-field" value={formData.collegeName} onChange={handleChange} required />
        <input name="collegeLoc" placeholder="College location" className="input-field" value={formData.collegeLoc} onChange={handleChange} required />
        <input name="department" placeholder="Department" className="input-field" value={formData.department} onChange={handleChange} required />
        <select name="yearOfStudy" className="input-field" value={formData.yearOfStudy} onChange={handleChange} required>
          {YEARS.map((year) => (
            <option key={year} value={year}>
              Year {year}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="relative">
          <input
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            className="input-field pr-10"
            value={formData.password}
            onChange={handleChange}
            required
          />
          <button
            type="button"
            className="absolute inset-y-0 right-3 flex items-center text-gray-500"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="relative">
          <input
            name="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="Confirm password"
            className="input-field pr-10"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
          />
          <button
            type="button"
            className="absolute inset-y-0 right-3 flex items-center text-gray-500"
            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            onClick={() => setShowConfirmPassword((v) => !v)}
          >
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
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
              className={`rounded-xl border-2 p-4 text-left transition ${
                formData.registrationType === type.id
                  ? 'border-black bg-black text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              <p className="font-semibold">{type.label}</p>
              <p className={`mt-1 text-sm ${formData.registrationType === type.id ? 'text-green-300' : 'text-gray-500'}`}>
                Rs {type.price}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <select name="paymentChannel" className="input-field" value={formData.paymentChannel} onChange={handleChange}>
          <option value="CASH">CASH</option>
          <option value="ONLINE">ONLINE</option>
        </select>
        <input
          name="transactionId"
          placeholder={formData.paymentChannel === 'ONLINE' ? 'Transaction ID / UTR (recommended)' : 'Transaction reference (optional)'}
          className="input-field"
          value={formData.transactionId}
          onChange={handleChange}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <label className="block text-sm font-medium text-gray-700">Upload Payment Proof (optional for CASH)</label>
        {formData.proofUrl ? (
          <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <p>Proof uploaded successfully.</p>
            <a href={formData.proofUrl} target="_blank" rel="noreferrer" className="underline">
              View uploaded proof
            </a>
          </div>
        ) : null}

        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              void handleProofUpload(file);
            }
          }}
          className="mt-3 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-gray-800"
        />
        {uploadingProof ? <p className="mt-2 text-xs text-gray-500">Uploading proof...</p> : null}
      </div>

      <input
        name="referralSource"
        placeholder="How did you hear about us? (optional)"
        className="input-field"
        value={formData.referralSource}
        onChange={handleChange}
      />

      <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3">
        <input id="onspot-terms" name="acceptedTerms" type="checkbox" checked={formData.acceptedTerms} onChange={handleChange} className="h-4 w-4" />
        <label htmlFor="onspot-terms" className="text-sm text-gray-700">
          I confirm that the details provided are correct.
        </label>
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
