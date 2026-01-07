import http from "./http";
import { CreateTrainingSessionPayload, TrainingChronoInput, TrainingSession } from "../types/training";

import { API_URL } from "./config";
const TRAINING_ENDPOINT = `${API_URL}/trainings`;

export const createTrainingSession = async (
    payload: CreateTrainingSessionPayload
): Promise<TrainingSession> => {
    const response = await http.post<TrainingSession>(TRAINING_ENDPOINT, payload);
    return response.data;
};

export const getTrainingSession = async (id: string): Promise<TrainingSession> => {
    const response = await http.get<TrainingSession>(`${TRAINING_ENDPOINT}/${id}`);
    return response.data;
};

export const listTrainingSessions = async (): Promise<TrainingSession[]> => {
    const response = await http.get<TrainingSession[]>(TRAINING_ENDPOINT);
    return response.data;
};

export const listParticipatingSessions = async (): Promise<TrainingSession[]> => {
    const response = await http.get<TrainingSession[]>(`${TRAINING_ENDPOINT}/participations`);
    return response.data;
};

export const listGroupSessions = async (groupId: string): Promise<TrainingSession[]> => {
    const response = await http.get<TrainingSession[]>(`${API_URL}/groups/${groupId}/sessions`);
    return response.data;
};

export const attachSessionToGroup = async (
    groupId: string,
    sessionId: string
): Promise<TrainingSession> => {
    const response = await http.post<TrainingSession>(
        `${API_URL}/groups/${groupId}/sessions`,
        { sessionId },
    );
    return response.data;
};

export const detachSessionFromGroup = async (
    groupId: string,
    sessionId: string
): Promise<TrainingSession> => {
    const response = await http.delete<TrainingSession>(
        `${API_URL}/groups/${groupId}/sessions/${sessionId}`,
    );
    return response.data;
};

export const deleteTrainingSession = async (id: string): Promise<void> => {
    await http.delete(`${TRAINING_ENDPOINT}/${id}`);
};

export const updateTrainingSession = async (
    id: string,
    payload: CreateTrainingSessionPayload
): Promise<TrainingSession> => {
    const response = await http.put<TrainingSession>(`${TRAINING_ENDPOINT}/${id}`, payload);
    return response.data;
};

export const joinTrainingSession = async (id: string): Promise<TrainingSession> => {
    const response = await http.post<TrainingSession>(`${TRAINING_ENDPOINT}/${id}/join`, {});
    return response.data;
};

export const leaveTrainingSession = async (id: string): Promise<TrainingSession> => {
    const response = await http.post<TrainingSession>(`${TRAINING_ENDPOINT}/${id}/leave`, {});
    return response.data;
};

export const addParticipantToTrainingSession = async (id: string, userId: string): Promise<TrainingSession> => {
    const response = await http.post<TrainingSession>(`${TRAINING_ENDPOINT}/${id}/participants`, { userId });
    return response.data;
};

export const removeParticipantFromTrainingSession = async (
    sessionId: string,
    participantId: string,
): Promise<TrainingSession> => {
    const response = await http.delete<TrainingSession>(
        `${TRAINING_ENDPOINT}/${sessionId}/participants/${participantId}`,
    );
    return response.data;
};

export const saveTrainingSessionChronos = async (
    id: string,
    entries: TrainingChronoInput[],
): Promise<TrainingSession> => {
    const response = await http.put<TrainingSession>(`${TRAINING_ENDPOINT}/${id}/chronos`, { entries });
    return response.data;
};
