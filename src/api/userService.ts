import http, { getAccessToken } from "./http";
import { RelationshipSummary, User, PerformancePoint } from "../types/User";
import { mockUserProfile } from "../mocks/userProfile";
import * as FileSystem from "expo-file-system/legacy";

// 🔹 Détection automatique de l’adresse selon le contexte
import { API_URL } from "./config";
const USE_PROFILE_MOCK = process.env.EXPO_PUBLIC_USE_PROFILE_MOCK === "true";

let mockProfileState: User = { ...mockUserProfile };

const cloneMockProfile = (): User => JSON.parse(JSON.stringify(mockProfileState));

const updateMockProfileState = (updates: Partial<User> = {}): User => {
    const sanitizedEntries = Object.entries(updates).reduce((acc, [key, value]) => {
        if (value !== undefined) {
            (acc as any)[key] = value;
        }
        return acc;
    }, {} as Partial<User>);

    mockProfileState = { ...mockProfileState, ...sanitizedEntries };
    return cloneMockProfile();
};

export type UserSearchResult = {
    id: string;
    fullName?: string;
    username?: string;
    photoUrl?: string;
};

/** 🔹 Récupère le profil utilisateur connecté */
export const getUserProfile = async (): Promise<User> => {
    try {
        if (USE_PROFILE_MOCK) {
            return cloneMockProfile();
        }
        if (!API_URL) {
            throw new Error("EXPO_PUBLIC_API_URL manquant (impossible d'atteindre le serveur)");
        }
        const response = await http.get<User>(`${API_URL}/user/me`);
        return response.data;
    } catch (error: any) {
        const hasResponse = Boolean(error?.response);
        const serverMsg = error?.response?.data?.message;
        const message = serverMsg || error?.message;

        console.error("Erreur getUserProfile :", error?.response?.data || message);

        // Axios "Network Error" (no response) => backend unreachable / bad API URL.
        if (!hasResponse) {
            throw new Error(
                "Impossible de joindre le serveur. Vérifie `EXPO_PUBLIC_API_URL` et que le backend est démarré.",
            );
        }

        throw new Error(serverMsg || "Erreur lors du chargement du profil");
    }
};

export const getUserProfileById = async (userId: string): Promise<User> => {
    const trimmedId = userId?.trim();
    if (!trimmedId) {
        throw new Error("Identifiant utilisateur requis");
    }

    try {
        if (USE_PROFILE_MOCK) {
            return cloneMockProfile();
        }
        const response = await http.get<User>(`${API_URL}/user/${trimmedId}`);
        return response.data;
    } catch (error: any) {
        const status = error?.response?.status;
        const serverMsg = error?.response?.data?.message;
        const message = serverMsg || error?.message || "Impossible de charger ce profil";

        // Expected case: target profile is private.
        if (status === 403 && typeof message === "string" && message.toLowerCase().includes("priv")) {
            if (__DEV__) {
                console.info("Profil privé:", { userId: trimmedId });
            }
            throw new Error(message);
        }

        console.error("Erreur getUserProfileById:", error.response?.data || error.message);
        throw new Error(message);
    }
};

/** 🔹 Met à jour le profil utilisateur (club, discipline, pays, etc.) */
export const updateUserProfile = async (updates: Partial<User>): Promise<User> => {
    try {
        if (USE_PROFILE_MOCK) {
            return updateMockProfileState(updates);
        }
        const response = await http.put<User>(`${API_URL}/user/update`, updates);
        return response.data;
    } catch (error: any) {
        console.error("Erreur updateUserProfile :", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Erreur lors de la mise à jour du profil");
    }
};

export const registerMyExpoPushToken = async (token: string): Promise<void> => {
    try {
        if (USE_PROFILE_MOCK) {
            return;
        }
        if (!API_URL) {
            throw new Error("EXPO_PUBLIC_API_URL manquant (impossible d'atteindre le serveur)");
        }
        const trimmed = (token || "").trim();
        if (!trimmed) {
            return;
        }
        await http.post(`${API_URL}/user/me/push-token`, { token: trimmed });
    } catch (error: any) {
        console.error("Erreur registerMyExpoPushToken :", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Impossible d'enregistrer le token push");
    }
};

export const unregisterMyExpoPushToken = async (token: string): Promise<void> => {
    try {
        if (USE_PROFILE_MOCK) {
            return;
        }
        if (!API_URL) {
            throw new Error("EXPO_PUBLIC_API_URL manquant (impossible d'atteindre le serveur)");
        }
        const trimmed = (token || "").trim();
        if (!trimmed) {
            return;
        }
        await http.delete(`${API_URL}/user/me/push-token`, { data: { token: trimmed } });
    } catch (error: any) {
        console.error("Erreur unregisterMyExpoPushToken :", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Impossible de supprimer le token push");
    }
};

export const updateUserCredentials = async (payload: {
    currentPassword: string;
    newPassword?: string;
    newEmail?: string;
}): Promise<{ ok: true; message: string; user: User } | { ok: false; message: string }> => {
    try {
        const response = await http.put<{ message: string; user: User }>(`${API_URL}/user/credentials`, payload);
        return { ok: true, message: response.data.message, user: response.data.user };
    } catch (error: any) {
        const serverMsg = error?.response?.data?.message;
        const message = serverMsg || error?.message || "Impossible de mettre à jour le mot de passe";
        if (__DEV__) {
            console.warn("updateUserCredentials", message);
        }
        return { ok: false, message };
    }
};

export const deleteAccount = async (): Promise<void> => {
    try {
        if (USE_PROFILE_MOCK) {
            mockProfileState = { ...mockUserProfile };
            return;
        }
        await http.delete(`${API_URL}/user/delete`);
    } catch (error: any) {
        console.error("Erreur deleteAccount :", error.response?.data || error.message);
        throw new Error(
            error?.response?.data?.message ||
            (error?.response?.status === 404
                ? "Compte introuvable"
                : "Suppression du compte impossible pour le moment"),
        );
    }
};

const normalizeImageUriForUpload = async (uri: string): Promise<string> => {
    if (!uri) return uri;
    if (!uri.startsWith("content://")) return uri;

    // On Android, ImagePicker may return content:// URIs which can break multipart uploads.
    // Copy to app cache to get a stable file:// URI.
    const extension = ".jpg";
    const target = `${FileSystem.cacheDirectory}profile-upload-${Date.now()}${extension}`;
    await FileSystem.copyAsync({ from: uri, to: target });
    return target;
};

/** 🔹 Upload de la photo de profil */
export const uploadProfilePhoto = async (imageUri: string): Promise<string> => {
    try {
        if (USE_PROFILE_MOCK) {
            const updated = updateMockProfileState({ photoUrl: imageUri });
            return updated.photoUrl ?? imageUri;
        }

        if (!API_URL) {
            throw new Error("EXPO_PUBLIC_API_URL manquant (impossible d'atteindre le serveur)");
        }

        const uploadUri = await normalizeImageUriForUpload(imageUri);
        const token = await getAccessToken();
        const endpoint = `${API_URL}/user/photo`;

        const result = await FileSystem.uploadAsync(endpoint, uploadUri, {
            httpMethod: "POST",
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: "photo",
            mimeType: "image/jpeg",
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                Accept: "application/json",
            },
        });

        let payload: any = undefined;
        try {
            payload = result.body ? JSON.parse(result.body) : undefined;
        } catch {
            payload = result.body;
        }

        if (result.status < 200 || result.status >= 300) {
            const serverMsg = (payload && typeof payload === "object" && payload.message) ? payload.message : undefined;
            throw new Error(serverMsg || `Upload photo échoué (${result.status})`);
        }

        if (!payload || typeof payload !== "object" || !payload.photoUrl) {
            throw new Error("Réponse serveur invalide (photoUrl manquant)");
        }

        return payload.photoUrl as string;
    } catch (error: any) {
        const message = error?.message || "Erreur lors de l’upload de la photo";
        console.error("Erreur uploadProfilePhoto :", {
            baseURL: API_URL,
            status: error?.response?.status,
            data: error?.response?.data,
            message,
            url: `${API_URL}/user/photo`,
            uri: imageUri,
        });
        throw new Error(message);
    }
};

export type ReadyPlayerMeAvatarPayload = {
    rpmAvatarUrl: string;
    rpmAvatarPreviewUrl?: string;
    rpmAvatarMeta?: Record<string, any>;
    rpmAvatarId?: string;
};

export const saveReadyPlayerMeAvatar = async (payload: ReadyPlayerMeAvatarPayload): Promise<User> => {
    try {
        if (USE_PROFILE_MOCK) {
            return updateMockProfileState(payload);
        }
        const response = await http.post<User>(`${API_URL}/avatar/save`, payload);
        return response.data;
    } catch (error: any) {
        console.error("Erreur saveReadyPlayerMeAvatar:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Impossible d'enregistrer l'avatar");
    }
};

export type ReadyPlayerMeTemplate = {
    id: string;
    imageUrl: string;
    gender?: string;
    usageType?: string;
};

export type ReadyPlayerMeDraftResponse = {
    avatarId: string;
    rpmUserId: string;
    templateId: string;
    glbUrl?: string;
    previewUrl?: string;
    assets?: Record<string, any>;
};

export const fetchReadyPlayerMeTemplates = async (): Promise<ReadyPlayerMeTemplate[]> => {
    try {
        const response = await http.get<{ templates: ReadyPlayerMeTemplate[] }>(`${API_URL}/avatar/templates`);
        return response.data.templates;
    } catch (error: any) {
        console.error("Erreur fetchReadyPlayerMeTemplates:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Impossible de récupérer les templates Ready Player Me");
    }
};

export const createReadyPlayerMeDraft = async (templateId?: string): Promise<ReadyPlayerMeDraftResponse> => {
    try {
        const response = await http.post<ReadyPlayerMeDraftResponse>(
            `${API_URL}/avatar/draft`,
            templateId ? { templateId } : {},
        );
        return response.data;
    } catch (error: any) {
        console.error("Erreur createReadyPlayerMeDraft:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Impossible de préparer l'avatar Ready Player Me");
    }
};

export const getFfaPerformanceTimeline = async (
    discipline?: string
): Promise<PerformancePoint[] | Record<string, PerformancePoint[]>> => {
    try {
        const response = await http.get<PerformancePoint[] | Record<string, PerformancePoint[]>>(
            `${API_URL}/user/ffa/performance-timeline`,
            discipline ? { params: { discipline } } : undefined,
        );
        return response.data;
    } catch (error: any) {
        console.error("Erreur getFfaPerformanceTimeline:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Impossible de charger la timeline FFA");
    }
};

// 🔹 Récupère uniquement les données ffaMergedByEvent (format objet par discipline)
export const getFfaMergedByEvent = async (
    discipline?: string
): Promise<PerformancePoint[] | Record<string, PerformancePoint[]>> => {
    try {
        const response = await http.get<PerformancePoint[] | Record<string, PerformancePoint[]>>(
            `${API_URL}/user/ffa/merged-by-event`,
            discipline ? { params: { discipline } } : undefined,
        );
        return response.data;
    } catch (error: any) {
        console.error("Erreur getFfaMergedByEvent:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Impossible de charger ffaMergedByEvent");
    }
};

export const searchUsers = async (query: string): Promise<UserSearchResult[]> => {
    const trimmed = query.trim();
    if (!trimmed) {
        return [];
    }

    if (USE_PROFILE_MOCK) {
        const lowered = trimmed.toLowerCase();
        const match =
            mockProfileState.fullName?.toLowerCase().startsWith(lowered) ||
            mockProfileState.username?.toLowerCase().startsWith(lowered);
        if (!match) {
            return [];
        }
        return [
            {
                id: (mockProfileState as any).id || (mockProfileState as any)._id || "mock-user",
                fullName: mockProfileState.fullName,
                username: mockProfileState.username,
                photoUrl: mockProfileState.photoUrl,
            },
        ];
    }

    try {
        const response = await http.get<UserSearchResult[]>(`${API_URL}/user/search`, {
            params: { q: trimmed },
        });
        return response.data;
    } catch (error: any) {
        console.error("Erreur searchUsers:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Impossible de rechercher des athlètes");
    }
};

export type FriendRequestResponse = {
    status: "pending" | "accepted" | "declined" | "removed";
    relationship: RelationshipSummary;
    message?: string;
};

export type InboxNotification = {
    id: string;
    type: "friend_request_accepted" | "group_join_accepted";
    message: string;
    createdAt: string;
    data?: Record<string, any>;
};

export const sendFriendInvitation = async (targetUserId: string): Promise<FriendRequestResponse> => {
    const trimmedId = targetUserId?.trim();
    if (!trimmedId) {
        throw new Error("Identifiant utilisateur requis");
    }

    if (USE_PROFILE_MOCK) {
        mockProfileState.relationship = {
            status: "outgoing",
            isSelf: false,
            areFriends: false,
            outgoingRequest: true,
            incomingRequest: false,
        };
        return {
            status: "pending",
            relationship: mockProfileState.relationship,
            message: "Invitation envoyée",
        };
    }

    try {
        const response = await http.post<FriendRequestResponse>(
            `${API_URL}/user/${trimmedId}/friend-request`,
            {},
        );
        return response.data;
    } catch (error: any) {
        console.error("Erreur sendFriendInvitation:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Impossible d'envoyer l'invitation");
    }
};

export const respondToFriendInvitation = async (
    requesterId: string,
    action: "accept" | "decline",
): Promise<FriendRequestResponse> => {
    const trimmedId = requesterId?.trim();
    if (!trimmedId) {
        throw new Error("Identifiant utilisateur requis");
    }

    if (USE_PROFILE_MOCK) {
        mockProfileState.relationship = {
            status: action === "accept" ? "friends" : "none",
            isSelf: false,
            areFriends: action === "accept",
            outgoingRequest: false,
            incomingRequest: false,
        };
        return {
            status: action === "accept" ? "accepted" : "declined",
            relationship: mockProfileState.relationship,
            message: action === "accept" ? "Invitation acceptée" : "Invitation refusée",
        };
    }

    try {
        const response = await http.post<FriendRequestResponse>(
            `${API_URL}/user/${trimmedId}/friend-request/respond`,
            { action },
        );
        return response.data;
    } catch (error: any) {
        console.error("Erreur respondToFriendInvitation:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Impossible de traiter l'invitation");
    }
};

export const removeFriend = async (targetUserId: string): Promise<FriendRequestResponse> => {
    const trimmedId = targetUserId?.trim();
    if (!trimmedId) {
        throw new Error("Identifiant utilisateur requis");
    }

    if (USE_PROFILE_MOCK) {
        const currentCount = mockProfileState.relationship?.friendsCount ?? 0;
        mockProfileState.relationship = {
            status: "none",
            isSelf: false,
            areFriends: false,
            outgoingRequest: false,
            incomingRequest: false,
            friendsCount: Math.max(currentCount - 1, 0),
        };
        return {
            status: "removed",
            relationship: mockProfileState.relationship,
            message: "Vous ne suivez plus cet athlète",
        };
    }

    try {
        const response = await http.delete<FriendRequestResponse>(
            `${API_URL}/user/${trimmedId}/friend`,
        );
        return response.data;
    } catch (error: any) {
        console.error("Erreur removeFriend:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Impossible de se désabonner");
    }
};

export const listMyNotifications = async (): Promise<InboxNotification[]> => {
    if (USE_PROFILE_MOCK) {
        return [];
    }

    try {
        const response = await http.get<InboxNotification[]>(`${API_URL}/user/me/notifications`);
        return response.data;
    } catch (error: any) {
        console.error("Erreur listMyNotifications:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Impossible de charger les notifications");
    }
};

export const deleteMyNotification = async (notificationId: string): Promise<void> => {
    const trimmedId = notificationId?.trim();
    if (!trimmedId) {
        throw new Error("Identifiant de notification requis");
    }

    if (USE_PROFILE_MOCK) {
        return;
    }

    try {
        await http.delete(`${API_URL}/user/me/notifications/${trimmedId}`);
    } catch (error: any) {
        console.error("Erreur deleteMyNotification:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Impossible de supprimer la notification");
    }
};

export const clearMyNotifications = async (): Promise<void> => {
    if (USE_PROFILE_MOCK) {
        return;
    }

    try {
        await http.delete(`${API_URL}/user/me/notifications`);
    } catch (error: any) {
        console.error("Erreur clearMyNotifications:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Impossible de supprimer les notifications");
    }
};
