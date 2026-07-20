import { describe, it, expect } from 'vitest';
import {
  EXERCISES,
  ISSUE_GUIDES,
  getExercisesForIssue,
  type IssueGuide,
} from '../exercises';

// The fixed contract of issue ids the detection layer will emit.
const CONTRACT_ISSUE_IDS = [
  'cadence-low',
  'overstriding-high',
  'heel-strike-pronounced',
  'vertical-oscillation-high',
  'trunk-lean-excessive',
  'trunk-lean-insufficient',
  'arm-swing-asymmetric',
  'arm-crossover',
  'hip-drop',
  'knee-valgus',
  'stride-asymmetry-high',
] as const;

const EXERCISE_IDS = new Set(EXERCISES.map((e) => e.id));
const CONTRACT_SET = new Set<string>(CONTRACT_ISSUE_IDS);

describe('EXERCISES catalog', () => {
  it('has 15-20 exercises', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(15);
    expect(EXERCISES.length).toBeLessThanOrEqual(20);
  });

  it('has unique kebab-case ids', () => {
    expect(EXERCISE_IDS.size).toBe(EXERCISES.length);
    for (const e of EXERCISES) {
      expect(e.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('has non-empty core fields on every exercise', () => {
    for (const e of EXERCISES) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.muscles.length).toBeGreaterThan(0);
      expect(e.howTo.length).toBeGreaterThan(0);
      expect(e.setsReps.length).toBeGreaterThan(0);
      expect(e.targetsIssues.length).toBeGreaterThan(0);
    }
  });

  it('only targets issue ids that are in the contract', () => {
    for (const e of EXERCISES) {
      for (const issueId of e.targetsIssues) {
        expect(CONTRACT_SET.has(issueId)).toBe(true);
      }
    }
  });
});

describe('ISSUE_GUIDES referential integrity', () => {
  it('has exactly one guide per contract issue id', () => {
    const guideIds = ISSUE_GUIDES.map((g) => g.issueId);
    expect(new Set(guideIds).size).toBe(guideIds.length);
    expect(new Set(guideIds)).toEqual(CONTRACT_SET);
  });

  it('references only existing exercise ids, 2-4 per guide', () => {
    for (const guide of ISSUE_GUIDES) {
      expect(guide.exerciseIds.length).toBeGreaterThanOrEqual(2);
      expect(guide.exerciseIds.length).toBeLessThanOrEqual(4);
      // no duplicate references within a guide
      expect(new Set(guide.exerciseIds).size).toBe(guide.exerciseIds.length);
      for (const id of guide.exerciseIds) {
        expect(EXERCISE_IDS.has(id)).toBe(true);
      }
    }
  });

  it('has non-empty whyItMatters copy', () => {
    for (const guide of ISSUE_GUIDES) {
      expect(guide.whyItMatters.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('coverage: every contract issue is targeted by 2-4 exercises', () => {
  it('each issue id appears in 2-4 Exercise.targetsIssues', () => {
    for (const issueId of CONTRACT_ISSUE_IDS) {
      const count = EXERCISES.filter((e) => e.targetsIssues.includes(issueId)).length;
      expect(count, `issue ${issueId} targeted by ${count} exercises`).toBeGreaterThanOrEqual(2);
      expect(count, `issue ${issueId} targeted by ${count} exercises`).toBeLessThanOrEqual(4);
    }
  });
});

describe('getExercisesForIssue', () => {
  it('returns a non-empty, deduped, order-preserving list for every contract id', () => {
    for (const issueId of CONTRACT_ISSUE_IDS) {
      const result = getExercisesForIssue(issueId);
      expect(result.length, `no exercises for ${issueId}`).toBeGreaterThan(0);

      const guide = ISSUE_GUIDES.find((g) => g.issueId === issueId) as IssueGuide;
      const expectedIds = [...new Set(guide.exerciseIds)];
      expect(result.map((e) => e.id)).toEqual(expectedIds);

      // deduped
      const ids = result.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('returns [] for unknown issue ids', () => {
    expect(getExercisesForIssue('not-a-real-issue')).toEqual([]);
    expect(getExercisesForIssue('')).toEqual([]);
  });
});
