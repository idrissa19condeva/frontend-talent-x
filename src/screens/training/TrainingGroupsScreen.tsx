import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View, Pressable, GestureResponderEvent } from "react-native";
import { Snackbar, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { listMyTrainingGroups } from "../../api/groupService";
import { TrainingGroupSummary } from "../../types/trainingGroup";
import { useAuth } from "../../context/AuthContext";

const extractOwnerId = (group: TrainingGroupSummary) => {
    if (!group.owner) return undefined;
    if (typeof group.owner === "string") return group.owner;
    return group.owner.id || group.owner._id;
};

const ownerDisplayName = (group: TrainingGroupSummary) => {
    if (!group.owner || typeof group.owner === "string") return undefined;
    return group.owner.fullName || group.owner.username;
};

export default function TrainingGroupsScreen() {
    const [groups, setGroups] = useState<TrainingGroupSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState("");

    const { user } = useAuth();
    const params = useLocalSearchParams<{ toast?: string | string[] }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const userId = user?.id || user?._id;
    const isCoach = user?.role === "coach";

    const toastParam = useMemo(() => {
        const value = params?.toast;
        if (!value) return "";
        return Array.isArray(value) ? value[0] ?? "" : value;
    }, [params?.toast]);

    const lastToastRef = useRef<string>("");

    useEffect(() => {
        if (!toastParam) return;
        if (toastParam === lastToastRef.current) return;
        lastToastRef.current = toastParam;
        setToastMessage(toastParam);
        setToastVisible(true);
    }, [toastParam]);

    const fetchGroups = useCallback(async () => {
        try {
            setError(null);
            const data = await listMyTrainingGroups();
            setGroups(data);
        } catch (err) {
            console.error("Erreur lors du chargement des groupes", err);
            setError("Impossible de charger vos groupes. Balayez vers le bas pour réessayer.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchGroups();
        }, [fetchGroups]),
    );

    const handleRefresh = () => {
        setRefreshing(true);
        fetchGroups();
    };

    const ownedGroups = groups.filter((group) => userId && extractOwnerId(group) === userId);
    const invitedGroups = groups.filter((group) => {
        if (!userId) return false;
        const ownerId = extractOwnerId(group);
        if (ownerId === userId) return false;
        return Boolean(group.hasPendingInvite && !group.isMember);
    });
    const memberGroups = groups.filter((group) => {
        if (!userId) return false;
        const ownerId = extractOwnerId(group);
        if (ownerId === userId) return false;
        return Boolean(group.isMember);
    });
    const totalGroups = groups.length;
    const renderGroupList = (collection: TrainingGroupSummary[], variant: "owned" | "member", emptyLabel: string) => {
        if (loading && !refreshing) {
            return (
                <View style={styles.loadingState}>
                    <ActivityIndicator size="small" color="#38bdf8" />
                </View>
            );
        }

        if (!collection.length) {
            return (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyLabel}>{emptyLabel}</Text>
                </View>
            );
        }

        return collection.map((group) => (
            <GroupCard
                key={group.id}
                group={group}
                variant={variant}
                onPress={() => router.push(`/(main)/training/groups/${group.id}`)}
                onEdit={
                    variant === "owned"
                        ? () => router.push(`/(main)/training/groups/${group.id}/edit`)
                        : undefined
                }
            />
        ));
    };

    return (
        <View style={styles.screen}>
            <ScrollView
                contentContainerStyle={[
                    styles.container,
                    {
                        paddingTop: Math.max(insets.top, 16),
                        paddingBottom: Math.max(insets.bottom + 24, 32),
                    },
                ]}
                refreshControl={<RefreshControl tintColor="#38bdf8" refreshing={refreshing} onRefresh={handleRefresh} />}
            >
                <View style={styles.heroCard}>
                    {isCoach ? (
                        <>
                            <View style={styles.heroStats}>
                                <View style={styles.heroStatCard}>
                                    <Text style={styles.heroStatValue}>{totalGroups}</Text>
                                    <Text style={styles.heroStatLabel}>Groupes actifs</Text>
                                </View>
                                <View style={styles.heroStatCard}>
                                    <Text style={styles.heroStatValue}>{ownedGroups.length}</Text>
                                    <Text style={styles.heroStatLabel}>Créés par vous</Text>
                                </View>
                            </View>

                            <View style={styles.heroActions}>
                                <Pressable
                                    style={styles.primaryAction}
                                    onPress={() => router.push("/(main)/training/groups/create")}
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.primaryActionText}>Créer un groupe</Text>
                                    <MaterialCommunityIcons name="plus-circle" size={20} color="#0f172a" />
                                </Pressable>
                                <Pressable
                                    style={styles.secondaryAction}
                                    onPress={() => router.push("/(main)/training/groups/join")}
                                    accessibilityRole="button"
                                >
                                    <MaterialCommunityIcons name="account-search" size={20} color="#f8fafc" />
                                    <Text style={styles.secondaryActionText}>Rejoindre</Text>
                                </Pressable>
                            </View>
                        </>
                    ) : (
                        <View style={styles.athleteHeroRow}>
                            <View style={[styles.heroStatCard, styles.athleteHeroStat]}>
                                <Text style={styles.heroStatValue}>{totalGroups}</Text>
                                <Text style={styles.heroStatLabel}>Groupes actifs</Text>
                            </View>

                            <Pressable
                                style={[styles.secondaryAction, styles.athleteJoinAction]}
                                onPress={() => router.push("/(main)/training/groups/join")}
                                accessibilityRole="button"
                            >
                                <MaterialCommunityIcons name="account-search" size={20} color="#f8fafc" />
                                <Text style={styles.secondaryActionText}>Rejoindre</Text>
                            </Pressable>
                        </View>
                    )}
                </View>

                {error ? (
                    <View style={styles.errorBanner}>
                        <MaterialCommunityIcons name="alert" size={18} color="#fbbf24" />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                {isCoach ? (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Groupes créés</Text>
                        <View style={styles.sectionContent}>
                            {renderGroupList(ownedGroups, "owned", "Créez votre premier groupe.")}
                        </View>
                    </View>
                ) : null}

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Groupes suivis</Text>
                    <View style={styles.sectionContent}>
                        {renderGroupList(memberGroups, "member", "Rejoignez un groupe pour collaborer avec d'autres athlètes.")}
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Invitations</Text>
                    <View style={styles.sectionContent}>
                        {renderGroupList(invitedGroups, "member", "Aucune invitation en attente.")}
                    </View>
                </View>
            </ScrollView>

            <Snackbar
                visible={toastVisible}
                onDismiss={() => setToastVisible(false)}
                duration={2500}
                action={{ label: "OK", onPress: () => setToastVisible(false) }}
            >
                {toastMessage}
            </Snackbar>
        </View>
    );
}

type GroupCardProps = {
    group: TrainingGroupSummary;
    variant: "owned" | "member";
    onEdit?: () => void;
    onPress?: () => void;
};

const GroupCard = ({ group, variant, onEdit, onPress }: GroupCardProps) => {
    const accent = variant === "owned" ? "#f97316" : "#38bdf8";
    const ownerName = ownerDisplayName(group);
    const roleLabel =
        variant === "owned" ? "Coach principal" : group.isMember ? "Membre actif" : group.hasPendingInvite ? "Invitation" : "Invité";
    const roleIcon =
        variant === "owned"
            ? "crown-outline"
            : group.isMember
                ? "account-check-outline"
                : group.hasPendingInvite
                    ? "email-outline"
                    : "account-outline";
    const createdLabel = group.createdAt
        ? new Date(group.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
        : null;

    const handleDetailsPress = (event: GestureResponderEvent) => {
        event.stopPropagation();
        onPress?.();
    };

    return (
        <Pressable
            style={[styles.groupCard, { borderColor: `${accent}35` }]}
            onPress={onPress}
            accessibilityRole="button"
        >
            <View style={[styles.groupCardGlow, { backgroundColor: `${accent}18` }]} />
            <View style={styles.groupCardContent}>
                <View style={styles.groupCardHeader}>
                    <View style={[styles.groupBadge, { borderColor: `${accent}4d`, backgroundColor: `${accent}1a` }]}>
                        <MaterialCommunityIcons
                            name={variant === "owned" ? "shield-crown" : "account-group"}
                            size={20}
                            color={accent}
                        />
                    </View>
                    <View style={styles.groupHeaderText}>
                        <Text style={styles.groupName} numberOfLines={1} ellipsizeMode="tail">
                            {group.name}
                        </Text>
                        <Text style={styles.groupOwnerLine}>
                            {ownerName ? `Coach ${ownerName}` : "Groupe Talent-X"}
                        </Text>
                    </View>
                    <View style={[styles.groupMembersChip, { backgroundColor: `${accent}22` }]}>
                        <MaterialCommunityIcons name="account-multiple" size={14} color="#bfcacfff" />
                        <Text style={styles.groupMembersValue}>{group.membersCount}</Text>
                    </View>
                </View>
                {group.description ? (
                    <Text numberOfLines={3} style={styles.groupDescription}>
                        {group.description}
                    </Text>
                ) : (
                    <Text style={styles.groupDescriptionMuted}>Aucune description pour le moment.</Text>
                )}
                <View style={styles.groupMetaRow}>
                    <View style={[styles.groupPill, styles.groupRolePill]}>
                        <MaterialCommunityIcons name={roleIcon} size={14} color="#f8fafc" />
                        <Text style={styles.groupPillText}>{roleLabel}</Text>
                    </View>
                    {createdLabel ? (
                        <View style={[styles.groupPill, styles.groupDatePill]}>
                            <MaterialCommunityIcons name="calendar-clock" size={14} color="#0f172a" />
                            <Text style={[styles.groupPillText, styles.groupDateText]}>Depuis {createdLabel}</Text>
                        </View>
                    ) : null}
                </View>
                {variant === "owned" ? (
                    <View style={styles.cardFooter}>
                        <Pressable
                            style={[styles.editButton, { backgroundColor: accent }]}
                            onPress={handleDetailsPress}
                            accessibilityRole="button"
                            disabled={!onPress}
                        >
                            <Text style={styles.editButtonText}>Voir les détails</Text>
                            <MaterialCommunityIcons name="arrow-right" size={16} color="#0f172a" />
                        </Pressable>
                    </View>
                ) : (
                    <View style={styles.cardFootnote}>
                        <MaterialCommunityIcons name="gesture-tap" size={14} color="#94a3b8" />
                        <Text style={styles.cardFootnoteText}>Touchez pour explorer le groupe</Text>
                    </View>
                )}
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: "#020617",
    },
    container: {
        paddingHorizontal: 14,
        gap: 28,
    },
    heroCard: {
        borderRadius: 32,
        padding: 12,
        gap: 10,
        backgroundColor: "#0f172a",
        borderWidth: 1,
        borderColor: "rgba(103,232,249,0.25)",
        position: "relative",
        overflow: "hidden",
    },
    heroBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    heroGlow: {
        position: "absolute",
        width: 180,
        height: 180,
        borderRadius: 999,
        opacity: 0.4,
    },
    heroGlowPrimary: {
        top: -60,
        right: -20,
        backgroundColor: "rgba(103,232,249,0.8)",
    },
    heroGlowSecondary: {
        bottom: -70,
        left: -30,
        backgroundColor: "rgba(248,113,113,0.6)",
    },
    heroHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    heroChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "#67e8f9",
    },
    heroChipText: {
        fontSize: 11,
        fontWeight: "700",
        color: "#04121d",
        letterSpacing: 0.5,
    },
    heroPulse: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.4)",
        backgroundColor: "rgba(148,163,184,0.12)",
    },
    heroPulseDot: {
        width: 8,
        height: 8,
        borderRadius: 999,
        backgroundColor: "#facc15",
    },
    heroPulseText: {
        color: "#f8fafc",
        fontSize: 11,
        fontWeight: "600",
    },
    heroKicker: {
        fontSize: 11,
        color: "#67e8f9",
        letterSpacing: 1.5,
        textTransform: "uppercase",
    },
    heroTitle: {
        fontSize: 24,
        fontWeight: "700",
        color: "#f8fafc",
    },
    heroSubtitle: {
        color: "#cbd5e1",
        fontSize: 13,
        lineHeight: 18,
    },
    heroStats: {
        flexDirection: "row",
        alignItems: "stretch",
        gap: 10,
    },
    heroStatCard: {
        flex: 1,
        paddingHorizontal: 8,
        paddingVertical: 10,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(248,250,252,0.15)",
        backgroundColor: "rgba(4,13,30,0.7)",
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    heroStatValue: {
        fontSize: 10,
        fontWeight: "700",
        color: "#f8fafc",
    },
    heroStatLabel: {
        color: "#94a3b8",
        fontSize: 10,
    },
    heroActions: {
        flexDirection: "row",
        gap: 12,
        marginTop: 4,
    },
    athleteHeroRow: {
        flexDirection: "row",
        gap: 12,
        alignItems: "stretch",
        marginTop: 6,
    },
    athleteHeroStat: {
        flex: 1,
    },
    athleteJoinAction: {
        flex: 1,
        justifyContent: "center",
    },
    primaryAction: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        borderRadius: 16,
        padding: 10,
        backgroundColor: "#69e0f0ff",
    },
    primaryActionText: {
        color: "#0f172a",
        fontWeight: "700",
        fontSize: 13,
    },
    secondaryAction: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        borderRadius: 16,
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.4)",
    },
    secondaryActionText: {
        color: "#f8fafc",
        fontWeight: "600",
        fontSize: 13,
    },
    errorBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        padding: 14,
        borderRadius: 16,
        backgroundColor: "rgba(251,191,36,0.15)",
        borderWidth: 1,
        borderColor: "rgba(251,191,36,0.4)",
    },
    errorText: {
        color: "#fbbf24",
        flex: 1,
        fontWeight: "600",
    },
    section: {
        gap: 8,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: "#f8fafc",
    },
    sectionSubtitle: {
        color: "#94a3b8",
    },
    sectionContent: {
        marginTop: 8,
        gap: 12,
    },
    loadingState: {
        paddingVertical: 24,
        alignItems: "center",
    },
    emptyState: {
        padding: 24,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        backgroundColor: "rgba(15,23,42,0.6)",
    },
    emptyLabel: {
        color: "#94a3b8",
        textAlign: "center",
    },
    groupCard: {
        borderRadius: 28,
        borderWidth: 1,
        backgroundColor: "#050b1d",
        overflow: "hidden",
    },
    groupCardGlow: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.5,
    },
    groupCardContent: {
        padding: 20,
        gap: 12,
    },
    groupCardHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
    },
    groupBadge: {
        width: 50,
        height: 50,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
    },
    groupHeaderText: {
        flex: 1,
        minWidth: 0,
    },
    groupName: {
        fontSize: 14,
        fontWeight: "700",
        color: "#f8fafc",
    },
    groupOwnerLine: {
        color: "#94a3b8",
        fontSize: 12,
        marginTop: 2,
    },
    groupMembersChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
    },
    groupMembersValue: {
        color: "#d9e5ebff",
        fontWeight: "700",
    },
    groupDescription: {
        color: "#cbd5e1",
        lineHeight: 18,
    },
    groupDescriptionMuted: {
        color: "#64748b",
        fontStyle: "italic",
    },
    groupMetaRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
    },
    groupPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    groupRolePill: {
        backgroundColor: "rgba(234, 238, 241, 0.08)",
        borderWidth: 1,
        borderColor: "rgba(248,250,252,0.2)",
    },
    groupDatePill: {
        backgroundColor: "rgba(227, 242, 242, 0.7)",
    },
    groupPillText: {
        color: "#f8fafc",
        fontSize: 12,
        fontWeight: "600",
    },
    groupDateText: {
        color: "#052738",
    },
    cardFooter: {
        marginTop: 6,
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    editButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        paddingHorizontal: 18,
        paddingVertical: 10,
        backgroundColor: "#67e8f9",
    },
    editButtonText: {
        color: "#0f172a",
        fontWeight: "700",
    },
    cardFootnote: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 4,
    },
    cardFootnoteText: {
        color: "#94a3b8",
        fontSize: 12,
    },
});
