export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-semibold mb-6">
        REGISTRATIONS OPEN
      </div>
      <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 mb-6">
        Shackles 2025
      </h1>
      <p className="text-xl text-gray-500 max-w-lg mb-8">
        The National Level Technical Symposium. <br/>
        Join the survival game.
      </p>
      <div className="flex gap-4">
        <button className="btn-primary">Register Now</button>
        <button className="btn-outline">View Events</button>
      </div>
    </div>
  );
}