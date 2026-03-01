'use client'

import { type ChangeEvent, type FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { registerFullUser } from "@/server/actions/register-full";
import Autocomplete from "@/components/ui/Autocomplete";

type PaymentUploadResponse = {
  proofUrl?: string;
  proofPath?: string;
  error?: string;
};

// Lists for Dropdowns
const COLLEGES = ["ACGCET", "PSG Tech", "CIT", "GCE Salem", "Anna University"];
const DEPARTMENTS = ["Mechanical", "CSE", "ECE", "EEE", "Civil"];
const YEARS = ["I", "II", "III", "IV"];

export default function RegistrationForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    firstName: "", 
    lastName: "", 
    email: "", 
    phone: "",
    collegeName: "", 
    collegeNameOther: "", // Keeping for compatibility but unused
    collegeLoc: "", 
    department: "", 
    departmentOther: "", // Keeping for compatibility but unused
    yearOfStudy: "I",
    password: "", 
    confirmPassword: "",
    
    registrationType: "",
    amount: 0,
    
    transactionId: "", 
    proofUrl: "", 
    proofPath: "",
    acceptedTerms: false
  });

  // Handle standard input changes
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Handle Autocomplete changes
  const handleAutocompleteChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleProofUpload = async (file: File) => {
    try {
      setUploadingProof(true);
      const payload = new FormData();
      payload.append("file", file);

      const response = await fetch("/api/upload/payment-proof", {
        method: "POST",
        body: payload,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as PaymentUploadResponse;
        throw new Error(body?.error || "Failed to upload proof");
      }

      const body = (await response.json()) as PaymentUploadResponse;
      setFormData(prev => ({
        ...prev,
        proofUrl: body.proofUrl || "",
        proofPath: body.proofPath || "",
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`Upload Failed: ${message}`);
    } finally {
      setUploadingProof(false);
    }
  };

  // Step 1 Validation
  const handleNext = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }
    setStep(2);
  };

  // Step 2 Submission
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.registrationType) {
      alert("Please select a Pass Type to proceed.");
      return;
    }

    if (!formData.acceptedTerms) {
      alert("You must accept the Terms and Conditions.");
      return;
    }
    
    if (!formData.proofUrl && !formData.proofPath) {
      alert("Please upload the payment screenshot first!");
      return;
    }
    
    setLoading(true);

    try {
       // Since Autocomplete sets the value directly, we don't need "Other" logic
       const finalCollege = formData.collegeName;
       const finalDepartment = formData.department;

       const payload = { 
         ...formData, 
         amount: Number(formData.amount),
         collegeName: finalCollege,
         department: finalDepartment
       };

       
       const res = await registerFullUser(payload);
       
       if(res.success) {
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

      <form onSubmit={step === 1 ? handleNext : handleSubmit}>
        
        {/* SECTION 1: DETAILS */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <input name="firstName" placeholder="First Name" className="input-field" onChange={handleChange} required />
              <input name="lastName" placeholder="Last Name" className="input-field" onChange={handleChange} required />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <input name="email" type="email" placeholder="Email ID" className="input-field" onChange={handleChange} required />
              <input name="phone" placeholder="Mobile Number" className="input-field" onChange={handleChange} required />
            </div>

            {/* --- COLLEGE SECTION --- */}
            <Autocomplete 
              name="collegeName"
              value={formData.collegeName}
              onChange={handleAutocompleteChange}
              suggestions={COLLEGES}
              placeholder="Select or Type College Name"
              required
            />

            <input name="collegeLoc" placeholder="College Location" className="input-field" onChange={handleChange} required />

            {/* --- DEPARTMENT SECTION --- */}
            <div className="grid grid-cols-2 gap-4">
              <div className="w-full">
                <Autocomplete
                  name="department"
                  value={formData.department}
                  onChange={handleAutocompleteChange}
                  suggestions={DEPARTMENTS}
                  placeholder="Department"
                  required
                />
              </div>
              
              <div className="w-full">
                <select name="yearOfStudy" className="input-field" onChange={handleChange} required>
                  {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  className="input-field pr-10"
                  onChange={handleChange}
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="relative">
                <input
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Re-Enter Password"
                  className="input-field pr-10"
                  onChange={handleChange}
                  required
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" className="w-full bg-black text-white py-3 rounded-lg font-bold hover:bg-gray-800 transition">
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
                  { id: "GENERAL", label: "General", price: 500, code: "SH26G" },
                  { id: "WORKSHOP", label: "Workshop", price: 300, code: "SH26W" },
                  { id: "COMBO", label: "Combo", price: 800, code: "SH26C" },
                ].map((type) => (
                  <div 
                    key={type.id}
                    onClick={() => setFormData(prev => {
                      // If already selected, deselect it
                      if (prev.registrationType === type.id) {
                        return { ...prev, registrationType: "", amount: 0 };
                      }
                      // Otherwise select it
                      return { ...prev, registrationType: type.id, amount: type.price };
                    })}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 flex flex-col justify-between ${
                      formData.registrationType === type.id 
                        ? 'border-black bg-black text-white shadow-lg scale-105' 
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-mono opacity-70 mb-1">{type.code}</p>
                      <h3 className="font-bold text-lg leading-tight">{type.label}</h3>
                    </div>
                    <div className="mt-4 text-right">
                      <p className={`text-xl font-black ${formData.registrationType === type.id ? 'text-green-400' : 'text-black'}`}>
                        ₹{type.price}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`transition-all duration-300 ${!formData.registrationType ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 text-center">
                <p className="text-sm text-gray-500 mb-2">Scan QR to Pay</p>
                <div className="w-40 h-40 bg-white border-2 border-gray-200 mx-auto mb-3 flex items-center justify-center rounded-lg">
                  {/* Replace this span with your actual QR Image */}
                  <span className="text-xs text-gray-400 font-mono">PAYMENT QR CODE</span>
                </div>
                <p className="text-3xl font-black text-green-600">
                  {formData.amount > 0 ? `₹ ${formData.amount}` : "--"}
                </p>
                <p className="text-xs text-gray-400 mt-1">Wait for payment to complete before uploading</p>
              </div>

              <div className="space-y-3 mt-6">
                <label className="block text-sm font-medium mb-1">Upload Proof (Screenshot)</label>
                
                {formData.proofUrl ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center relative group">
                    <p className="text-green-700 font-bold text-sm">✅ Upload Successful!</p>
                    <a 
                      href={formData.proofUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline mt-1 block"
                    >
                      View Screenshot
                    </a>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, proofUrl: "", proofPath: "" }))}
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
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            void handleProofUpload(file);
                          }
                        }}
                        className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-gray-800"
                      />
                      <p className="mt-2 text-xs text-gray-500">Accepted: image files up to 4MB</p>
                      {uploadingProof ? <p className="mt-2 text-xs text-gray-600">Uploading...</p> : null}
                    </div>
                  </div>
                )}
                
                <input name="transactionId" placeholder="Enter Transaction ID / UTR" className="input-field mt-4" onChange={handleChange} required />
              </div>

              {/* --- FIXED SECTION START --- */}
              <div className="flex items-center gap-2 mt-4 bg-gray-50 p-3 rounded">
                <input name="acceptedTerms" type="checkbox" id="terms" className="w-4 h-4" onChange={handleChange} />
                <label htmlFor="terms" className="text-sm text-gray-600">
                  I accept the <a 
                    href="/terms" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="underline text-black font-semibold hover:text-gray-800"
                  >
                    Terms & Conditions
                  </a>
                </label>
              </div>
              {/* --- FIXED SECTION END --- */}
            </div>

            <div className="flex gap-4 mt-6">
              <button type="button" onClick={() => setStep(1)} className="w-1/3 py-3 rounded-lg border border-gray-300 font-medium hover:bg-gray-50 transition">Back</button>
              <button 
                type="submit" 
                className={`w-2/3 bg-black text-white py-3 rounded-lg font-bold transition shadow-lg ${!formData.registrationType ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800'}`} 
                disabled={loading || !formData.registrationType}
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