"use client";
import { selectMission } from "@/lib/learning/mission";
import { useLearning } from "./learning-provider";
import { useProfile } from "./profile-provider";
import { useGoal } from "./goal-editor";
import { useRoadmap } from "./use-roadmap";
export function useMission(minutes?: number) {
  const { profile } = useProfile();
  const { view, ready } = useLearning();
  const goal = useGoal(),
    roadmap = useRoadmap();
  return {
    mission: selectMission({
      state: view.state,
      profile,
      goal: goal.goal,
      roadmap: roadmap.roadmap,
      availableMinutes: minutes ?? profile.dailyMinutes,
    }),
    loading: !ready || !goal.loaded || roadmap.loading,
    error: goal.error || roadmap.error,
    refresh: async () => {
      await Promise.all([goal.refresh(), roadmap.refresh()]);
    },
  };
}
