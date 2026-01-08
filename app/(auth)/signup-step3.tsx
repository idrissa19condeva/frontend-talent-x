import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Text, Button, TextInput } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSignupWizard } from "../../src/context/SignupWizardContext";
import { useAuth } from "../../src/context/AuthContext";
import { DISCIPLINE_GROUPS, getDisciplinesForPrimary, DisciplineGroup, DisciplineSubGroup } from "../../src/constants/disciplineGroups";
import { checkLicenseExists } from "../../src/api/authService";

export default function SignupStep3Screen() {
    const router = useRouter();
    const { draft, setStep3, reset } = useSignupWizard();
    const { signup } = useAuth();

    const isCoach = draft.role === "coach";

    const [selectedGroupId, setSelectedGroupId] = useState<string>(draft.mainDisciplineFamily || DISCIPLINE_GROUPS[0]?.id || "");
    const [selectedDiscipline, setSelectedDiscipline] = useState<string>(draft.mainDiscipline || "");
    const [licenseNumber, setLicenseNumber] = useState<string>(draft.licenseNumber || "");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [licenseError, setLicenseError] = useState<string | null>(null);
    const [activePicker, setActivePicker] = useState<"group" | "discipline" | null>(null);
    const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false);

    const group = useMemo<DisciplineGroup | undefined>(() => DISCIPLINE_GROUPS.find((g) => g.id === selectedGroupId), [selectedGroupId]);

    useEffect(() => {
        if (!draft.emailVerified) {
            router.replace("/(auth)/signup-email-confirm");
            return;
        }
        if (!draft.firstName || !draft.lastName || !draft.email || !draft.password || !draft.birthDate || !draft.gender || !draft.role) {
            router.replace("/(auth)/signup");
        }
    }, [draft, router]);

    useEffect(() => {
        // If the chosen discipline no longer belongs to the group, reset it
        const disciplines = group ? getDisciplinesForPrimary(group, undefined) : [];
        if (group?.id === "courses" && group.subGroups?.length) {
            const courseLabels = group.subGroups.map((sub) => sub.label);
            if (selectedDiscipline && !courseLabels.includes(selectedDiscipline)) {
                setSelectedDiscipline("");
            }
            return;
        }
        if (selectedDiscipline && !disciplines.includes(selectedDiscipline)) {
            setSelectedDiscipline("");
        }
    }, [group, selectedDiscipline]);

    const handleSelectGroup = (id: string) => {
        setSelectedGroupId(id);
        setSelectedDiscipline("");
        setActivePicker(null);
        setError(null);
    };

    const handleSubmit = async () => {
        setError(null);
        setLicenseError(null);

        if (!hasAcceptedLegal) {
            setError("Tu dois accepter les CGU et la politique de confidentialité pour continuer.");
            return;
        }

        if (!isCoach) {
            if (!selectedGroupId || !selectedDiscipline) {
                setError("Choisis ta discipline principale");
                return;
            }
            if (!licenseNumber.trim()) {
                setError("Le numéro de licence est requis");
                return;
            }
        }
        setLoading(true);
        try {
            setStep3({
                mainDisciplineFamily: isCoach ? undefined : selectedGroupId,
                mainDiscipline: isCoach ? undefined : selectedDiscipline,
                licenseNumber: isCoach ? undefined : licenseNumber.trim() || undefined,
            });
            await signup({
                firstName: draft.firstName || "",
                lastName: draft.lastName || "",
                email: draft.email || "",
                password: draft.password || "",
                birthDate: draft.birthDate,
                gender: draft.gender as any,
                role: draft.role as any,
                mainDisciplineFamily: isCoach ? undefined : selectedGroupId,
                mainDiscipline: isCoach ? undefined : selectedDiscipline,
                licenseNumber: isCoach ? undefined : licenseNumber.trim() || undefined,
            });
            reset();
            router.replace("/(main)/home");
        } catch (err) {
            console.warn("Signup step3 error", err);
            const resp = (err as any)?.response;
            const apiMessage = resp?.data?.message;
            const status = resp?.status;
            const lower = typeof apiMessage === "string" ? apiMessage.toLowerCase() : "";
            const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const folded = fold(lower);

            if (lower.includes("email not verified")) {
                setError("Confirme ton email avec le code reçu avant de continuer.");
                router.replace("/(auth)/signup-email-confirm");
                return;
            }
            // Duplicate license (API returns 409, but also catch message-only variants)
            if (
                status === 409
                || folded.includes("deja utilise")
                || folded.includes("already used")
                || folded.includes("duplicate")
            ) {
                setLicenseError("Ce numéro de licence est déjà utilisé. Si c'est toi, connecte-toi. Sinon, vérifie le numéro.");
                return;
            }
            // License mismatch with FFA profile (be specific, don't match the duplicate case above)
            if (
                folded.includes("introuvable")
                || folded.includes("fiche ffa")
                || folded.includes("ne correspond")
                || folded.includes("mismatch")
            ) {
                setLicenseError(`Le numéro de licence ne correspond pas au prénom et nom ${draft.firstName} ${draft.lastName}`.trim());
                return;
            }
            if (status === 502) {
                setLicenseError("Impossible de vérifier le numéro de licence pour le moment. Réessaie dans quelques minutes.");
                return;
            }
            setError("Impossible de finaliser l'inscription");
        } finally {
            setLoading(false);
        }
    };

    const verifyLicenseUniqueness = async () => {
        if (isCoach) return;
        const trimmed = String(licenseNumber || "").trim();
        if (!trimmed) return;

        try {
            const exists = await checkLicenseExists(trimmed);
            if (exists) {
                setLicenseError("Ce numéro de licence est déjà utilisé. Si c'est toi, connecte-toi. Sinon, vérifie le numéro.");
            }
        } catch (_err) {
            // Best effort: do not block signup on pre-check failures.
        }
    };

    const disciplineOptions = useMemo(() => {
        if (!group) return [];
        if (group.id === "courses" && group.subGroups?.length) {
            return group.subGroups.map((sub) => sub.label);
        }
        if (group.subGroups?.length) {
            return group.subGroups.flatMap((sub) => sub.disciplines);
        }
        return group.disciplines;
    }, [group]);

    return (
        <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
            <LinearGradient
                colors={["#0f172a", "#0b1120"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
            >
                <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                    <LinearGradient
                        colors={["rgba(34,211,238,0.18)", "rgba(14,165,233,0.12)", "rgba(99,102,241,0.12)"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.card}
                    >
                        <View style={styles.navBar}>
                            <View style={styles.navButtonsWrap}>
                                <Pressable onPress={() => router.push("/(auth)/signup-step2")} style={styles.navButton}>
                                    <Ionicons name="chevron-back" size={16} color="#e0f2fe" />
                                </Pressable>
                                <Pressable
                                    onPress={handleSubmit}
                                    style={[styles.navButtonPrimary, (!hasAcceptedLegal || loading) && styles.navButtonPrimaryDisabled]}
                                    disabled={!hasAcceptedLegal || loading}
                                >
                                    <Ionicons name="checkmark" size={16} color="#0f172a" />
                                </Pressable>
                            </View>
                            <View style={styles.progressWrap}>
                                <View style={styles.progressDot} />
                                <View style={styles.progressDot} />
                                <View style={[styles.progressDot, styles.progressDotActive]} />
                            </View>
                        </View>

                        <View style={styles.cardHeader}>
                            <View style={styles.headerTitleRow}>
                                <Ionicons name="flash-outline" size={18} color="#e0f2fe" />
                                <Text style={styles.title}>{isCoach ? "Profil coach" : "Ta discipline principale"}</Text>
                            </View>
                        </View>

                        {!isCoach ? (
                            <>
                                <View style={styles.fieldGroup}>
                                    <Text style={styles.sectionLabel}>Famille *</Text>
                                    <Pressable style={styles.dropdown} onPress={() => setActivePicker("group")}>
                                        <Text style={selectedGroupId ? styles.dropdownValue : styles.dropdownPlaceholder} numberOfLines={1}>
                                            {group?.label || "Sélectionner"}
                                        </Text>
                                        <Ionicons name="chevron-down" size={16} color="#e2e8f0" />
                                    </Pressable>
                                </View>

                                <View style={styles.fieldGroup}>
                                    <Text style={styles.sectionLabel}>Discipline *</Text>
                                    <Pressable
                                        style={styles.dropdown}
                                        onPress={() => {
                                            if (!disciplineOptions.length) return;
                                            setActivePicker("discipline");
                                        }}
                                    >
                                        <Text
                                            style={selectedDiscipline ? styles.dropdownValue : styles.dropdownPlaceholder}
                                            numberOfLines={1}
                                        >
                                            {selectedDiscipline || "Choisir une discipline"}
                                        </Text>
                                        <Ionicons name="chevron-down" size={16} color="#e2e8f0" />
                                    </Pressable>
                                    {error && !selectedDiscipline ? <Text style={styles.error}>{error}</Text> : null}
                                </View>

                                <View style={styles.fieldGroup}>
                                    <Text style={styles.sectionLabel}>Numéro de licence *</Text>
                                    <TextInput
                                        mode="outlined"
                                        value={licenseNumber}
                                        onChangeText={(value) => {
                                            setLicenseNumber(value);
                                            if (licenseError) setLicenseError(null);
                                        }}
                                        onBlur={verifyLicenseUniqueness}
                                        placeholder="Ex: 1234567"
                                        autoCapitalize="none"
                                        keyboardType="number-pad"
                                        inputMode="numeric"
                                        outlineColor="rgba(148,163,184,0.45)"
                                        activeOutlineColor="#22d3ee"
                                        style={styles.input}
                                        textColor="#f8fafc"
                                        placeholderTextColor="#94a3b8"
                                        theme={{ colors: { text: "#f8fafc" } }}
                                    />
                                    {licenseError ? <Text style={styles.error}>{licenseError}</Text> : null}
                                </View>
                            </>
                        ) : (
                            <View style={styles.fieldGroup}>
                                <Text style={styles.sectionLabel}>Créez et gérez vos groupes d'entraînement</Text>
                            </View>
                        )}

                        {error && selectedDiscipline ? <Text style={styles.error}>{error}</Text> : null}

                        {loading && !isCoach ? (
                            <Text style={styles.helper}>Veuillez patienter, vérification de votre numéro de licence en cours...</Text>
                        ) : null}

                        <View style={styles.legalWrap}>
                            <Pressable
                                onPress={() => setHasAcceptedLegal((prev) => !prev)}
                                style={({ pressed }) => [styles.legalRow, pressed && styles.legalRowPressed]}
                            >
                                <Ionicons
                                    name={hasAcceptedLegal ? "checkbox" : "square-outline"}
                                    size={18}
                                    color={hasAcceptedLegal ? "#22d3ee" : "#94a3b8"}
                                />
                                <Text style={styles.legalText}>
                                    J’accepte les{" "}
                                    <Text
                                        style={styles.legalLink}
                                        onPress={() => router.push("/terms")}
                                        accessibilityRole="link"
                                    >
                                        Conditions Générales d’Utilisation
                                    </Text>
                                    {" "}et la{" "}
                                    <Text
                                        style={styles.legalLink}
                                        onPress={() => router.push("/terms")}
                                        accessibilityRole="link"
                                    >
                                        Politique de Confidentialité
                                    </Text>
                                    {" "}et je consens explicitement au traitement de mes données personnelles et sportives.
                                </Text>
                            </Pressable>
                            {!hasAcceptedLegal ? (
                                <Text style={styles.legalHint}>Obligatoire pour finaliser l’inscription.</Text>
                            ) : null}
                        </View>

                        <Button
                            mode="contained"
                            onPress={handleSubmit}
                            loading={loading}
                            disabled={loading || !hasAcceptedLegal}
                            style={styles.button}
                            contentStyle={{ paddingVertical: 10 }}
                        >
                            Finaliser l'inscription
                        </Button>
                    </LinearGradient>
                    {!isCoach && activePicker ? (
                        <View style={styles.dropdownPortal} pointerEvents="box-none">
                            <Pressable style={styles.dropdownBackdrop} onPress={() => setActivePicker(null)} />
                            <View style={styles.dropdownCard}>
                                <View style={styles.dropdownCardHeader}>
                                    <Text style={styles.dropdownCardTitle}>
                                        {activePicker === "group" ? "Choisir une famille" : "Choisir une discipline"}
                                    </Text>
                                    <Pressable style={styles.dropdownClose} onPress={() => setActivePicker(null)}>
                                        <Ionicons name="close" size={18} color="#e2e8f0" />
                                    </Pressable>
                                </View>
                                <ScrollView style={{ maxHeight: 320 }}>
                                    {(activePicker === "group" ? DISCIPLINE_GROUPS : disciplineOptions).map((item) => {
                                        const value = activePicker === "group" ? (item as any).id : (item as string);
                                        const label = activePicker === "group" ? (item as any).label : (item as string);
                                        const isActive =
                                            activePicker === "group" ? value === selectedGroupId : label === selectedDiscipline;
                                        return (
                                            <Pressable
                                                key={value}
                                                style={[styles.dropdownOption, isActive && styles.dropdownOptionActive]}
                                                onPress={() => {
                                                    if (activePicker === "group") {
                                                        handleSelectGroup(value);
                                                    } else {
                                                        setSelectedDiscipline(label);
                                                        setError(null);
                                                    }
                                                    setActivePicker(null);
                                                }}
                                            >
                                                <Text
                                                    style={[styles.dropdownOptionText, isActive && styles.dropdownOptionTextActive]}
                                                    numberOfLines={1}
                                                >
                                                    {label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        </View>
                    ) : null}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "transparent",
    },
    flex: {
        flex: 1,
    },
    container: {
        padding: 20,
        paddingBottom: 40,
        flexGrow: 1,
        justifyContent: "center",
    },
    card: {
        borderRadius: 24,
        padding: 20,
        gap: 16,
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.25)",
        backgroundColor: "rgba(2,6,23,0.9)",
    },
    cardHeader: {
        gap: 8,
    },
    navBar: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.25)",
        backgroundColor: "rgba(15,23,42,0.7)",
        marginBottom: 6,
        shadowColor: "#0ea5e9",
        shadowOpacity: 0.16,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
    },
    navButtonsWrap: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    navButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.35)",
        backgroundColor: "rgba(15,23,42,0.35)",
        alignItems: "center",
        justifyContent: "center",
    },
    navButtonPrimary: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#22d3ee",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#22d3ee",
        shadowOpacity: 0.25,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
    },
    navButtonPrimaryDisabled: {
        opacity: 0.5,
    },
    progressWrap: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    progressDot: {
        width: 22,
        height: 6,
        borderRadius: 999,
        backgroundColor: "rgba(148,163,184,0.35)",
    },
    progressDotActive: {
        backgroundColor: "#22d3ee",
        shadowColor: "#22d3ee",
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
    },
    stepPill: {
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "rgba(34,211,238,0.15)",
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.35)",
    },
    stepText: {
        color: "#22d3ee",
        fontWeight: "700",
        fontSize: 12,
    },
    headerTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    title: {
        color: "#f8fafc",
        fontSize: 20,
        fontWeight: "800",
    },
    subtitle: {
        color: "#cbd5e1",
        fontSize: 14,
    },
    fieldGroup: {
        gap: 10,
    },
    sectionLabel: {
        color: "#e2e8f0",
        fontWeight: "700",
        fontSize: 14,
    },
    dropdown: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
        backgroundColor: "rgba(15,23,42,0.65)",
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
    },
    dropdownValue: {
        color: "#f8fafc",
        fontWeight: "700",
        flex: 1,
    },
    dropdownPlaceholder: {
        color: "#94a3b8",
        fontStyle: "italic",
        flex: 1,
    },
    input: {
        backgroundColor: "rgba(15,23,42,0.6)",
    },
    button: {
        marginTop: 6,
        borderRadius: 14,
        backgroundColor: "#22d3ee",
    },
    secondaryButton: {
        marginTop: 10,
        borderRadius: 14,
        borderColor: "#22d3ee",
    },
    error: {
        color: "#f97316",
        fontSize: 13,
    },
    helperText: {
        color: "#cbd5e1",
        fontSize: 13,
        lineHeight: 18,
    },
    helper: {
        color: "#cbd5e1",
        fontSize: 13,
        lineHeight: 18,
    },
    legalWrap: {
        gap: 6,
        marginTop: 6,
    },
    legalRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
        backgroundColor: "rgba(15,23,42,0.55)",
    },
    legalRowPressed: {
        opacity: 0.9,
    },
    legalText: {
        flex: 1,
        color: "#cbd5e1",
        fontSize: 12,
        lineHeight: 18,
    },
    legalLink: {
        color: "#22d3ee",
        fontWeight: "800",
    },
    legalHint: {
        color: "#94a3b8",
        fontSize: 12,
        lineHeight: 16,
        paddingHorizontal: 2,
    },
    dropdownPortal: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 20,
    },
    dropdownBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.35)",
    },
    dropdownCard: {
        width: "88%",
        maxWidth: 380,
        borderRadius: 18,
        backgroundColor: "rgba(15,23,42,0.9)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
        paddingHorizontal: 14,
        paddingVertical: 12,
        shadowColor: "#0ea5e9",
        shadowOpacity: 0.2,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 14 },
        gap: 8,
    },
    dropdownCardHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    dropdownCardTitle: {
        color: "#e2e8f0",
        fontWeight: "700",
        fontSize: 16,
    },
    dropdownClose: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(148,163,184,0.15)",
    },
    dropdownOption: {
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 12,
        marginBottom: 6,
        backgroundColor: "rgba(15,23,42,0.6)",
        borderWidth: 1,
        borderColor: "transparent",
    },
    dropdownOptionActive: {
        borderColor: "#22d3ee",
        backgroundColor: "rgba(34,211,238,0.15)",
    },
    dropdownOptionText: {
        color: "#e2e8f0",
        fontWeight: "600",
    },
    dropdownOptionTextActive: {
        color: "#0f172a",
    },
});
