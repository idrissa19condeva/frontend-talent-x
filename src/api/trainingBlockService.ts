import http from "./http";
import { CreateTrainingBlockPayload, TrainingBlock, UpdateTrainingBlockPayload } from "../types/trainingBlock";

import { API_URL } from "./config";
const BLOCK_ENDPOINT = `${API_URL}/training-blocks`;

export const listTrainingBlocks = async (): Promise<TrainingBlock[]> => {
    const response = await http.get<TrainingBlock[]>(`${BLOCK_ENDPOINT}/mine`);
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
