"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { getPersonalDishes, DishDoc } from "@/lib/firestore";

export function usePendingRatings() {
  const { user } = useAuth();
  const [pending, setPending] = useState<DishDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPending([]);
      setLoading(false);
      return;
    }
    getPersonalDishes(user.uid)
      .then(setPending)
      .finally(() => setLoading(false));
  }, [user]);

  return { pending, loading };
}
