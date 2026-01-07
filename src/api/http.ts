import axios, { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import * as SecureStore from "expo-secure-store";

import { API_URL } from "./config";

const client: AxiosInstance = axios.create({
    baseURL: API_URL,
    timeout: 20000,
});

const ACCESS_KEY = "token";
const REFRESH_KEY = "refreshToken";
const REFRESH_ENDPOINT = "/auth/refresh";

const getAccessToken = async () => SecureStore.getItemAsync(ACCESS_KEY);
const getRefreshToken = async () => SecureStore.getItemAsync(REFRESH_KEY);
const setAccessToken = async (token?: string | null) => {
    if (token) return SecureStore.setItemAsync(ACCESS_KEY, token);
    return SecureStore.deleteItemAsync(ACCESS_KEY);
};
const setRefreshToken = async (token?: string | null) => {
    if (token) return SecureStore.setItemAsync(REFRESH_KEY, token);
    return SecureStore.deleteItemAsync(REFRESH_KEY);
};

let refreshPromise: Promise<string | null> | null = null;
let isRefreshing = false;

client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    if (__DEV__) {
        const url = String(config.url || "");
        const baseURL = String((config as any).baseURL || "");
        const full = url.startsWith("http") ? url : `${baseURL}${url}`;
        console.debug("HTTP →", config.method?.toUpperCase(), full);
    }

    const token = await getAccessToken();
    if (token) {
        const headers = (config.headers ?? {}) as Record<string, any>;
        headers.Authorization = `Bearer ${token}`;
        config.headers = headers as any;
    }
    return config;
});

client.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
        if (__DEV__) {
            const cfg: any = error.config || {};
            const url = String(cfg.url || "");
            const baseURL = String(cfg.baseURL || "");
            const full = url.startsWith("http") ? url : `${baseURL}${url}`;
            const status = error.response?.status;
            console.warn("HTTP ✖", status ?? "(no response)", full, error.message);
        }

        const status = error.response?.status;
        const originalRequest: any = error.config;

        if (status === 401 && originalRequest && !originalRequest._retry) {
            const isRefreshCall = originalRequest?.url?.includes(REFRESH_ENDPOINT);
            if (isRefreshCall) {
                await setAccessToken(null);
                await setRefreshToken(null);
                return Promise.reject(error);
            }

            if (!isRefreshing) {
                isRefreshing = true;
                refreshPromise = (async () => {
                    const refreshToken = await getRefreshToken();
                    if (!refreshToken) return null;
                    try {
                        const res = await axios.post(`${API_URL}${REFRESH_ENDPOINT}`, { refreshToken });
                        const newToken = (res.data as any)?.token;
                        const newRefresh = (res.data as any)?.refreshToken;
                        if (newToken) await setAccessToken(newToken);
                        if (newRefresh) await setRefreshToken(newRefresh);
                        return newToken ?? null;
                    } catch (err) {
                        await setAccessToken(null);
                        await setRefreshToken(null);
                        return null;
                    } finally {
                        isRefreshing = false;
                    }
                })();
            }

            const newAccess = await refreshPromise;
            if (newAccess) {
                originalRequest._retry = true;
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers.Authorization = `Bearer ${newAccess}`;
                return client(originalRequest);
            }
        }

        return Promise.reject(error);
    },
);

export default client;
export { getAccessToken, getRefreshToken, setAccessToken, setRefreshToken };
