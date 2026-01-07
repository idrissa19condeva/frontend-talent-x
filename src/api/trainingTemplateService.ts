import http from "./http";
import { TrainingSession } from "../types/training";
import {
    CreateSessionFromTemplatePayload,
    CreateTrainingTemplatePayload,
    TrainingTemplate,
    UpdateTrainingTemplatePayload,
} from "../types/trainingTemplate";

import { API_URL } from "./config";
const TEMPLATE_ENDPOINT = `${API_URL}/training-templates`;

export const listTrainingTemplates = async (): Promise<TrainingTemplate[]> => {
    const response = await http.get<TrainingTemplate[]>(`${TEMPLATE_ENDPOINT}/mine`);
    return response.data;
};

export const getTrainingTemplate = async (id: string): Promise<TrainingTemplate> => {
    const response = await http.get<TrainingTemplate>(`${TEMPLATE_ENDPOINT}/${id}`);
    return response.data;
};

export const createTrainingTemplate = async (
    payload: CreateTrainingTemplatePayload,
): Promise<TrainingTemplate> => {
    const response = await http.post<TrainingTemplate>(TEMPLATE_ENDPOINT, payload);
    return response.data;
};

export const updateTrainingTemplate = async (
    id: string,
    payload: UpdateTrainingTemplatePayload,
): Promise<TrainingTemplate> => {
    const response = await http.put<TrainingTemplate>(`${TEMPLATE_ENDPOINT}/${id}`, payload);
    return response.data;
};

export const deleteTrainingTemplate = async (id: string): Promise<void> => {
    await http.delete(`${TEMPLATE_ENDPOINT}/${id}`);
};

export const createSessionFromTemplate = async (
    templateId: string,
    payload: CreateSessionFromTemplatePayload,
): Promise<TrainingSession> => {
    const response = await http.post<TrainingSession>(`${TEMPLATE_ENDPOINT}/${templateId}/sessions`, payload);
    return response.data;
};
