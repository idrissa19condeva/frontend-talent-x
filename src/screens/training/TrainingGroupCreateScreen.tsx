import React, { useCallback, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button, Dialog, Portal, Text, TextInput } from "react-native-paper";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { createTrainingGroup } from "../../api/groupService";

export default function TrainingGroupCreateScreen() {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [step, setStep] = useState<1 | 2>(1);
    const [submitting, setSubmitting] = useState(false);
    const [systemDialogVisible, setSystemDialogVisible] = useState(false);
    const [systemDialogTitle, setSystemDialogTitle] = useState("");
    const [systemDialogMessage, setSystemDialogMessage] = useState("");
    const [systemDialogTone, setSystemDialogTone] = useState<"info" | "error">("info");
    const [successDialogVisible, setSuccessDialogVisible] = useState(false);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const canProceed = useMemo(() => Boolean(name.trim()), [name]);

    const showSystemDialog = useCallback((title: string, message: string, tone: "info" | "error" = "info") => {
        setSystemDialogTitle(title);
        setSystemDialogMessage(message);
        setSystemDialogTone(tone);
        setSystemDialogVisible(true);
    }, []);

    const goToStep = (target: 1 | 2) => {
        if (target === 1) {
            setStep(1);
            return;
        }
        if (!canProceed) {
            showSystemDialog("Complétez l'étape 1", "Ajoutez un nom de groupe avant de passer aux invitations.", "info");
            return;
        }
        setStep(2);
    };

    const handleNextStep = () => {
        if (canProceed) {
            setStep(2);
        } else {
            showSystemDialog("Nom requis", "Merci de renseigner un nom de groupe.", "info");
        }
    };

    const handleSubmit = useCallback(async () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            showSystemDialog("Nom requis", "Merci de renseigner un nom de groupe.", "info");
            return;
        }
        try {
            setSubmitting(true);
            await createTrainingGroup({ name: trimmedName, description: description.trim() || undefined });
            setSuccessDialogVisible(true);
        } catch (error: any) {
            const message = error?.response?.data?.message || error?.message || "Création impossible";
            showSystemDialog("Erreur", message, "error");
        } finally {
            setSubmitting(false);
        }
    }, [description, name, showSystemDialog]);

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
            <Portal>
                <Dialog
                    visible={systemDialogVisible}
                    onDismiss={() => setSystemDialogVisible(false)}
                    style={styles.systemDialog}
                >
                    <Dialog.Title>
                        <View style={styles.systemDialogTitleRow}>
                            <MaterialCommunityIcons
                                name={systemDialogTone === "error" ? "alert-circle-outline" : "information-outline"}
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
                        <Button onPress={() => setSystemDialogVisible(false)} textColor="#67e8f9">
                            OK
                        </Button>
                    </Dialog.Actions>
                </Dialog>

                <Dialog
                    visible={successDialogVisible}
                    onDismiss={() => setSuccessDialogVisible(false)}
                    style={styles.successDialog}
                >
                    <Dialog.Title>
                        <View style={styles.successDialogTitleRow}>
                            <MaterialCommunityIcons name="check-circle-outline" size={18} color="#22d3ee" />
                            <Text style={styles.successDialogTitle}>Groupe créé</Text>
                        </View>
                    </Dialog.Title>
                    <Dialog.Content>
                        <Text style={styles.successDialogText}>
                            Votre groupe est prêt. Partagez son nom pour que les athlètes le rejoignent.
                        </Text>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button
                            onPress={() => {
                                setSuccessDialogVisible(false);
                                if (router.canGoBack?.()) {
                                    router.back();
                                } else {
                                    router.replace("/(main)/training/groups");
                                }
                            }}
                            textColor="#67e8f9"
                        >
                            OK
                        </Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={{ flex: 1 }}
                keyboardVerticalOffset={80}
            >
                <ScrollView
                    contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom + 12, 20) }]}
                    keyboardShouldPersistTaps="handled"
                >
                    <LinearGradient colors={["#0f172a", "#0b1220"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
                        <Text style={styles.heroTitle}>Créez votre groupe</Text>

                        <View style={styles.heroSteps}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => goToStep(1)}
                                style={[styles.heroStepBase, step === 1 ? styles.heroStepActive : styles.heroStepIdle]}
                            >
                                <Text style={step === 1 ? styles.stepLabel : styles.stepLabelMuted}>Étape 1</Text>
                                <Text style={step === 1 ? styles.stepTitle : styles.stepTitleMuted}>Identité</Text>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => goToStep(2)}
                                style={[
                                    styles.heroStepBase,
                                    step === 2 ? styles.heroStepActive : styles.heroStepIdle,
                                    !canProceed && step !== 2 ? styles.heroStepDisabled : null,
                                ]}
                            >
                                <Text style={step === 2 ? styles.stepLabel : styles.stepLabelMuted}>Étape 2</Text>
                                <Text style={step === 2 ? styles.stepTitle : styles.stepTitleMuted}>Invitations</Text>
                            </Pressable>
                        </View>
                    </LinearGradient>

                    <View style={styles.formSection}>
                        {step === 1 ? (
                            <>

                                <View style={styles.card}>
                                    <View style={styles.inputLabelRow}>
                                        <Text style={styles.inputLabel}>Nom du groupe</Text>
                                        <Text style={styles.inputHelper}>Obligatoire</Text>
                                    </View>
                                    <TextInput
                                        value={name}
                                        onChangeText={setName}
                                        mode="outlined"
                                        style={styles.input}
                                        placeholder="Ex: Couloir V"
                                        autoCapitalize="words"
                                        autoCorrect
                                        disabled={submitting}
                                    />
                                    <Text style={styles.inputLabel}>Description (optionnel)</Text>
                                    <TextInput
                                        value={description}
                                        onChangeText={setDescription}
                                        mode="outlined"
                                        style={[styles.input, styles.textarea]}
                                        multiline
                                        numberOfLines={4}
                                        placeholder="Disciplines, créneaux…"
                                        disabled={submitting}
                                    />


                                    <Button
                                        mode="contained"
                                        onPress={handleNextStep}
                                        disabled={submitting}
                                        buttonColor="#22d3ee"
                                        textColor="#02111f"
                                        style={styles.submitButton}
                                    >
                                        Continuer
                                    </Button>
                                </View>
                            </>
                        ) : (
                            <>


                                <View style={styles.card}>
                                    <Text style={styles.summaryLabel}>Aperçu du groupe</Text>
                                    <View style={styles.summaryCard}>
                                        <View style={styles.summaryIcon}>
                                            <Text style={styles.summaryInitial}>{name.trim().slice(0, 1).toUpperCase() || "G"}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.summaryName}>{name.trim() || "Nom à définir"}</Text>
                                            {description ? (
                                                <Text style={styles.summaryDescription}>{description}</Text>
                                            ) : (
                                                <Text style={styles.summaryDescriptionMuted}>Ajoutez une description pour inspirer.</Text>
                                            )}
                                        </View>
                                    </View>



                                    <View style={styles.inviteTip}>
                                        <MaterialCommunityIcons name="information" size={18} color="#f97316" />
                                        <Text style={styles.inviteTipText}>
                                            Une fois le groupe publié, vos athlètes pourront le retrouver via la recherche.
                                        </Text>
                                    </View>

                                    <Button
                                        mode="contained"
                                        onPress={handleSubmit}
                                        disabled={submitting}
                                        loading={submitting}
                                        buttonColor="#22d3ee"
                                        textColor="#02111f"
                                        style={styles.submitButton}
                                    >
                                        Créer mon groupe
                                    </Button>

                                </View>
                            </>
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#020617",
    },
    container: {
        paddingHorizontal: 14,
        paddingTop: 14,
        paddingBottom: 0,
        gap: 24,
    },
    hero: {
        borderRadius: 30,
        padding: 24,
        gap: 14,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
    },
    heroOverline: {
        color: "#67e8f9",
        letterSpacing: 1.5,
        textTransform: "uppercase",
        fontSize: 12,
    },
    heroTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: "#f8fafc",
    },
    heroSubtitle: {
        color: "#cbd5e1",
        lineHeight: 20,
    },
    heroSteps: {
        flexDirection: "row",
        gap: 10,
    },
    heroStepBase: {
        flex: 1,
        borderRadius: 18,
        paddingVertical: 2,
        alignItems: "center",
        borderWidth: 1,
    },
    heroStepActive: {
        backgroundColor: "#22d3ee",
        borderColor: "#22d3ee",
    },
    heroStepIdle: {
        backgroundColor: "transparent",
        borderColor: "rgba(148,163,184,0.35)",
    },
    heroStepDisabled: {
        opacity: 0.5,
    },
    stepLabel: {
        color: "#0f172a",
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 1.2,
    },
    stepTitle: {
        color: "#0f172a",
        fontWeight: "700",
    },
    stepLabelMuted: {
        color: "#94a3b8",
        fontSize: 12,
        letterSpacing: 1.2,
    },
    stepTitleMuted: {
        color: "#cbd5e1",
        fontWeight: "700",
    },
    formSection: {
        gap: 14,
    },
    formHeader: {
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
    },
    formHeaderIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: "#22d3ee",
        alignItems: "center",
        justifyContent: "center",
    },
    formHeaderIconSecondary: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: "rgba(56,189,248,0.15)",
        alignItems: "center",
        justifyContent: "center",
    },
    formTitle: {
        color: "#f8fafc",
        fontSize: 18,
        fontWeight: "700",
    },
    formSubtitle: {
        color: "#94a3b8",
    },
    card: {
        borderRadius: 20,
        padding: 16,
        backgroundColor: "rgba(15,23,42,0.85)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        gap: 14,
    },
    input: {
        backgroundColor: "transparent",
    },
    textarea: {
        minHeight: 110,
        textAlignVertical: "top",
    },
    inputLabelRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    inputLabel: {
        color: "#cbd5e1",
        fontWeight: "600",
    },
    inputHelper: {
        color: "#22d3ee",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    tipsCard: {
        flexDirection: "row",
        gap: 10,
        borderRadius: 14,
        padding: 12,
        backgroundColor: "rgba(250,204,21,0.1)",
        borderWidth: 1,
        borderColor: "rgba(250,204,21,0.4)",
        alignItems: "center",
    },
    tipsTitle: {
        color: "#facc15",
        fontWeight: "700",
    },
    tipsText: {
        color: "#fef9c3",
        fontSize: 13,
    },
    submitButton: {
        marginTop: 4,
        borderRadius: 16,
        paddingVertical: 4,
    },
    summaryLabel: {
        color: "#94a3b8",
        fontSize: 12,
        letterSpacing: 1.2,
        textTransform: "uppercase",
    },
    summaryCard: {
        flexDirection: "row",
        gap: 12,
        marginTop: 10,
        padding: 14,
        borderRadius: 18,
        backgroundColor: "rgba(2,6,23,0.6)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
    },
    summaryIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: "rgba(34,211,238,0.15)",
        alignItems: "center",
        justifyContent: "center",
    },
    summaryInitial: {
        color: "#22d3ee",
        fontSize: 20,
        fontWeight: "700",
    },
    summaryName: {
        color: "#f8fafc",
        fontSize: 18,
        fontWeight: "700",
    },
    summaryDescription: {
        color: "#cbd5e1",
        marginTop: 2,
    },
    summaryDescriptionMuted: {
        color: "#94a3b8",
        marginTop: 2,
    },
    shareCard: {
        flexDirection: "row",
        gap: 12,
        alignItems: "flex-start",
        marginTop: 16,
        padding: 14,
        borderRadius: 16,
        backgroundColor: "rgba(56,189,248,0.08)",
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.4)",
    },
    shareLabel: {
        color: "#38bdf8",
        fontWeight: "700",
        marginBottom: 4,
    },
    shareText: {
        color: "#e2e8f0",
        lineHeight: 20,
    },
    inviteTip: {
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        marginTop: 12,
        padding: 10,
        borderRadius: 12,
        backgroundColor: "rgba(249,115,22,0.1)",
    },
    inviteTipText: {
        flex: 1,
        color: "#fed7aa",
        fontSize: 13,
    },
    systemDialog: {
        backgroundColor: "rgba(15,23,42,0.98)",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
    },
    systemDialogTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    systemDialogTitle: {
        color: "#f8fafc",
        fontSize: 16,
        fontWeight: "700",
    },
    systemDialogText: {
        color: "#cbd5e1",
        lineHeight: 20,
    },
    successDialog: {
        backgroundColor: "rgba(15,23,42,0.98)",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
    },
    successDialogTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    successDialogTitle: {
        color: "#f8fafc",
        fontSize: 16,
        fontWeight: "700",
    },
    successDialogText: {
        color: "#cbd5e1",
        lineHeight: 20,
    },
});
