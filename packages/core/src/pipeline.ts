import { z } from "zod";

// A single step in the pipeline e.g. gaussian_blur with its params
export const PipelineStepSchema = z.object({
  id: z.string(),
  op: z.string(),
  params: z.record(z.union([z.number(), z.boolean(), z.string()])),
  enabled: z.boolean().default(true),
});

export type PipelineStep = z.infer<typeof PipelineStepSchema>;

// The full pipeline — this is what gets exported to JSON
export const PipelineSchema = z.object({
  version: z.literal("1.0"),
  name: z.string().default("Untitled pipeline"),
  createdAt: z.string(),
  steps: z.array(PipelineStepSchema),
});

export type Pipeline = z.infer<typeof PipelineSchema>;

// Helper to create a blank pipeline
export function createPipeline(name = "Untitled pipeline"): Pipeline {
  return {
    version: "1.0",
    name,
    createdAt: new Date().toISOString(),
    steps: [],
  };
}