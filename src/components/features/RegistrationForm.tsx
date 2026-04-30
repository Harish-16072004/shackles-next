'use client'

import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerFullUser } from "@/server/actions/register-full";
import Autocomplete from "@/components/ui/Autocomplete";
import { compressImage } from "@/lib/compress-image";
import { fullRegistrationSchema, type FullRegistrationData } from "@/lib/schemas/registration-schema";

type PaymentUploadResponse = {
  proofUrl?: string;
  proofPath?: string;
  error?: string;
};

// Lists for Dropdowns
const COLLEGES = ["ACGCET", "PSG Tech", "CIT", "GCE Salem", "Anna University"];
const DEPARTMENTS = ["Mechanical", "CSE", "ECE", "EEE", "Civil"];
const YEARS = ["I", "II", "III", "IV"] as const;

const STORAGE_KEY = "registration_form_data";

type RegistrationFormProps = {
  yearShort?: string;
};

export default function RegistrationForm({ yearShort }: RegistrationFormProps) {
  const router = useRouter();
  const currentYearShort = yearShort || String(new Date().getUTCFullYear() % 100).padStart(2, "0");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [compressingProof, setCompressingProof] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
    reset,
  } = useForm<FullRegistrationData>({
    resolver: zodResolver(fullRegistrationSchema) as any,
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      collegeName: "",
      collegeLoc: "",
      department: "",
      yearOfStudy: "I",
      password: "",
      confirmPassword: "",
      registrationType: "GENERAL",
      amount: 500,
      transactionId: "",
      proofUrl: "",
      proofPath: "",
      acceptedTerms: false,
    },
  });

  const formValues = watch();

  // Load form data from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsedData = JSON.parse(saved);
        // We don't restore passwords for security
        const { password, confirmPassword, ...rest } = parsedData;
        void password;
        void confirmPassword;
        reset({ ...rest });
      }
    } catch (error) {
      console.warn("Failed to load form data from storage:", error);
    }
  }, [reset]);

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    const subscription = watch((value) => {
      try {
        const { password, confirmPassword, ...persistable } = value;
        void password;
        void confirmPassword;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
      } catch (error) {
        console.warn("Failed to save form data to storage:", error);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  const handleAutocompleteChange = (name: string, value: string) => {
    setValue(name as keyof FullRegistrationData, value, { shouldValidate: true });
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCompressingProof(true);
      const compressed = await compressImage(file);
      setCompressingProof(false);

      setUploadingProof(true);
      const payload = new FormData();
      payload.append("file", compressed);

      const response = await fetch("/api/upload/payment-proof", {
        method: "POST",
        body: payload,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as PaymentUploadResponse;
        throw new Error(body?.error || "Failed to upload proof");
      }

      const body = (await response.json()) as PaymentUploadResponse;
      setValue("proofUrl", body.proofUrl || "", { shouldValidate: true });
      setValue("proofPath", body.proofPath || "", { shouldValidate: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`Upload Failed: ${message}`);
    } finally {
      setCompressingProof(false);
      setUploadingProof(false);
    }
  };

  // Step 1 Validation
  const handleNext = async () => {
    const fieldsToValidate: (keyof FullRegistrationData)[] = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "collegeName",
      "collegeLoc",
      "department",
      "yearOfStudy",
      "password",
      "confirmPassword",
    ];
    const isStep1Valid = await trigger(fieldsToValidate);
    if (isStep1Valid) {
      setStep(2);
    }
  };

  // Final Submission
  const onValidSubmit = async (data: FullRegistrationData) => {
    setLoading(true);

    try {
      const res = await registerFullUser({
        ...data,
        amount: Number(data.amount),
      });

      if (res.success) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
          console.warn("Failed to clear form data:", e);
        }
        router.push('/userDashboard');
      } else {
        alert(res.error || "Registration Failed");
      }
    } catch {
      alert("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card max-w-2xl mx-auto p-8 bg-white shadow-xl rounded-2xl">

      {/* Progress Bar */}
      <div className="flex mb-8 text-sm font-medium text-gray-400">
        <span className={step === 1 ? "text-black font-bold" : ""}>1. Personal Details</span>
        <span className="mx-2">→</span>
        <span className={step === 2 ? "text-black font-bold" : ""}>2. Payment & Verify</span>
      </div>

      <form onSubmit={handleSubmit(onValidSubmit)}>

        {/* SECTION 1: DETAILS */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <input {...register("firstName")} placeholder="First Name" className="input-field" />
                {errors.firstName && <p className="mt-1 text-xs text-red-500">{errors.firstName.message}</p>}
              </div>
              <div>
                <input {...register("lastName")} placeholder="Last Name" className="input-field" />
                {errors.lastName && <p className="mt-1 text-xs text-red-500">{errors.lastName.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <input {...register("email")} type="email" placeholder="Email ID" className="input-field" />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
              </div>
              <div>
                <input
                  {...register("phone")}
                  type="tel"
                  inputMode="numeric"
                  placeholder="Mobile (+91XXXXXXXXXX)"
                  className="input-field"
                />
                {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>}
              </div>
            </div>

            <div>
              <Autocomplete
                name="collegeName"
                value={formValues.collegeName}
                onChange={handleAutocompleteChange}
                suggestions={COLLEGES}
                placeholder="Select or Type College Name"
              />
              {errors.collegeName && <p className="mt-1 text-xs text-red-500">{errors.collegeName.message}</p>}
            </div>

            <div>
              <input {...register("collegeLoc")} placeholder="College Location" className="input-field" />
              {errors.collegeLoc && <p className="mt-1 text-xs text-red-500">{errors.collegeLoc.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Autocomplete
                  name="department"
                  value={formValues.department}
                  onChange={handleAutocompleteChange}
                  suggestions={DEPARTMENTS}
                  placeholder="Department"
                />
                {errors.department && <p className="mt-1 text-xs text-red-500">{errors.department.message}</p>}
              </div>

              <div>
                <select {...register("yearOfStudy")} className="input-field">
                  {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
                </select>
                {errors.yearOfStudy && <p className="mt-1 text-xs text-red-500">{errors.yearOfStudy.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  className="input-field pr-10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="h-4 w-4" />}
                </button>
                {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
              </div>
              <div className="relative">
                <input
                  {...register("confirmPassword")}
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Re-Enter Password"
                  className="input-field pr-10"
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="h-4 w-4" />}
                </button>
                {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>}
              </div>
            </div>

            <button type="button" onClick={handleNext} className="w-full bg-black text-white py-3 rounded-lg font-bold hover:bg-gray-800 transition">
              Proceed to Payment →
            </button>
          </div>
        )}

        {/* SECTION 2: PAYMENT */}
        {step === 2 && (
          <div className="space-y-6">

            {/* --- REGISTRATION TYPE CARDS --- */}
            <div>
              <label className="block text-sm font-bold mb-4 text-gray-800">Select Pass Type</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { id: "GENERAL", label: "General", price: 500, code: `SH${currentYearShort}G` },
                  { id: "WORKSHOP", label: "Workshop", price: 300, code: `SH${currentYearShort}W` },
                  { id: "COMBO", label: "Combo", price: 800, code: `SH${currentYearShort}C` },
                ].map((type) => (
                  <div
                    key={type.id}
                    onClick={() => {
                      setValue("registrationType", type.id as any, { shouldValidate: true });
                      setValue("amount", type.price, { shouldValidate: true });
                    }}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 flex flex-col justify-between ${formValues.registrationType === type.id
                      ? 'border-black bg-black text-white shadow-lg scale-105'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                  >
                    <div>
                      <p className="text-xs font-mono opacity-70 mb-1">{type.code}</p>
                      <h3 className="font-bold text-lg leading-tight">{type.label}</h3>
                    </div>
                    <div className="mt-4 text-right">
                      <p className={`text-xl font-black ${formValues.registrationType === type.id ? 'text-green-400' : 'text-black'}`}>
                        ₹{type.price}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {errors.registrationType && <p className="mt-1 text-xs text-red-500">{errors.registrationType.message}</p>}
            </div>

            <div className={`transition-all duration-300 ${!formValues.registrationType ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 text-center">
                <p className="text-sm text-gray-500 mb-2">Scan QR to Pay</p>
                <div className="w-40 h-40 bg-white border-2 border-gray-200 mx-auto mb-3 flex items-center justify-center rounded-lg">
                  <span className="text-xs text-gray-400 font-mono">PAYMENT QR CODE</span>
                </div>
                <p className="text-3xl font-black text-green-600">
                  {formValues.amount > 0 ? `₹ ${formValues.amount}` : "--"}
                </p>
                <p className="text-xs text-gray-400 mt-1">Wait for payment to complete before uploading</p>
              </div>

              <div className="space-y-3 mt-6">
                <label className="block text-sm font-medium mb-1">Upload Proof (Screenshot)</label>

                {formValues.proofUrl ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center relative group">
                    <p className="text-green-700 font-bold text-sm">✅ Upload Successful!</p>
                    <a
                      href={formValues.proofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline mt-1 block"
                    >
                      View Screenshot
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setValue("proofUrl", "", { shouldValidate: true });
                        setValue("proofPath", "", { shouldValidate: true });
                      }}
                      className="text-xs text-red-500 mt-2 hover:underline"
                    >
                      Remove & Upload Again
                    </button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 bg-gray-50 flex justify-center hover:bg-gray-100 transition">
                    <div className="w-full max-w-sm">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProofUpload}
                        className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-gray-800"
                      />
                      <p className="mt-2 text-xs text-gray-500">Accepted: image files up to 4MB</p>
                      {compressingProof ? <p className="mt-2 text-xs text-gray-600">Compressing image...</p> : null}
                      {uploadingProof ? <p className="mt-2 text-xs text-gray-600">Uploading...</p> : null}
                    </div>
                  </div>
                )}
                {errors.proofUrl && <p className="mt-1 text-xs text-red-500">{errors.proofUrl.message}</p>}

                <div>
                  <input {...register("transactionId")} placeholder="Enter Transaction ID / UTR" className="input-field mt-4" />
                  {errors.transactionId && <p className="mt-1 text-xs text-red-500">{errors.transactionId.message}</p>}
                </div>
              </div>

              <div className="space-y-1 mt-4">
                <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-sm">
                  <input {...register("acceptedTerms")} type="checkbox" id="terms" className="w-4 h-4" />
                  <label htmlFor="terms" className="text-sm text-gray-600">
                    I accept the <a
                      href="/terms-and-conditions"
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-black font-semibold hover:text-gray-800"
                    >
                      Terms & Conditions
                    </a>
                  </label>
                </div>
                {errors.acceptedTerms && <p className="mt-1 text-xs text-red-500">{errors.acceptedTerms.message}</p>}
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button type="button" onClick={() => setStep(1)} className="w-1/3 py-3 rounded-lg border border-gray-300 font-medium hover:bg-gray-50 transition">Back</button>
              <button
                type="submit"
                className={`w-2/3 bg-black text-white py-3 rounded-lg font-bold transition shadow-lg ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800'}`}
                disabled={loading}
              >
                {loading ? "Registering..." : "Complete Registration"}
              </button>
            </div>
          </div>
        )}

      </form>
    </div>
  );
}