import { prisma } from "@/lib/prisma";
import { verifyUserPayment } from "@/server/actions/admin";
import { getPaymentProofSignedUrl } from "@/lib/storage/signed-urls";

export default async function AdminDashboard() {
  const [
    users,
    totalRegistrations,
    generalPassCount,
    workshopPassCount,
    comboPassCount,
    verifiedPayments,
    pendingPayments,
    kitsIssued,
    totalAccommodations,
    maleAccommodations,
    femaleAccommodations
  ] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: { in: ['APPLICANT', 'PARTICIPANT'] }
      },
      include: { payment: true },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.user.count({
      where: { role: { in: ['APPLICANT', 'PARTICIPANT'] } }
    }),
    prisma.user.count({
      where: {
        role: { in: ['APPLICANT', 'PARTICIPANT'] },
        registrationType: 'GENERAL'
      }
    }),
    prisma.user.count({
      where: {
        role: { in: ['APPLICANT', 'PARTICIPANT'] },
        registrationType: 'WORKSHOP'
      }
    }),
    prisma.user.count({
      where: {
        role: { in: ['APPLICANT', 'PARTICIPANT'] },
        registrationType: 'COMBO'
      }
    }),
    prisma.payment.count({ where: { status: 'VERIFIED' } }),
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.user.count({ where: { kitStatus: 'ISSUED' } }),
    prisma.accommodation.count(),
    prisma.accommodation.count({ where: { gender: 'MALE' } }),
    prisma.accommodation.count({ where: { gender: 'FEMALE' } })
  ]);

  const formatNumber = (value: number) => value.toLocaleString('en-IN');

  const proofUrlByUserId = new Map<string, string>();
  for (const user of users) {
    const signed = await getPaymentProofSignedUrl(user.payment?.proofPath, 300);
    const resolved = signed || user.payment?.proofUrl;
    if (resolved) {
      proofUrlByUserId.set(user.id, resolved);
    }
  }

  const overviewCards = [
    { label: 'Total Registrations', value: totalRegistrations },
    { label: 'Verified Payments', value: verifiedPayments },
    { label: 'Pending Payments', value: pendingPayments }
  ];

  const passCards = [
    { label: 'General Pass', value: generalPassCount },
    { label: 'Workshop Pass', value: workshopPassCount },
    { label: 'Combo Pass', value: comboPassCount }
  ];

  const logisticsCards = [
    { label: 'Accommodation Requests', value: totalAccommodations },
    { label: 'Male Requests', value: maleAccommodations },
    { label: 'Female Requests', value: femaleAccommodations },
    { label: 'Kits Issued', value: kitsIssued }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900"> Admin Control Center</h1>
            <p className="text-gray-500">Verify payments and generate Shackles IDs</p>
          </div>
          <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200 text-sm font-medium">
            Total Registrations: <span className="text-blue-600 font-bold">{users.length}</span>
          </div>
        </header>

        <section className="space-y-6 mb-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {overviewCards.map((card) => (
              <div key={card.label} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{card.label}</p>
                <p className="mt-3 text-3xl font-bold text-gray-900">{formatNumber(card.value)}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {passCards.map((card) => (
              <div key={card.label} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{card.label}</p>
                <p className="mt-3 text-2xl font-bold text-gray-900">{formatNumber(card.value)}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {logisticsCards.map((card) => (
              <div key={card.label} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{card.label}</p>
                <p className="mt-3 text-2xl font-bold text-gray-900">{formatNumber(card.value)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Table Container */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 border-b border-gray-200 text-xs uppercase text-gray-500 font-bold tracking-wider">
                <tr>
                  <th className="p-4">Candidate</th>
                  <th className="p-4">Pass Type</th>
                  <th className="p-4">Shackles ID</th>
                  <th className="p-4">Payment Proof</th>
                  <th className="p-4 text-center">Status / Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition group">
                    
                    {/* 1. Candidate Info */}
                    <td className="p-4">
                      <div className="font-bold text-gray-900">{user.firstName} {user.lastName}</div>
                      <div className="text-xs text-gray-500">{user.collegeName}</div>
                      <div className="text-xs text-gray-400">{user.phone}</div>
                    </td>

                    {/* 2. Pass Type (Badge) */}
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
                        ${user.registrationType === 'GENERAL' ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}
                        ${user.registrationType === 'WORKSHOP' ? 'bg-purple-50 text-purple-700 border-purple-200' : ''}
                        ${user.registrationType === 'COMBO' ? 'bg-orange-50 text-orange-700 border-orange-200' : ''}
                      `}>
                        {user.registrationType}
                      </span>
                      <div className="text-xs text-gray-400 mt-1">₹ {user.payment?.amount}</div>
                    </td>

                    {/* 3. Generated ID */}
                    <td className="p-4 font-mono text-sm">
                      {user.shacklesId ? (
                        <span className="bg-gray-900 text-white px-2 py-1 rounded text-xs tracking-wider">
                          {user.shacklesId}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs italic">Pending...</span>
                      )}
                    </td>

                    {/* 4. Screenshot */}
                    <td className="p-4">
                      {proofUrlByUserId.get(user.id) ? (
                        <a 
                          href={proofUrlByUserId.get(user.id)} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-blue-600 text-xs font-medium hover:underline flex items-center gap-1 bg-blue-50 w-fit px-2 py-1 rounded"
                        >
                          View Proof
                        </a>
                      ) : (
                        <span className="text-red-400 text-xs">Missing</span>
                      )}
                      <div className="text-[10px] text-gray-400 mt-1 font-mono">
                        {user.payment?.transactionId}
                      </div>
                    </td>

                    {/* 5. Actions */}
                    <td className="p-4">
                      <div className="flex justify-center">
                        {user.role === 'APPLICANT' ? (
                          <div className="flex gap-2">
                            {/* Verify Button */}
                            <form action={async () => {
                              'use server'
                              await verifyUserPayment(user.id, 'APPROVE')
                            }}>
                              <button className="bg-green-600 text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-green-700 shadow-sm transition-all active:scale-95">
                                GENERATE ID
                              </button>
                            </form>
                            
                            {/* Reject Button */}
                            <form action={async () => {
                              'use server'
                              await verifyUserPayment(user.id, 'REJECT')
                            }}>
                              <button className="bg-white text-red-600 border border-red-200 px-3 py-1.5 rounded-md text-xs font-bold hover:bg-red-50 transition-colors">
                                Reject
                              </button>
                            </form>
                          </div>
                        ) : (
                          <span className="text-green-600 font-bold text-xs flex items-center gap-1">
                            ✅ Verified
                          </span>
                        )}
                      </div>
                    </td>

                  </tr>
                ))}

                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-gray-500">
                      No registrations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}