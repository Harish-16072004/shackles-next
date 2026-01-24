import { getSession } from "@/lib/session"; 
import { redirect } from "next/navigation";
import AccommodationForm from "@/components/features/AccommodationForm"; 

export default async function AccommodationPage() {
  // 1. Fetch Session Securely on Server
  const session = await getSession();

  // 2. Security Check: If no session, redirect to login
  if (!session || !session.userId) {
    redirect("/login");
  }

  // 3. Pass the userId to the Client Component
  return <AccommodationForm userId={session.userId as string} />;
}