'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerFullUser } from "@/server/actions/register-full"; 

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
    collegeNameOther: "", // Store custom college here
    collegeLoc: "", 
    department: "", 
    departmentOther: "",  // Store custom department here
    yearOfStudy: "I",
    password: "", 
    confirmPassword: "",
    amount: 500, 
    transactionId: "", 
    proofUrl: "placeholder.jpg", 
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
    
    setLoading(true);

    try {
       // Logic: If "Other" is selected, use the typed value. Otherwise, use the dropdown value.
       const finalCollege = formData.collegeName === "Other" ? formData.collegeNameOther : formData.collegeName;
       const finalDepartment = formData.department === "Other" ? formData.departmentOther : formData.department;

       // Create the final payload to send to the server
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
    <div className="card max-w-2xl mx-auto p-8">
      
      {/* Progress Bar */}
      <div className="flex mb-8 text-sm font-medium text-gray-400">
        <span className={step === 1 ? "text-black" : ""}>1. Personal Details</span>
        <span className="mx-2">→</span>
        <span className={step === 2 ? "text-black" : ""}>2. Payment & Verify</span>
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
            {/* Show this input ONLY if 'Other' is selected */}
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
                {/* Show this input ONLY if 'Other' is selected */}
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

            <button type="submit" className="btn-primary w-full mt-4">
              Proceed to Payment →
            </button>
          </div>
        )}

        {/* SECTION 2: PAYMENT */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
              <p className="text-sm text-gray-500">Scan to Pay</p>
              <div className="w-32 h-32 bg-gray-200 mx-auto my-2 flex items-center justify-center">
                {/* QR Placeholder */}
                <span className="text-xs text-gray-500">QR CODE HERE</span>
              </div>
              <p className="font-bold text-lg">₹ {formData.amount}</p>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium">Upload Proof (Screenshot)</label>
              <input type="file" className="input-field p-1" accept="image/*" />
              
              <input name="transactionId" placeholder="Transaction / UTR ID" className="input-field" onChange={handleChange} required />
            </div>

            <div className="flex items-center gap-2 mt-4">
              <input name="acceptedTerms" type="checkbox" id="terms" onChange={handleChange} />
              <label htmlFor="terms" className="text-sm text-gray-600">
                I accept the <a href="/terms" className="underline text-black">Terms & Conditions</a>
              </label>
            </div>

            <div className="flex gap-4 mt-6">
              <button type="button" onClick={() => setStep(1)} className="btn-outline w-1/3">Back</button>
              <button type="submit" className="btn-primary w-2/3" disabled={loading}>
                {loading ? "Registering..." : "Complete Registration"}
              </button>
            </div>
          </div>
        )}

      </form>
    </div>
  );
}