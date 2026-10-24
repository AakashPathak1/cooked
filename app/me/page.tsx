"use client";

import { ProfileView } from "@/components/profile-view";
import { useMe } from "@/hooks/useMe";

export default function MePage() {
  const { me } = useMe();
  return <ProfileView handle={me?.handle} />;
}
