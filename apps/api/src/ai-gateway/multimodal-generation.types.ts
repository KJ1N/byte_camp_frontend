import type {
  GeneratedMultimodalDraft,
  GenerateMultimodalInput,
  MultimodalGenerationProgress,
} from "@bytecamp-aigc/shared";

export interface MultimodalGenerationJobData {
  userId: string;
  input: GenerateMultimodalInput;
  createdAt: string;
  cancelRequested?: boolean;
}

export interface MultimodalGenerationReturnValue {
  result: GeneratedMultimodalDraft;
  completedAt: string;
}

export type MultimodalGenerationJobProgress = MultimodalGenerationProgress;
