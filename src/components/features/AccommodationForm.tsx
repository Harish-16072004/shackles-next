'use client'

import { useState } from "react";
import { registerAccommodation } from "@/server/actions/accommodation";

export default function AccommodationForm({ userId }: { userId: string }) {
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "">("");
  const [days, setDays] = useState<string[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const toggleDay = (day: string) => {
    setDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const toggleGender = (value: "MALE" | "FEMALE") => {
    setGender((prev) => (prev === value ? "" : value));
  };

  const handleSubmit = async () => {
    if (!accepted) return alert("Please accept the rules.");
    if (!gender) return alert("Please select your gender.");
    if (days.length === 0) return alert("Select at least one date.");

    setLoading(true);
    const res = await registerAccommodation({ userId, gender, days });
    setLoading(false);

    if (res.success) setSuccess(true);
    else alert(res.error);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10">
        
        {/* LEFT COLUMN: RULES */}
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Accommodation</h1>
            <p className="text-gray-500 mt-2">
              Secure your stay at our college common halls.
            </p>
          </div>
          
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 space-y-6">
            <h2 className="font-semibold text-lg text-gray-900 border-b pb-2">Rules & Regulations</h2>
            <ul className="space-y-4 text-gray-600 list-disc pl-5 text-sm leading-relaxed">
              <li>Accommodation is provided on a <strong>First-Come-First-Serve</strong> basis.</li>
              <li>Separate common halls are allocated for Boys and Girls.</li>
              <li>Participants must carry their <strong>College ID Card</strong> and <strong>Symposium ID Tag</strong> at all times.</li>
              <li>Check-in starts at <strong>6:00 PM</strong> on the previous day.</li>
              <li>Strictly <strong>No Alcohol, Smoking, or Misconduct</strong> allowed.</li>
              <li>Lights out at <strong>10:30 PM</strong>. Maintain silence in the halls.</li>
            </ul>
          </div>
        </div>

        {/* RIGHT COLUMN: BOOKING CARD */}
        <div className="flex flex-col justify-center">
          {success ? (
            <div className="bg-white border border-green-100 p-8 rounded-2xl text-center shadow-lg">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Request Confirmed</h2>
              <p className="text-gray-500 mt-2">
                Your accommodation spot has been reserved.
              </p>
            </div>
          ) : (
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
              <h3 className="text-xl font-bold mb-6 text-gray-900">Book Your Stay</h3>
              
              {/* Dates Selection */}
              <div className="mb-6">
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Select Dates</label>
                <div className="grid grid-cols-2 gap-4">
                  {['DAY1', 'DAY2'].map((d, i) => (
                    <button 
                      key={d}
                      onClick={() => toggleDay(d)}
                      className={`p-4 rounded-xl border-2 font-bold transition-all text-left ${
                        days.includes(d) 
                        ? "border-black bg-black text-white" 
                        : "border-gray-200 text-gray-400 hover:border-gray-300"
                      }`}
                    >
                      <span className="block text-lg">MAR {25 + i}</span>
                      <span className="text-xs font-normal opacity-70">Day {i + 1}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Gender Selection */}
              <div className="mb-8">
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Select Gender</label>
                <div className="flex gap-4">
                  <button 
                    onClick={() => toggleGender("MALE")}
                    className={`flex-1 py-3 rounded-lg border font-medium transition-all ${
                      gender === "MALE" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    Male
                  </button>
                  <button 
                    onClick={() => toggleGender("FEMALE")}
                    className={`flex-1 py-3 rounded-lg border font-medium transition-all ${
                      gender === "FEMALE" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    Female
                  </button>
                </div>
              </div>

              {/* Rules Checkbox */}
              <div className="mb-8 flex items-start gap-3 bg-gray-50 p-4 rounded-lg border border-gray-100">
                <input 
                  type="checkbox" 
                  id="rules" 
                  className="w-5 h-5 mt-0.5 accent-black rounded border-gray-300"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <label htmlFor="rules" className="text-sm text-gray-600 cursor-pointer select-none">
                  I have read all the rules and conditions mentioned and I agree to abide by them.
                </label>
              </div>

              {/* Submit Button */}
              <button 
                onClick={handleSubmit}
                disabled={loading || !accepted || days.length === 0 || !gender}
                className="w-full bg-black text-white py-4 rounded-xl font-bold text-lg hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {loading ? "Processing..." : "Confirm Accommodation"}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}