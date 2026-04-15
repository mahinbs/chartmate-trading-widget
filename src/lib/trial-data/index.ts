import { getAllTrialBrokerSlugs, getTrialDashboardDataset } from "@/lib/trial-data/datasets";
import type { TrialBrokerSlug } from "@/lib/trial-data/types";
import { validateTrialDashboardDataset } from "@/lib/trial-data/validator";

export function isTrialBrokerSlug(value: string): value is TrialBrokerSlug {
  return (getAllTrialBrokerSlugs() as string[]).includes(value);
}

export function resolveValidatedTrialDataset(slug: TrialBrokerSlug) {
  const dataset = getTrialDashboardDataset(slug);
  const validation = validateTrialDashboardDataset(dataset);
  return {
    dataset,
    validation,
  };
}

export * from "@/lib/trial-data/types";
export * from "@/lib/trial-data/timeline";
