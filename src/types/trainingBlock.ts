import { TrainingSeriesSegment } from "./training";

export type TrainingBlockSegment = Omit<TrainingSeriesSegment, "id">;

export interface TrainingBlock {
    id: string;
    ownerId: string;
    isDefault?: boolean;
    defaultKey?: string;
    title: string;
    segment: TrainingBlockSegment;
    version: number;
    createdAt?: string;
    updatedAt?: string;
}

export type CreateTrainingBlockPayload = {
    title: string;
    segment: TrainingBlockSegment;
};

export type UpdateTrainingBlockPayload = CreateTrainingBlockPayload;
