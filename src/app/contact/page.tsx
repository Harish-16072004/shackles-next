'use client'

import { Mail, Phone, User, Send, Linkedin, Instagram, Twitter, Facebook, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { submitContactForm } from "@/server/actions/contact";

const INQUIRY_DATA = [
  {
    title: "General Inquiries",
    contacts: [
      { name: "Student Coordinator 1", phone: "+91 98765 43210" },
      { name: "Student Coordinator 2", phone: "+91 98765 43211" }
    ],
    email: "shacklessymposium@gmail.com"
  },
  {
    title: "Registration Support",
    contacts: [
      { name: "Reg Lead 1", phone: "+91 98765 43212" },
      { name: "Reg Lead 2", phone: "+91 98765 43213" }
    ],
    email: "register.shackles@gmail.com"
  },
  {
    title: "Event Queries",
    contacts: [
      { name: "Event Head 1", phone: "+91 98765 43214" }
    ],
    email: "events.shackles@gmail.com"
  }
];

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    email: "",
    message: ""
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  
  // Accordion State
  const [openSection, setOpenSection] = useState<number | null>(0);

  const toggleSection = (index: number) => {
    setOpenSection(openSection === index ? null : index);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await submitContactForm(formData); 
      
      if (res.success) {
        setSuccess(true);
        setFormData({ name: "", mobile: "", email: "", message: "" });
        setTimeout(() => setSuccess(false), 5000);
      } else {
        setError(res.error || "Something went wrong");
      }
    } catch {
      setError("Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-0 shadow-2xl rounded-2xl overflow-hidden bg-white border border-gray-100">
          
        {/* LEFT SECTION: Info & Map (Black Theme) */}
        <div className="bg-black text-white p-10 flex flex-col justify-between relative overflow-hidden">
            
            {/* Contact Details */}
            <div className="space-y-8 z-10">
              <div>
                <h5 className="text-gray-400 font-bold tracking-widest text-sm uppercase mb-2">Connect</h5>
                <h1 className="text-3xl font-bold">Contact Us</h1>
              </div>

              <div className="flex gap-4 mt-6">
                {[
                  { icon: Mail, href: "mailto:shacklessymposium@gmail.com" },
                  { icon: Facebook, href: "#" },
                  { icon: Instagram, href: "#" },
                  { icon: Twitter, href: "#" },
                  { icon: Linkedin, href: "#" },
                ].map((item, idx) => (
                  <a 
                    key={idx} 
                    href={item.href} 
                    className="w-10 h-10 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center hover:bg-white hover:text-black hover:border-white transition-all duration-300"
                  >
                    <item.icon size={18} />
                  </a>
                ))}
              </div>
            </div>

            {/* Embedded Map */}
            <div className="mt-12 w-full h-64 bg-gray-900 rounded-xl overflow-hidden border border-gray-800 relative group">
               <iframe 
                 src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1964.0551946420087!2d78.79385470392388!3d10.09004034689319!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3b0067a028f8a8f9%3A0x9c2484c6df0fb26!2sAlagappa%20Chettiar%20Government%20College%20of%20Engineering%20%26%20Technology.!5e0!3m2!1sen!2sin!4v1771227811562!5m2!1sen!2sin" 
                 width="100%" 
                 height="100%" 
                 style={{border:0}} 
                 allowFullScreen={true} 
                 loading="lazy"
                 referrerPolicy="no-referrer-when-downgrade"
                 className="absolute inset-0 opacity-60 group-hover:opacity-100 transition-opacity duration-500 rounded-lg filter grayscale group-hover:grayscale-0"
               ></iframe>
               <div className="absolute bottom-4 left-4 bg-white text-black px-3 py-1 text-xs font-bold rounded shadow-lg pointer-events-none">
                  ACGCET, Karaikudi
               </div>
            </div>

            {/* Accordion List */}
            <div className="mt-8 z-10 space-y-3">
              {INQUIRY_DATA.map((item, idx) => (
                <div 
                  key={idx}
                  className={`border rounded-xl transition-all duration-300 overflow-hidden ${
                    openSection === idx 
                      ? "border-purple-600 bg-gray-900/80 shadow-[0_0_15px_rgba(147,51,234,0.15)]" 
                      : "border-gray-800 bg-gray-900/50 hover:border-gray-600"
                  }`}
                >
                    <button 
                      onClick={() => toggleSection(idx)}
                      className="w-full flex justify-between items-center p-4 text-left focus:outline-none bg-transparent"
                    >
                      <span className={`font-semibold text-sm uppercase tracking-wide flex items-center gap-2 ${openSection === idx ? "text-purple-400" : "text-gray-200"}`}>
                        {item.title}
                      </span>
                      {openSection === idx ? <ChevronUp size={16} className="text-purple-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </button>
                    
                    <div 
                      className={`overflow-hidden transition-all duration-300 ease-in-out ${
                        openSection === idx ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
                      }`}
                    >
                      <div className="p-4 pt-0 border-t border-gray-800/50 text-sm text-gray-300 space-y-3">
                        {item.contacts.map((contact, cIdx) => (
                          <div key={cIdx} className="flex justify-between items-center pb-2 border-b border-gray-800 last:border-0 last:pb-0">
                            <span>{contact.name}</span>
                            <a href={`tel:${contact.phone}`} className="font-mono text-purple-300 hover:text-purple-200">{contact.phone}</a>
                          </div>
                        ))}
                        {item.email && (
                          <div className="pt-2 flex justify-end">
                             <a href={`mailto:${item.email}`} className="text-xs text-gray-400 hover:text-white transition-colors">
                               {item.email}
                             </a>
                          </div>
                        )}
                      </div>
                    </div>
                </div>
              ))}
            </div>
        </div>

        {/* RIGHT SECTION: Form (White Theme) */}
        <div className="p-10 lg:p-14 bg-white flex flex-col justify-center">
            
            {/* Header */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">Send a Message</h2>
              <div className="h-1 w-16 bg-black mt-2"></div>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              
              <div className="group relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400 group-focus-within:text-black transition-colors" />
                </div>
                <input 
                  type="text" 
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Name" 
                  required
                  className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all placeholder:text-gray-400"
                />
              </div>

              <div className="group relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-gray-400 group-focus-within:text-black transition-colors" />
                </div>
                <input 
                  type="tel" 
                  name="mobile"
                  value={formData.mobile}
                  onChange={handleChange}
                  placeholder="Mobile" 
                  required
                  className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all placeholder:text-gray-400"
                />
              </div>

              <div className="group relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-black transition-colors" />
                </div>
                <input 
                  type="email" 
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Email" 
                  required
                  className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all placeholder:text-gray-400"
                />
              </div>

              <div className="group relative">
                <textarea 
                  rows={4} 
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  placeholder="Your Message" 
                  required
                  className="w-full p-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all placeholder:text-gray-400 resize-none"
                />
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-black hover:bg-gray-900 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transform active:scale-95 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span>Sending...</span>
                ) : (
                  <>
                    <span>Submit</span>
                    <Send size={18} />
                  </>
                )}
              </button>

              {success && (
                <div className="p-3 bg-green-50 text-green-700 text-sm text-center rounded border border-green-200 animate-pulse">
                  Request sent successfully!
                </div>
              )}
              
              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-sm text-center rounded border border-red-200">
                  {error}
                </div>
              )}
            </form>
        </div>

      </div>
    </div>
  );
}
