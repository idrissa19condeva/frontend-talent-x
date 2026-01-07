import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ImageBackground,
    Alert,
    Modal,
    Pressable,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text, Card, Avatar, Chip, Searchbar, ActivityIndicator, ProgressBar } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../../src/context/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NewsItem } from "../../src/mocks/newsFeed";
import {
    clearMyNotifications,
    deleteMyNotification,
    getUserProfileById,
    InboxNotification,
    listMyNotifications,
    searchUsers,
    UserSearchResult,
} from "../../src/api/userService";
import { listMyTrainingGroups } from "../../src/api/groupService";
import { User } from "../../src/types/User";
import { TrainingSession } from "../../src/types/training";
import { useNavigation, useRouter } from "expo-router";
import { useTraining } from "../../src/context/TrainingContext";

type QuickStat = {
    id: string;
    label: string;
    value: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    gradient: [string, string];
};

type NotificationItem = {
    id: string;
    message: string;
    tone: "info" | "alert";
    action?: "friendRequests" | "groupRequests" | "groupInvites" | "navigate" | "info";
    groupId?: string;
    serverNotificationId?: string;
};

const isDynamicNotificationId = (id: string) =>
    id === "talentx-about" ||
    id === "friend-requests" ||
    id.startsWith("group-requests-") ||
    id.startsWith("group-invite-") ||
    id.startsWith("server-");

const isPersistedDismissalId = (id: string) =>
    id === "talentx-about" || id === "friend-requests" || id.startsWith("group-requests-");

const getNotificationSignature = (notification: Pick<NotificationItem, "id" | "message">) =>
    `${notification.id}|${notification.message}`;

const kmFromDistance = (distance: number, unit: "m" | "km") =>
    unit === "m" ? distance / 1000 : distance;

const computeSessionVolumeKm = (session: TrainingSession): number => {
    if (!session.series?.length) return 0;
    return session.series.reduce((seriesTotal, series) => {
        const seriesRepeats = series.repeatCount ?? 1;
        const segmentsTotal = series.segments?.reduce((sum, segment) => {
            if (!segment.distance || !segment.distanceUnit) return sum;
            const reps = segment.repetitions ?? 1;
            const segmentKm = kmFromDistance(segment.distance, segment.distanceUnit);
            return sum + segmentKm * reps;
        }, 0) ?? 0;
        return seriesTotal + segmentsTotal * seriesRepeats;
    }, 0);
};

const inRange = (isoDate?: string, from?: number, to?: number) => {
    if (!isoDate) return false;
    const t = new Date(isoDate).getTime();
    if (Number.isNaN(t)) return false;
    if (from !== undefined && t < from) return false;
    if (to !== undefined && t > to) return false;
    return true;
};

export default function HomePage() {
    const { user, refreshProfile } = useAuth();
    const isCoach = user?.role === "coach";
    const userId = user?.id || user?._id;
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const navigation = useNavigation();
    const {
        sessions,
        ownedSessionIds,
        participatingSessionIds,
        ownedSessionsLoaded,
        participatingSessionsLoaded,
        fetchAllSessions,
        fetchParticipantSessions,
    } = useTraining();
    const [searchQuery, setSearchQuery] = useState("");
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [talentXAboutPromptPending, setTalentXAboutPromptPending] = useState(false);
    const [talentXAboutPromptLoaded, setTalentXAboutPromptLoaded] = useState(false);
    const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [requestsModalOpen, setRequestsModalOpen] = useState(false);
    const [requestsLoading, setRequestsLoading] = useState(false);
    const [requestsError, setRequestsError] = useState<string | null>(null);
    const [requesters, setRequesters] = useState<User[]>([]);
    const [sessionsHydrated, setSessionsHydrated] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [groupRequestsCount, setGroupRequestsCount] = useState(0);
    const [groupRequestSummaries, setGroupRequestSummaries] = useState<{
        groupId: string;
        name?: string;
        count: number;
    }[]>([]);
    const [groupInviteSummaries, setGroupInviteSummaries] = useState<{
        groupId: string;
        name?: string;
    }[]>([]);
    const [serverInbox, setServerInbox] = useState<InboxNotification[]>([]);

    const talentXAboutStorageKey = useMemo(() => {
        if (!userId) return null;
        return `talentx.aboutPrompt.v1:${userId}`;
    }, [userId]);

    const loadTalentXAboutPrompt = useCallback(async () => {
        if (!talentXAboutStorageKey) {
            setTalentXAboutPromptPending(false);
            setTalentXAboutPromptLoaded(true);
            return;
        }
        try {
            const raw = await AsyncStorage.getItem(talentXAboutStorageKey);
            setTalentXAboutPromptPending(raw === "1");
        } catch {
            setTalentXAboutPromptPending(false);
        } finally {
            setTalentXAboutPromptLoaded(true);
        }
    }, [talentXAboutStorageKey]);

    const markTalentXAboutSeen = useCallback(async () => {
        setTalentXAboutPromptPending(false);
        if (!talentXAboutStorageKey) return;
        try {
            await AsyncStorage.setItem(talentXAboutStorageKey, "0");
        } catch {
            // best effort
        }
    }, [talentXAboutStorageKey]);
    const listRef = useRef<FlatList<NewsItem>>(null);
    const weeklyTargetNumber = useMemo(() => {
        const parsed = Number(user?.weeklySessions);
        if (!Number.isFinite(parsed) || parsed <= 0) return null;
        return parsed;
    }, [user?.weeklySessions]);
    const hasWeeklyTarget = weeklyTargetNumber !== null;

    const primaryDiscipline =
        user?.mainDiscipline || user?.otherDisciplines?.[0] || "À renseigner";
    const pendingFriendIds = user?.friendRequestsReceived ?? [];
    const pendingFriendRequests = pendingFriendIds.length;

    const nextSession = useMemo(() => {
        const now = Date.now();
        const ids = Array.from(new Set([...ownedSessionIds, ...participatingSessionIds]));

        const toSessionStart = (session: TrainingSession) => {
            const rawDate = session.date || "";
            const datePart = rawDate.includes("T") ? rawDate.slice(0, 10) : rawDate;
            const timePart = session.startTime && /^\d{2}:\d{2}$/.test(session.startTime) ? session.startTime : "00:00";
            const startIso = datePart ? `${datePart}T${timePart}` : timePart;
            const start = startIso && datePart ? new Date(startIso) : new Date(NaN);
            return { startIso, start };
        };

        const toSessionEnd = (session: TrainingSession, start: Date) => {
            if (Number.isNaN(start.getTime())) {
                return null;
            }
            const durationMinutes = Number(session.durationMinutes);
            if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
                return null;
            }
            return new Date(start.getTime() + durationMinutes * 60 * 1000);
        };

        const enriched = ids
            .map((id) => sessions[id])
            .filter(Boolean)
            .map((session) => {
                const { startIso, start } = toSessionStart(session);
                const end = toSessionEnd(session, start);
                return { session, startIso, start, end };
            });

        const explicitOngoing = enriched
            .filter(({ session }) => session.status === "ongoing")
            .sort((a, b) => b.start.getTime() - a.start.getTime());

        const inferredOngoing = enriched
            .filter(({ session, start, end }) => {
                if (session.status !== "planned") {
                    return false;
                }
                if (Number.isNaN(start.getTime()) || !end) {
                    return false;
                }
                return start.getTime() <= now && end.getTime() > now;
            })
            .sort((a, b) => b.start.getTime() - a.start.getTime());

        const plannedUpcoming = enriched
            .filter(
                ({ session, start }) =>
                    session.status === "planned" && !Number.isNaN(start.getTime()) && start.getTime() > now,
            )
            .sort((a, b) => a.start.getTime() - b.start.getTime());

        const match = explicitOngoing[0] || inferredOngoing[0] || plannedUpcoming[0];
        if (!match) return null;

        const coachLabel = match.session.athlete?.fullName || match.session.athlete?.username;
        return {
            id: match.session.id,
            title: match.session.title || "Séance",
            location: match.session.place || "",
            coach: coachLabel || (match.session.coachNotes ? "Coach" : undefined),
            focus: match.session.type,
            startAt: match.startIso || match.session.date || match.session.startTime || "",
            date: match.session.date,
            startTime: match.session.startTime,
            status: match.session.status,
        };
    }, [ownedSessionIds, participatingSessionIds, sessions]);

    const weeklyProgress = useMemo(() => {
        const now = new Date();
        const dayMs = 24 * 60 * 60 * 1000;
        const midnight = new Date(now);
        midnight.setHours(0, 0, 0, 0);
        const dayIndex = midnight.getDay(); // 0 = Sunday, 1 = Monday
        const daysSinceMonday = (dayIndex + 6) % 7;
        const startThisWeek = midnight.getTime() - daysSinceMonday * dayMs;
        const endThisWeek = startThisWeek + 7 * dayMs - 1;

        const sessionList = Object.values(sessions || {});

        const doneThisWeek = sessionList.filter(
            (s) => s.status === "done" && inRange(s.date, startThisWeek, endThisWeek),
        );
        const completed = doneThisWeek.length;
        const target = hasWeeklyTarget ? weeklyTargetNumber! : 1;
        const ratio = hasWeeklyTarget && target > 0 ? Math.min(completed / target, 1) : 0;
        const delta = hasWeeklyTarget ? Math.round(ratio * 100) : 0;

        return {
            completed,
            target,
            ratio,
            delta,
            hasWeeklyTarget,
        };
    }, [sessions, weeklyTargetNumber, hasWeeklyTarget]);

    const quickStats = useMemo<QuickStat[]>(() => {
        const sessionsCount = weeklyProgress.completed;
        const plural = sessionsCount > 1 ? "s" : "";

        if (isCoach) {
            return [
                {
                    id: "role",
                    label: "Rôle",
                    value: "Coach",
                    icon: "school",
                    gradient: ["rgba(34,197,94,0.28)", "rgba(59,130,246,0.18)"],
                },
                {
                    id: "sessions",
                    label: "Séances prévues",
                    value: `${sessionsCount} séance${plural}`,
                    icon: "calendar-week",
                    gradient: ["rgba(14,165,233,0.35)", "rgba(99,102,241,0.2)"],
                },
            ];
        }

        return [
            {
                id: "focus",
                label: "Discipline",
                value: primaryDiscipline,
                icon: "run-fast",
                gradient: ["rgba(16,185,129,0.35)", "rgba(34,211,238,0.15)"],
            },
            {
                id: "sessions",
                label: "Volume hebdo",
                value: `${sessionsCount} séance${plural}`,
                icon: "calendar-week",
                gradient: ["rgba(14,165,233,0.35)", "rgba(99,102,241,0.2)"],
            },
            {
                id: "load",
                label: "Objectif hebdo",
                value: hasWeeklyTarget
                    ? `${weeklyTargetNumber} séance${(weeklyTargetNumber ?? 0) > 1 ? "s" : ""}`
                    : "Définir",
                icon: "target",
                gradient: ["rgba(59,130,246,0.25)", "rgba(34,197,94,0.2)"],
            },
        ];
    }, [isCoach, primaryDiscipline, weeklyProgress, hasWeeklyTarget, weeklyTargetNumber]);

    const actionShortcuts = useMemo(() => {
        const shortcuts: { id: string; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void; priority: number }[] = [];

        const addIfMissing = (
            missing: boolean,
            entry: { id: string; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void; priority?: number }
        ) => {
            if (missing) shortcuts.push({ ...entry, priority: entry.priority ?? 10 });
        };

        addIfMissing(
            !user?.photoUrl || !user?.birthDate || !user?.gender,
            {
                id: "identity",
                label: "Compléter ton identité",
                icon: "account-edit",
                onPress: () => router.push("/(main)/edit-profile/personal" as never),
                priority: 3,
            },
        );

        addIfMissing(
            !user?.mainDiscipline,
            {
                id: "discipline",
                label: "Ajouter ta discipline",
                icon: "run-fast",
                onPress: () => router.push("/(main)/edit-profile/sport" as never),
                priority: 4,
            },
        );

        addIfMissing(
            !user?.goals,
            {
                id: "goals",
                label: "Fixer tes objectifs",
                icon: "target",
                onPress: () => router.push("/(main)/edit-profile/sport" as never),
                priority: 5,
            },
        );

        addIfMissing(
            !user?.club || !user?.city,
            {
                id: "club",
                label: "Ajouter club et ville",
                icon: "map-marker-outline",
                onPress: () => router.push("/(main)/edit-profile/personal" as never),
                priority: 6,
            },
        );

        addIfMissing(
            !user?.instagram && !user?.strava,
            {
                id: "socials",
                label: "Lier un réseau",
                icon: "share-variant",
                onPress: () => router.push("/(main)/edit-profile/preferences" as never),
                priority: 8,
            },
        );

        if (isCoach) {
            addIfMissing(
                !(user?.phoneNumber || user?.phone),
                {
                    id: "contact",
                    label: "Ajouter ton contact",
                    icon: "phone",
                    onPress: () => router.push("/(main)/edit-profile/personal" as never),
                    priority: 7,
                },
            );
            addIfMissing(
                !user?.trainingAddress,
                {
                    id: "address",
                    label: "Ajouter lieu d'entraînement",
                    icon: "home-map-marker",
                    onPress: () => router.push("/(main)/edit-profile/personal" as never),
                    priority: 8,
                },
            );
        } else {
            addIfMissing(
                !user?.licenseNumber,
                {
                    id: "license",
                    label: "Ajouter ton numéro de licence",
                    icon: "card-account-details-outline",
                    onPress: () => router.push("/(main)/edit-profile/sport" as never),
                    priority: 1,
                },
            );
            addIfMissing(
                !user?.bodyWeightKg,
                {
                    id: "weight",
                    label: "Renseigner ton poids",
                    icon: "scale-bathroom",
                    onPress: () => router.push("/(main)/edit-profile/sport" as never),
                    priority: 9,
                },
            );
            addIfMissing(
                !user?.records || !Object.keys(user.records || {}).length,
                {
                    id: "records",
                    label: "Ajouter un record",
                    icon: "trophy-outline",
                    onPress: () => router.push("/(main)/account" as never),
                    priority: 10,
                },
            );
        }
        return shortcuts
            .sort((a, b) => a.priority - b.priority)
            .slice(0, 4)
            .map(({ priority: _priority, ...rest }) => rest);
    }, [isCoach, router, user]);

    const newsFeed: NewsItem[] = [];

    const fetchGroupRequests = useCallback(async () => {
        if (!userId) {
            setGroupRequestsCount(0);
            setGroupInviteSummaries([]);
            return;
        }
        try {
            const groups = await listMyTrainingGroups();
            const invitesReceived = groups
                .filter((group) => Boolean(group?.hasPendingInvite) && !group?.isMember)
                .filter((group) => Boolean(group?.id))
                .map((group) => ({ groupId: group.id, name: group.name }));

            const summaries = groups.reduce<{ groupId: string; name?: string; count: number }[]>((acc, group) => {
                const owner = typeof group.owner === "string" ? group.owner : group.owner?.id || group.owner?._id;
                if (owner !== userId) return acc;
                const requestsCount = typeof group.pendingRequestsCount === "number"
                    ? group.pendingRequestsCount
                    : Array.isArray(group.pendingRequests)
                        ? group.pendingRequests.length
                        : 0;

                // Owner-side membership activity: join requests.
                // (Invites sent are not included in listMyTrainingGroups payload by default.)
                const count = requestsCount;
                if (count && group.id) {
                    acc.push({ groupId: group.id, name: group.name, count });
                }
                return acc;
            }, []);
            const total = summaries.reduce((sum, item) => sum + item.count, 0);
            setGroupRequestSummaries(summaries);
            setGroupRequestsCount(total);
            setGroupInviteSummaries(invitesReceived);
        } catch (error) {
            console.warn("loadGroupRequests", error);
            setGroupRequestsCount(0);
            setGroupRequestSummaries([]);
            setGroupInviteSummaries([]);
        }
    }, [userId]);

    useEffect(() => {
        let isMounted = true;
        const fetchInbox = async () => {
            if (!userId) {
                if (isMounted) setServerInbox([]);
                return;
            }
            try {
                const items = await listMyNotifications();
                if (isMounted) setServerInbox(items);
            } catch (error) {
                if (__DEV__) {
                    console.warn("loadInboxNotifications", error);
                }
            }
        };
        const loadSessions = async () => {
            try {
                if (!ownedSessionsLoaded) {
                    await fetchAllSessions();
                }
                if (!participatingSessionsLoaded) {
                    await fetchParticipantSessions();
                }
            } catch (error) {
                console.warn("loadHomeSessions", error);
            } finally {
                if (isMounted) setSessionsHydrated(true);
            }
        };

        void loadSessions();
        void fetchGroupRequests();
        void fetchInbox();

        return () => {
            isMounted = false;
        };
    }, [fetchAllSessions, fetchGroupRequests, fetchParticipantSessions, ownedSessionsLoaded, participatingSessionsLoaded, userId]);

    // Si les sessions sont déjà chargées (préfetch dans AuthGate), hydrate immédiatement l'écran
    useEffect(() => {
        if (ownedSessionsLoaded && participatingSessionsLoaded) {
            setSessionsHydrated(true);
        }
    }, [ownedSessionsLoaded, participatingSessionsLoaded]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([
                refreshProfile(),
                fetchAllSessions(),
                fetchParticipantSessions(),
                fetchGroupRequests(),
                userId
                    ? listMyNotifications().then(setServerInbox).catch(() => undefined)
                    : Promise.resolve(),
            ]);
        } catch (error) {
            console.warn("refreshHome", error);
        } finally {
            setRefreshing(false);
        }
    }, [fetchAllSessions, fetchGroupRequests, fetchParticipantSessions, refreshProfile, userId]);

    // Ne rafraîchit que sur un tap explicite du tab quand on est déjà sur Accueil,
    // pas sur un retour depuis une autre page.
    useEffect(() => {
        const nav: any = navigation;
        const unsubscribe = nav?.addListener?.("tabPress", (e: { defaultPrevented?: boolean }) => {
            if (e?.defaultPrevented) return;
            // Si l'écran n'est pas focalisé, laisser la navigation gérer le focus sans forcer le refresh.
            if (!nav?.isFocused?.()) {
                return;
            }
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
            void handleRefresh();
        });
        return unsubscribe;
    }, [navigation, handleRefresh]);

    const buildDefaultNotifications = useCallback(() => {
        const items: NotificationItem[] = [];

        if (talentXAboutPromptLoaded && talentXAboutPromptPending) {
            items.push({
                id: "talentx-about",
                tone: "info",
                message: "Bienvenue sur Talent‑X ! Découvre l’application dans Compte → À propos.",
                action: "navigate",
            });
        }

        serverInbox.forEach((notification) => {
            items.push({
                id: `server-${notification.id}`,
                serverNotificationId: notification.id,
                tone: "info",
                message: notification.message,
                groupId: (notification.data as any)?.groupId,
                action: "info",
            });
        });

        if (pendingFriendRequests > 0) {
            const suffix = pendingFriendRequests > 1 ? "s" : "";
            items.push({
                id: "friend-requests",
                tone: "alert",
                message: `Vous avez ${pendingFriendRequests} demande${suffix} en attente`,
                action: "friendRequests",
            });
        }
        groupRequestSummaries.forEach((entry) => {
            const suffix = entry.count > 1 ? "s" : "";
            const label = entry.name ? ` (${entry.name})` : "";
            items.push({
                id: `group-requests-${entry.groupId}`,
                tone: "alert",
                message: `${entry.count} demande${suffix} d'adhésion${label}`,
                action: "groupRequests",
                groupId: entry.groupId,
            });
        });

        groupInviteSummaries.forEach((entry) => {
            items.push({
                id: `group-invite-${entry.groupId}`,
                tone: "info",
                message: entry.name ? `Invitation reçue : ${entry.name}` : "Invitation reçue à rejoindre un groupe",
                action: "groupInvites",
                groupId: entry.groupId,
            });
        });
        return items;
    }, [groupInviteSummaries, groupRequestSummaries, pendingFriendRequests, serverInbox, talentXAboutPromptLoaded, talentXAboutPromptPending]);

    const dismissedStorageKey = useMemo(() => {
        if (!userId) return null;
        return `home.dismissedNotifications.v1:${userId}`;
    }, [userId]);

    const [dismissedNotificationSignatures, setDismissedNotificationSignatures] = useState<string[]>([]);
    const [dismissedNotificationsLoaded, setDismissedNotificationsLoaded] = useState(false);
    const dismissedSignatureSet = useMemo(
        () => new Set(dismissedNotificationSignatures),
        [dismissedNotificationSignatures],
    );

    useEffect(() => {
        let isMounted = true;
        const loadDismissed = async () => {
            if (isMounted) setDismissedNotificationsLoaded(false);
            if (!dismissedStorageKey) {
                if (isMounted) setDismissedNotificationSignatures([]);
                if (isMounted) setDismissedNotificationsLoaded(true);
                return;
            }
            try {
                const raw = await AsyncStorage.getItem(dismissedStorageKey);
                const parsed = raw ? (JSON.parse(raw) as unknown) : [];
                const safe = Array.isArray(parsed)
                    ? parsed
                        .filter((x) => typeof x === "string")
                        // Migration: re-enable group invite notifications (they should remain visible while pending).
                        .filter((signature) => !String(signature).startsWith("group-invite-"))
                    : [];
                if (isMounted) setDismissedNotificationSignatures(safe);
            } catch {
                if (isMounted) setDismissedNotificationSignatures([]);
            } finally {
                if (isMounted) setDismissedNotificationsLoaded(true);
            }
        };

        void loadDismissed();
        return () => {
            isMounted = false;
        };
    }, [dismissedStorageKey]);

    useEffect(() => {
        setTalentXAboutPromptLoaded(false);
        void loadTalentXAboutPrompt();
    }, [loadTalentXAboutPrompt, userId]);

    useEffect(() => {
        if (!dismissedStorageKey) return;
        const persist = async () => {
            try {
                // Keep storage bounded.
                const trimmed = dismissedNotificationSignatures.slice(-200);
                await AsyncStorage.setItem(dismissedStorageKey, JSON.stringify(trimmed));
            } catch {
                // best effort
            }
        };
        void persist();
    }, [dismissedNotificationSignatures, dismissedStorageKey]);

    const [notifications, setNotifications] = useState<NotificationItem[]>([]);

    useEffect(() => {
        if (!dismissedNotificationsLoaded) {
            return;
        }
        setNotifications((previous) => {
            const defaults = buildDefaultNotifications().filter(
                (item) => !dismissedSignatureSet.has(getNotificationSignature(item)),
            );
            const withoutDynamic = previous.filter((item) => !isDynamicNotificationId(item.id));
            return [...withoutDynamic, ...defaults];
        });
    }, [buildDefaultNotifications, dismissedNotificationsLoaded, dismissedSignatureSet]);

    const handleSearchSubmit = useCallback(() => {
        const trimmed = searchQuery.trim();
        if (!trimmed) {
            return;
        }
        Alert.alert("Recherche utilisateur", `Recherche lancée pour ${trimmed}`);
    }, [searchQuery]);

    const toggleNotifications = useCallback(() => {
        setNotificationsOpen((prev) => {
            const next = !prev;
            if (next && !talentXAboutPromptLoaded) {
                void loadTalentXAboutPrompt();
            }
            return next;
        });
    }, [loadTalentXAboutPrompt, talentXAboutPromptLoaded]);

    const closeNotifications = useCallback(() => {
        setNotificationsOpen(false);
    }, []);

    const openFriendRequestsModal = useCallback(async () => {
        if (!pendingFriendIds.length) {
            Alert.alert("Aucune demande", "Tu n'as aucune demande en attente.");
            return;
        }
        setRequestsModalOpen(true);
        setRequestsLoading(true);
        setRequestsError(null);
        try {
            const profiles = await Promise.all(
                pendingFriendIds.map((id) =>
                    getUserProfileById(id).catch(() => null),
                ),
            );
            const filtered = profiles.filter(Boolean) as User[];
            setRequesters(filtered);
            if (!filtered.length) {
                setRequestsError("Impossible de charger ces profils");
            }
        } catch (error) {
            console.error("loadFriendRequests", error);
            setRequestsError("Une erreur est survenue");
        } finally {
            setRequestsLoading(false);
        }
    }, [pendingFriendIds]);

    const closeFriendRequestsModal = useCallback(() => {
        setRequestsModalOpen(false);
        setRequestsError(null);
        setRequesters([]);
    }, []);

    const handleDismissNotification = useCallback((notification: NotificationItem) => {
        if (notification.serverNotificationId) {
            void deleteMyNotification(notification.serverNotificationId).catch(() => undefined);
            setServerInbox((previous) => previous.filter((item) => item.id !== notification.serverNotificationId));
        }

        if (notification.id === "talentx-about") {
            void markTalentXAboutSeen();
        }

        if (isPersistedDismissalId(notification.id)) {
            const signature = getNotificationSignature(notification);
            setDismissedNotificationSignatures((previous) => {
                if (previous.includes(signature)) return previous;
                return [...previous, signature];
            });
        }
        setNotifications((previous) => previous.filter((item) => item.id !== notification.id));
    }, [markTalentXAboutSeen]);

    const handleClearNotifications = useCallback(() => {
        const hasServerNotifications = notifications.some((n) => Boolean(n.serverNotificationId));
        if (hasServerNotifications) {
            void clearMyNotifications().catch(() => undefined);
            setServerInbox([]);
        }
        setDismissedNotificationSignatures((previous) => {
            const next = new Set(previous);
            notifications.forEach((notification) => {
                if (!isPersistedDismissalId(notification.id)) return;
                next.add(getNotificationSignature(notification));
            });
            return Array.from(next);
        });

        if (notifications.some((n) => n.id === "talentx-about")) {
            void markTalentXAboutSeen();
        }
        setNotifications([]);
    }, [markTalentXAboutSeen, notifications]);

    const handleNotificationPress = useCallback(
        (notification: NotificationItem) => {
            if (notification.id === "talentx-about" || notification.action === "navigate") {
                closeNotifications();
                router.push("/(main)/about" as never);
                handleDismissNotification(notification);
                return;
            }
            if (notification.id === "friend-requests" || notification.action === "friendRequests") {
                closeNotifications();
                openFriendRequestsModal();
                return;
            }
            if (notification.id.startsWith("group-requests-") || notification.action === "groupRequests") {
                closeNotifications();
                if (notification.groupId) {
                    router.push({ pathname: "/(main)/training/groups/[id]", params: { id: notification.groupId } } as never);
                } else {
                    router.push("/(main)/training/groups" as never);
                }
                return;
            }
            if (notification.id.startsWith("group-invite-") || notification.action === "groupInvites") {
                closeNotifications();
                if (notification.groupId) {
                    router.push({ pathname: "/(main)/training/groups/[id]", params: { id: notification.groupId } } as never);
                } else {
                    router.push("/(main)/training/groups" as never);
                }
                return;
            }
            closeNotifications();
            Alert.alert("Notification", notification.message);
        },
        [closeNotifications, handleDismissNotification, openFriendRequestsModal, router],
    );

    const handleClearSearch = useCallback(() => {
        setSearchQuery("");
        setSearchResults([]);
        setSearchError(null);
    }, []);

    const handleSelectResult = useCallback(
        (result: UserSearchResult) => {
            if (!result?.id) {
                return;
            }
            setSearchQuery(result.fullName || result.username || "");
            setSearchResults([]);
            setSearchError(null);
            router.push({ pathname: "/(main)/profiles/[id]", params: { id: result.id } });
        },
        [router],
    );

    const handleOpenRequesterProfile = useCallback(
        (userId?: string) => {
            if (!userId) {
                return;
            }
            closeFriendRequestsModal();
            router.push({ pathname: "/(main)/profiles/[id]", params: { id: userId } });
        },
        [closeFriendRequestsModal, router],
    );

    useEffect(() => {
        const trimmed = searchQuery.trim();
        if (trimmed.length < 2) {
            setSearchResults([]);
            setSearchError(null);
            setSearchLoading(false);
            return;
        }

        let isCancelled = false;
        setSearchLoading(true);
        const debounceId = setTimeout(() => {
            searchUsers(trimmed)
                .then((results) => {
                    if (isCancelled) return;
                    setSearchResults(results);
                    setSearchError(results.length ? null : "Aucun athlète trouvé");
                })
                .catch(() => {
                    if (isCancelled) return;
                    setSearchResults([]);
                    setSearchError("Impossible de rechercher des athlètes");
                })
                .finally(() => {
                    if (isCancelled) return;
                    setSearchLoading(false);
                });
        }, 250);

        return () => {
            isCancelled = true;
            clearTimeout(debounceId);
        };
    }, [searchQuery]);

    const headerTopInset = insets.top + 12;
    const fixedHeaderHeight = 80;
    const listTopPadding = headerTopInset + fixedHeaderHeight - 20;
    const navigationBarOffset = 0;

    return (
        <LinearGradient colors={["#020617", "#030711", "#00040a"]} style={styles.gradient}>
            <View
                style={[
                    styles.fixedHeaderContainer,
                    {
                        paddingTop: headerTopInset,
                        paddingHorizontal: 20,
                    },
                ]}
            >
                <View style={styles.fixedHeaderInner}>
                    <HomeUtilityHeader
                        searchQuery={searchQuery}
                        onChangeSearch={setSearchQuery}
                        onSubmitSearch={handleSearchSubmit}
                        onClearSearch={handleClearSearch}
                        onSelectResult={handleSelectResult}
                        searchLoading={searchLoading}
                        searchResults={searchResults}
                        searchError={searchError}
                        notifications={notifications}
                        pendingCount={pendingFriendRequests + groupRequestsCount}
                        onDismissNotification={handleDismissNotification}
                        onClearNotifications={handleClearNotifications}
                        isOpen={notificationsOpen}
                        onToggle={toggleNotifications}
                        onClose={closeNotifications}
                        onNotificationPress={handleNotificationPress}
                    />
                </View>
            </View>
            <View
                style={[
                    styles.scrollRegion,
                    {
                        paddingTop: listTopPadding,
                        paddingBottom: navigationBarOffset,
                    },
                ]}
            >
                <FlatList
                    ref={listRef}
                    style={styles.feedList}
                    data={newsFeed}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => <NewsCard item={item} />}
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    ListHeaderComponent={
                        <View style={styles.listHeader}>
                            <StatsRow stats={quickStats} />
                            <FeedHeader
                                userName={user?.fullName || user?.username || user?.email}
                                isAuthenticated={Boolean(user)}
                            />
                            <NextSessionCard
                                session={nextSession}
                                loading={!sessionsHydrated}
                                onPressDetails={() => {
                                    if (!nextSession?.id) {
                                        router.push("/(main)/training" as never);
                                        return;
                                    }
                                    router.push({ pathname: "/(main)/training/[id]", params: { id: nextSession.id } } as never);
                                }}
                                onPressCreate={() => router.push("/(main)/training/create" as never)}
                            />
                            {!isCoach ? (
                                <ProgressCard
                                    progress={weeklyProgress}
                                    weeklyTarget={weeklyTargetNumber}
                                    hasWeeklyTarget={hasWeeklyTarget}
                                    onPressDefineTarget={() => router.push("/(main)/edit-profile/sport" as never)}
                                />
                            ) : null}
                            <ActionShortcuts shortcuts={actionShortcuts} />
                            <View style={styles.placeholderCard}>
                                <MaterialCommunityIcons name="newspaper-variant-outline" size={20} color="#cbd5e1" />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.placeholderTitle}>Les actus arrivent bientôt</Text>
                                    <Text style={styles.placeholderSubtitle}>Nous préparons un flux plus riche. En attendant, tu peux suivre tes séances et ta progression ici.</Text>
                                </View>
                            </View>
                        </View>
                    }
                    ListEmptyComponent={
                        <Text style={styles.emptyState}>Les actus seront ajoutées dans une prochaine version.</Text>
                    }
                    contentContainerStyle={[
                        styles.listContent,
                        {
                            paddingBottom: Math.max(insets.bottom, 24),
                        },
                    ]}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                    overScrollMode="never"
                />
            </View>
            <Modal
                transparent
                visible={requestsModalOpen}
                animationType="fade"
                onRequestClose={closeFriendRequestsModal}
            >
                <View style={styles.notificationModalBackdrop}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={closeFriendRequestsModal} />
                    <View style={styles.requestsModalCard}>
                        <View style={styles.notificationModalHeader}>
                            <Text style={styles.notificationTitle}>Demandes d'amis</Text>
                            <TouchableOpacity
                                onPress={closeFriendRequestsModal}
                                accessibilityRole="button"
                            >
                                <MaterialCommunityIcons name="close" size={20} color="#cbd5e1" />
                            </TouchableOpacity>
                        </View>
                        {requestsLoading ? (
                            <View style={styles.requestsLoadingRow}>
                                <ActivityIndicator animating color="#38bdf8" />
                                <Text style={styles.notificationItemText}>Chargement…</Text>
                            </View>
                        ) : requesters.length ? (
                            requesters.map((requester) => (
                                <TouchableOpacity
                                    key={requester._id || requester.id}
                                    style={styles.requestItem}
                                    onPress={() => handleOpenRequesterProfile(requester._id || requester.id)}
                                    activeOpacity={0.85}
                                >
                                    <MaterialCommunityIcons
                                        name="account-circle"
                                        size={30}
                                        color="#38bdf8"
                                    />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.requestName}>
                                            {requester.fullName || requester.username || "Athlète"}
                                        </Text>
                                        {requester.username ? (
                                            <Text style={styles.requestMeta}>@{requester.username}</Text>
                                        ) : null}
                                    </View>
                                    <MaterialCommunityIcons
                                        name="chevron-right"
                                        size={22}
                                        color="#94a3b8"
                                    />
                                </TouchableOpacity>
                            ))
                        ) : (
                            <Text style={styles.notificationEmpty}>
                                {requestsError || "Aucune demande à afficher"}
                            </Text>
                        )}
                    </View>
                </View>
            </Modal>
        </LinearGradient>
    );
}

const HomeUtilityHeader = ({
    searchQuery,
    onChangeSearch,
    onSubmitSearch,
    onClearSearch,
    onSelectResult,
    searchLoading,
    searchResults,
    searchError,
    notifications,
    pendingCount,
    onDismissNotification,
    onClearNotifications,
    isOpen,
    onToggle,
    onClose,
    onNotificationPress,
}: {
    searchQuery: string;
    onChangeSearch: (value: string) => void;
    onSubmitSearch: () => void;
    onClearSearch: () => void;
    onSelectResult: (result: UserSearchResult) => void;
    searchLoading: boolean;
    searchResults: UserSearchResult[];
    searchError: string | null;
    notifications: NotificationItem[];
    pendingCount: number;
    onDismissNotification: (notification: NotificationItem) => void;
    onClearNotifications: () => void;
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
    onNotificationPress: (notification: NotificationItem) => void;
}) => {
    const badgeValue = notifications.length;
    const trimmedQuery = searchQuery.trim();
    const showSearchResults = trimmedQuery.length >= 2 && (searchLoading || searchResults.length > 0 || !!searchError);
    return (
        <>
            <View style={styles.utilityHeader}>
                <View style={styles.searchWrapper}>
                    <Searchbar
                        placeholder="Rechercher un utilisateur"
                        placeholderTextColor="#94a3b8"
                        value={searchQuery}
                        onChangeText={onChangeSearch}
                        onSubmitEditing={onSubmitSearch}
                        onClearIconPress={onClearSearch}
                        iconColor="#38bdf8"
                        style={styles.searchBar}
                        inputStyle={styles.searchInput}
                        elevation={0}
                        returnKeyType="search"
                        loading={searchLoading}
                    />
                    {showSearchResults ? (
                        <View style={styles.searchDropdown}>
                            {searchLoading ? (
                                <View style={styles.searchDropdownRow}>
                                    <ActivityIndicator animating size="small" color="#38bdf8" />
                                    <Text style={styles.searchDropdownText}>Recherche en cours…</Text>
                                </View>
                            ) : searchResults.length ? (
                                searchResults.map((result) => (
                                    <TouchableOpacity
                                        key={result.id}
                                        style={styles.searchDropdownRow}
                                        onPress={() => onSelectResult(result)}
                                    >
                                        <MaterialCommunityIcons
                                            name="account-search"
                                            size={18}
                                            color="#38bdf8"
                                        />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.searchResultName}>
                                                {result.fullName || result.username || "Utilisateur"}
                                            </Text>
                                            {result.username ? (
                                                <Text style={styles.searchResultMeta}>@{result.username}</Text>
                                            ) : null}
                                        </View>
                                    </TouchableOpacity>
                                ))
                            ) : (
                                <Text style={styles.searchDropdownEmpty}>{searchError || "Aucun résultat"}</Text>
                            )}
                        </View>
                    ) : null}
                </View>
                <TouchableOpacity
                    style={styles.notificationButton}
                    onPress={onToggle}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Afficher les notifications"
                >
                    <MaterialCommunityIcons name="bell-badge" size={20} color="#f8fafc" />
                    <View style={styles.notificationBadge}>
                        <Text style={styles.notificationBadgeText}>{badgeValue}</Text>
                    </View>
                </TouchableOpacity>
            </View>
            <Modal transparent visible={isOpen} animationType="fade" onRequestClose={onClose}>
                <View style={styles.notificationModalBackdrop}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                    <View style={styles.notificationModalCard}>
                        <View style={styles.notificationModalHeader}>
                            <Text style={styles.notificationTitle}>Notifications</Text>
                            <View style={styles.notificationHeaderActions}>
                                {notifications.length ? (
                                    <Pressable
                                        onPress={onClearNotifications}
                                        style={styles.clearNotificationsButton}
                                        accessibilityRole="button"
                                        hitSlop={8}
                                    >
                                        <MaterialCommunityIcons name="trash-can-outline" size={16} color="#f8fafc" />
                                        <Text style={styles.clearNotificationsText}>Tout effacer</Text>
                                    </Pressable>
                                ) : null}
                                <TouchableOpacity onPress={onClose} accessibilityRole="button">
                                    <MaterialCommunityIcons name="close" size={20} color="#cbd5e1" />
                                </TouchableOpacity>
                            </View>
                        </View>
                        <View style={styles.notificationList}>
                            {notifications.length ? (
                                notifications.map((notification) => (
                                    <Pressable
                                        key={notification.id}
                                        style={({ pressed }) => [
                                            styles.notificationItem,
                                            notification.tone === "alert"
                                                ? styles.notificationItemAlert
                                                : styles.notificationItemInfo,
                                            pressed ? { opacity: 0.9 } : null,
                                        ]}
                                        onPress={() => onNotificationPress(notification)}
                                    >
                                        <MaterialCommunityIcons
                                            name={
                                                notification.tone === "alert"
                                                    ? "bell-alert-outline"
                                                    : "information-outline"
                                            }
                                            size={20}
                                            color="#f8fafc"
                                        />
                                        <Text style={styles.notificationItemText}>{notification.message}</Text>
                                        <Pressable
                                            onPress={(event) => {
                                                event.stopPropagation();
                                                onDismissNotification(notification);
                                            }}
                                            style={({ pressed }) => [
                                                styles.notificationDismissButton,
                                                pressed ? { opacity: 0.7 } : null,
                                            ]}
                                            accessibilityRole="button"
                                            hitSlop={6}
                                        >
                                            <MaterialCommunityIcons name="close" size={14} color="#e2e8f0" />
                                        </Pressable>
                                    </Pressable>
                                ))
                            ) : (
                                <Text style={styles.notificationEmpty}>Aucune notification pour le moment.</Text>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
};

const FeedHeader = ({
    userName,
    isAuthenticated,
}: {
    userName?: string | null;
    isAuthenticated: boolean;
}) => (
    <View style={styles.header}>
        {!isAuthenticated ? (
            <Text style={styles.subtitle}>
                Connecte-toi pour suivre tes séances, tes stats et planifier ton entraînement.
            </Text>
        ) : null}
    </View>
);

const NextSessionCard = ({
    session,
    loading,
    onPressDetails,
    onPressCreate,
}: {
    session: { id?: string; title: string; location: string; coach?: string; focus?: string; startAt: string; date?: string; startTime?: string; status: string } | null;
    loading?: boolean;
    onPressDetails: () => void;
    onPressCreate: () => void;
}) => {
    if (loading) {
        return (
            <View style={[styles.nextSessionCard, { justifyContent: "center", alignItems: "center" }]}>
                <ActivityIndicator animating color="#22d3ee" />
                <Text style={[styles.nextSessionMeta, { marginTop: 8 }]}>Chargement de tes séances…</Text>
            </View>
        );
    }

    if (!session) {
        return (
            <LinearGradient
                colors={["rgba(34,211,238,0.12)", "rgba(56,189,248,0.08)", "rgba(15,23,42,0.9)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.nextSessionCard}
            >
                <View style={styles.nextSessionHeader}>
                    <View style={styles.nextSessionPill}>
                        <MaterialCommunityIcons name="calendar-clock" size={16} color="#0ea5e9" />
                        <Text style={styles.nextSessionPillText}>Prochaine séance</Text>
                    </View>
                </View>
                <Text style={styles.nextSessionTitle}>Pas de séance planifiée</Text>
                <Text style={styles.nextSessionMeta}>Planifie ta prochaine sortie pour la voir ici.</Text>
                <TouchableOpacity style={styles.nextSessionButton} onPress={onPressCreate} activeOpacity={0.9}>
                    <Text style={styles.nextSessionButtonText}>Planifier</Text>
                    <MaterialCommunityIcons name="plus" size={16} color="#0f172a" />
                </TouchableOpacity>
            </LinearGradient>
        );
    }

    const formatSessionDate = (value: Date) =>
        new Intl.DateTimeFormat("fr-FR", {
            weekday: "short",
            day: "2-digit",
            month: "short",
        })
            .format(value)
            .replace(/\.$/, "");

    const start = new Date(session.startAt);
    const hasValidDate = !Number.isNaN(start.getTime());
    const dayLabel = hasValidDate
        ? formatSessionDate(start)
        : session.date?.split("T")?.[0] || session.date || "Date à confirmer";
    const timeLabel = session.status === "ongoing"
        ? "En cours"
        : hasValidDate
            ? start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
            : session.startTime || "Horaire à confirmer";

    return (
        <LinearGradient
            colors={["rgba(34,211,238,0.12)", "rgba(56,189,248,0.08)", "rgba(15,23,42,0.9)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.nextSessionCard}
        >
            <View style={styles.nextSessionHeader}>
                <View style={styles.nextSessionPill}>
                    <MaterialCommunityIcons name="calendar-clock" size={16} color="#0ea5e9" />
                    <Text style={styles.nextSessionPillText}>Prochaine séance</Text>
                </View>
                <Text style={styles.nextSessionTime}>{timeLabel}</Text>
            </View>
            <Text style={styles.nextSessionTitle}>{session.title}</Text>
            <View style={styles.nextSessionRow}>
                <MaterialCommunityIcons name="clock-outline" size={18} color="#cbd5e1" />
                <Text style={styles.nextSessionMeta}>{dayLabel}</Text>
            </View>
            {session.location ? (
                <View style={styles.nextSessionRow}>
                    <MaterialCommunityIcons name="map-marker-outline" size={18} color="#cbd5e1" />
                    <Text style={styles.nextSessionMeta}>{session.location}</Text>
                </View>
            ) : null}
            {session.focus ? (
                <View style={styles.nextSessionRow}>
                    <MaterialCommunityIcons name="run-fast" size={18} color="#cbd5e1" />
                    <Text style={styles.nextSessionMeta}>{session.focus}</Text>
                </View>
            ) : null}
            {session.coach ? (
                <View style={styles.nextSessionRow}>
                    <MaterialCommunityIcons name="whistle" size={18} color="#cbd5e1" />
                    <Text style={styles.nextSessionMeta}>
                        {session.coach.trim().toLowerCase().startsWith("coach")
                            ? session.coach
                            : `Coach ${session.coach}`}
                    </Text>
                </View>
            ) : null}
            <TouchableOpacity style={styles.nextSessionButton} onPress={onPressDetails} activeOpacity={0.9}>
                <Text style={styles.nextSessionButtonText}>Voir la séance</Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color="#0f172a" />
            </TouchableOpacity>
        </LinearGradient>
    );
};

const ProgressCard = ({
    progress,
    weeklyTarget,
    hasWeeklyTarget,
    onPressDefineTarget,
}: {
    progress: { completed: number; target: number; ratio: number; delta: number; hasWeeklyTarget: boolean };
    weeklyTarget: number | null;
    hasWeeklyTarget: boolean;
    onPressDefineTarget: () => void;
}) => (
    <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
            <View style={styles.progressPill}>
                <MaterialCommunityIcons name="chart-areaspline" size={16} color="#22d3ee" />
                <Text style={styles.progressPillText}>Progression</Text>
            </View>
            <Text style={styles.progressDelta}>{progress.delta}%</Text>
        </View>
        <View style={styles.progressValues}>
            <View style={{ flex: 1 }}>
                <Text style={styles.progressLabel}>Séances complétées</Text>
                <Text style={styles.progressValue}>
                    {progress.completed}/{progress.target}
                </Text>
            </View>
            <View style={{ flex: 0.5, alignItems: "flex-end" }}>
                <Text style={styles.progressLabel}>Objectif hebdo</Text>
                {hasWeeklyTarget ? (
                    <Text style={styles.targetValue}>{weeklyTarget}</Text>
                ) : (
                    <TouchableOpacity style={styles.defineTargetButton} onPress={onPressDefineTarget}>
                        <MaterialCommunityIcons name="target" size={16} color="#0f172a" />
                        <Text style={styles.defineTargetText}>Définir</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
        <ProgressBar progress={progress.ratio} color="#22d3ee" style={styles.progressBar} />
    </View>
);

const ActionShortcuts = ({ shortcuts }: { shortcuts: { id: string; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void }[] }) => (
    <View style={styles.shortcutsRow}>
        {shortcuts.map((shortcut) => (
            <TouchableOpacity
                key={shortcut.id}
                style={styles.shortcutCard}
                onPress={shortcut.onPress}
                activeOpacity={0.88}
            >
                <View style={styles.shortcutIconWrapper}>
                    <MaterialCommunityIcons name={shortcut.icon} size={20} color="#0f172a" />
                </View>
                <Text style={styles.shortcutLabel}>{shortcut.label}</Text>
            </TouchableOpacity>
        ))}
    </View>
);

const StatsRow = ({ stats }: { stats: QuickStat[] }) => (
    <View style={styles.statsRow}>
        {stats.map((stat) => (
            <LinearGradient
                key={stat.id}
                colors={stat.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statCard}
            >
                <View style={styles.statIconWrapper}>
                    <MaterialCommunityIcons name={stat.icon} size={18} color="#f8fafc" />
                </View>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={[styles.statValue, stat.value === "À renseigner" && styles.statValuePlaceholder]}>
                    {stat.value}
                </Text>
            </LinearGradient>
        ))}
    </View>
);

const HighlightCard = ({ feature }: { feature?: NewsItem }) => {
    if (!feature) {
        return null;
    }

    return (
        <LinearGradient
            colors={["rgba(56,189,248,0.25)", "rgba(15,23,42,0.9)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.highlightCard}
        >
            <View style={styles.highlightContent}>
                <Text style={styles.highlightLabel}>Focus du jour</Text>
                <Text style={styles.highlightTitle}>{feature.headline}</Text>
                <Text style={styles.highlightMeta}>
                    {feature.discipline} • {feature.country}
                </Text>
                <TouchableOpacity style={styles.highlightCTA}>
                    <Text style={styles.highlightCTAText}>Voir les détails</Text>
                    <MaterialCommunityIcons
                        name="arrow-right"
                        size={18}
                        color="#f8fafc"
                    />
                </TouchableOpacity>
            </View>
            <ImageBackground
                source={{ uri: feature.mediaUrl }}
                style={styles.highlightImage}
                imageStyle={styles.highlightImageRadius}
            />
        </LinearGradient>
    );
};

const NewsCard = ({ item }: { item: NewsItem }) => (
    <Card style={styles.card} mode="elevated">
        <Card.Title
            title={item.headline}
            subtitle={`${item.athleteName} • ${formatDate(item.publishedAt)}`}
            left={(props) => (
                <Avatar.Text
                    {...props}
                    label={getInitials(item.athleteName)}
                    style={styles.avatar}
                    size={42}
                />
            )}
            right={() => (
                <Chip compact style={styles.chip} textStyle={styles.chipText}>
                    {item.discipline}
                </Chip>
            )}
        />
        {item.mediaUrl ? (
            <Card.Cover source={{ uri: item.mediaUrl }} style={styles.cardCover} />
        ) : null}
        <Card.Content>
            <Text style={styles.summary}>{item.summary}</Text>
            <View style={styles.metaRow}>
                <Text style={styles.metaText}>{item.country}</Text>
                <Text style={styles.metaText}>❤️ {item.likes}</Text>
                <Text style={styles.metaText}>💬 {item.comments}</Text>
            </View>
            <View style={styles.tagsRow}>
                {item.tags.map((tag) => (
                    <Text key={tag} style={styles.tag}>
                        #{tag}
                    </Text>
                ))}
            </View>
        </Card.Content>
    </Card>
);

const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });

const getInitials = (value: string) =>
    value
        .split(" ")
        .map((chunk) => chunk?.[0] ?? "")
        .join("")
        .slice(0, 2)
        .toUpperCase();

const styles = StyleSheet.create({
    gradient: {
        flex: 1,
    },
    scrollRegion: {
        flex: 1,
    },
    feedList: {
        flex: 1,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 0,
        paddingTop: 8,
    },
    listHeader: {
        gap: 16,
    },
    fixedHeaderContainer: {
        position: "absolute",
        left: 0,
        right: 0,
        zIndex: 50,
    },
    fixedHeaderInner: {

    },
    utilityHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,

    },
    searchWrapper: {
        flex: 1,
        position: "relative",
    },
    searchBar: {
        flex: 1,
        backgroundColor: "rgba(15,23,42,0.85)",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.35)",

    },
    searchInput: {
        color: "#f8fafc",
        fontSize: 14,
    },
    searchDropdown: {
        position: "absolute",
        top: 58,
        left: 0,
        right: 0,
        borderRadius: 18,
        backgroundColor: "rgba(2,6,23,0.95)",
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.25)",
        paddingVertical: 6,
        gap: 2,
        zIndex: 100,
    },
    searchDropdownRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    searchDropdownText: {
        color: "#e2e8f0",
        fontSize: 13,
    },
    searchResultName: {
        color: "#f8fafc",
        fontSize: 14,
        fontWeight: "600",
    },
    searchResultMeta: {
        color: "#94a3b8",
        fontSize: 12,
    },
    searchDropdownEmpty: {
        color: "#94a3b8",
        fontSize: 13,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    notificationButton: {
        width: 56,
        height: 56,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(56,189,248,0.2)",
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.4)",

    },
    notificationBadge: {
        position: "absolute",
        top: 8,
        right: 8,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: "#f97316",

    },
    notificationBadgeText: {
        color: "#0f172a",
        fontSize: 10,
        fontWeight: "700",
    },
    title: {
        fontSize: 30,
        fontWeight: "700",
        color: "#f1f5f9",
        textAlign: "left",
        marginBottom: 4,
    },
    header: {
        paddingVertical: 10,
        gap: 8,
    },
    nextSessionCard: {
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.35)",
        backgroundColor: "rgba(2,6,23,0.8)",
        gap: 10,
    },
    nextSessionHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    nextSessionPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "rgba(34,211,238,0.12)",
    },
    nextSessionPillText: {
        color: "#22d3ee",
        fontSize: 12,
        fontWeight: "700",
    },
    nextSessionTime: { color: "#5cbc69ff", fontSize: 14, fontWeight: "700" },
    nextSessionTitle: { color: "#f8fafc", fontSize: 18, fontWeight: "800" },
    nextSessionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    nextSessionMeta: { color: "#cbd5e1", fontSize: 14 },
    nextSessionButton: {
        marginTop: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: "#22d3ee",
        borderRadius: 14,
        paddingVertical: 10,
    },
    nextSessionButtonText: { color: "#0f172a", fontWeight: "700" },
    progressCard: {
        borderRadius: 20,
        padding: 16,
        backgroundColor: "rgba(2,6,23,0.85)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        gap: 12,
    },
    progressHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    progressPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "rgba(34,211,238,0.12)",
    },
    progressPillText: {
        color: "#22d3ee",
        fontSize: 12,
        fontWeight: "700",
    },
    progressDelta: { fontSize: 12, fontWeight: "700", color: "#f8fafc" },
    progressValues: { flexDirection: "row", gap: 12 },
    progressLabel: { color: "#94a3b8", fontSize: 12 },
    progressValue: { color: "#f8fafc", fontSize: 18, fontWeight: "700" },
    targetValue: { color: "#f8fafc", fontSize: 18, fontWeight: "700", minWidth: 24, textAlign: "center" },
    defineTargetButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 4,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: "#22d3ee",
        borderRadius: 10,
    },
    defineTargetText: {
        fontSize: 13,
        fontWeight: "700",
        color: "#0f172a",
    },
    progressBar: { height: 10, borderRadius: 999, backgroundColor: "rgba(148,163,184,0.25)" },
    shortcutsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
    },
    shortcutCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 12,
        borderRadius: 16,
        backgroundColor: "rgba(15,23,42,0.75)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        width: "48%",
    },
    shortcutIconWrapper: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#22d3ee",
    },
    shortcutLabel: { color: "#e2e8f0", fontSize: 13, fontWeight: "600", flex: 1, flexWrap: "wrap" },
    badgeRow: {
        flexDirection: "row",
        gap: 8,
    },
    badgePrimary: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: "rgba(250,204,21,0.15)",
        borderRadius: 999,
    },
    badgeSecondary: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: "rgba(56,189,248,0.15)",
        borderRadius: 999,
    },
    badgeText: {
        color: "#fde047",
        fontSize: 12,
        fontWeight: "600",
    },
    badgeTextSecondary: {
        color: "#38bdf8",
        fontSize: 12,
        fontWeight: "600",
    },
    name: {
        fontSize: 22,
        color: "#22d3ee",
        marginVertical: 8,
        fontWeight: "600",
    },
    subtitle: {
        textAlign: "left",
        color: "#cbd5e1",
        fontSize: 15,
        marginBottom: 10,
    },
    welcome: {
        fontSize: 18,
        fontWeight: "600",
        color: "#f8fafc",
    },
    statsRow: {
        flexDirection: "row",
        gap: 12,
    },
    statCard: {
        flex: 1,
        padding: 5,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.35)",
        backgroundColor: "rgba(2,6,23,0.9)",
        shadowColor: "#22d3ee",
        shadowOpacity: 0.18,
        shadowRadius: 12,
        marginTop: 4,
    },
    statIconWrapper: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(34,211,238,0.15)",
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.35)",
        marginBottom: 10,
    },
    statLabel: {
        color: "#cbd5e1",
        fontSize: 12,
    },
    statValue: {
        color: "#f8fafc",
        fontSize: 14,
        fontWeight: "700",
        marginTop: 2,
    },
    statValuePlaceholder: {
        fontSize: 14,
        fontStyle: "italic",
        color: "#94a3b8",
    },
    highlightCard: {
        flexDirection: "row",
        borderRadius: 26,
        padding: 18,
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.3)",
        overflow: "hidden",
        gap: 16,
    },
    placeholderCard: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        borderRadius: 18,
        padding: 14,
        backgroundColor: "rgba(15,23,42,0.7)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
    },
    placeholderTitle: { color: "#f8fafc", fontSize: 15, fontWeight: "700" },
    placeholderSubtitle: { color: "#94a3b8", fontSize: 13, marginTop: 2 },
    highlightContent: {
        flex: 1,
        gap: 10,
    },
    highlightLabel: {
        color: "#38bdf8",
        fontSize: 12,
        letterSpacing: 1,
        textTransform: "uppercase",
    },
    highlightTitle: {
        color: "#f8fafc",
        fontSize: 20,
        fontWeight: "700",
    },
    highlightMeta: {
        color: "#cbd5e1",
        fontSize: 14,
    },
    highlightCTA: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 6,
    },
    highlightCTAText: {
        color: "#f8fafc",
        fontWeight: "600",
    },
    highlightImage: {
        width: 110,
        height: 120,
    },
    highlightImageRadius: {
        borderRadius: 18,
    },
    notificationModalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(2,6,23,0.85)",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
    },
    notificationModalCard: {
        width: "100%",
        borderRadius: 24,
        padding: 20,
        backgroundColor: "rgba(15,23,42,0.98)",
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.35)",
        gap: 16,
    },
    requestsModalCard: {
        width: "100%",
        borderRadius: 24,
        padding: 20,
        backgroundColor: "rgba(2,6,23,0.98)",
        borderWidth: 1,
        borderColor: "rgba(34,197,94,0.35)",
        gap: 12,
        maxHeight: 420,
    },
    notificationModalHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    notificationHeaderActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    notificationTitle: {
        color: "#f8fafc",
        fontSize: 18,
        fontWeight: "700",
    },
    clearNotificationsButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "rgba(148,163,184,0.15)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.3)",
    },
    clearNotificationsText: {
        color: "#f8fafc",
        fontSize: 12,
        fontWeight: "600",
    },
    notificationList: {
        gap: 12,
    },
    notificationItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 18,
    },
    notificationItemAlert: {
        backgroundColor: "rgba(248,113,113,0.15)",
        borderWidth: 1,
        borderColor: "rgba(248,113,113,0.4)",
    },
    notificationItemInfo: {
        backgroundColor: "rgba(59,130,246,0.12)",
        borderWidth: 1,
        borderColor: "rgba(59,130,246,0.35)",
    },
    notificationItemText: {
        flex: 1,
        color: "#e2e8f0",
        fontSize: 14,
        lineHeight: 20,
    },
    notificationDismissButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(15,23,42,0.35)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
    },
    notificationEmpty: {
        color: "#94a3b8",
        fontSize: 14,
        textAlign: "center",
        paddingVertical: 10,
    },
    requestsLoadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    requestItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        gap: 12,
        borderBottomWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
    },
    requestName: {
        color: "#f8fafc",
        fontSize: 15,
        fontWeight: "600",
    },
    requestMeta: {
        color: "#94a3b8",
        fontSize: 12,
    },
    sectionTitle: {
        color: "#f8fafc",
        fontSize: 18,
        fontWeight: "600",
        marginTop: 8,
    },
    card: {
        marginBottom: 18,
        backgroundColor: "rgba(2,6,23,0.7)",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
        shadowColor: "#0ea5e9",
        shadowOpacity: 0.15,
        shadowRadius: 12,
    },
    cardCover: {
        backgroundColor: "#0f172a",
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
    },
    summary: {
        color: "#e2e8f0",
        fontSize: 15,
        marginTop: 8,
    },
    metaRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 12,
    },
    metaText: {
        color: "#94a3b8",
        fontSize: 13,
    },
    tagsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        marginTop: 12,
        gap: 6,
    },
    tag: {
        color: "#38bdf8",
        fontSize: 13,
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.4)",
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 2,
    },
    emptyState: {
        color: "#94a3b8",
        textAlign: "center",
        marginTop: 40,
    },
    chip: {
        backgroundColor: "rgba(56,189,248,0.15)",
    },
    chipText: {
        color: "#38bdf8",
        fontSize: 12,
    },
    avatar: {
        backgroundColor: "#0ea5e9",
    },
});
