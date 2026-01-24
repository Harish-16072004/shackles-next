'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerFullUser } from "@/server/actions/register-full";
import { UploadButton } from "@/lib/uploadthing";

// Lists for Dropdowns
const COLLEGES = ["ACGCET", "PSG Tech", "CIT", "GCE Salem", "Anna University", "Other"];
const DEPARTMENTS = ["Mechanical", "CSE", "ECE", "EEE", "Civil", "Other"];
const YEARS = ["I", "II", "III", "IV"];

export default function RegistrationForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    firstName: "", 
    lastName: "", 
    email: "", 
    phone: "",
    collegeName: "", 
    collegeNameOther: "", 
    collegeLoc: "", 
    department: "", 
    departmentOther: "", 
    yearOfStudy: "I",
    password: "", 
    confirmPassword: "",
    
    // --- NEW FIELDS ---
    registrationType: "GENERAL",
    amount: 500, // Default for General
    
    transactionId: "", 
    proofUrl: "", 
    acceptedTerms: false
  });

  // Handle Inputs
  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Step 1 Validation
  const handleNext = (e: any) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }
    setStep(2);
  };

  // Step 2 Submission
  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!formData.acceptedTerms) {
      alert("You must accept the Terms and Conditions.");
      return;
    }
    
    if (!formData.proofUrl) {
      alert("Please upload the payment screenshot first!");
      return;
    }
    
    setLoading(true);

    try {
       const finalCollege = formData.collegeName === "Other" ? formData.collegeNameOther : formData.collegeName;
       const finalDepartment = formData.department === "Other" ? formData.departmentOther : formData.department;

       const payload = { 
         ...formData, 
         amount: Number(formData.amount),
         collegeName: finalCollege,
         department: finalDepartment
       };
       
       const res = await registerFullUser(payload);
       
       if(res.success) {
         router.push('/dashboard'); 
       } else {
         alert(res.error || "Registration Failed");
       }
    } catch (err) {
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
            <select name="collegeName" className="input-field" onChange={handleChange} required>
              <option value="">Select College</option>
              {COLLEGES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {formData.collegeName === "Other" && (
              <input name="collegeNameOther" placeholder="Type your College Name" className="input-field bg-blue-50 border-blue-200" required />
            )}

            <input name="collegeLoc" placeholder="College Location" className="input-field" onChange={handleChange} required />

            {/* --- DEPARTMENT SECTION --- */}
            <div className="grid grid-cols-2 gap-4">
              <div className="w-full">
                <select name="department" className="input-field" onChange={handleChange} required>
                  <option value="">Select Department</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {formData.department === "Other" && (
                  <input name="departmentOther" placeholder="Type Department" className="input-field bg-blue-50 border-blue-200 mt-2" required />
                )}
              </div>
              
              <div className="w-full">
                <select name="yearOfStudy" className="input-field" onChange={handleChange} required>
                  {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <input name="password" type="password" placeholder="Password" className="input-field" onChange={handleChange} required />
              <input name="confirmPassword" type="password" placeholder="Re-Enter Password" className="input-field" onChange={handleChange} required />
            </div>

            <button type="submit" className="w-full bg-black text-white py-3 rounded-lg font-bold hover:bg-gray-800 transition">
              Proceed to Payment →
            </button>
          </div>
        )}

        {/* SECTION 2: PAYMENT */}
        {step === 2 && (
          <div className="space-y-6">
            
            {/* --- REGISTRATION TYPE DROPDOWN --- */}
            <div>
              <label className="block text-sm font-bold mb-2">Select Pass Type</label>
              <select 
                name="registrationType" 
                className="input-field border-2 border-black"
                value={formData.registrationType}
                onChange={(e) => {
                  const type = e.target.value;
                  let newAmount = 500;
                  if (type === "WORKSHOP") newAmount = 300;
                  if (type === "COMBO") newAmount = 800;
                  
                  setFormData(prev => ({ 
                    ...prev, 
                    registrationType: type, 
                    amount: newAmount 
                  }));
                }}
              >
                <option value="GENERAL">General Registration (SH26-EN)</option>
                <option value="WORKSHOP">Workshop Only (SH26-WK)</option>
                <option value="COMBO">Combo Pack (SH26-GN)</option>
              </select>
            </div>

            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 text-center">
              <p className="text-sm text-gray-500 mb-2">Scan QR to Pay</p>
              <div className="w-40 h-40 bg-white border-2 border-gray-200 mx-auto mb-3 flex items-center justify-center rounded-lg">
                 {/* Replace this span with your actual QR Image */}
                 <span className="text-xs text-gray-400 font-mono">PAYMENT QR CODE</span>
              </div>
              <p className="text-3xl font-black text-green-600">₹ {formData.amount}</p>
              <p className="text-xs text-gray-400 mt-1">Wait for payment to complete before uploading</p>
            </div>

            <div className="space-y-3">
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
                    onClick={() => setFormData(prev => ({ ...prev, proofUrl: "" }))}
                    className="text-xs text-red-500 mt-2 hover:underline"
                  >
                    Remove & Upload Again
                  </button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 bg-gray-50 flex justify-center hover:bg-gray-100 transition">
                  <UploadButton
                    endpoint="paymentProof"
                    onClientUploadComplete={(res) => {
                      if (res && res[0]) {
                        setFormData(prev => ({ ...prev, proofUrl: res[0].url }));
                      }
                    }}
                    onUploadError={(error: Error) => {
                      alert(`Upload Failed: ${error.message}`);
                    }}
                    appearance={{
                      button: "bg-black text-white text-sm px-6 py-2 rounded-md hover:bg-gray-800 transition-all",
                      allowedContent: "text-xs text-gray-500"
                    }}
                  />
                </div>
              )}
              
              <input name="transactionId" placeholder="Enter Transaction ID / UTR" className="input-field mt-4" onChange={handleChange} required />
            </div>

            <div className="flex items-center gap-2 mt-4 bg-gray-50 p-3 rounded">
              <input name="acceptedTerms" type="checkbox" id="terms" className="w-4 h-4" onChange={handleChange} />
              <label htmlFor="terms" className="text-sm text-gray-600">
                I accept the <a href="/terms" className="underline text-black font-semibold">Terms & Conditions</a>
              </label>
            </div>

            <div className="flex gap-4 mt-6">
              <button type="button" onClick={() => setStep(1)} className="w-1/3 py-3 rounded-lg border border-gray-300 font-medium hover:bg-gray-50 transition">Back</button>
              <button type="submit" className="w-2/3 bg-black text-white py-3 rounded-lg font-bold hover:bg-gray-800 transition shadow-lg" disabled={loading}>
                {loading ? "Registering..." : "Complete Registration"}
              </button>
            </div>
          </div>
        )}

      </form>
    </div>
  );
}