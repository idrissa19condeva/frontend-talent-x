import http from "./http";
import { CreateTrainingBlockPayload, TrainingBlock, UpdateTrainingBlockPayload } from "../types/trainingBlock";

import { API_URL } from "./config";
const BLOCK_ENDPOINT = `${API_URL}/training-blocks`;

export const listTrainingBlocks = async (scope: "mine" | "library" = "mine"): Promise<TrainingBlock[]> => {
    const suffix = scope === "library" ? "library" : "mine";
    const response = await http.get<TrainingBlock[]>(`${BLOCK_ENDPOINT}/${suffix}`);
    return response.data;
};

export const getTrainingBlock = async (id: string): Promise<TrainingBlock> => {
    const response = await http.get<TrainingBlock>(`${BLOCK_ENDPOINT}/${id}`);
    return response.data;
};

export const createTrainingBlock = async (payload: CreateTrainingBlockPayload): Promise<TrainingBlock> => {
    const response = await http.post<TrainingBlock>(BLOCK_ENDPOINT, payload);
    return response.data;
};

export const updateTrainingBlock = async (
    id: string,
    payload: UpdateTrainingBlockPayload,
): Promise<TrainingBlock> => {
    const response = await http.put<TrainingBlock>(`${BLOCK_ENDPOINT}/${id}`, payload);
    return response.data;
};

export const deleteTrainingBlock = async (id: string): Promise<void> => {
    await http.delete(`${BLOCK_ENDPOINT}/${id}`);
};

export const duplicateTrainingBlock = async (id: string): Promise<TrainingBlock> => {
    const response = await http.post<TrainingBlock>(`${BLOCK_ENDPOINT}/${id}/duplicate`);
    return response.data;
};
