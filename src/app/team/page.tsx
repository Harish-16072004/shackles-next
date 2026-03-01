'use client'

import { Linkedin } from "lucide-react";

// ============================================================
// TEAM DATA — Update names, roles, images & LinkedIn URLs here
// ============================================================

const STAFF_IN_CHARGE = [
  { name: "Dr.K.Ramanathan", role: "Head of Department", image: "/team/staff1.jpg", linkedin: "#" },
  { name: "Prof.V.Jawahar", role: "Staff Advisor", image: "/team/staff2.jpg", linkedin: "#" },
];

const OFFICE_BEARERS = [
  { name: "Killivalavan S", role: "General Secretary", image: "/team/ob1.jpg", linkedin: "#" },
  { name: "Abirami N", role: "General Secretary", image: "/team/ob2.jpg", linkedin: "#" },
  { name: "Harish J", role: "Accounts Secretary", image: "/team/ob3.jpg", linkedin: "#" },
  { name: "Siva G", role: "Accounts Secretary", image: "/team/ob4.jpg", linkedin: "#" },
];

const COORDINATORS = [
  { name: "Coordinator 1", role: "Event Coordinator", image: "/team/coord1.jpg", linkedin: "#" },
  { name: "Coordinator 2", role: "Event Coordinator", image: "/team/coord2.jpg", linkedin: "#" },
  { name: "Coordinator 3", role: "Technical Lead", image: "/team/coord3.jpg", linkedin: "#" },
  { name: "Coordinator 4", role: "Design Lead", image: "/team/coord4.jpg", linkedin: "#" },
];

// ============================================================

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="text-center mb-10">
      <h2 className="text-xl font-bold uppercase tracking-widest text-gray-900">{title}</h2>
      <div className="mt-2 mx-auto h-[2px] w-32 bg-black" />
    </div>
  );
}

function MemberCard({ member }: { member: { name: string; role: string; image: string; linkedin: string } }) {
  return (
    <div className="flex flex-col items-center p-6 rounded-xl border border-gray-200 bg-white hover:shadow-lg transition-all duration-300">
      <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-gray-200 mb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={member.image}
          alt={member.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=f3f4f6&color=111827&size=256&font-size=0.35&bold=true`;
          }}
        />
      </div>

      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide text-center">{member.name}</h3>
      <p className="text-xs text-gray-500 mt-1">{member.role}</p>

      {member.linkedin && member.linkedin !== "#" && (
        <a
          href={member.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-100 transition-colors"
        >
          <Linkedin size={14} />
          <span>Connect</span>
        </a>
      )}
    </div>
  );
}

export default function TeamPage() {
  return (
    <div className="min-h-screen bg-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-3xl font-bold text-gray-900">Our Team</h1>
          <p className="mt-2 text-gray-500 text-sm">Meet the Mechanical Engineering Association</p>
          <p className="text-gray-400 text-xs mt-1">The dedicated team behind SHACKLES 25-26</p>
        </div>

        {/* Staff-In-Charge */}
        <section className="mb-16">
          <SectionTitle title="Staff-In-Charge" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-lg mx-auto">
            {STAFF_IN_CHARGE.map((member, idx) => (
              <MemberCard key={idx} member={member} />
            ))}
          </div>
        </section>

        {/* Office Bearers */}
        <section className="mb-16">
          <SectionTitle title="Office Bearers" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {OFFICE_BEARERS.map((member, idx) => (
              <MemberCard key={idx} member={member} />
            ))}
          </div>
        </section>

        {/* Coordinators */}
        <section className="mb-16">
          <SectionTitle title="Coordinators" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {COORDINATORS.map((member, idx) => (
              <MemberCard key={idx} member={member} />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
