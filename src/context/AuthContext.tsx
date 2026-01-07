import React, { createContext, useState, useEffect, useContext } from "react";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { login as apiLogin, signup as apiSignup } from "../api/authService";
import { getUserProfile } from "../api/userService";
import { User } from "../types/User";
import { normalizePersonName } from "../utils/nameFormat";

const USE_PROFILE_MOCK = process.env.EXPO_PUBLIC_USE_PROFILE_MOCK === "true";

type SignupPayload = {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    birthDate?: string;
    gender?: "male" | "female";
    role?: "athlete" | "coach";
    mainDisciplineFamily?: string;
    mainDiscipline?: string;
    licenseNumber?: string;
};

type AuthContextType = {
    user: User | null;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    token: string | null;
    refreshToken?: string | null;
    loading: boolean;
    signup: (payload: SignupPayload) => Promise<void>;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [refreshToken, setRefreshToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // 🔹 Chargement initial du token et du profil utilisateur
    useEffect(() => {
        const loadUserData = async () => {
            try {
                if (USE_PROFILE_MOCK) {
                    const profile = await getUserProfile();
                    setUser({
                        ...profile,
                        firstName: profile.firstName ? normalizePersonName(profile.firstName) : profile.firstName,
                        lastName: profile.lastName ? normalizePersonName(profile.lastName) : profile.lastName,
                        fullName: profile.fullName
                            ? normalizePersonName(profile.fullName)
                            : `${normalizePersonName(profile.firstName || "")} ${normalizePersonName(profile.lastName || "")}`.trim(),
                    });
                    setToken(null);
                    setLoading(false);
                    return;
                }
                const [savedToken, savedRefresh] = await Promise.all([
                    SecureStore.getItemAsync("token"),
                    SecureStore.getItemAsync("refreshToken"),
                ]);

                if (!savedToken || savedToken === "null") {
                    setUser(null);
                    setLoading(false);
                    return;
                }
                setToken(savedToken);
                setRefreshToken(savedRefresh || null);
                const profile = await getUserProfile();
                setUser({
                    ...profile,
                    firstName: profile.firstName ? normalizePersonName(profile.firstName) : profile.firstName,
                    lastName: profile.lastName ? normalizePersonName(profile.lastName) : profile.lastName,
                    fullName: profile.fullName
                        ? normalizePersonName(profile.fullName)
                        : `${normalizePersonName(profile.firstName || "")} ${normalizePersonName(profile.lastName || "")}`.trim(),
                });
                console.warn("✅ Utilisateur chargé depuis le stockage sécurisé");
            } catch (err) {
                const message = (err as any)?.message || "";
                const isNetworkError = typeof message === "string" && message.toLowerCase().includes("joindre le serveur");

                // Ne pas supprimer le token si le serveur est juste injoignable.
                if (isNetworkError) {
                    console.warn("⚠️ Serveur injoignable pendant le chargement du profil");
                    setUser(null);
                    return;
                }

                console.log("⚠️ Token invalide ou expiré, suppression du token...");
                await SecureStore.deleteItemAsync("token");
                await SecureStore.deleteItemAsync("refreshToken");
                setUser(null);
                setToken(null);
                setRefreshToken(null);
            } finally {
                setLoading(false);
            }
        };

        loadUserData();
    }, []);

    // 🔹 Inscription
    const signup = async ({ firstName, lastName, email, password, birthDate, gender, role, mainDisciplineFamily, mainDiscipline, licenseNumber }: SignupPayload) => {
        if (USE_PROFILE_MOCK) {
            const profile = await getUserProfile();
            setUser(profile);
            setToken(null);
            return;
        }
        const normalizedFirstName = normalizePersonName(firstName);
        const normalizedLastName = normalizePersonName(lastName);

        const data = await apiSignup({
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
            email,
            password,
            birthDate,
            gender,
            role,
            mainDisciplineFamily,
            mainDiscipline,
            licenseNumber,
        });

        // First connection after signup: show a one-time About notification in Home.
        try {
            const createdUserId = (data.user as any)?.id || (data.user as any)?._id;
            if (createdUserId) {
                await AsyncStorage.setItem(`talentx.aboutPrompt.v1:${createdUserId}`, "1");
            }
        } catch {
            // best effort
        }
        await Promise.all([
            SecureStore.setItemAsync("token", data.token),
            data.refreshToken ? SecureStore.setItemAsync("refreshToken", data.refreshToken) : SecureStore.deleteItemAsync("refreshToken"),
        ]);
        setUser({
            ...data.user,
            firstName: data.user.firstName ? normalizePersonName(data.user.firstName) : data.user.firstName,
            lastName: data.user.lastName ? normalizePersonName(data.user.lastName) : data.user.lastName,
            fullName: data.user.fullName
                ? normalizePersonName(data.user.fullName)
                : `${normalizePersonName(data.user.firstName || "")} ${normalizePersonName(data.user.lastName || "")}`.trim(),
        });
        setToken(data.token);
        setRefreshToken(data.refreshToken || null);
        try {
            const profile = await getUserProfile();
            setUser({
                ...profile,
                firstName: profile.firstName ? normalizePersonName(profile.firstName) : profile.firstName,
                lastName: profile.lastName ? normalizePersonName(profile.lastName) : profile.lastName,
                fullName: profile.fullName
                    ? normalizePersonName(profile.fullName)
                    : `${normalizePersonName(profile.firstName || "")} ${normalizePersonName(profile.lastName || "")}`.trim(),
            });
        } catch (e) {
            console.warn("Profil non rafraîchi (réseau)");
        }
    };

    // 🔹 Connexion
    const login = async (email: string, password: string) => {
        if (USE_PROFILE_MOCK) {
            const profile = await getUserProfile();
            setUser(profile);
            setToken(null);
            return;
        }
        const data = await apiLogin(email, password);
        await Promise.all([
            SecureStore.setItemAsync("token", data.token),
            data.refreshToken ? SecureStore.setItemAsync("refreshToken", data.refreshToken) : SecureStore.deleteItemAsync("refreshToken"),
        ]);
        setUser({
            ...data.user,
            firstName: data.user.firstName ? normalizePersonName(data.user.firstName) : data.user.firstName,
            lastName: data.user.lastName ? normalizePersonName(data.user.lastName) : data.user.lastName,
            fullName: data.user.fullName
                ? normalizePersonName(data.user.fullName)
                : `${normalizePersonName(data.user.firstName || "")} ${normalizePersonName(data.user.lastName || "")}`.trim(),
        });
        try {
            const profile = await getUserProfile();
            setUser({
                ...profile,
                firstName: profile.firstName ? normalizePersonName(profile.firstName) : profile.firstName,
                lastName: profile.lastName ? normalizePersonName(profile.lastName) : profile.lastName,
                fullName: profile.fullName
                    ? normalizePersonName(profile.fullName)
                    : `${normalizePersonName(profile.firstName || "")} ${normalizePersonName(profile.lastName || "")}`.trim(),
            });
        } catch (e) {
            console.warn("Profil non rafraîchi (réseau)");
        }
        setToken(data.token);
        setRefreshToken(data.refreshToken || null);
    };

    // 🔹 Déconnexion
    const logout = async () => {
        try {
            if (USE_PROFILE_MOCK) {
                setUser(null);
                setToken(null);
                return;
            }
            await SecureStore.deleteItemAsync("token");
            await SecureStore.deleteItemAsync("refreshToken");
            await SecureStore.setItemAsync("token", ""); // ✅ sécurité anti-cache
            setUser(null);
            setToken(null);
            setRefreshToken(null);
            console.log("✅ Déconnexion réussie");
        } catch (error) {
            console.error("Erreur lors de la déconnexion :", error);
        }
    };

    // 🔹 Rafraîchissement manuel du profil
    const refreshProfile = async () => {
        if (USE_PROFILE_MOCK) {
            const profile = await getUserProfile();
            setUser(profile);
            return;
        }
        if (!token) return;
        try {
            const profile = await getUserProfile();
            setUser({
                ...profile,
                firstName: profile.firstName ? normalizePersonName(profile.firstName) : profile.firstName,
                lastName: profile.lastName ? normalizePersonName(profile.lastName) : profile.lastName,
                fullName: profile.fullName
                    ? normalizePersonName(profile.fullName)
                    : `${normalizePersonName(profile.firstName || "")} ${normalizePersonName(profile.lastName || "")}`.trim(),
            });
        } catch (err) {
            console.warn("Erreur lors du rafraîchissement du profil :", err);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                setUser,
                token,
                refreshToken,
                loading,
                signup,
                login,
                logout,
                refreshProfile,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

// 🔹 Hook personnalisé pour l’utiliser facilement
export const useAuth = () => useContext(AuthContext);
