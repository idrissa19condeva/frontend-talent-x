import http from "./http";
import {
    CreateTrainingGroupPayload,
    TrainingGroupSummary,
    UpdateTrainingGroupPayload,
} from "../types/trainingGroup";

import { API_URL } from "./config";
const GROUPS_ENDPOINT = `${API_URL}/groups`;

export const createTrainingGroup = async (payload: CreateTrainingGroupPayload): Promise<TrainingGroupSummary> => {
    const response = await http.post<TrainingGroupSummary>(GROUPS_ENDPOINT, payload);
    return response.data;
};

export const searchTrainingGroups = async (query = "", limit = 25): Promise<TrainingGroupSummary[]> => {
    const response = await http.get<TrainingGroupSummary[]>(GROUPS_ENDPOINT, {
        params: { q: query, limit },
    });
    return response.data;
};

export const joinTrainingGroup = async (groupId: string): Promise<TrainingGroupSummary> => {
    const response = await http.post<TrainingGroupSummary>(`${GROUPS_ENDPOINT}/${groupId}/join`, {});
    return response.data;
};

export const addMemberToTrainingGroup = async (
    groupId: string,
    userId: string
): Promise<TrainingGroupSummary> => {
    const response = await http.post<TrainingGroupSummary>(
        `${GROUPS_ENDPOINT}/${groupId}/members`,
        { userId },
    );
    return response.data;
};

export const removeMemberFromTrainingGroup = async (
    groupId: string,
    memberId: string
): Promise<TrainingGroupSummary> => {
    const response = await http.delete<TrainingGroupSummary>(
        `${GROUPS_ENDPOINT}/${groupId}/members/${memberId}`,
    );
    return response.data;
};

export const listMyTrainingGroups = async (): Promise<TrainingGroupSummary[]> => {
    const response = await http.get<TrainingGroupSummary[]>(`${GROUPS_ENDPOINT}/mine`);
    return response.data;
};

export const getTrainingGroup = async (groupId: string): Promise<TrainingGroupSummary> => {
    const response = await http.get<TrainingGroupSummary>(`${GROUPS_ENDPOINT}/${groupId}`);
    return response.data;
};

export const acceptTrainingGroupRequest = async (groupId: string, userId: string): Promise<TrainingGroupSummary> => {
    const response = await http.post<TrainingGroupSummary>(`${GROUPS_ENDPOINT}/${groupId}/requests/${userId}/accept`, {});
    return response.data;
};

export const rejectTrainingGroupRequest = async (groupId: string, userId: string): Promise<TrainingGroupSummary> => {
    const response = await http.delete<TrainingGroupSummary>(`${GROUPS_ENDPOINT}/${groupId}/requests/${userId}`);
    return response.data;
};

export const cancelTrainingGroupInvite = async (groupId: string, userId: string): Promise<TrainingGroupSummary> => {
    const response = await http.delete<TrainingGroupSummary>(`${GROUPS_ENDPOINT}/${groupId}/invites/${userId}`);
    return response.data;
};

export const acceptTrainingGroupInvite = async (groupId: string): Promise<TrainingGroupSummary> => {
    const response = await http.post<TrainingGroupSummary>(`${GROUPS_ENDPOINT}/${groupId}/invites/accept`, {});
    return response.data;
};

export const declineTrainingGroupInvite = async (groupId: string): Promise<TrainingGroupSummary> => {
    const response = await http.delete<TrainingGroupSummary>(`${GROUPS_ENDPOINT}/${groupId}/invites`);
    return response.data;
};

export const updateTrainingGroup = async (
    groupId: string,
    payload: UpdateTrainingGroupPayload
): Promise<TrainingGroupSummary> => {
    const response = await http.patch<TrainingGroupSummary>(`${GROUPS_ENDPOINT}/${groupId}`, payload);
    return response.data;
};

export const deleteTrainingGroup = async (groupId: string): Promise<{ ok: boolean; message?: string; id?: string }> => {
    const response = await http.delete<{ ok: boolean; message?: string; id?: string }>(`${GROUPS_ENDPOINT}/${groupId}`);
    return response.data;
};
