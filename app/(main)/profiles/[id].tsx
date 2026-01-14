import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Alert, ScrollView, StyleSheet, View, Text, Pressable, Linking, RefreshControl } from "react-native";
import { ActivityIndicator, Button, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import ProfileHeader from "../../../src/components/profile/ProfileHeader";
import ProfileHighlightsCard from "../../../src/components/profile/ProfileHighlightsCard";
import ProfileSocialLinks from "../../../src/components/profile/ProfileSocialLinks";
import { sanitizeInternalAppPath } from "../../../src/utils/safeNavigation";
import { searchTrainingGroups } from "../../../src/api/groupService";
import { TrainingGroupSummary } from "../../../src/types/trainingGroup";
import {
    getUserProfileById,
    respondToFriendInvitation,
    sendFriendInvitation,
    removeFriend,
} from "../../../src/api/userService";
import { User } from "../../../src/types/User";
import { useAuth } from "../../../src/context/AuthContext";

export default function PublicProfileScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ id?: string; from?: string }>();
    const { user: currentUser, refreshProfile } = useAuth();
    const [profile, setProfile] = useState<User | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [inviteLoading, setInviteLoading] = useState(false);
    const [respondingAction, setRespondingAction] = useState<"accept" | "decline" | null>(null);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [groupsError, setGroupsError] = useState<string | null>(null);
    const [ownedGroups, setOwnedGroups] = useState<TrainingGroupSummary[]>([]);

    const [confirmToastVisible, setConfirmToastVisible] = useState(false);
    const [confirmToastMessage, setConfirmToastMessage] = useState("");
    const confirmToastActionRef = useRef<null | (() => void)>(null);

    const openConfirmToast = useCallback((message: string, onConfirm: () => void) => {
        confirmToastActionRef.current = onConfirm;
        setConfirmToastMessage(message);
        setConfirmToastVisible(true);
    }, []);

    const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
    const rawFrom = Array.isArray(params.from) ? params.from[0] : params.from;
    const profileId = rawId?.trim() || null;
    const returnPath = useMemo(() => {
        return sanitizeInternalAppPath(rawFrom, {
            allowedPrefixes: ["/(main)/", "/(auth)/"],
            allowedExact: ["/", "/terms", "/avatar-loader"],
        });
    }, [rawFrom]);

    const viewerId = currentUser?._id || currentUser?.id || null;
    const targetProfileId = profile?._id || profile?.id || profileId || null;
    const relationship = profile?.relationship;
    const computedIsSelf = useMemo(() => {
        if (!viewerId || !targetProfileId) {
            return false;
        }
        return viewerId === targetProfileId;
    }, [targetProfileId, viewerId]);
    const isSelf = relationship?.isSelf ?? computedIsSelf;
    const resolvedRelationshipStatus = relationship?.status ?? (isSelf ? "self" : "none");
    const canSendInvite = Boolean(!isSelf && targetProfileId && !["friends", "outgoing", "incoming"].includes(resolvedRelationshipStatus));
    const hasIncomingInvite = !isSelf && resolvedRelationshipStatus === "incoming";
    const isResponding = respondingAction !== null;
    const inviteButtonState = useMemo(() => {
        switch (resolvedRelationshipStatus) {
            case "friends":
                return {
                    label: "Suivi",
                    icon: "checkmark-circle-outline" as const,
                    mode: "contained-tonal" as const,
                    textColor: "#041b15",
                    canPress: true,
                    action: "unfollow" as const,
                };
            case "outgoing":
                return {
                    label: "Envoyée",
                    icon: "hourglass-outline" as const,
                    mode: "outlined" as const,
                    textColor: "#bae6fd",
                    canPress: false,
                    action: "invite" as const,
                };
            default:
                return {
                    label: "Suivre",
                    icon: "person-add" as const,
                    mode: "contained" as const,
                    textColor: "#02111f",
                    canPress: canSendInvite,
                    action: "invite" as const,
                };
        }
    }, [canSendInvite, resolvedRelationshipStatus]);
    const isUnfollowAction = inviteButtonState.action === "unfollow";

    const loadProfile = useCallback(async () => {
        if (!profileId) {
            setProfile(null);
            setError("Aucun athlète sélectionné");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const data = await getUserProfileById(profileId);
            setProfile(data);
        } catch (fetchError: any) {
            setProfile(null);
            setError(fetchError?.message || "Impossible de charger ce profil");
        } finally {
            setLoading(false);
        }
    }, [profileId]);

    useEffect(() => {
        const loadGroups = async () => {
            if (!profile || profile.role !== "coach") {
                setOwnedGroups([]);
                return;
            }
            setGroupsLoading(true);
            setGroupsError(null);
            try {
                const data = await searchTrainingGroups("", 50);
                const coachId = profile._id || profile.id;
                const filtered = data.filter((group) => {
                    const owner = group.owner;
                    if (!owner) return false;
                    if (typeof owner === "string") return owner === coachId;
                    return owner._id === coachId || owner.id === coachId;
                });
                setOwnedGroups(filtered);
            } catch (groupError: any) {
                setGroupsError(groupError?.message || "Groupes indisponibles");
            } finally {
                setGroupsLoading(false);
            }
        };

        loadGroups();
    }, [profile]);

    useFocusEffect(
        useCallback(() => {
            loadProfile();
        }, [loadProfile]),
    );

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([refreshProfile(), loadProfile()]);
        } catch (error) {
            console.warn("refreshPublicProfile", error);
        } finally {
            setRefreshing(false);
        }
    }, [loadProfile, refreshProfile]);

    const handleGoBack = useCallback(() => {
        if (returnPath) {
            router.replace(returnPath as Href);
            return;
        }
        if (router.canGoBack?.()) {
            router.back();
        } else {
            router.replace("/(main)/home");
        }
    }, [returnPath, router]);

    const handleOpenGroup = useCallback(
        (groupId: string) => {
            if (!groupId) return;
            router.push({ pathname: "/(main)/training/groups/[id]", params: { id: groupId } });
        },
        [router],
    );

    const contactEmail = profile?.email?.trim?.() || "";
    const contactPhone = profile?.phoneNumber?.trim?.() || profile?.phone?.trim?.() || "";
    const trainingAddress = profile?.trainingAddress?.trim?.() || profile?.city?.trim?.() || "";

    const handleOpenEmail = useCallback(() => {
        if (!contactEmail) return;
        Linking.openURL(`mailto:${contactEmail}`).catch(() => null);
    }, [contactEmail]);

    const handleOpenPhone = useCallback(() => {
        if (!contactPhone) return;
        const normalized = contactPhone.replace(/\s+/g, "");
        Linking.openURL(`tel:${normalized}`).catch(() => null);
    }, [contactPhone]);

    const handleOpenAddress = useCallback(() => {
        if (!trainingAddress) return;
        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trainingAddress)}`;
        Linking.openURL(url).catch(() => null);
    }, [trainingAddress]);

    const handleSendInvite = useCallback(async () => {
        if (!targetProfileId || !canSendInvite) {
            return;
        }
        try {
            setInviteLoading(true);
            const response = await sendFriendInvitation(targetProfileId);
            setProfile((previous) => (previous ? { ...previous, relationship: response.relationship } : previous));
        } catch (inviteError: any) {
            Alert.alert("Invitation impossible", inviteError?.message || "Une erreur est survenue.");
        } finally {
            setInviteLoading(false);
        }
    }, [canSendInvite, targetProfileId]);

    const handleRespondToInvite = useCallback(
        async (action: "accept" | "decline") => {
            if (!targetProfileId || !hasIncomingInvite) {
                return;
            }
            try {
                setRespondingAction(action);
                const response = await respondToFriendInvitation(targetProfileId, action);
                setProfile((previous) =>
                    previous
                        ? {
                            ...previous,
                            relationship: response.relationship,
                        }
                        : previous,
                );
                await refreshProfile();
                await loadProfile();
            } catch (respondError: any) {
                Alert.alert(
                    "Action impossible",
                    respondError?.message || "Nous n'avons pas pu traiter cette invitation.",
                );
            } finally {
                setRespondingAction(null);
            }
        },
        [hasIncomingInvite, loadProfile, refreshProfile, targetProfileId],
    );

    const performRemoveFriend = useCallback(async () => {
        if (!targetProfileId || resolvedRelationshipStatus !== "friends") {
            return;
        }
        try {
            setInviteLoading(true);
            const response = await removeFriend(targetProfileId);
            setProfile((previous) =>
                previous
                    ? {
                        ...previous,
                        relationship: response.relationship,
                    }
                    : previous,
            );
            await refreshProfile();
            await loadProfile();
        } catch (removeError: any) {
            Alert.alert(
                "Action impossible",
                removeError?.message || "Nous n'avons pas pu vous désabonner de cet athlète.",
            );
        } finally {
            setInviteLoading(false);
        }
    }, [loadProfile, refreshProfile, resolvedRelationshipStatus, targetProfileId]);

    const handleRemoveFriend = useCallback(() => {
        if (!targetProfileId || resolvedRelationshipStatus !== "friends" || inviteLoading) {
            return;
        }
        openConfirmToast("Ne plus suivre cet athlète ?", performRemoveFriend);
    }, [inviteLoading, openConfirmToast, performRemoveFriend, resolvedRelationshipStatus, targetProfileId]);

    const renderFallback = (title: string, subtitle?: string, canRetry = false) => (
        <View style={styles.fallbackState}>
            <Ionicons name="person-circle-outline" size={56} color="#475569" />
            <Text style={styles.fallbackTitle}>{title}</Text>
            {subtitle ? <Text style={styles.fallbackSubtitle}>{subtitle}</Text> : null}
            <Button
                mode="outlined"
                textColor="#38bdf8"
                style={styles.fallbackButton}
                onPress={canRetry ? loadProfile : handleGoBack}
            >
                {canRetry ? "Réessayer" : "Revenir en arrière"}
            </Button>
        </View>
    );

    if (!profileId) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["top", "right", "left"]}>
                {renderFallback("Profil inconnu", "Sélectionnez un athlète depuis un groupe ou une séance.")}
            </SafeAreaView>
        );
    }

    if (loading && !profile) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["top", "right", "left"]}>
                <View style={styles.loadingState}>
                    <ActivityIndicator color="#22d3ee" />
                    <Text style={styles.loadingLabel}>Chargement du profil…</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (error && !profile) {
        const lower = typeof error === "string" ? error.toLowerCase() : "";
        const isPrivateProfile = lower.includes("priv");
        return (
            <SafeAreaView style={styles.safeArea} edges={["top", "right", "left"]}>
                {isPrivateProfile
                    ? renderFallback("Profil privé", error, false)
                    : renderFallback("Profil indisponible", error, true)}
            </SafeAreaView>
        );
    }

    if (!profile) {
        return null;
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={["top", "right", "left"]}>
            <ScrollView
                contentContainerStyle={styles.container}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor="#22d3ee"
                        colors={["#22d3ee"]}
                    />
                }
            >
                <View style={styles.headerActions}>
                    <Button
                        mode="text"
                        textColor="#bae6fd"
                        icon={({ size, color }) => <Ionicons name="arrow-back" size={size} color={color} />}
                        onPress={handleGoBack}
                        compact
                    >
                        Retour
                    </Button>
                    {!isSelf ? (
                        hasIncomingInvite ? (
                            <View style={styles.responseActions}>
                                <Button
                                    mode="contained"
                                    onPress={() => handleRespondToInvite("accept")}
                                    icon={({ size, color }) => (
                                        <Ionicons name="checkmark" size={size} color={color} />
                                    )}
                                    textColor="#041b15"
                                    style={styles.acceptButton}
                                    loading={respondingAction === "accept"}
                                    disabled={isResponding}
                                    compact
                                >
                                    Accepter
                                </Button>
                                <Button
                                    mode="outlined"
                                    onPress={() => handleRespondToInvite("decline")}
                                    icon={({ size, color }) => (
                                        <Ionicons name="close" size={size} color={color} />
                                    )}
                                    textColor="#f97316"
                                    style={styles.declineButton}
                                    loading={respondingAction === "decline"}
                                    disabled={isResponding}
                                    compact
                                >
                                    Décliner
                                </Button>
                            </View>
                        ) : (
                            <Button
                                mode={inviteButtonState.mode}
                                onPress={isUnfollowAction ? handleRemoveFriend : handleSendInvite}
                                icon={({ size, color }) => (
                                    <Ionicons name={inviteButtonState.icon} size={size} color={color} />
                                )}
                                disabled={!inviteButtonState.canPress || inviteLoading}
                                loading={inviteLoading}
                                textColor={inviteButtonState.textColor}
                                style={[styles.inviteButton, isUnfollowAction ? styles.unfollowButton : null]}
                                compact
                            >
                                {inviteButtonState.label}
                            </Button>
                        )
                    ) : null}
                </View>
                {loading ? (
                    null
                ) : null}
                <ProfileHeader user={profile} />
                {profile.bio ? (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionLabel}>Bio</Text>
                        <Text style={styles.sectionBody}>{profile.bio}</Text>
                    </View>
                ) : null}
                {profile.goals ? (
                    <View style={styles.goalCard}>
                        <View style={styles.goalIconWrapper}>
                            <Ionicons name="flag-outline" size={18} color="#e2e8f0" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.goalLabel}>Objectif de la saison</Text>
                            <Text style={styles.goalText} numberOfLines={3} ellipsizeMode="tail">
                                {profile.goals}
                            </Text>
                        </View>
                    </View>
                ) : null}
                {profile.role === "coach" ? (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionLabel}>Coordonnées</Text>
                        <Pressable
                            style={({ pressed }) => [styles.contactRow, pressed ? styles.contactRowPressed : null]}
                            onPress={handleOpenEmail}
                            accessibilityRole="button"
                            accessibilityLabel="Envoyer un mail"
                        >
                            <View style={[styles.contactIcon, styles.contactIconPrimary]}>
                                <Ionicons name="mail" size={16} color="#0f172a" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.contactLabel}>Email</Text>
                                <Text style={styles.contactValue} numberOfLines={1} ellipsizeMode="tail">
                                    {contactEmail}
                                </Text>
                            </View>
                            <Ionicons name="open-outline" size={16} color="#94a3b8" />
                        </Pressable>
                        <Pressable
                            style={({ pressed }) => [styles.contactRow, !contactPhone ? styles.contactRowDisabled : null, pressed && contactPhone ? styles.contactRowPressed : null]}
                            onPress={contactPhone ? handleOpenPhone : undefined}
                            accessibilityRole="button"
                            accessibilityLabel="Appeler le coach"
                            disabled={!contactPhone}
                        >
                            <View style={[styles.contactIcon, styles.contactIconSecondary]}>
                                <Ionicons name="call" size={16} color="#0f172a" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.contactLabel}>Téléphone</Text>
                                <Text
                                    style={[styles.contactValue, !contactPhone ? styles.contactValueMuted : null]}
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                >
                                    {contactPhone || "Non renseigné"}
                                </Text>
                            </View>
                            <Ionicons name="open-outline" size={16} color="#94a3b8" />
                        </Pressable>
                        <Pressable
                            style={({ pressed }) => [styles.contactRow, !trainingAddress ? styles.contactRowDisabled : null, pressed && trainingAddress ? styles.contactRowPressed : null]}
                            onPress={trainingAddress ? handleOpenAddress : undefined}
                            accessibilityRole="button"
                            accessibilityLabel="Ouvrir l'adresse d'entraînement"
                            disabled={!trainingAddress}
                        >
                            <View style={[styles.contactIcon, styles.contactIconTertiary]}>
                                <Ionicons name="location" size={16} color="#0f172a" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.contactLabel}>Adresse d'entraînement</Text>
                                <Text
                                    style={[styles.contactValue, !trainingAddress ? styles.contactValueMuted : null]}
                                    numberOfLines={2}
                                    ellipsizeMode="tail"
                                >
                                    {trainingAddress || "Non renseignée"}
                                </Text>
                            </View>
                            <Ionicons name="map" size={16} color="#94a3b8" />
                        </Pressable>
                    </View>
                ) : null}
                <ProfileHighlightsCard user={profile} showStatsLink={false} />
                {profile.role === "coach" ? (
                    <View style={styles.sectionCard}>
                        <View style={styles.sectionHeaderRow}>
                            <Text style={styles.sectionLabel}>Groupes créés</Text>
                            <View style={styles.chipBadge}>
                                <Ionicons name="people" size={14} color="#0f172a" />
                                <Text style={styles.chipBadgeText}>{ownedGroups.length}</Text>
                            </View>
                        </View>
                        {groupsLoading ? (
                            <View style={styles.rowCentered}>
                                <ActivityIndicator color="#22d3ee" />
                            </View>
                        ) : ownedGroups.length ? (
                            ownedGroups.map((group) => (
                                <Pressable
                                    key={group.id}
                                    style={({ pressed }) => [styles.groupRow, pressed ? styles.groupRowPressed : null]}
                                    onPress={() => handleOpenGroup(group.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Ouvrir le groupe ${group.name}`}
                                >
                                    <View style={styles.groupIcon}>
                                        <Ionicons name="shield-checkmark" size={16} color="#0f172a" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.groupName} numberOfLines={1} ellipsizeMode="tail">
                                            {group.name}
                                        </Text>
                                        <Text style={styles.groupMeta} numberOfLines={2} ellipsizeMode="tail">
                                            {group.description?.trim() || `${group.membersCount} athlète${group.membersCount > 1 ? "s" : ""}`}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                                </Pressable>
                            ))
                        ) : (
                            <Text style={styles.sectionBody}>
                                {groupsError || "Ce coach n'a pas encore créé de groupe."}
                            </Text>
                        )}
                    </View>
                ) : null}
                <ProfileSocialLinks user={profile} />
            </ScrollView>

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
                    textColor: "#22d3ee",
                }}
                style={styles.confirmToast}
            >
                <Text style={styles.confirmToastText}>{confirmToastMessage}</Text>
            </Snackbar>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "transparent",
    },
    container: {
        padding: 10,
        paddingBottom: 24,
        gap: 16,
    },
    headerActions: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
        gap: 12,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    chipBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "#38bdf8",
    },
    chipBadgeGhost: {
        backgroundColor: "rgba(56,189,248,0.12)",
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.35)",
    },
    chipBadgeText: {
        color: "#0f172a",
        fontWeight: "800",
    },
    chipBadgeTextGhost: {
        color: "#bae6fd",
    },
    rowCentered: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    groupRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(148,163,184,0.18)",
    },
    groupRowPressed: {
        opacity: 0.8,
    },
    groupIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "rgba(56,189,248,0.2)",
        alignItems: "center",
        justifyContent: "center",
    },
    groupName: {
        color: "#e2e8f0",
        fontWeight: "700",
    },
    groupMeta: {
        color: "#94a3b8",
        fontSize: 12,
    },
    contactRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
    },
    contactRowDisabled: {
        opacity: 0.65,
    },
    contactRowPressed: {
        opacity: 0.8,
    },
    contactIcon: {
        width: 34,
        height: 34,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
    },
    contactIconPrimary: {
        backgroundColor: "rgba(34,211,238,0.2)",
        borderColor: "rgba(34,211,238,0.35)",
    },
    contactIconSecondary: {
        backgroundColor: "rgba(74,222,128,0.18)",
        borderColor: "rgba(74,222,128,0.35)",
    },
    contactIconTertiary: {
        backgroundColor: "rgba(251,191,36,0.14)",
        borderColor: "rgba(251,191,36,0.35)",
    },
    contactLabel: {
        color: "#cbd5e1",
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 0.3,
        textTransform: "uppercase",
    },
    contactValue: {
        color: "#f8fafc",
        fontSize: 14,
        fontWeight: "700",
    },
    contactValueMuted: {
        color: "#94a3b8",
    },
    responseActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    inviteButton: {
        borderRadius: 999,
    },
    unfollowButton: {
        backgroundColor: "rgba(190, 187, 208, 0.5)",
        borderWidth: 1,
        borderColor: "rgba(193, 171, 171, 0.5)",
    },
    acceptButton: {
        borderRadius: 999,
        backgroundColor: "#34d399",
    },
    declineButton: {
        borderRadius: 999,
        borderColor: "rgba(249,115,22,0.4)",
    },
    loadingState: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
    },
    loadingLabel: {
        color: "#94a3b8",
        fontSize: 13,
    },
    confirmToast: {
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: 18,
        backgroundColor: "rgba(2,6,23,0.92)",
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.35)",
    },
    confirmToastText: {
        color: "#e2e8f0",
        fontSize: 13,
        fontWeight: "600",
    },
    sectionCard: {
        borderRadius: 20,
        backgroundColor: "rgba(15,23,42,0.85)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
        padding: 16,
        gap: 8,
    },
    sectionLabel: {
        color: "#94a3b8",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        fontWeight: "600",
    },
    sectionBody: {
        color: "#f8fafc",
        fontSize: 14,
        lineHeight: 20,
    },
    goalCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.4)",
        backgroundColor: "rgba(2,6,23,0.9)",
        paddingHorizontal: 18,
        paddingVertical: 16,
    },
    goalIconWrapper: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(34,211,238,0.25)",
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.5)",
        alignItems: "center",
        justifyContent: "center",
    },
    goalLabel: {
        color: "#bae6fd",
        fontSize: 11,
        letterSpacing: 1,
        textTransform: "uppercase",
        fontWeight: "700",
    },
    goalText: {
        color: "#f8fafc",
        fontSize: 12,
        fontWeight: "700",
        marginTop: 4,
        lineHeight: 20,
        fontStyle: "italic",
    },
    fallbackState: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 12,
    },
    fallbackTitle: {
        color: "#f8fafc",
        fontSize: 18,
        fontWeight: "700",
        textAlign: "center",
    },
    fallbackSubtitle: {
        color: "#94a3b8",
        textAlign: "center",
        lineHeight: 20,
    },
    fallbackButton: {
        borderColor: "rgba(56,189,248,0.6)",
    },
});
