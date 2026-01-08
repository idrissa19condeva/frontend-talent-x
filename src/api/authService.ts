// src/api/authService.ts
import axios from "axios";

import { API_URL } from "./config";

// ⚠️ Si tu testes sur un vrai téléphone : remplace 10.0.2.2 par ton IP locale (ex : 192.168.1.25)

/** 🔹 Inscription utilisateur */
export const signup = async (payload: {
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
}) => {
    const response = await axios.post(`${API_URL}/auth/signup`, payload);
    return response.data;
};

/** 🔹 Vérifie si un email est déjà utilisé */
export const checkEmailExists = async (email: string) => {
    const response = await axios.get(`${API_URL}/auth/check-email`, { params: { email } });
    return Boolean(response.data?.exists);
};

/** 🔹 Vérifie si un numéro de licence est déjà utilisé */
export const checkLicenseExists = async (licenseNumber: string) => {
    const response = await axios.get(`${API_URL}/auth/check-license`, { params: { licenseNumber } });
    return Boolean(response.data?.exists);
};

/** 🔹 Demande un code email OTP */
export const requestEmailCode = async (email: string) => {
    const response = await axios.post(`${API_URL}/auth/email-code`, { email });
    return response.data;
};

/** 🔹 Vérifie le code OTP */
export const verifyEmailCode = async (email: string, code: string) => {
    const response = await axios.post(`${API_URL}/auth/email-code/verify`, { email, code });
    return response.data;
};

/** 🔹 Demande un code de réinitialisation de mot de passe */
export const requestPasswordResetCode = async (email: string) => {
    const response = await axios.post(`${API_URL}/auth/password-reset/request`, { email });
    return response.data;
};

/** 🔹 Vérifie le code de réinitialisation */
export const verifyPasswordResetCode = async (email: string, code: string) => {
    const response = await axios.post(`${API_URL}/auth/password-reset/verify`, { email, code });
    return response.data;
};

/** 🔹 Confirme la réinitialisation (code + nouveau mdp) */
export const confirmPasswordReset = async (email: string, code: string, newPassword: string) => {
    const response = await axios.post(`${API_URL}/auth/password-reset/confirm`, { email, code, newPassword });
    return response.data;
};

/** 🔹 Connexion utilisateur */
export const login = async (email: string, password: string) => {
    const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password,
    });
    return response.data;
};
