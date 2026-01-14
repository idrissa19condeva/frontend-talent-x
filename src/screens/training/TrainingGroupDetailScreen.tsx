import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from "react-native";
import { Avatar, Button, Dialog, Portal, Text, TextInput, Snackbar } from "react-native-paper";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect, useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import {
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    useFonts,
} from "@expo-google-fonts/space-grotesk";
import {
    addMemberToTrainingGroup,
    acceptTrainingGroupInvite,
    cancelTrainingGroupInvite,
    declineTrainingGroupInvite,
    getTrainingGroup,
    joinTrainingGroup,
    acceptTrainingGroupRequest,
    rejectTrainingGroupRequest,
    removeMemberFromTrainingGroup,
} from "../../api/groupService";
import {
    attachSessionToGroup,
    detachSessionFromGroup,
    listGroupSessions,
    listTrainingSessions,
} from "../../api/trainingService";
import { GroupMember, GroupUserRef, TrainingGroupSummary } from "../../types/trainingGroup";
import { SessionParticipant, TrainingSession } from "../../types/training";
import { useAuth } from "../../context/AuthContext";
import { useTraining } from "../../context/TrainingContext";
import TrainingSessionCard from "../../components/training/TrainingSessionCard";
import { searchUsers, UserSearchResult } from "../../api/userService";

const extractUserId = (value?: GroupUserRef | string) => {
    if (!value) return undefined;
    if (typeof value === "string") return value;
    return value.id || value._id;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ?? "";
const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_BASE_URL?.replace(/\/+$/, "") ?? "";

const resolveProfilePhoto = (value?: string | null): string | undefined => {
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    if (!API_BASE_URL) {
        return undefined;
    }
    const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return `${API_BASE_URL}${normalized}`;
};

const getMemberPhotoUri = (value?: string | null) => resolveProfilePhoto(value);

const formatDisplayDate = (value?: string) => {
    if (!value) return "Date à définir";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
    });
};

type SessionGroupingKey = "today" | "upcoming" | "past";

const SECTION_LABELS: Record<SessionGroupingKey, string> = {
    today: "Séances du jour",
    upcoming: "Séances à venir",
    past: "Séances passées",
};

const TIMEFRAME_OPTIONS: { key: SessionGroupingKey; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
    { key: "today", label: "Aujourd'hui", icon: "calendar-today" },
    { key: "upcoming", label: "À venir", icon: "calendar-arrow-right" },
    { key: "past", label: "Passées", icon: "history" },
];

const toValidDate = (value?: string) => {
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const getSessionStartDate = (session: TrainingSession) => {
    const baseDate = toValidDate(session.date);
    if (!baseDate) {
        return null;
    }
    if (session.startTime && /^\d{2}:\d{2}$/.test(session.startTime)) {
        const [hours, minutes] = session.startTime.split(":").map((part) => Number(part));
        if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
            const start = new Date(baseDate);
            start.setHours(hours, minutes, 0, 0);
            return start;
        }
    }
    const dayStart = new Date(baseDate);
    dayStart.setHours(0, 0, 0, 0);
    return dayStart;
};

const getSessionEndDate = (session: TrainingSession, startDate: Date | null) => {
    if (startDate) {
        const durationMinutes = Number(session.durationMinutes);
        if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
            return new Date(startDate.getTime() + durationMinutes * 60 * 1000);
        }
        const endOfDay = new Date(startDate);
        endOfDay.setHours(23, 59, 59, 999);
        return endOfDay;
    }
    const baseDate = toValidDate(session.date);
    if (!baseDate) {
        return null;
    }
    baseDate.setHours(23, 59, 59, 999);
    return baseDate;
};

const getDayStart = (date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
};

const getSessionSortTimestamp = (session: TrainingSession) => {
    const startDate = getSessionStartDate(session);
    if (startDate) {
        return startDate.getTime();
    }
    const baseDate = toValidDate(session.date);
    return baseDate ? baseDate.getTime() : 0;
};

const categorizeSession = (session: TrainingSession): SessionGroupingKey => {
    const now = new Date();
    const todayStart = getDayStart(now);
    const baseDate = toValidDate(session.date);
    const startDate = getSessionStartDate(session);
    const endDate = getSessionEndDate(session, startDate);
    if (baseDate && isSameDay(baseDate, now)) {
        return "today";
    }
    if (startDate && startDate > now) {
        return "upcoming";
    }
    if (!startDate && baseDate && getDayStart(baseDate) > todayStart) {
        return "upcoming";
    }
    if (endDate && endDate < now) {
        return "past";
    }
    if (baseDate && getDayStart(baseDate) < todayStart) {
        return "past";
    }
    return "upcoming";
};

const groupSessionsByTimeframe = (sessions: TrainingSession[]) => {
    const groups: Record<SessionGroupingKey, TrainingSession[]> = {
        today: [],
        upcoming: [],
        past: [],
    };
    sessions.forEach((session) => {
        const bucket = categorizeSession(session);
        groups[bucket].push(session);
    });
    groups.today.sort((a, b) => getSessionSortTimestamp(a) - getSessionSortTimestamp(b));
    groups.upcoming.sort((a, b) => getSessionSortTimestamp(a) - getSessionSortTimestamp(b));
    groups.past.sort((a, b) => getSessionSortTimestamp(b) - getSessionSortTimestamp(a));
    return groups;
};

const isSessionLocked = (status?: TrainingSession["status"]) => status === "done" || status === "canceled";

export default function TrainingGroupDetailScreen() {
    const { id } = useLocalSearchParams<{ id?: string }>();
    const pathname = usePathname();
    const { user } = useAuth();
    const { joinSession, leaveSession } = useTraining();
    const router = useRouter();
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const [fontsLoaded] = useFonts({
        SpaceGrotesk_400Regular,
        SpaceGrotesk_500Medium,
        SpaceGrotesk_600SemiBold,
        SpaceGrotesk_700Bold,
    });

    const [group, setGroup] = useState<TrainingGroupSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState<TrainingSession[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [sessionsError, setSessionsError] = useState<string | null>(null);
    const [sessionMutationIds, setSessionMutationIds] = useState<Record<string, boolean>>({});
    const [memberDialogVisible, setMemberDialogVisible] = useState(false);
    const [memberDialogKeyboardVisible, setMemberDialogKeyboardVisible] = useState(false);
    const [memberInput, setMemberInput] = useState("");
    const [memberSuggestions, setMemberSuggestions] = useState<UserSearchResult[]>([]);
    const [memberSearchLoading, setMemberSearchLoading] = useState(false);
    const [selectedMember, setSelectedMember] = useState<UserSearchResult | null>(null);
    const [memberSaving, setMemberSaving] = useState(false);
    const [joinLoading, setJoinLoading] = useState(false);
    const [leaveLoading, setLeaveLoading] = useState(false);
    const [inviteDecisionLoading, setInviteDecisionLoading] = useState<"accept" | "decline" | null>(null);
    const [removingMemberIds, setRemovingMemberIds] = useState<Record<string, boolean>>({});
    const [sessionPickerVisible, setSessionPickerVisible] = useState(false);
    const [sessionPickerLoading, setSessionPickerLoading] = useState(false);
    const [sessionPickerError, setSessionPickerError] = useState<string | null>(null);
    const [ownedSessions, setOwnedSessions] = useState<TrainingSession[]>([]);
    const [sessionPublishingId, setSessionPublishingId] = useState<string | null>(null);
    const [sessionRemovalIds, setSessionRemovalIds] = useState<Record<string, boolean>>({});
    const [requestActionIds, setRequestActionIds] = useState<Record<string, "accept" | "reject">>({});
    const [timeframe, setTimeframe] = useState<SessionGroupingKey>("today");
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [refreshing, setRefreshing] = useState(false);

    const [confirmToastVisible, setConfirmToastVisible] = useState(false);
    const [confirmToastMessage, setConfirmToastMessage] = useState("");
    const confirmToastActionRef = useRef<null | (() => void)>(null);

    const openConfirmToast = useCallback((message: string, onConfirm: () => void) => {
        confirmToastActionRef.current = onConfirm;
        setConfirmToastMessage(message);
        setConfirmToastVisible(true);
    }, []);

    const [removeMemberDialogVisible, setRemoveMemberDialogVisible] = useState(false);
    const [removeMemberTargetId, setRemoveMemberTargetId] = useState<string | null>(null);
    const [removeMemberTargetLabel, setRemoveMemberTargetLabel] = useState<string | null>(null);

    const [removeSessionDialogVisible, setRemoveSessionDialogVisible] = useState(false);
    const [removeSessionTargetId, setRemoveSessionTargetId] = useState<string | null>(null);
    const [removeSessionTargetLabel, setRemoveSessionTargetLabel] = useState<string | null>(null);

    const [cancelInviteDialogVisible, setCancelInviteDialogVisible] = useState(false);
    const [cancelInviteTargetId, setCancelInviteTargetId] = useState<string | null>(null);
    const [cancelInviteTargetLabel, setCancelInviteTargetLabel] = useState<string | null>(null);
    const [cancelInviteLoading, setCancelInviteLoading] = useState(false);

    const [systemDialogVisible, setSystemDialogVisible] = useState(false);
    const [systemDialogTitle, setSystemDialogTitle] = useState<string>("");
    const [systemDialogMessage, setSystemDialogMessage] = useState<string>("");
    const [systemDialogTone, setSystemDialogTone] = useState<"info" | "error" | "success">("info");
    const [systemDialogOnOk, setSystemDialogOnOk] = useState<(() => void) | null>(null);

    const openSystemDialog = useCallback(
        (
            title: string,
            message: string,
            tone: "info" | "error" | "success" = "info",
            onOk?: () => void,
        ) => {
            setSystemDialogTitle(title);
            setSystemDialogMessage(message);
            setSystemDialogTone(tone);
            setSystemDialogOnOk(() => onOk || null);
            setSystemDialogVisible(true);
        },
        [],
    );

    const closeSystemDialog = useCallback(() => {
        setSystemDialogVisible(false);
        setSystemDialogOnOk(null);
    }, []);

    const handleSystemDialogOk = useCallback(() => {
        const onOk = systemDialogOnOk;
        closeSystemDialog();
        onOk?.();
    }, [closeSystemDialog, systemDialogOnOk]);

    const ownerId = extractUserId(group?.owner);
    const currentUserId = user?.id || user?._id;
    const isOwner = ownerId && currentUserId && ownerId === currentUserId;
    const isMember = Boolean(group?.isMember || isOwner);

    const fetchGroup = useCallback(async (): Promise<TrainingGroupSummary | null> => {
        if (!id) return null;
        try {
            setLoading(true);
            const data = await getTrainingGroup(id.toString());
            setGroup(data);
            return data;
        } catch (error: any) {
            const status = error?.response?.status;
            if (status === 404) {
                // Group has been deleted (e.g. user navigated back after deleting it).
                setGroup(null);
                setSessions([]);
                setSessionsError(null);
                if (navigation.canGoBack?.()) {
                    navigation.goBack();
                } else {
                    router.replace("/(main)/training/groups");
                }
                return null;
            }

            console.error("Erreur chargement groupe", error);
            const message = error?.response?.data?.message || "Impossible de charger ce groupe";
            openSystemDialog(
                "Erreur",
                message,
                "error",
                () => (router.canGoBack?.() ? router.back() : router.replace("/(main)/training/groups")),
            );
            return null;
        } finally {
            setLoading(false);
        }
    }, [id, navigation, openSystemDialog, router]);

    const fetchSessions = useCallback(async (memberOverride?: boolean) => {
        if (!id) return;
        const member = memberOverride ?? isMember;
        if (!member) {
            setSessions([]);
            setSessionsError(null);
            return;
        }
        try {
            setSessionsLoading(true);
            const data = await listGroupSessions(id.toString());
            setSessions(data);
            setSessionsError(null);
        } catch (error: any) {
            const status = error?.response?.status;
            if (status === 404) {
                setSessions([]);
                setSessionsError(null);
                if (navigation.canGoBack?.()) {
                    navigation.goBack();
                } else {
                    router.replace("/(main)/training/groups");
                }
                return;
            }

            console.error("Erreur chargement séances groupe", error);
            const message = error?.response?.data?.message || "Impossible de charger les séances du groupe";
            setSessionsError(message);
        } finally {
            setSessionsLoading(false);
        }
    }, [id, isMember, navigation, router]);

    useFocusEffect(
        useCallback(() => {
            let isActive = true;

            const run = async () => {
                const data = await fetchGroup();
                if (!isActive || !data) return;

                const ownerIdFromData = extractUserId(data.owner);
                const currentUserIdFromData = user?.id || user?._id;
                const isOwnerFromData =
                    Boolean(ownerIdFromData && currentUserIdFromData && ownerIdFromData === currentUserIdFromData);
                const isMemberFromData = Boolean(data.isMember || isOwnerFromData);

                await fetchSessions(isMemberFromData);
            };

            run();
            return () => {
                isActive = false;
            };
        }, [fetchGroup, fetchSessions, user]),
    );

    const handleRefresh = useCallback(() => {
        if (refreshing) {
            return;
        }
        setRefreshing(true);
        (async () => {
            try {
                const data = await fetchGroup();
                if (!data) return;

                const ownerIdFromData = extractUserId(data.owner);
                const currentUserIdFromData = user?.id || user?._id;
                const isOwnerFromData =
                    Boolean(ownerIdFromData && currentUserIdFromData && ownerIdFromData === currentUserIdFromData);
                const isMemberFromData = Boolean(data.isMember || isOwnerFromData);

                await fetchSessions(isMemberFromData);
            } catch {
                // Errors are already handled inside fetchGroup/fetchSessions.
            } finally {
                setRefreshing(false);
            }
        })();
    }, [fetchGroup, fetchSessions, refreshing, user]);

    useEffect(() => {
        if (isMember) {
            fetchSessions();
        } else {
            setSessions([]);
        }
    }, [isMember, fetchSessions]);

    const members = group?.members ?? [];
    const pendingRequests = group?.pendingRequests ?? [];
    const pendingInvites = group?.memberInvites ?? [];
    const groupReturnPath = useMemo(() => {
        const slug = group?.id || id?.toString() || "";
        const query = slug ? `?id=${slug}` : "";
        return `${pathname}${query}`;
    }, [group?.id, id, pathname]);
    const shareableSessions = useMemo(() => {
        if (!ownerId) return [];
        return ownedSessions.filter((session) => session.athleteId === ownerId && !session.groupId);
    }, [ownedSessions, ownerId]);

    const groupedSessions = useMemo(() => groupSessionsByTimeframe(sessions), [sessions]);

    const filteredSessions = groupedSessions[timeframe] || [];
    const timeframeTitle = SECTION_LABELS[timeframe];
    const formattedCreatedAt = useMemo(() => {
        if (!group?.createdAt) return null;
        try {
            return new Date(group.createdAt).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            });
        } catch (error) {
            console.warn("Format date groupe", error);
            return null;
        }
    }, [group?.createdAt]);

    const heroStats = useMemo(
        () => [
            {
                icon: "account-group-outline" as const,
                label: "Membres actifs",
                value: `${group?.membersCount ?? members.length}`,
            },
            {
                icon: "calendar-blank-outline" as const,
                label: "Créé le",
                value: formattedCreatedAt ?? "À définir",
            },
        ],
        [formattedCreatedAt, group?.membersCount, members.length],
    );

    const handlePublishSession = useCallback(() => {
        if (!isOwner) {
            return;
        }
        setSessionPickerVisible(true);
        setSessionPickerError(null);
        setSessionPickerLoading(true);
        setOwnedSessions([]);
        listTrainingSessions()
            .then((data) => {
                setOwnedSessions(data);
            })
            .catch((error: any) => {
                const message = error?.response?.data?.message || error?.message || "Impossible de récupérer vos séances";
                setSessionPickerError(message);
            })
            .finally(() => {
                setSessionPickerLoading(false);
            });
    }, [isOwner]);

    const handleCreateNewSession = useCallback(() => {
        const groupId = group?.id || id?.toString();
        if (!groupId) return;
        setSessionPickerVisible(false);
        router.push({ pathname: "/(main)/training/create", params: { groupId } });
    }, [group?.id, id, router]);

    const handleShareGroup = useCallback(async () => {
        const groupId = group?.id || id?.toString();
        if (!groupId) return;

        const groupName = group?.name?.trim() || "un groupe";
        const universalUrl = WEB_BASE_URL
            ? `${WEB_BASE_URL}/groups/${groupId}`
            : /^https?:\/\//i.test(API_BASE_URL)
                ? `${API_BASE_URL.replace(/\/+$/, "")}/groups/${groupId}`
                : null;

        const fallbackDeepLink = Linking.createURL(`/(main)/training/groups/${groupId}`);
        const urlToShare = universalUrl || fallbackDeepLink;
        const message = `Rejoins ${groupName} sur Talent-X : ${urlToShare}`;

        try {
            await Share.share({ message });
        } catch (error) {
            console.warn("shareGroup", error);
            openSystemDialog(
                "Erreur",
                "Impossible d'ouvrir le partage sur cet appareil.",
                "error",
            );
        }
    }, [group?.id, group?.name, id, openSystemDialog]);

    const handleJoinGroup = useCallback(async () => {
        const groupId = group?.id || id?.toString();
        if (!groupId || joinLoading || leaveLoading) return;
        try {
            setJoinLoading(true);
            const updated = await joinTrainingGroup(groupId);
            setGroup((prev) => ({ ...(prev || {}), ...updated, hasPendingRequest: true }));
            setToastMessage("Demande envoyée — Votre demande a été transmise au coach du groupe.");
            setToastVisible(true);
        } catch (error: any) {
            const message = error?.response?.data?.message || error?.message || "Impossible d'envoyer la demande";
            openSystemDialog("Erreur", message, "error");
        } finally {
            setJoinLoading(false);
        }
    }, [group?.id, id, joinLoading, leaveLoading, openSystemDialog]);

    const performLeaveGroup = useCallback(async () => {
        const groupId = group?.id || id?.toString();
        if (!groupId || !currentUserId || joinLoading || leaveLoading) return;
        try {
            setLeaveLoading(true);
            const updated = await removeMemberFromTrainingGroup(groupId, currentUserId);
            setGroup(updated);
            setToastMessage("Groupe quitté — Vous avez quitté ce groupe.");
            setToastVisible(true);
        } catch (error: any) {
            const message = error?.response?.data?.message || error?.message || "Impossible de quitter le groupe";
            openSystemDialog("Erreur", message, "error");
        } finally {
            setLeaveLoading(false);
        }
    }, [currentUserId, group?.id, id, joinLoading, leaveLoading, openSystemDialog]);

    const handleLeaveGroup = useCallback(() => {
        const groupId = group?.id || id?.toString();
        if (!groupId || !currentUserId || joinLoading || leaveLoading) return;
        openConfirmToast("Quitter ce groupe ?", performLeaveGroup);
    }, [currentUserId, group?.id, id, joinLoading, leaveLoading, openConfirmToast, performLeaveGroup]);

    const handleAcceptInvite = useCallback(async () => {
        const groupId = group?.id || id?.toString();
        if (!groupId || inviteDecisionLoading) {
            return;
        }
        try {
            setInviteDecisionLoading("accept");
            const updated = await acceptTrainingGroupInvite(groupId);
            setGroup(updated);
            setToastMessage("Invitation acceptée.");
            setToastVisible(true);
            fetchSessions();
        } catch (error: any) {
            const message = error?.response?.data?.message || error?.message || "Impossible d'accepter l'invitation";
            openSystemDialog("Erreur", message, "error");
        } finally {
            setInviteDecisionLoading(null);
        }
    }, [fetchSessions, group?.id, id, inviteDecisionLoading, openSystemDialog]);

    const handleDeclineInvite = useCallback(async () => {
        const groupId = group?.id || id?.toString();
        if (!groupId || inviteDecisionLoading) {
            return;
        }
        try {
            setInviteDecisionLoading("decline");
            await declineTrainingGroupInvite(groupId);
            openSystemDialog(
                "Invitation refusée",
                "Vous avez refusé l'invitation.",
                "info",
                () => (router.canGoBack?.() ? router.back() : router.replace("/(main)/training/groups")),
            );
        } catch (error: any) {
            const message = error?.response?.data?.message || error?.message || "Impossible de refuser l'invitation";
            openSystemDialog("Erreur", message, "error");
        } finally {
            setInviteDecisionLoading(null);
        }
    }, [group?.id, id, inviteDecisionLoading, openSystemDialog, router]);

    const closeSessionPicker = useCallback(() => {
        if (sessionPublishingId) {
            return;
        }
        setSessionPickerVisible(false);
        setSessionPickerError(null);
    }, [sessionPublishingId]);

    const handleAttachExistingSession = useCallback(
        async (sessionId: string) => {
            if (!group?.id) {
                return;
            }
            setSessionPublishingId(sessionId);
            try {
                await attachSessionToGroup(group.id, sessionId);
                await fetchSessions();
                setToastMessage("Séance ajoutée — La séance est maintenant partagée dans ce groupe.");
                setToastVisible(true);
                setSessionPickerVisible(false);
            } catch (error: any) {
                const message = error?.response?.data?.message || error?.message || "Impossible d'ajouter cette séance";
                openSystemDialog("Erreur", message, "error");
            } finally {
                setSessionPublishingId(null);
            }
        },
        [fetchSessions, group?.id, openSystemDialog],
    );

    const performDetachGroupSession = useCallback(
        async (sessionId: string) => {
            if (!group?.id || !sessionId) {
                return;
            }
            setSessionRemovalIds((prev) => ({ ...prev, [sessionId]: true }));
            try {
                await detachSessionFromGroup(group.id, sessionId);
                await fetchSessions();
                setToastMessage("Séance retirée — Cette séance n'est plus partagée dans le groupe.");
                setToastVisible(true);
            } catch (error: any) {
                const message = error?.response?.data?.message || error?.message || "Impossible de retirer cette séance";
                openSystemDialog("Erreur", message, "error");
            } finally {
                setSessionRemovalIds((prev) => {
                    if (!prev[sessionId]) {
                        return prev;
                    }
                    const next = { ...prev };
                    delete next[sessionId];
                    return next;
                });
            }
        },
        [fetchSessions, group?.id, openSystemDialog],
    );

    const closeRemoveSessionDialog = useCallback(() => {
        if (removeSessionTargetId && sessionRemovalIds[removeSessionTargetId]) {
            return;
        }
        setRemoveSessionDialogVisible(false);
        setRemoveSessionTargetId(null);
        setRemoveSessionTargetLabel(null);
    }, [removeSessionTargetId, sessionRemovalIds]);

    const handleConfirmRemoveSession = useCallback(async () => {
        if (!removeSessionTargetId) return;
        await performDetachGroupSession(removeSessionTargetId);
        setRemoveSessionDialogVisible(false);
        setRemoveSessionTargetId(null);
        setRemoveSessionTargetLabel(null);
    }, [performDetachGroupSession, removeSessionTargetId]);

    const closeCancelInviteDialog = useCallback(() => {
        if (cancelInviteLoading) {
            return;
        }
        setCancelInviteDialogVisible(false);
        setCancelInviteTargetId(null);
        setCancelInviteTargetLabel(null);
    }, [cancelInviteLoading]);

    const confirmCancelInvite = useCallback((userId: string, label?: string) => {
        if (!userId) return;
        setCancelInviteTargetId(userId);
        setCancelInviteTargetLabel(label || null);
        setCancelInviteDialogVisible(true);
    }, []);

    const handleConfirmCancelInvite = useCallback(async () => {
        const groupId = group?.id || id?.toString();
        if (!groupId || !cancelInviteTargetId || cancelInviteLoading) {
            return;
        }
        try {
            setCancelInviteLoading(true);
            const updated = await cancelTrainingGroupInvite(groupId, cancelInviteTargetId);
            setGroup(updated);
            setToastMessage("Invitation annulée.");
            setToastVisible(true);
            closeCancelInviteDialog();
        } catch (error: any) {
            const message = error?.response?.data?.message || error?.message || "Impossible d'annuler l'invitation";
            openSystemDialog("Erreur", message, "error");
        } finally {
            setCancelInviteLoading(false);
        }
    }, [cancelInviteLoading, cancelInviteTargetId, closeCancelInviteDialog, group?.id, id, openSystemDialog]);

    const confirmDetachGroupSession = useCallback(
        (sessionId: string, label?: string) => {
            if (!sessionId) {
                return;
            }
            setRemoveSessionTargetId(sessionId);
            setRemoveSessionTargetLabel(label || null);
            setRemoveSessionDialogVisible(true);
        },
        [],
    );

    const handleOpenSession = useCallback(
        (sessionId: string) => {
            router.push(`/(main)/training/${sessionId}`);
        },
        [router],
    );

    const handleJoinSession = useCallback(
        async (sessionId: string) => {
            if (!sessionId) return;
            const targetSession = sessions.find((item) => item.id === sessionId);
            if (isSessionLocked(targetSession?.status)) {
                const reasonLabel = targetSession?.status === "canceled" ? "annulée" : "terminée";
                openSystemDialog("Séance clôturée", `Impossible de rejoindre une séance ${reasonLabel}.`, "info");
                return;
            }
            let skip = false;
            setSessionMutationIds((prev) => {
                if (prev[sessionId]) {
                    skip = true;
                    return prev;
                }
                return { ...prev, [sessionId]: true };
            });
            if (skip) {
                return;
            }
            try {
                const updated = await joinSession(sessionId);
                setSessions((prev) => prev.map((session) => (session.id === updated.id ? updated : session)));
            } catch (error: any) {
                console.error("Erreur participation séance", error);
                const message = error?.response?.data?.message || "Impossible de rejoindre cette séance";
                openSystemDialog("Erreur", message, "error");
            } finally {
                setSessionMutationIds((prev) => {
                    if (!prev[sessionId]) return prev;
                    const next = { ...prev };
                    delete next[sessionId];
                    return next;
                });
            }
        },
        [joinSession, openSystemDialog, sessions],
    );

    const handleLeaveSession = useCallback(
        async (sessionId: string) => {
            if (!sessionId) return;
            const targetSession = sessions.find((item) => item.id === sessionId);
            if (isSessionLocked(targetSession?.status)) {
                const reasonLabel = targetSession?.status === "canceled" ? "annulée" : "terminée";
                openSystemDialog(
                    "Séance clôturée",
                    `Les désinscriptions sont verrouillées car la séance est ${reasonLabel}.`,
                    "info",
                );
                return;
            }
            let skip = false;
            setSessionMutationIds((prev) => {
                if (prev[sessionId]) {
                    skip = true;
                    return prev;
                }
                return { ...prev, [sessionId]: true };
            });
            if (skip) {
                return;
            }
            try {
                const updated = await leaveSession(sessionId);
                setSessions((prev) => prev.map((session) => (session.id === updated.id ? updated : session)));
            } catch (error: any) {
                console.error("Erreur désinscription séance", error);
                const message = error?.response?.data?.message || "Impossible de se désinscrire de cette séance";
                openSystemDialog("Erreur", message, "error");
            } finally {
                setSessionMutationIds((prev) => {
                    if (!prev[sessionId]) return prev;
                    const next = { ...prev };
                    delete next[sessionId];
                    return next;
                });
            }
        },
        [leaveSession, openSystemDialog, sessions],
    );

    const handleOpenMemberDialog = useCallback(() => {
        setMemberDialogVisible(true);
        setMemberInput("");
        setMemberSuggestions([]);
        setSelectedMember(null);
    }, []);

    useEffect(() => {
        const showSub = Keyboard.addListener("keyboardDidShow", () => setMemberDialogKeyboardVisible(true));
        const hideSub = Keyboard.addListener("keyboardDidHide", () => setMemberDialogKeyboardVisible(false));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const closeMemberDialog = useCallback(() => {
        if (memberSaving) {
            return;
        }
        setMemberDialogVisible(false);
        setMemberInput("");
        setMemberSuggestions([]);
        setSelectedMember(null);
    }, [memberSaving]);

    const handleDismissMemberDialog = useCallback(() => {
        if (memberSaving) {
            return;
        }
        // When the user taps outside while typing, hide the keyboard first (do not close the dialog).
        if (memberDialogKeyboardVisible) {
            Keyboard.dismiss();
            return;
        }
        closeMemberDialog();
    }, [closeMemberDialog, memberDialogKeyboardVisible, memberSaving]);

    const handleSelectMemberSuggestion = useCallback((suggestion: UserSearchResult) => {
        setSelectedMember(suggestion);
        setMemberInput(suggestion.fullName?.trim() || suggestion.username?.trim() || suggestion.id);
        setMemberSuggestions([]);
        setMemberSearchLoading(false);
    }, []);

    const handleAddMember = useCallback(async () => {
        const groupId = group?.id || id?.toString();
        if (!groupId) {
            return;
        }
        const trimmed = memberInput.trim();
        const manualIdAllowed = /^[a-f\d]{8,}$/i.test(trimmed);
        const targetUserId = selectedMember?.id || (manualIdAllowed ? trimmed : "");
        if (!targetUserId) {
            openSystemDialog(
                "Sélection requise",
                "Choisissez un athlète dans la liste ou renseignez son identifiant complet.",
                "info",
            );
            return;
        }
        try {
            setMemberSaving(true);
            const updated = await addMemberToTrainingGroup(groupId, targetUserId);
            setGroup(updated);
            setMemberDialogVisible(false);
            setMemberInput("");
            setMemberSuggestions([]);
            setSelectedMember(null);
            setToastMessage("Invitation envoyée.");
            setToastVisible(true);
        } catch (error: any) {
            const message = error?.response?.data?.message || error?.message || "Ajout impossible";
            openSystemDialog("Erreur", message, "error");
        } finally {
            setMemberSaving(false);
        }
    }, [group?.id, id, memberInput, openSystemDialog, selectedMember]);

    const performRemoveMember = useCallback(
        async (memberId: string) => {
            const groupId = group?.id || id?.toString();
            if (!groupId || !memberId) {
                return;
            }
            setRemovingMemberIds((prev) => ({ ...prev, [memberId]: true }));
            try {
                const updated = await removeMemberFromTrainingGroup(groupId, memberId);
                setGroup(updated);
                setToastMessage("Membre retiré du groupe.");
                setToastVisible(true);
            } catch (error: any) {
                const message = error?.response?.data?.message || error?.message || "Impossible de retirer ce membre";
                openSystemDialog("Erreur", message, "error");
            } finally {
                setRemovingMemberIds((prev) => {
                    if (!prev[memberId]) return prev;
                    const next = { ...prev };
                    delete next[memberId];
                    return next;
                });
            }
        },
        [group?.id, id, openSystemDialog],
    );

    const closeRemoveMemberDialog = useCallback(() => {
        if (removeMemberTargetId && removingMemberIds[removeMemberTargetId]) {
            return;
        }
        setRemoveMemberDialogVisible(false);
        setRemoveMemberTargetId(null);
        setRemoveMemberTargetLabel(null);
    }, [removeMemberTargetId, removingMemberIds]);

    const handleConfirmRemoveMember = useCallback(async () => {
        if (!removeMemberTargetId) return;
        await performRemoveMember(removeMemberTargetId);
        // Close after the async action, regardless of outcome (errors are already surfaced).
        setRemoveMemberDialogVisible(false);
        setRemoveMemberTargetId(null);
        setRemoveMemberTargetLabel(null);
    }, [performRemoveMember, removeMemberTargetId]);

    const confirmRemoveMember = useCallback(
        (memberId: string, label?: string) => {
            if (!memberId) {
                return;
            }
            setRemoveMemberTargetId(memberId);
            setRemoveMemberTargetLabel(label || null);
            setRemoveMemberDialogVisible(true);
        },
        [],
    );

    const handleAcceptRequest = useCallback(
        async (requestUserId: string) => {
            const groupId = group?.id || id?.toString();
            if (!groupId || !requestUserId) return;
            setRequestActionIds((prev) => ({ ...prev, [requestUserId]: "accept" }));
            try {
                const updated = await acceptTrainingGroupRequest(groupId, requestUserId);
                setGroup(updated);
                setToastMessage("Demande acceptée — L’athlète a été ajouté au groupe.");
                setToastVisible(true);
            } catch (error: any) {
                const message = error?.response?.data?.message || error?.message || "Impossible d'accepter la demande";
                openSystemDialog("Erreur", message, "error");
            } finally {
                setRequestActionIds((prev) => {
                    if (!prev[requestUserId]) return prev;
                    const next = { ...prev };
                    delete next[requestUserId];
                    return next;
                });
            }
        },
        [group?.id, id, openSystemDialog],
    );

    const handleRejectRequest = useCallback(
        async (requestUserId: string) => {
            const groupId = group?.id || id?.toString();
            if (!groupId || !requestUserId) return;
            setRequestActionIds((prev) => ({ ...prev, [requestUserId]: "reject" }));
            try {
                const updated = await rejectTrainingGroupRequest(groupId, requestUserId);
                setGroup(updated);
            } catch (error: any) {
                const message = error?.response?.data?.message || error?.message || "Impossible de refuser la demande";
                openSystemDialog("Erreur", message, "error");
            } finally {
                setRequestActionIds((prev) => {
                    if (!prev[requestUserId]) return prev;
                    const next = { ...prev };
                    delete next[requestUserId];
                    return next;
                });
            }
        },
        [group?.id, id, openSystemDialog],
    );

    useEffect(() => {
        if (!memberDialogVisible) {
            setMemberSuggestions([]);
            setMemberSearchLoading(false);
            return;
        }
        const trimmed = memberInput.trim();
        if (trimmed.length < 2) {
            setMemberSuggestions([]);
            setMemberSearchLoading(false);
            return;
        }
        let isActive = true;
        setMemberSearchLoading(true);
        const debounce = setTimeout(() => {
            searchUsers(trimmed)
                .then((results) => {
                    if (!isActive) return;
                    setMemberSuggestions(results);
                })
                .catch(() => {
                    if (!isActive) return;
                    setMemberSuggestions([]);
                })
                .finally(() => {
                    if (!isActive) return;
                    setMemberSearchLoading(false);
                });
        }, 250);
        return () => {
            isActive = false;
            clearTimeout(debounce);
        };
    }, [memberDialogVisible, memberInput]);

    if (!fontsLoaded) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.loadingState}>
                    <ActivityIndicator color="#22d3ee" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <>
            <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
                <View style={styles.backgroundDecor}>
                    <LinearGradient
                        colors={["#020617", "#01030b"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0.8, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <LinearGradient
                        colors={["rgba(34,211,238,0.35)", "transparent"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.backgroundGlow}
                    />
                </View>
                <ScrollView
                    contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom + 16, 36) }]}
                    refreshControl={
                        <RefreshControl tintColor="#22d3ee" refreshing={refreshing} onRefresh={handleRefresh} />
                    }
                >
                    {loading ? (
                        <View style={styles.loadingInline}>
                            <ActivityIndicator color="#22d3ee" />
                        </View>
                    ) : null}

                    {group ? (
                        <>
                            <View style={styles.hero}>
                                <LinearGradient
                                    colors={["rgba(34,211,238,0.25)", "rgba(2,6,23,0.35)"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.heroGradient}
                                />

                                <View style={styles.heroHeaderRow}>
                                    <View style={styles.heroIdentity}>
                                        <View style={styles.heroNameRow}>
                                            <View style={styles.heroNamePlate}>
                                                <Text style={styles.heroTitle}>{group.name}</Text>
                                            </View>
                                            <Pressable
                                                accessibilityRole="button"
                                                accessibilityLabel="Partager ce groupe"
                                                onPress={handleShareGroup}
                                                style={styles.heroShareIcon}
                                                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                            >
                                                <MaterialCommunityIcons name="share-variant" size={20} color="#02131d" />
                                            </Pressable>
                                            {isOwner ? (
                                                <Pressable
                                                    accessibilityRole="button"
                                                    accessibilityLabel="Modifier ce groupe"
                                                    onPress={() =>
                                                        router.push(`/(main)/training/groups/${group.id}/edit`)
                                                    }
                                                    style={styles.heroEditIcon}
                                                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                                >
                                                    <MaterialCommunityIcons name="square-edit-outline" size={20} color="#02131d" />
                                                </Pressable>
                                            ) : null}
                                        </View>
                                        {group.description ? (
                                            <Text style={styles.heroSubtitle} numberOfLines={3}>
                                                {group.description}
                                            </Text>
                                        ) : null}
                                    </View>
                                </View>

                                <View style={styles.heroMetaGrid}>
                                    {heroStats.map((stat) => (
                                        <HeroStat key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} />
                                    ))}
                                </View>
                            </View>

                            <View style={styles.sectionCard}>
                                <View style={styles.sectionHeader}>
                                    <View>
                                        <Text style={styles.sectionTitle}>Séances partagées</Text>
                                        <Text style={styles.sectionHint}>
                                            {isMember
                                                ? sessions.length > 0
                                                    ? `${sessions.length} publication${sessions.length > 1 ? "s" : ""}`
                                                    : "Aucune séance programmée"
                                                : "Rejoignez le groupe pour voir les séances"}
                                        </Text>
                                    </View>
                                    {isOwner ? (
                                        <Pressable
                                            style={styles.primaryButton}
                                            accessibilityRole="button"
                                            onPress={handlePublishSession}
                                        >
                                            <MaterialCommunityIcons name="plus" size={12} color="#010b14" />
                                        </Pressable>
                                    ) : null}
                                </View>
                                <View style={styles.sectionDivider} />
                                {!isMember ? (
                                    <View style={styles.timeframeEmptyState}>
                                        <MaterialCommunityIcons name="lock-open-variant" size={22} color="#94a3b8" />
                                        <Text style={styles.timeframeEmptyTitle}>Aperçu limité</Text>
                                        <Text style={styles.timeframeEmptySubtitle}>
                                            Seuls les membres peuvent consulter les séances partagées de ce groupe.
                                        </Text>
                                    </View>
                                ) : sessionsLoading ? (
                                    <View style={styles.loadingInline}>
                                        <ActivityIndicator color="#22d3ee" />
                                    </View>
                                ) : sessionsError ? (
                                    <Text style={styles.emptyState}>{sessionsError}</Text>
                                ) : sessions.length === 0 ? (
                                    <Text style={styles.emptyState}>
                                        {isOwner
                                            ? "Publiez votre première séance pour dynamiser ce groupe."
                                            : "Le coach n'a pas encore partagé de séance."}
                                    </Text>
                                ) : (
                                    <>
                                        <View style={styles.timeframeSwitcher}>
                                            {TIMEFRAME_OPTIONS.map((option) => {
                                                const isActive = timeframe === option.key;
                                                const count = groupedSessions[option.key].length;
                                                return (
                                                    <Pressable
                                                        key={option.key}
                                                        style={[styles.timeframeChip, isActive && styles.timeframeChipActive]}
                                                        accessibilityRole="button"
                                                        onPress={() => setTimeframe(option.key)}
                                                    >
                                                        <MaterialCommunityIcons
                                                            name={option.icon}
                                                            size={12}
                                                            color={isActive ? "#010617" : "#38bdf8"}
                                                        />
                                                        <View style={styles.timeframeChipLabels}>
                                                            <Text
                                                                style={[styles.timeframeChipLabel, isActive && styles.timeframeChipLabelActive]}
                                                            >
                                                                {option.label}
                                                            </Text>
                                                            <Text
                                                                style={[styles.timeframeChipCount, isActive && styles.timeframeChipCountActive]}
                                                            >
                                                                {count} séance{count > 1 ? "s" : ""}
                                                            </Text>
                                                        </View>
                                                    </Pressable>
                                                );
                                            })}
                                        </View>
                                        <View style={styles.timeframeSectionHeader}>
                                            <View>
                                                <Text style={styles.timeframeSectionTitle}>{timeframeTitle}</Text>
                                            </View>
                                            <View style={styles.timeframeCountPill}>
                                                <Text style={styles.timeframeCountNumber}>{filteredSessions.length}</Text>
                                                <Text style={styles.timeframeCountLabel}>
                                                    séance{filteredSessions.length > 1 ? "s" : ""}
                                                </Text>
                                            </View>
                                        </View>
                                        {filteredSessions.length ? (
                                            <View style={styles.sessionList}>
                                                {filteredSessions.map((session) => {
                                                    const sessionOwnerId = getSessionOwnerId(session);
                                                    const ownsSession = sessionOwnerId === currentUserId;
                                                    const hasConfirmed = userHasConfirmedSession(session, currentUserId);
                                                    const isLockedSession = isSessionLocked(session.status);
                                                    const canJoinSession = !isLockedSession && !ownsSession && !hasConfirmed;
                                                    const canLeaveSession = !isLockedSession && !ownsSession && hasConfirmed;
                                                    const isMutating = Boolean(sessionMutationIds[session.id]);
                                                    const canDetachSession = Boolean(isOwner && sessionOwnerId === ownerId);
                                                    const isRemovingSession = Boolean(sessionRemovalIds[session.id]);
                                                    return (
                                                        <View key={session.id} style={styles.sessionCardWrapper}>
                                                            <TrainingSessionCard
                                                                session={session}
                                                                currentUserId={currentUserId}
                                                                onPress={() => handleOpenSession(session.id)}
                                                            />
                                                            {canDetachSession ? (
                                                                <Pressable
                                                                    style={({ pressed }) => [
                                                                        styles.sessionDetachButton,
                                                                        pressed && styles.sessionDetachButtonPressed,
                                                                        isRemovingSession && styles.sessionDetachButtonDisabled,
                                                                    ]}
                                                                    accessibilityRole="button"
                                                                    onPress={() =>
                                                                        confirmDetachGroupSession(session.id, session.title)
                                                                    }
                                                                    disabled={isRemovingSession}
                                                                >
                                                                    {isRemovingSession ? (
                                                                        <ActivityIndicator size="small" color="#fecaca" />
                                                                    ) : (
                                                                        <>
                                                                            <MaterialCommunityIcons
                                                                                name="trash-can"
                                                                                size={16}
                                                                                color="#fecaca"
                                                                            />
                                                                            <Text style={styles.sessionDetachButtonLabel}>Retirer</Text>
                                                                        </>
                                                                    )}
                                                                </Pressable>
                                                            ) : null}
                                                            {canJoinSession ? (
                                                                <Pressable
                                                                    style={[
                                                                        styles.sessionJoinButton,
                                                                        isMutating && styles.sessionJoinButtonDisabled,
                                                                    ]}
                                                                    accessibilityRole="button"
                                                                    onPress={() => handleJoinSession(session.id)}
                                                                    disabled={isMutating}
                                                                >
                                                                    {isMutating ? (
                                                                        <ActivityIndicator color="#02131d" />
                                                                    ) : (
                                                                        <>
                                                                            <MaterialCommunityIcons
                                                                                name="hand-back-left"
                                                                                size={14}
                                                                                color="#02131d"
                                                                            />
                                                                            <Text
                                                                                style={styles.sessionJoinButtonLabel}
                                                                                numberOfLines={1}
                                                                                ellipsizeMode="tail"
                                                                            >
                                                                                Je participe
                                                                            </Text>
                                                                        </>
                                                                    )}
                                                                </Pressable>
                                                            ) : canLeaveSession ? (
                                                                <Pressable
                                                                    style={[
                                                                        styles.sessionLeaveButton,
                                                                        isMutating && styles.sessionJoinButtonDisabled,
                                                                    ]}
                                                                    accessibilityRole="button"
                                                                    onPress={() => handleLeaveSession(session.id)}
                                                                    disabled={isMutating}
                                                                >
                                                                    {isMutating ? (
                                                                        <ActivityIndicator color="#fca5a5" />
                                                                    ) : (
                                                                        <>
                                                                            <MaterialCommunityIcons
                                                                                name="account-cancel"
                                                                                size={14}
                                                                                color="#fecaca"
                                                                            />
                                                                            <Text
                                                                                style={styles.sessionLeaveButtonLabel}
                                                                                numberOfLines={1}
                                                                                ellipsizeMode="tail"
                                                                            >
                                                                                Je me désinscris
                                                                            </Text>
                                                                        </>
                                                                    )}
                                                                </Pressable>
                                                            ) : null}
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        ) : (
                                            <View style={styles.timeframeEmptyState}>
                                                <MaterialCommunityIcons
                                                    name="emoticon-neutral-outline"
                                                    size={22}
                                                    color="#94a3b8"
                                                />
                                                <Text style={styles.timeframeEmptyTitle}>Aucune séance ici</Text>

                                            </View>
                                        )}
                                    </>
                                )}
                            </View>

                            <View style={styles.sectionCard}>
                                <View style={styles.sectionHeader}>
                                    <View>
                                        <Text style={styles.sectionTitle}>Membres</Text>
                                    </View>
                                    {isOwner ? (
                                        <Pressable
                                            style={({ pressed }) => [
                                                styles.memberActionButton,
                                                pressed && styles.memberActionButtonPressed,
                                            ]}
                                            accessibilityRole="button"
                                            onPress={handleOpenMemberDialog}
                                        >
                                            <MaterialCommunityIcons name="account-plus" size={16} color="#010617" />
                                            <Text style={styles.memberActionButtonLabel}>Ajouter</Text>
                                        </Pressable>
                                    ) : null}
                                </View>
                                <View style={styles.sectionDivider} />
                                {members.length === 0 ? (
                                    <Text style={styles.emptyState}>Aucun membre visible pour le moment.</Text>
                                ) : (
                                    members.map((member) => {
                                        const canRemoveMember = Boolean(isOwner && member.id && member.id !== ownerId);
                                        const isRemovingMember = Boolean(member.id && removingMemberIds[member.id]);
                                        const label = member.fullName || member.username;
                                        return (
                                            <MemberCard
                                                key={member.id}
                                                member={member}
                                                isCreator={member.id === ownerId}
                                                isCurrentUser={member.id === currentUserId}
                                                canRemove={canRemoveMember}
                                                isRemoving={isRemovingMember}
                                                returnPath={groupReturnPath}
                                                onRemove={
                                                    canRemoveMember && member.id
                                                        ? () => confirmRemoveMember(member.id, label)
                                                        : undefined
                                                }
                                            />
                                        );
                                    })
                                )}
                            </View>

                            {isOwner ? (
                                <View style={styles.sectionCard}>
                                    <View style={styles.sectionHeader}>
                                        <View>
                                            <Text style={styles.sectionTitle}>Demandes</Text>
                                            <Text style={styles.sectionHint}>
                                                {pendingRequests.length + pendingInvites.length
                                                    ? `${pendingRequests.length + pendingInvites.length} en attente`
                                                    : "Aucune demande en attente"}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.sectionDivider} />
                                    {pendingRequests.length === 0 && pendingInvites.length === 0 ? (
                                        <Text style={styles.emptyState}>Aucune demande pour le moment.</Text>
                                    ) : (
                                        <>
                                            {pendingRequests.map((request) => {
                                                const isActing = Boolean(request.id && requestActionIds[request.id]);
                                                const photoUri = getMemberPhotoUri(request.photoUrl);
                                                const displayName = request.fullName || request.username || "Athlète";
                                                const subtitle = request.username && request.fullName ? `@${request.username}` : request.username ? `@${request.username}` : undefined;
                                                const requestedDate = request.requestedAt
                                                    ? new Date(request.requestedAt).toLocaleDateString("fr-FR")
                                                    : undefined;
                                                return (
                                                    <View key={request.id} style={styles.requestCard}>
                                                        <View style={styles.requestInfo}>
                                                            {photoUri ? (
                                                                <Avatar.Image size={40} source={{ uri: photoUri }} style={styles.requestAvatar} />
                                                            ) : (
                                                                <View style={styles.requestAvatarFallback}>
                                                                    <Text style={styles.requestAvatarInitial}>
                                                                        {displayName.charAt(0).toUpperCase()}
                                                                    </Text>
                                                                </View>
                                                            )}
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={styles.requestName}>{displayName}</Text>
                                                                {subtitle ? <Text style={styles.requestSubtitle}>{subtitle}</Text> : null}
                                                                {requestedDate ? (
                                                                    <Text style={styles.requestDate}>Demandé le {requestedDate}</Text>
                                                                ) : null}
                                                            </View>
                                                        </View>
                                                        <View style={styles.requestActions}>
                                                            <Pressable
                                                                style={({ pressed }) => [
                                                                    styles.requestAcceptButton,
                                                                    pressed && styles.requestAcceptButtonPressed,
                                                                    isActing && styles.requestButtonDisabled,
                                                                ]}
                                                                disabled={isActing}
                                                                onPress={() => request.id && handleAcceptRequest(request.id)}
                                                            >
                                                                {requestActionIds[request.id || ""] === "accept" ? (
                                                                    <ActivityIndicator color="#010617" />
                                                                ) : (
                                                                    <>
                                                                        <MaterialCommunityIcons name="check" size={16} color="#010617" />
                                                                        <Text style={styles.requestAcceptLabel}>Valider</Text>
                                                                    </>
                                                                )}
                                                            </Pressable>
                                                            <Pressable
                                                                style={({ pressed }) => [
                                                                    styles.requestRejectButton,
                                                                    pressed && styles.requestRejectButtonPressed,
                                                                    isActing && styles.requestButtonDisabled,
                                                                ]}
                                                                disabled={isActing}
                                                                onPress={() => request.id && handleRejectRequest(request.id)}
                                                            >
                                                                {requestActionIds[request.id || ""] === "reject" ? (
                                                                    <ActivityIndicator color="#fecaca" />
                                                                ) : (
                                                                    <>
                                                                        <MaterialCommunityIcons name="close" size={16} color="#fecaca" />
                                                                        <Text style={styles.requestRejectLabel}>Refuser</Text>
                                                                    </>
                                                                )}
                                                            </Pressable>
                                                        </View>
                                                    </View>
                                                );
                                            })}

                                            {pendingInvites.map((invite) => {
                                                const photoUri = getMemberPhotoUri(invite.photoUrl);
                                                const displayName = invite.fullName || invite.username || "Athlète";
                                                const subtitle = invite.username && invite.fullName ? `@${invite.username}` : invite.username ? `@${invite.username}` : undefined;
                                                const invitedDate = invite.invitedAt
                                                    ? new Date(invite.invitedAt).toLocaleDateString("fr-FR")
                                                    : undefined;
                                                return (
                                                    <View key={`invite-${invite.id}`} style={styles.requestCard}>
                                                        <View style={styles.requestInfo}>
                                                            {photoUri ? (
                                                                <Avatar.Image size={40} source={{ uri: photoUri }} style={styles.requestAvatar} />
                                                            ) : (
                                                                <View style={styles.requestAvatarFallback}>
                                                                    <Text style={styles.requestAvatarInitial}>
                                                                        {displayName.charAt(0).toUpperCase()}
                                                                    </Text>
                                                                </View>
                                                            )}
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={styles.requestName}>{displayName}</Text>
                                                                {subtitle ? <Text style={styles.requestSubtitle}>{subtitle}</Text> : null}
                                                                <Text style={styles.requestDate}>
                                                                    Invitation envoyée{invitedDate ? ` le ${invitedDate}` : ""}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                        <View style={styles.requestActions}>
                                                            <Pressable
                                                                style={({ pressed }) => [
                                                                    styles.requestRejectButton,
                                                                    pressed && styles.requestRejectButtonPressed,
                                                                    cancelInviteLoading && styles.requestButtonDisabled,
                                                                ]}
                                                                disabled={cancelInviteLoading}
                                                                onPress={() => confirmCancelInvite(invite.id, displayName)}
                                                            >
                                                                <>
                                                                    <MaterialCommunityIcons name="close" size={16} color="#fecaca" />
                                                                    <Text style={styles.requestRejectLabel}>Annuler</Text>
                                                                </>
                                                            </Pressable>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </>
                                    )}
                                </View>
                            ) : null}

                            {!isOwner ? (
                                <View style={styles.footerActionsBar}>
                                    <View style={[styles.membershipActions, styles.membershipActionsFullWidth]}>
                                        {isMember ? (
                                            <Pressable
                                                style={({ pressed }) => [
                                                    styles.leaveButton,
                                                    styles.membershipButtonWide,
                                                    (pressed || leaveLoading) ? styles.leaveButtonPressed : null,
                                                    leaveLoading ? styles.membershipButtonDisabled : null,
                                                ]}
                                                disabled={leaveLoading}
                                                onPress={handleLeaveGroup}
                                                accessibilityRole="button"
                                            >
                                                {leaveLoading ? (
                                                    <ActivityIndicator color="#fecaca" />
                                                ) : (
                                                    <>
                                                        <MaterialCommunityIcons name="exit-run" size={16} color="#fecaca" />
                                                        <Text style={styles.leaveButtonLabel}>Quitter le groupe</Text>
                                                    </>
                                                )}
                                            </Pressable>
                                        ) : group?.hasPendingInvite ? (
                                            <>
                                                <Pressable
                                                    style={({ pressed }) => [
                                                        styles.joinButton,
                                                        styles.membershipButtonWide,
                                                        pressed ? styles.joinButtonPressed : null,
                                                        inviteDecisionLoading ? styles.membershipButtonDisabled : null,
                                                    ]}
                                                    disabled={Boolean(inviteDecisionLoading)}
                                                    onPress={handleAcceptInvite}
                                                    accessibilityRole="button"
                                                >
                                                    {inviteDecisionLoading === "accept" ? (
                                                        <ActivityIndicator color="#010b14" />
                                                    ) : (
                                                        <>
                                                            <MaterialCommunityIcons name="check-circle-outline" size={16} color="#010b14" />
                                                            <Text style={styles.joinButtonLabel}>Accepter l’invitation</Text>
                                                        </>
                                                    )}
                                                </Pressable>
                                                <Pressable
                                                    style={({ pressed }) => [
                                                        styles.leaveButton,
                                                        styles.membershipButtonWide,
                                                        pressed ? styles.leaveButtonPressed : null,
                                                        inviteDecisionLoading ? styles.membershipButtonDisabled : null,
                                                    ]}
                                                    disabled={Boolean(inviteDecisionLoading)}
                                                    onPress={handleDeclineInvite}
                                                    accessibilityRole="button"
                                                >
                                                    {inviteDecisionLoading === "decline" ? (
                                                        <ActivityIndicator color="#fecaca" />
                                                    ) : (
                                                        <>
                                                            <MaterialCommunityIcons name="close-circle-outline" size={16} color="#fecaca" />
                                                            <Text style={styles.leaveButtonLabel}>Refuser</Text>
                                                        </>
                                                    )}
                                                </Pressable>
                                            </>
                                        ) : group?.hasPendingRequest ? (
                                            <View style={[styles.pendingBadge, styles.membershipButtonDisabled, styles.membershipButtonWide]}>
                                                <MaterialCommunityIcons name="clock-outline" size={16} color="#cbd5e1" />
                                                <Text style={styles.pendingBadgeLabel}>Demande envoyée</Text>
                                            </View>
                                        ) : (
                                            <Pressable
                                                style={({ pressed }) => [
                                                    styles.joinButton,
                                                    styles.membershipButtonWide,
                                                    pressed ? styles.joinButtonPressed : null,
                                                    joinLoading ? styles.membershipButtonDisabled : null,
                                                ]}
                                                disabled={joinLoading}
                                                onPress={handleJoinGroup}
                                                accessibilityRole="button"
                                            >
                                                {joinLoading ? (
                                                    <ActivityIndicator color="#010b14" />
                                                ) : (
                                                    <>
                                                        <MaterialCommunityIcons name="account-multiple-plus" size={16} color="#010b14" />
                                                        <Text style={styles.joinButtonLabel}>Rejoindre le groupe</Text>
                                                    </>
                                                )}
                                            </Pressable>
                                        )}
                                    </View>
                                </View>
                            ) : null}
                        </>
                    ) : !loading ? (
                        <Text style={styles.emptyState}>Impossible de retrouver ce groupe.</Text>
                    ) : null}
                </ScrollView>
                {sessionPickerVisible ? (
                    <Portal>
                        <Dialog visible={true} onDismiss={closeSessionPicker}>
                            <Dialog.Content>
                                {sessionPickerLoading ? (
                                    <View style={styles.sessionPickerLoading}>
                                        <ActivityIndicator color="#22d3ee" />
                                    </View>
                                ) : sessionPickerError ? (
                                    <Text style={styles.sessionPickerError}>{sessionPickerError}</Text>
                                ) : shareableSessions.length ? (
                                    <ScrollView style={styles.sessionPickerList}>
                                        <View style={styles.sessionPickerListContent}>
                                            {shareableSessions.map((session) => {
                                                const isPublishing = sessionPublishingId === session.id;
                                                return (
                                                    <Pressable
                                                        key={session.id}
                                                        style={({ pressed }) => [
                                                            styles.sessionOptionRow,
                                                            pressed && styles.sessionOptionRowPressed,
                                                        ]}
                                                        onPress={() => handleAttachExistingSession(session.id)}
                                                        disabled={isPublishing}
                                                    >
                                                        <View style={styles.sessionOptionMeta}>
                                                            <Text style={styles.sessionOptionTitle}>{session.title}</Text>
                                                            <Text style={styles.sessionOptionSubtitle}>
                                                                {formatDisplayDate(session.date)}
                                                            </Text>
                                                        </View>
                                                        {isPublishing ? (
                                                            <ActivityIndicator size="small" color="#22d3ee" />
                                                        ) : (
                                                            <Text style={styles.sessionOptionAction}>Ajouter</Text>
                                                        )}
                                                    </Pressable>
                                                );
                                            })}
                                        </View>
                                    </ScrollView>
                                ) : (
                                    <Text style={styles.sessionPickerEmpty}>
                                        {ownedSessions.length
                                            ? "Toutes vos séances sont déjà partagées dans un groupe."
                                            : "Vous n'avez pas encore créé de séance."}
                                    </Text>
                                )}
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.sessionCreateButton,
                                        pressed && styles.sessionCreateButtonPressed,
                                    ]}
                                    onPress={handleCreateNewSession}
                                >
                                    <MaterialCommunityIcons name="plus-circle-outline" size={16} color="#010617" />
                                    <Text style={styles.sessionCreateButtonLabel}>Créer une nouvelle séance</Text>
                                </Pressable>
                            </Dialog.Content>
                            <Dialog.Actions>
                                <Button onPress={closeSessionPicker} disabled={Boolean(sessionPublishingId)} textColor="#94a3b8">
                                    Fermer
                                </Button>
                            </Dialog.Actions>
                        </Dialog>
                    </Portal>
                ) : null}
                {memberDialogVisible ? (
                    <Portal>
                        <Dialog visible={true} onDismiss={handleDismissMemberDialog} style={styles.memberDialog}>
                            <Dialog.Title>Ajouter un membre</Dialog.Title>
                            <Dialog.Content>
                                <TextInput
                                    label="Rechercher un athlète"
                                    value={memberInput}
                                    onChangeText={(value) => {
                                        setMemberInput(value);
                                        setSelectedMember(null);
                                    }}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    mode="outlined"
                                    style={styles.memberDialogInput}
                                    placeholder="Nom ou pseudo"
                                    returnKeyType="done"
                                    onSubmitEditing={() => Keyboard.dismiss()}
                                    disabled={memberSaving}
                                />
                                {memberInput.trim().length >= 2 ? (
                                    <View style={styles.memberSuggestionList}>
                                        {memberSearchLoading ? (
                                            <View style={styles.memberSuggestionLoading}>
                                                <ActivityIndicator color="#22d3ee" />
                                            </View>
                                        ) : memberSuggestions.length ? (
                                            memberSuggestions.map((suggestion, index) => {
                                                const suggestionPhotoUri = getMemberPhotoUri(suggestion.photoUrl);
                                                const suggestionLabel = suggestion.fullName || suggestion.username || "Athlète";
                                                return (
                                                    <Pressable
                                                        key={suggestion.id}
                                                        style={({ pressed }) => [
                                                            styles.memberSuggestionRow,
                                                            index === memberSuggestions.length - 1 && styles.memberSuggestionRowLast,
                                                            pressed && styles.memberSuggestionRowPressed,
                                                        ]}
                                                        onPress={() => handleSelectMemberSuggestion(suggestion)}
                                                    >
                                                        {suggestionPhotoUri ? (
                                                            <Avatar.Image
                                                                size={32}
                                                                source={{ uri: suggestionPhotoUri }}
                                                                style={[styles.memberSuggestionAvatar, styles.memberSuggestionAvatarImage]}
                                                            />
                                                        ) : (
                                                            <Avatar.Text
                                                                size={32}
                                                                label={suggestionLabel.slice(0, 2).toUpperCase()}
                                                                style={styles.memberSuggestionAvatar}
                                                            />
                                                        )}
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={styles.memberSuggestionName}>{suggestionLabel}</Text>
                                                            {suggestion.username ? (
                                                                <Text style={styles.memberSuggestionHandle}>@{suggestion.username}</Text>
                                                            ) : null}
                                                        </View>
                                                    </Pressable>
                                                );
                                            })
                                        ) : (
                                            <Text style={styles.memberSuggestionEmpty}>Aucun athlète trouvé.</Text>
                                        )}
                                    </View>
                                ) : (
                                    <Text style={styles.memberDialogHint}>Tapez au moins 2 lettres pour lancer la recherche.</Text>
                                )}

                            </Dialog.Content>
                            <Dialog.Actions>
                                <Button onPress={closeMemberDialog} disabled={memberSaving} textColor="#94a3b8">
                                    Annuler
                                </Button>
                                <Button onPress={handleAddMember} loading={memberSaving} disabled={memberSaving}>
                                    Ajouter
                                </Button>
                            </Dialog.Actions>
                        </Dialog>
                    </Portal>
                ) : null}

                {removeMemberDialogVisible ? (
                    <Portal>
                        <Dialog visible={true} onDismiss={closeRemoveMemberDialog} style={styles.removeDialog}>
                            <Dialog.Title>
                                <View style={styles.removeDialogTitleRow}>
                                    <MaterialCommunityIcons name="account-remove" size={18} color="#fca5a5" />
                                    <Text style={styles.removeDialogTitle}>Retirer le membre</Text>
                                </View>
                            </Dialog.Title>
                            <Dialog.Content>
                                <Text style={styles.removeDialogText}>
                                    {removeMemberTargetLabel
                                        ? `Retirer ${removeMemberTargetLabel} du groupe ?`
                                        : "Retirer cet athlète du groupe ?"}
                                </Text>
                            </Dialog.Content>
                            <Dialog.Actions>
                                <Button
                                    onPress={closeRemoveMemberDialog}
                                    disabled={Boolean(removeMemberTargetId && removingMemberIds[removeMemberTargetId])}
                                    textColor="#94a3b8"
                                >
                                    Annuler
                                </Button>
                                <Button
                                    onPress={handleConfirmRemoveMember}
                                    disabled={Boolean(removeMemberTargetId && removingMemberIds[removeMemberTargetId])}
                                    textColor="#fca5a5"
                                >
                                    Retirer
                                </Button>
                            </Dialog.Actions>
                        </Dialog>
                    </Portal>
                ) : null}

                {removeSessionDialogVisible ? (
                    <Portal>
                        <Dialog visible={true} onDismiss={closeRemoveSessionDialog} style={styles.removeDialog}>
                            <Dialog.Title>
                                <View style={styles.removeDialogTitleRow}>
                                    <MaterialCommunityIcons name="trash-can-outline" size={18} color="#fca5a5" />
                                    <Text style={styles.removeDialogTitle}>Retirer la séance</Text>
                                </View>
                            </Dialog.Title>
                            <Dialog.Content>
                                <Text style={styles.removeDialogText}>
                                    {removeSessionTargetLabel
                                        ? `Retirer "${removeSessionTargetLabel}" du groupe ?`
                                        : "Retirer cette séance du groupe ?"}
                                </Text>
                            </Dialog.Content>
                            <Dialog.Actions>
                                <Button
                                    onPress={closeRemoveSessionDialog}
                                    disabled={Boolean(removeSessionTargetId && sessionRemovalIds[removeSessionTargetId])}
                                    textColor="#94a3b8"
                                >
                                    Annuler
                                </Button>
                                <Button
                                    onPress={handleConfirmRemoveSession}
                                    disabled={Boolean(removeSessionTargetId && sessionRemovalIds[removeSessionTargetId])}
                                    textColor="#fca5a5"
                                >
                                    Retirer
                                </Button>
                            </Dialog.Actions>
                        </Dialog>
                    </Portal>
                ) : null}

                {cancelInviteDialogVisible ? (
                    <Portal>
                        <Dialog visible={true} onDismiss={closeCancelInviteDialog} style={styles.removeDialog}>
                            <Dialog.Title>
                                <View style={styles.removeDialogTitleRow}>
                                    <MaterialCommunityIcons name="close-circle-outline" size={18} color="#fca5a5" />
                                    <Text style={styles.removeDialogTitle}>Annuler l’invitation</Text>
                                </View>
                            </Dialog.Title>
                            <Dialog.Content>
                                <Text style={styles.removeDialogText}>
                                    {cancelInviteTargetLabel
                                        ? `Annuler l’invitation envoyée à ${cancelInviteTargetLabel} ?`
                                        : "Annuler cette invitation ?"}
                                </Text>
                            </Dialog.Content>
                            <Dialog.Actions>
                                <Button onPress={closeCancelInviteDialog} disabled={cancelInviteLoading} textColor="#94a3b8">
                                    Retour
                                </Button>
                                <Button onPress={handleConfirmCancelInvite} disabled={cancelInviteLoading} textColor="#fca5a5">
                                    Annuler
                                </Button>
                            </Dialog.Actions>
                        </Dialog>
                    </Portal>
                ) : null}

                {systemDialogVisible ? (
                    <Portal>
                        <Dialog visible={true} onDismiss={closeSystemDialog} style={styles.systemDialog}>
                            <Dialog.Title>
                                <View style={styles.removeDialogTitleRow}>
                                    <MaterialCommunityIcons
                                        name={
                                            systemDialogTone === "error"
                                                ? "alert-circle-outline"
                                                : systemDialogTone === "success"
                                                    ? "check-circle-outline"
                                                    : "information-outline"
                                        }
                                        size={18}
                                        color={systemDialogTone === "error" ? "#fca5a5" : "#22d3ee"}
                                    />
                                    <Text style={styles.systemDialogTitle}>{systemDialogTitle}</Text>
                                </View>
                            </Dialog.Title>
                            <Dialog.Content>
                                <Text style={styles.systemDialogText}>{systemDialogMessage}</Text>
                            </Dialog.Content>
                            <Dialog.Actions>
                                <Button onPress={handleSystemDialogOk} textColor="#67e8f9">
                                    OK
                                </Button>
                            </Dialog.Actions>
                        </Dialog>
                    </Portal>
                ) : null}
            </SafeAreaView>

            <Snackbar
                visible={toastVisible}
                onDismiss={() => setToastVisible(false)}
                duration={2200}
                action={{
                    label: "OK",
                    onPress: () => setToastVisible(false),
                    textColor: "#67e8f9",
                }}
                style={styles.toast}
            >
                <Text style={styles.toastText}>{toastMessage}</Text>
            </Snackbar>

            <Snackbar
                visible={confirmToastVisible}
                onDismiss={() => setConfirmToastVisible(false)}
                duration={4000}
                action={{
                    label: "Confirmer",
                    onPress: () => {
                        setConfirmToastVisible(false);
                        confirmToastActionRef.current?.();
                    },
                    textColor: "#67e8f9",
                }}
                style={styles.toast}
            >
                <Text style={styles.toastText}>{confirmToastMessage}</Text>
            </Snackbar>
        </>
    );
}

type HeroStatProps = {
    icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
    label: string;
    value: string;
};

const HeroStat = ({ icon, label, value }: HeroStatProps) => (
    <View style={styles.heroStat}>
        <View style={styles.heroStatIcon}>
            <MaterialCommunityIcons name={icon} color="#02131d" size={16} />
        </View>
        <View>
            <Text style={styles.heroStatLabel}>{label}</Text>
            <Text style={styles.heroStatValue}>{value}</Text>
        </View>
    </View>
);

type MemberCardProps = {
    member: GroupMember;
    isCreator: boolean;
    isCurrentUser: boolean;
    canRemove?: boolean;
    onRemove?: () => void;
    isRemoving?: boolean;
    returnPath?: string;
};

const MemberCard = ({ member, isCreator, isCurrentUser, canRemove, onRemove, isRemoving, returnPath }: MemberCardProps) => {
    const router = useRouter();
    const displayName = member.fullName || member.username || "Membre";
    const subtitle = member.username && member.fullName ? `@${member.username}` : member.username ? `@${member.username}` : undefined;
    const date = member.joinedAt ? new Date(member.joinedAt).toLocaleDateString("fr-FR") : undefined;
    const avatarInitial = displayName.charAt(0).toUpperCase();
    const showSelfBadge = isCurrentUser && !isCreator;
    const showBadges = isCreator || showSelfBadge;
    const photoUri = getMemberPhotoUri(member.photoUrl);
    const navigateToProfile = useCallback(() => {
        if (!member.id) return;
        if (isCurrentUser) {
            router.push("/(main)/user-profile");
            return;
        }
        router.push({
            pathname: "/(main)/profiles/[id]",
            params: returnPath ? { id: member.id, from: returnPath } : { id: member.id },
        });
    }, [isCurrentUser, member.id, returnPath, router]);

    return (
        <Pressable
            style={({ pressed }) => [
                styles.memberCard,
                member.id && styles.memberCardInteractive,
                pressed && member.id && styles.memberCardPressed,
            ]}
            accessibilityRole={member.id ? "button" : undefined}
            onPress={member.id ? navigateToProfile : undefined}
            disabled={!member.id}
        >
            {photoUri ? (
                <Avatar.Image
                    size={42}
                    source={{ uri: photoUri }}
                    style={[styles.memberAvatarFallback, styles.memberAvatarImage]}
                />
            ) : (
                <View style={styles.memberAvatarFallback}>
                    <Text style={styles.memberAvatarInitial}>{avatarInitial}</Text>
                </View>
            )}
            <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{displayName}</Text>
                {subtitle ? <Text style={styles.memberSubtitle}>{subtitle}</Text> : null}
            </View>
            <View style={styles.memberMetaColumn}>
                {date ? <Text style={styles.memberDate}>Depuis {date}</Text> : null}
                {canRemove ? (
                    <Pressable
                        style={({ pressed }) => [
                            styles.memberRemoveButton,
                            pressed && styles.memberRemoveButtonPressed,
                            isRemoving && styles.memberRemoveButtonDisabled,
                        ]}
                        accessibilityRole="button"
                        onPress={(event) => {
                            event.stopPropagation();
                            if (!isRemoving && onRemove) {
                                onRemove();
                            }
                        }}
                        disabled={isRemoving || !onRemove}
                    >
                        {isRemoving ? (
                            <ActivityIndicator size="small" color="#fecaca" />
                        ) : (
                            <MaterialCommunityIcons name="account-remove" size={16} color="#fca5a5" />
                        )}
                    </Pressable>
                ) : null}
                {showBadges ? (
                    <View style={styles.memberBadgeRow}>
                        {isCreator ? (
                            <View style={[styles.memberPill, styles.memberPillOwner]}>
                                <Text style={[styles.memberPillText, styles.memberPillTextDark]}>Coach</Text>
                            </View>
                        ) : null}
                        {showSelfBadge ? (
                            <View style={[styles.memberPill, styles.memberPillSelf]}>
                                <Text style={styles.memberPillText}>Vous</Text>
                            </View>
                        ) : null}
                    </View>
                ) : null}
            </View>
        </Pressable>
    );
};

function getParticipantUserId(value?: SessionParticipant["user"]) {
    if (!value) return undefined;
    if (typeof value === "string") return value;
    return value.id || value._id;
}

function getSessionOwnerId(session: TrainingSession) {
    const ownerRef = (session.athlete || session.athleteId) as SessionParticipant["user"] | undefined;
    return getParticipantUserId(ownerRef);
}

function userHasConfirmedSession(session: TrainingSession, userId?: string | null) {
    if (!userId) return false;
    if (getSessionOwnerId(session) === userId) return true;
    return (
        session.participants?.some(
            (participant) => getParticipantUserId(participant.user) === userId && (participant.status ?? "confirmed") === "confirmed"
        ) || false
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#020617",
    },
    backgroundDecor: {
        ...StyleSheet.absoluteFillObject,
    },
    backgroundGlow: {
        position: "absolute",
        width: 320,
        height: 320,
        borderRadius: 320,
        top: -80,
        right: -60,
        opacity: 0.8,
    },
    container: {
        paddingHorizontal: 10,
        paddingTop: 20,
        gap: 10,
    },
    loadingState: {
        marginTop: 40,
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
    },
    loadingInline: {
        alignItems: "center",
    },
    hero: {
        borderRadius: 24,
        padding: 8,
        backgroundColor: "rgba(15,23,42,0.65)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        gap: 10,
        overflow: "hidden",
        position: "relative",
    },
    heroGradient: {
        ...StyleSheet.absoluteFillObject,
    },
    footerActionsBar: {
        width: "100%",
        marginTop: 16,
        alignItems: "center",
    },
    heroHeaderRow: {
        width: "100%",
    },
    heroIdentity: {
        flex: 1,
        gap: 12,
        alignItems: "flex-start",
        width: "100%",
    },
    heroNameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        width: "100%",
        flexWrap: "wrap",
    },
    heroNamePlate: {
        paddingHorizontal: 10,
        paddingVertical: 12,
        borderRadius: 20,
        backgroundColor: "rgba(2,6,23,0.65)",
        borderWidth: 1,
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
        flex: 1,
        minWidth: 0,
    },
    heroTitle: {
        color: "#f8fafc",
        fontSize: 14,
        fontFamily: "SpaceGrotesk_700Bold",
        textAlign: "center",
    },
    heroSubtitle: {
        color: "#cbd5e1",
        marginTop: 4,
        fontFamily: "SpaceGrotesk_400Regular",
        fontStyle: "italic",
        fontSize: 14,
    },
    heroChipRow: {
        flex: 1,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
    },
    heroChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(15,23,42,0.7)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.3)",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,

    },
    heroChipText: {
        color: "#f8fafc",
        fontSize: 10,
        fontFamily: "SpaceGrotesk_500Medium",
    },
    heroMetaGrid: {
        flexDirection: "row",
        gap: 12,
        marginTop: 4,
        flexWrap: "wrap",
    },
    heroStat: {
        flex: 1,
        minWidth: 0,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        padding: 8,
        backgroundColor: "rgba(2,6,23,0.45)",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    heroStatIcon: {
        width: 34,
        height: 34,
        borderRadius: 12,
        backgroundColor: "rgba(248,250,252,0.9)",
        alignItems: "center",
        justifyContent: "center",
    },
    heroStatLabel: {
        color: "#94a3b8",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        fontFamily: "SpaceGrotesk_500Medium",
    },
    heroStatValue: {
        color: "#f8fafc",
        fontSize: 10,
        fontFamily: "SpaceGrotesk_700Bold",
        marginTop: 2,
    },
    heroEditIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: "#22d3ee",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#22d3ee",
        shadowOpacity: 0.4,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
    },
    heroShareIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: "rgba(248,250,252,0.85)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.45)",
    },
    sectionCard: {
        borderRadius: 28,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        backgroundColor: "rgba(10,15,35,0.75)",
        paddingHorizontal: 10,
        paddingVertical: 10,
    },
    sectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    primaryButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: "#22d3ee",
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 999,
        shadowColor: "#22d3ee",
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
    },
    primaryButtonLabel: {
        color: "#010b14",
        fontFamily: "SpaceGrotesk_700Bold",
        fontSize: 5,
        textTransform: "uppercase",
        letterSpacing: 0.4,
    },
    sectionTitle: {
        color: "#f8fafc",
        fontSize: 14,
        fontFamily: "SpaceGrotesk_700Bold",
    },
    sectionHint: {
        color: "#94a3b8",
        fontSize: 12,
        fontFamily: "SpaceGrotesk_400Regular",
    },
    sectionDivider: {
        height: 1,
        backgroundColor: "rgba(148,163,184,0.25)",
        marginVertical: 4,
    },
    emptyState: {
        color: "#94a3b8",
        textAlign: "center",
        paddingVertical: 12,
        fontFamily: "SpaceGrotesk_400Regular",
    },
    sessionList: {
        width: "100%",
        gap: 16,
    },
    sessionCardWrapper: {
        width: "100%",
    },
    timeframeSwitcher: {
        flexDirection: "row",
        gap: 10,
        marginTop: 4,
    },
    timeframeChip: {
        flex: 1,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(45,212,191,0.3)",
        backgroundColor: "rgba(15,118,110,0.12)",
        paddingVertical: 5,
        paddingHorizontal: 2,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    timeframeChipActive: {
        backgroundColor: "#2dd4bf",
        borderColor: "#2dd4bf",
    },
    timeframeChipLabels: {
        flex: 1,
    },
    timeframeChipLabel: {
        color: "#94a3b8",
        fontSize: 8,
        fontFamily: "SpaceGrotesk_600SemiBold",
        letterSpacing: 0.5,
    },
    timeframeChipLabelActive: {
        color: "#02131d",
    },
    timeframeChipCount: {
        color: "#a5f3fc",
        fontSize: 10,
        fontFamily: "SpaceGrotesk_500Medium",
    },
    timeframeChipCountActive: {
        color: "#02131d",
    },
    timeframeSectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 16,
        marginBottom: 4,
        gap: 12,
    },
    timeframeSectionTitle: {
        color: "#f8fafc",
        fontSize: 15,
        fontFamily: "SpaceGrotesk_700Bold",
    },
    timeframeSectionDescription: {
        color: "#94a3b8",
        fontSize: 12,
        fontFamily: "SpaceGrotesk_400Regular",
        marginTop: 2,
    },
    timeframeCountPill: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.4)",
        backgroundColor: "rgba(15,23,42,0.5)",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 72,
    },
    timeframeCountNumber: {
        color: "#f8fafc",
        fontSize: 16,
        fontFamily: "SpaceGrotesk_700Bold",
        lineHeight: 18,
    },
    timeframeCountLabel: {
        color: "#94a3b8",
        fontSize: 11,
        fontFamily: "SpaceGrotesk_400Regular",
    },
    timeframeEmptyState: {
        marginTop: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        padding: 18,
        alignItems: "center",
        gap: 6,
        backgroundColor: "rgba(15,23,42,0.5)",
    },
    timeframeEmptyTitle: {
        color: "#f8fafc",
        fontFamily: "SpaceGrotesk_600SemiBold",
    },
    timeframeEmptySubtitle: {
        color: "#94a3b8",
        fontSize: 12,
        textAlign: "center",
    },
    sessionDetachButton: {
        alignSelf: "flex-end",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: "rgba(248,113,113,0.12)",
        borderWidth: 1,
        borderColor: "rgba(248,113,113,0.35)",
    },
    sessionDetachButtonPressed: {
        opacity: 0.85,
    },
    sessionDetachButtonDisabled: {
        opacity: 0.55,
    },
    sessionDetachButtonLabel: {
        color: "#fecaca",
        fontSize: 11,
        fontFamily: "SpaceGrotesk_600SemiBold",
        textTransform: "uppercase",
        letterSpacing: 0.3,
    },
    sessionPickerLoading: {
        paddingVertical: 16,
        alignItems: "center",
    },
    sessionPickerError: {
        color: "#f87171",
        fontFamily: "SpaceGrotesk_500Medium",
        marginVertical: 8,
    },
    sessionPickerList: {
        marginTop: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        backgroundColor: "rgba(2,6,23,0.95)",
        maxHeight: 260,
        overflow: "hidden",
    },
    sessionPickerListContent: {
        paddingVertical: 4,
    },
    sessionOptionRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(148,163,184,0.15)",
        gap: 12,
    },
    sessionOptionRowPressed: {
        backgroundColor: "rgba(34,211,238,0.08)",
    },
    sessionOptionMeta: {
        flex: 1,
    },
    sessionOptionTitle: {
        color: "#f8fafc",
        fontFamily: "SpaceGrotesk_600SemiBold",
        fontSize: 13,
    },
    sessionOptionSubtitle: {
        color: "#94a3b8",
        fontSize: 11,
        marginTop: 2,
    },
    sessionOptionAction: {
        color: "#22d3ee",
        fontFamily: "SpaceGrotesk_600SemiBold",
        fontSize: 12,
        textTransform: "uppercase",
    },
    sessionPickerEmpty: {
        color: "#94a3b8",
        fontFamily: "SpaceGrotesk_400Regular",
        marginTop: 8,
        textAlign: "center",
    },
    sessionCreateButton: {
        marginTop: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: "#22d3ee",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        alignSelf: "center",
        shadowColor: "#22d3ee",
        shadowOpacity: 0.35,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
    },
    sessionCreateButtonPressed: {
        opacity: 0.9,
    },
    sessionCreateButtonLabel: {
        color: "#010617",
        fontFamily: "SpaceGrotesk_700Bold",
        fontSize: 12,
        letterSpacing: 0.4,
    },
    sessionJoinButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
        backgroundColor: "#22d3ee",
        shadowColor: "#22d3ee",
        shadowOpacity: 0.45,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 5 },
        elevation: 10,
    },
    sessionJoinButtonDisabled: {
        opacity: 0.55,
    },
    sessionJoinButtonLabel: {
        color: "#03131f",
        fontFamily: "SpaceGrotesk_700Bold",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 0.4,
    },
    sessionLeaveButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
        backgroundColor: "rgba(239,68,68,0.12)",
        borderWidth: 1,
        borderColor: "rgba(239,68,68,0.45)",
    },
    sessionLeaveButtonLabel: {
        color: "#fecaca",
        fontFamily: "SpaceGrotesk_600SemiBold",
        fontSize: 12,
    },
    requestCard: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
        backgroundColor: "rgba(15,23,42,0.6)",
        padding: 14,
        gap: 12,
        marginBottom: 8,
    },
    requestInfo: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    requestAvatar: {
        backgroundColor: "rgba(2,6,23,0.4)",
    },
    requestAvatarFallback: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(34,211,238,0.18)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.35)",
    },
    requestAvatarInitial: {
        color: "#f8fafc",
        fontFamily: "SpaceGrotesk_600SemiBold",
        fontSize: 14,
    },
    requestName: {
        color: "#f8fafc",
        fontFamily: "SpaceGrotesk_700Bold",
        fontSize: 14,
    },
    requestSubtitle: {
        color: "#94a3b8",
        fontFamily: "SpaceGrotesk_400Regular",
        fontSize: 12,
    },
    requestDate: {
        color: "#cbd5e1",
        fontFamily: "SpaceGrotesk_400Regular",
        fontSize: 12,
        marginTop: 2,
    },
    requestActions: {
        flexDirection: "row",
        gap: 10,
        justifyContent: "flex-end",
    },
    requestAcceptButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: "#22d3ee",
        shadowColor: "#22d3ee",
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
    },
    requestAcceptButtonPressed: {
        opacity: 0.9,
    },
    requestAcceptLabel: {
        color: "#010617",
        fontFamily: "SpaceGrotesk_700Bold",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 0.3,
    },
    requestRejectButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: "rgba(239,68,68,0.12)",
        borderWidth: 1,
        borderColor: "rgba(239,68,68,0.45)",
    },
    requestRejectButtonPressed: {
        opacity: 0.9,
    },
    requestRejectLabel: {
        color: "#fecaca",
        fontFamily: "SpaceGrotesk_600SemiBold",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 0.3,
    },
    requestButtonDisabled: {
        opacity: 0.55,
    },
    membershipActions: {
        marginTop: 0,
        flexDirection: "row",
        gap: 10,
        flexWrap: "wrap",
    },
    membershipActionsFullWidth: {
        justifyContent: "center",
        alignItems: "center",
    },
    membershipButtonWide: {
        minWidth: 0,
        justifyContent: "center",
        alignSelf: "center",
    },
    joinButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: "#22d3ee",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        shadowColor: "#22d3ee",
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
    },
    joinButtonPressed: {
        opacity: 0.9,
    },
    joinButtonLabel: {
        color: "#010b14",
        fontFamily: "SpaceGrotesk_700Bold",
        fontSize: 10,
    },
    leaveButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(239,68,68,0.55)",
        backgroundColor: "rgba(239,68,68,0.1)",
    },
    leaveButtonPressed: {
        opacity: 0.85,
    },
    leaveButtonLabel: {
        color: "#fecaca",
        fontFamily: "SpaceGrotesk_700Bold",
        fontSize: 10,
    },
    pendingBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.45)",
        backgroundColor: "rgba(148,163,184,0.14)",
    },
    pendingBadgeLabel: {
        color: "#cbd5e1",
        fontFamily: "SpaceGrotesk_600SemiBold",
        fontSize: 10,
    },
    membershipButtonDisabled: {
        opacity: 0.65,
    },
    memberCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 2,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(148,163,184,0.15)",
    },
    memberCardInteractive: {
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderRadius: 18,
        marginHorizontal: -4,
    },
    memberCardPressed: {
        backgroundColor: "rgba(15,23,42,0.45)",
    },
    memberAvatarFallback: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: "rgba(34,211,238,0.18)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.35)",
    },
    memberAvatarImage: {
        backgroundColor: "rgba(2,6,23,0.4)",
    },
    memberAvatarInitial: {
        color: "#f8fafc",
        fontFamily: "SpaceGrotesk_600SemiBold",
        fontSize: 14,
    },
    memberInfo: {
        flex: 1,
    },
    memberName: {
        color: "#f8fafc",
        fontFamily: "SpaceGrotesk_600SemiBold",
    },
    memberSubtitle: {
        color: "#94a3b8",
        fontSize: 12,
        fontFamily: "SpaceGrotesk_400Regular",
        marginTop: 2,
    },
    memberMetaColumn: {
        alignItems: "flex-end",
        gap: 6,
    },
    memberBadgeRow: {
        flexDirection: "row",
        gap: 6,
    },
    memberPill: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    memberPillOwner: {
        backgroundColor: "#fbbf24",
    },
    memberPillSelf: {
        backgroundColor: "rgba(34,211,238,0.18)",
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.4)",
    },
    memberPillText: {
        fontSize: 12,
        color: "#22d3ee",
        fontFamily: "SpaceGrotesk_600SemiBold",
    },
    memberPillTextDark: {
        color: "#1e1b4b",
    },
    memberDate: {
        color: "#cbd5e1",
        fontSize: 10,
        fontFamily: "SpaceGrotesk_500Medium",
    },
    memberActionButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: "#22d3ee",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        shadowColor: "#22d3ee",
        shadowOpacity: 0.35,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
    },
    memberActionButtonPressed: {
        opacity: 0.9,
    },
    memberActionButtonLabel: {
        color: "#010617",
        fontFamily: "SpaceGrotesk_700Bold",
        fontSize: 12,
    },
    memberRemoveButton: {
        padding: 6,
        borderRadius: 999,
        backgroundColor: "rgba(248,113,113,0.08)",
        borderWidth: 1,
        borderColor: "rgba(248,113,113,0.35)",
        marginTop: 4,
    },
    memberRemoveButtonPressed: {
        opacity: 0.85,
    },
    memberRemoveButtonDisabled: {
        opacity: 0.5,
    },
    memberDialogInput: {
        marginBottom: 8,
        backgroundColor: "#010617",
    },
    memberDialogHint: {
        color: "#94a3b8",
        fontSize: 12,
        marginTop: 8,
    },
    memberDialog: {
        borderRadius: 20,
        backgroundColor: "rgba(31, 29, 54, 1)",
    },
    memberSuggestionList: {
        marginTop: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.3)",
        backgroundColor: "rgba(2,6,23,0.9)",
        overflow: "hidden",
    },
    memberSuggestionRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(15,23,42,0.5)",
    },
    memberSuggestionRowLast: {
        borderBottomWidth: 0,
    },
    memberSuggestionRowPressed: {
        backgroundColor: "rgba(34,211,238,0.08)",
    },
    memberSuggestionName: {
        color: "#f8fafc",
        fontSize: 13,
        fontFamily: "SpaceGrotesk_600SemiBold",
    },
    memberSuggestionHandle: {
        color: "#94a3b8",
        fontSize: 11,
        fontFamily: "SpaceGrotesk_400Regular",
    },
    memberSuggestionEmpty: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: "#94a3b8",
        fontSize: 12,
        textAlign: "center",
    },
    memberSuggestionLoading: {
        padding: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    memberSuggestionAvatar: {
        backgroundColor: "rgba(34,211,238,0.2)",
    },
    memberSuggestionAvatarImage: {
        backgroundColor: "rgba(2,6,23,0.35)",
    },
    removeDialogTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    removeDialogTitle: {
        color: "#f8fafc",
        fontWeight: "700",
    },
    removeDialog: {
        borderRadius: 14,
        backgroundColor: "rgba(31, 29, 54, 1)",
    },
    removeDialogText: {
        color: "#cbd5e1",
        lineHeight: 20,
    },
    systemDialog: {
        borderRadius: 14,
        backgroundColor: "rgba(31, 29, 54, 1)",
    },
    systemDialogTitle: {
        color: "#f8fafc",
        fontWeight: "700",
    },
    systemDialogText: {
        color: "#cbd5e1",
        lineHeight: 20,
    },
    toast: {
        backgroundColor: "#0b1220",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        borderRadius: 12,
    },
    toastText: {
        color: "#f8fafc",
        fontWeight: "600",
    },
});
