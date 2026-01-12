import React, { useState } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { Text, TextInput, Button } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";

type AuthFormProps = {
    type: "login" | "signup";
    onSubmit: (form: {
        firstName?: string;
        lastName?: string;
        email: string;
        password: string;
    }) => Promise<void>;
    successMessage?: string;
    initialValues?: {
        firstName?: string;
        lastName?: string;
        email?: string;
        password?: string;
    };
    submitLabel?: string;
    suppressSuccessToast?: boolean;
    includeNames?: boolean;
    includeEmail?: boolean;
    includePassword?: boolean;
};

export default function AuthForm({
    type,
    onSubmit,
    successMessage,
    initialValues,
    submitLabel,
    suppressSuccessToast,
    includeNames = true,
    includeEmail = true,
    includePassword = true,
}: AuthFormProps) {
    const testIDs = {
        form: "auth-form",
        firstName: "auth-firstName",
        lastName: "auth-lastName",
        email: "auth-email",
        password: "auth-password",
        confirm: "auth-confirm",
        passwordToggle: "auth-password-toggle",
        confirmToggle: "auth-confirm-toggle",
        submit: "auth-submit",
    };

    const [firstName, setFirstName] = useState(initialValues?.firstName ?? "");
    const [lastName, setLastName] = useState(initialValues?.lastName ?? "");
    const [email, setEmail] = useState(initialValues?.email ?? "");
    const [password, setPassword] = useState(initialValues?.password ?? "");
    const [confirm, setConfirm] = useState(initialValues?.password ?? "");

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const [errors, setErrors] = useState<{
        firstName?: string;
        lastName?: string;
        email?: string;
        password?: string;
        confirm?: string;
        form?: string;
    }>({});
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

    const [toast] = useState(new Animated.Value(0));
    const [toastMessage, setToastMessage] = useState("");
    const [toastColor, setToastColor] = useState("#22c55e");

    const [successAnim] = useState(new Animated.Value(0));

    // Only trim leading/trailing whitespace when validating/submitting.
    // Never trim while the user is typing (so multi-word names work).
    const trimEdges = (value?: string) => value?.trim?.() ?? "";
    const sanitizedFields = () => ({
        firstName: trimEdges(firstName),
        lastName: trimEdges(lastName),
        email: trimEdges(email),
        password: trimEdges(password),
        confirm: trimEdges(confirm),
    });

    // ✅ Toast animé
    const showToast = (message: string, success = true) => {
        setToastMessage(message);
        setToastColor(success ? "#22c55e" : "#ef4444");

        Animated.sequence([
            Animated.timing(toast, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2000),
            Animated.timing(toast, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start();
    };

    // Hydrate state if initialValues change (when returning to a previous step)
    React.useEffect(() => {
        if (!initialValues) return;
        setFirstName(initialValues.firstName ?? "");
        setLastName(initialValues.lastName ?? "");
        setEmail(initialValues.email ?? "");
        setPassword(initialValues.password ?? "");
        setConfirm(initialValues.password ?? "");
    }, [initialValues?.firstName, initialValues?.lastName, initialValues?.email, initialValues?.password]);

    // ✅ Validation du formulaire
    const validateFields = () => {
        const { firstName: fn, lastName: ln, email: em, password: pw, confirm: cf } = sanitizedFields();
        const newErrors: Record<string, string> = {};
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const passRegex = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{6,}$/;

        if (includeEmail && !emailRegex.test(em)) newErrors.email = "Email invalide";

        if (type === "signup") {
            if (includeNames) {
                if (!fn) newErrors.firstName = "Prénom requis";
                if (!ln) newErrors.lastName = "Nom requis";
            }
            if (includePassword) {
                if (!passRegex.test(pw)) {
                    newErrors.password = "6+ caractères, 1 majuscule, 1 chiffre, 1 symbole";
                }
                if (pw !== cf) {
                    newErrors.confirm = "Les mots de passe ne correspondent pas";
                }
            }
        } else {
            if (includePassword && !pw?.length) {
                newErrors.password = "Mot de passe requis";
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const extractErrorMessage = (err: any) => {
        const data = err?.response?.data;
        const status = err?.response?.status;
        const candidate = data?.message || data?.error || (Array.isArray(data) ? data[0] : null);

        // Masquer les détails pour la connexion : toujours générique sur 400/401
        if (type === "login" && (status === 400 || status === 401)) {
            return "Email ou mot de passe incorrect";
        }

        if (typeof candidate === "string" && candidate.trim().length) return candidate;
        if (status === 400 || status === 401) return "Erreur lors de l’opération";
        return "Erreur lors de l’opération";
    };

    // ✅ Soumission
    const handleSubmit = async () => {
        setSubmitted(true);
        if (!validateFields()) return;

        setLoading(true);
        try {
            const { firstName: fn, lastName: ln, email: em, password: pw, confirm: cf } = sanitizedFields();
            await onSubmit({
                firstName: fn,
                lastName: ln,
                email: em,
                password: pw,
            });
            if (!suppressSuccessToast) {
                showToast(
                    successMessage || (type === "login" ? "Connexion réussie 🎉" : "Inscription réussie 🎯"),
                    true
                );

                Animated.sequence([
                    Animated.timing(successAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
                    Animated.delay(1000),
                    Animated.timing(successAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
                ]).start();
            }
        } catch (e: any) {
            const field = e?.field as keyof typeof errors | undefined;
            const directMessage = typeof e?.message === "string" ? e.message : undefined;

            if (field) {
                setSubmitted(true);
                setErrors((prev) => ({
                    ...prev,
                    [field]: directMessage || "Erreur lors de l’opération",
                }));
                return;
            }

            const message = extractErrorMessage(e);
            console.log("❌ Erreur capturée dans AuthForm:", e?.response?.data || e.message || e);

            // On login, show incorrect credentials inline (under password) instead of a toast.
            const status = e?.response?.status;
            if (type === "login" && (status === 400 || status === 401)) {
                setSubmitted(true);
                setErrors((prev) => ({
                    ...prev,
                    form: message,
                }));
                return;
            }

            showToast(message, false);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.form} testID={testIDs.form}>
            {/* ✅ Toast animé */}
            <Animated.View
                style={[
                    styles.toast,
                    {
                        backgroundColor: toastColor,
                        opacity: toast,
                        transform: [
                            {
                                translateY: toast.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [-80, 0],
                                }),
                            },
                        ],
                    },
                ]}
            >
                <Text style={styles.toastText}>{toastMessage}</Text>
            </Animated.View>

            {type === "signup" && includeNames && (
                <TextInput
                    label="Prénom"
                    value={firstName}
                    onChangeText={setFirstName}
                    style={styles.input}
                    mode="outlined"
                    outlineStyle={styles.inputOutline}
                    textColor="#f8fafc"
                    placeholderTextColor="#94a3b8"
                    left={<TextInput.Icon icon="account" />}
                    error={submitted && !!errors.firstName}
                    testID={testIDs.firstName}
                />
            )}

            {submitted && errors.firstName && <Text style={styles.error}>{errors.firstName}</Text>}

            {type === "signup" && includeNames && (
                <TextInput
                    label="Nom"
                    value={lastName}
                    onChangeText={setLastName}
                    style={styles.input}
                    mode="outlined"
                    outlineStyle={styles.inputOutline}
                    textColor="#f8fafc"
                    placeholderTextColor="#94a3b8"
                    left={<TextInput.Icon icon="account" />}
                    error={submitted && !!errors.lastName}
                    testID={testIDs.lastName}
                />
            )}

            {submitted && errors.lastName && <Text style={styles.error}>{errors.lastName}</Text>}

            {includeEmail && (
                <>
                    <TextInput
                        label="Email"
                        value={email}
                        onChangeText={(value) => {
                            setEmail(value);
                            if (errors.form) setErrors((prev) => ({ ...prev, form: undefined }));
                        }}
                        style={styles.input}
                        mode="outlined"
                        left={<TextInput.Icon icon="email" />}
                        outlineStyle={styles.inputOutline}
                        textColor="#f8fafc"
                        placeholderTextColor="#94a3b8"
                        error={submitted && !!errors.email}
                        multiline={false}
                        numberOfLines={1}
                        autoCorrect={false}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        textContentType="emailAddress"
                        inputMode="email"
                        testID={testIDs.email}
                    />
                    {submitted && errors.email && <Text style={styles.error}>{errors.email}</Text>}
                </>
            )}

            {includePassword && (
                <>
                    <TextInput
                        label="Mot de passe"
                        value={password}
                        onChangeText={(value) => {
                            setPassword(value);
                            if (errors.form) setErrors((prev) => ({ ...prev, form: undefined }));
                        }}
                        secureTextEntry={!showPassword}
                        style={styles.input}
                        mode="outlined"
                        left={<TextInput.Icon icon="lock" />}
                        right={
                            <TextInput.Icon
                                icon={showPassword ? "eye-off" : "eye"}
                                onPress={() => setShowPassword((prev) => !prev)}
                                testID={testIDs.passwordToggle}
                            />
                        }
                        outlineStyle={styles.inputOutline}
                        textColor="#f8fafc"
                        placeholderTextColor="#94a3b8"
                        error={submitted && !!errors.password}
                        testID={testIDs.password}
                    />
                    {submitted && errors.password && (
                        <Text style={styles.error}>{errors.password}</Text>
                    )}

                    {type === "login" && submitted && errors.form && (
                        <Text style={styles.error}>{errors.form}</Text>
                    )}
                </>
            )}

            {type === "signup" && includePassword && (
                <>
                    <TextInput
                        label="Confirmer le mot de passe"
                        value={confirm}
                        onChangeText={setConfirm}
                        secureTextEntry={!showConfirm}
                        style={styles.input}
                        mode="outlined"
                        left={<TextInput.Icon icon="lock-check" />}
                        right={
                            <TextInput.Icon
                                icon={showConfirm ? "eye-off" : "eye"}
                                onPress={() => setShowConfirm((prev) => !prev)}
                                testID={testIDs.confirmToggle}
                            />
                        }
                        outlineStyle={styles.inputOutline}
                        textColor="#f8fafc"
                        placeholderTextColor="#94a3b8"
                        error={submitted && !!errors.confirm}
                        testID={testIDs.confirm}
                    />
                    {submitted && errors.confirm && (
                        <Text style={styles.error}>{errors.confirm}</Text>
                    )}
                </>
            )}

            <Button
                mode="contained"
                onPress={handleSubmit}
                loading={loading}
                disabled={loading}
                style={styles.button}
                contentStyle={{ paddingVertical: 6 }}
                testID={testIDs.submit}
            >
                {submitLabel || (type === "login" ? "Se connecter" : "S'inscrire")}
            </Button>

            {/* ✅ Check animé */}
            <Animated.View
                style={[
                    styles.checkContainer,
                    { opacity: successAnim, transform: [{ scale: successAnim }] },
                ]}
            >
                <Ionicons name="checkmark-circle" size={70} color="#10b981" />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    form: {
        width: "100%",
        padding: 24,
        borderRadius: 26,
        backgroundColor: "rgba(15,23,42,0.72)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
    },
    input: {
        marginBottom: 12,
        backgroundColor: "rgba(15,23,42,0.45)",
    },
    inputOutline: {
        borderRadius: 16,
        borderColor: "rgba(148,163,184,0.4)",
    },
    button: {
        marginTop: 10,
        borderRadius: 16,
        backgroundColor: "#22d3ee",
    },
    error: {
        color: "#ef4444",
        fontSize: 13,
        marginBottom: 8,
    },
    checkContainer: {
        position: "absolute",
        alignSelf: "center",
        top: "40%",
    },
    toast: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        paddingVertical: 10,
        alignItems: "center",
        zIndex: 10,
    },
    toastText: {
        color: "#fff",
        fontWeight: "600",
    },
});
