"use client";

import { useParams } from "next/navigation";
import { ProfileView } from "@/components/profile-view";

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  return <ProfileView handle={handle} />;
}
