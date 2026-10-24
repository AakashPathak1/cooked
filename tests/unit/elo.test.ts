import { describe, expect, it } from "vitest";
import {
  DEFAULT_RATING,
  MAX_RATING,
  MIN_RATING,
  QUICK_RATINGS,
  averageRating,
  calculateElo,
  clampRating,
  expected,
  resolveDuel,
} from "@/lib/elo";
import { eloTier, eloToRating, eloToScore, onColor, scoreColor } from "@/lib/score";

describe("expected()", () => {
  it("is 0.5 for equal ratings", () => {
    expect(expected(1200, 1200)).toBeCloseTo(0.5, 10);
  });

  it("is symmetric: P(a beats b) + P(b beats a) = 1", () => {
    expect(expected(1350, 1100) + expected(1100, 1350)).toBeCloseTo(1, 10);
  });

  it("favours the higher rating (400 points ≈ 10:1 odds)", () => {
    expect(expected(1600, 1200)).toBeCloseTo(10 / 11, 6);
  });
});

describe("calculateElo()", () => {
  it("moves equal players by K/2 in opposite directions", () => {
    expect(calculateElo(1200, 1200)).toEqual({ winnerNewElo: 1216, loserNewElo: 1184 });
  });

  it("rewards an upset more than an expected win", () => {
    const upset = calculateElo(1100, 1300).winnerNewElo - 1100;
    const routine = calculateElo(1300, 1100).winnerNewElo - 1300;
    expect(upset).toBeGreaterThan(routine);
  });

  it("is (almost) zero-sum", () => {
    const { winnerNewElo, loserNewElo } = calculateElo(1250, 1180);
    expect(Math.abs(winnerNewElo + loserNewElo - (1250 + 1180))).toBeLessThanOrEqual(1);
  });
});

describe("resolveDuel()", () => {
  it("a decisive result matches calculateElo", () => {
    const duel = resolveDuel(1200, 1200, "a");
    expect(duel).toEqual({ a: 1216, b: 1184 });
  });

  it("is symmetric between a and b", () => {
    const x = resolveDuel(1300, 1100, "b");
    const y = resolveDuel(1100, 1300, "a");
    expect(x.a).toBe(y.b);
    expect(x.b).toBe(y.a);
  });

  it("a tie between equal ratings changes nothing", () => {
    expect(resolveDuel(1200, 1200, "tie")).toEqual({ a: 1200, b: 1200 });
  });

  it("a tie pulls the higher rating down and the lower one up", () => {
    const { a, b } = resolveDuel(1400, 1200, "tie");
    expect(a).toBeLessThan(1400);
    expect(b).toBeGreaterThan(1200);
  });
});

describe("clampRating()", () => {
  it("bounds runaway ratings", () => {
    expect(clampRating(99_999)).toBe(MAX_RATING);
    expect(clampRating(-5)).toBe(MIN_RATING);
    expect(clampRating(1234.6)).toBe(1235);
  });

  it("applies when repeatedly beating weaker dishes", () => {
    let top = DEFAULT_RATING;
    for (let i = 0; i < 5000; i++) top = calculateElo(top, 900).winnerNewElo;
    expect(top).toBeLessThanOrEqual(MAX_RATING);
  });
});

describe("averageRating()", () => {
  it("rounds the mean", () => {
    expect(averageRating([1200, 1301])).toBe(1251);
  });
  it("defaults when empty", () => {
    expect(averageRating([])).toBe(DEFAULT_RATING);
  });
});

describe("display helpers", () => {
  it("maps the quick-rating anchors to the documented scores", () => {
    expect(eloToRating(QUICK_RATINGS.loved)).toBe("9.0");
    expect(eloToRating(QUICK_RATINGS.good)).toBe("7.0");
    expect(eloToRating(QUICK_RATINGS.okay)).toBe("5.0");
    expect(eloToRating(QUICK_RATINGS.meh)).toBe("2.5");
  });

  it("clamps to 0–10", () => {
    expect(eloToScore(0)).toBe(0);
    expect(eloToScore(5000)).toBe(10);
  });

  it("assigns tiers at the documented boundaries", () => {
    expect(eloTier(1400)).toBe("S");
    expect(eloTier(1399)).toBe("A");
    expect(eloTier(1300)).toBe("A");
    expect(eloTier(1200)).toBe("B");
    expect(eloTier(1100)).toBe("C");
    expect(eloTier(1099)).toBe("D");
  });

  it("returns valid hex colours across the whole range", () => {
    for (let elo = 900; elo <= 1500; elo += 25) {
      expect(scoreColor(elo)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("picks readable text colours", () => {
    expect(onColor("#ffffff")).toBe("#1d1814");
    expect(onColor("#000000")).toBe("#ffffff");
  });
});
