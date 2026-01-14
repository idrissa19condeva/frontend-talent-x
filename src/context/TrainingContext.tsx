import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
    createTrainingSession,
    deleteTrainingSession,
    getTrainingSession,
    joinTrainingSession,
    listTrainingSessions,
    addParticipantToTrainingSession,
    updateTrainingSession,
    listParticipatingSessions,
    leaveTrainingSession,
    removeParticipantFromTrainingSession,
    saveTrainingSessionChronos,
} from "../api/trainingService";
import { CreateTrainingSessionPayload, TrainingChronoInput, TrainingSession } from "../types/training";
import { useAuth } from "./AuthContext";
import { cancelSessionStartReminder, scheduleSessionStartReminder } from "../utils/sessionReminders";

interface TrainingContextValue {
    sessions: Record<string, TrainingSession>;
    createSession: (payload: CreateTrainingSessionPayload) => Promise<TrainingSession>;
    updateSession: (id: string, payload: CreateTrainingSessionPayload) => Promise<TrainingSession>;
    fetchSession: (id: string) => Promise<TrainingSession>;
    getSessionFromCache: (id: string) => TrainingSession | undefined;
    fetchAllSessions: () => Promise<TrainingSession[]>;
    fetchParticipantSessions: () => Promise<TrainingSession[]>;
    deleteSession: (id: string) => Promise<void>;
    joinSession: (id: string) => Promise<TrainingSession>;
    leaveSession: (id: string) => Promise<TrainingSession>;
    addParticipantToSession: (id: string, userId: string) => Promise<TrainingSession>;
    removeParticipantFromSession: (sessionId: string, participantId: string) => Promise<TrainingSession>;
    saveSessionChronos: (sessionId: string, entries: TrainingChronoInput[]) => Promise<TrainingSession>;
    ownedSessionIds: string[];
    participatingSessionIds: string[];
    ownedSessionsLoaded: boolean;
    participatingSessionsLoaded: boolean;
}

const TrainingContext = createContext<TrainingContextValue | undefined>(undefined);

export const TrainingProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const authUserId = user?._id || user?.id || null;
    const notificationsEnabled = Boolean((user as any)?.notificationsEnabled);
    const [sessions, setSessions] = useState<Record<string, TrainingSession>>({});
    const [ownedSessionIds, setOwnedSessionIds] = useState<string[]>([]);
    const [participatingSessionIds, setParticipatingSessionIds] = useState<string[]>([]);
    const [ownedSessionsLoaded, setOwnedSessionsLoaded] = useState(false);
    const [participatingSessionsLoaded, setParticipatingSessionsLoaded] = useState(false);

    useEffect(() => {
        setSessions({});
        setOwnedSessionIds([]);
        setParticipatingSessionIds([]);
        setOwnedSessionsLoaded(false);
        setParticipatingSessionsLoaded(false);
    }, [authUserId]);

    const isUserInSession = useCallback(
        (session: TrainingSession) => {
            if (!authUserId) return false;
            if (session.athleteId === authUserId) return true;
            const participants = Array.isArray(session.participants) ? session.participants : [];
            return participants.some((p) => {
                const u = (p as any)?.user;
                if (!u) return false;
                if (typeof u === "string") return u === authUserId;
                return u.id === authUserId || u._id === authUserId;
            });
        },
        [authUserId]
    );

    const syncSessionReminder = useCallback(
        async (session: TrainingSession) => {
            if (!session?.id) return;

            if (!notificationsEnabled || !isUserInSession(session) || session.status !== "planned") {
                await cancelSessionStartReminder(session.id);
                return;
            }

            await scheduleSessionStartReminder(session, 30);
        },
        [notificationsEnabled, isUserInSession]
    );

    const mergeSession = useCallback((session: TrainingSession) => {
        setSessions((prev) => ({ ...prev, [session.id]: session }));
    }, []);

    const createSession = useCallback(
        async (payload: CreateTrainingSessionPayload) => {
            const created = await createTrainingSession(payload);
            mergeSession(created);
            setOwnedSessionIds((prev) => (prev.includes(created.id) ? prev : [created.id, ...prev]));
            setOwnedSessionsLoaded(true);
            await syncSessionReminder(created);
            return created;
        },
        [mergeSession, syncSessionReminder]
    );

    const fetchSession = useCallback(
        async (id: string) => {
            const fetched = await getTrainingSession(id);
            mergeSession(fetched);
            await syncSessionReminder(fetched);
            return fetched;
        },
        [mergeSession, syncSessionReminder]
    );

    const fetchAllSessions = useCallback(async () => {
        const fetched = await listTrainingSessions();
        setSessions((prev) => {
            const next = { ...prev };
            fetched.forEach((session) => {
                next[session.id] = session;
            });
            return next;
        });
        setOwnedSessionIds(fetched.map((session) => session.id));
        setOwnedSessionsLoaded(true);

        await Promise.all(fetched.map((session) => syncSessionReminder(session)));
        return fetched;
    }, [syncSessionReminder]);

    const fetchParticipantSessions = useCallback(async () => {
        const fetched = await listParticipatingSessions();
        setSessions((prev) => {
            const next = { ...prev };
            fetched.forEach((session) => {
                next[session.id] = session;
            });
            return next;
        });
        setParticipatingSessionIds(fetched.map((session) => session.id));
        setParticipatingSessionsLoaded(true);

        await Promise.all(fetched.map((session) => syncSessionReminder(session)));
        return fetched;
    }, [syncSessionReminder]);

    const updateSession = useCallback(
        async (id: string, payload: CreateTrainingSessionPayload) => {
            const updated = await updateTrainingSession(id, payload);
            mergeSession(updated);
            await syncSessionReminder(updated);
            return updated;
        },
        [mergeSession, syncSessionReminder]
    );

    const deleteSession = useCallback(async (id: string) => {
        await deleteTrainingSession(id);
        await cancelSessionStartReminder(id);
        setSessions((prev) => {
            if (!prev[id]) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
        });
        setOwnedSessionIds((prev) => prev.filter((sessionId) => sessionId !== id));
        setParticipatingSessionIds((prev) => prev.filter((sessionId) => sessionId !== id));
    }, []);

    const joinSession = useCallback(
        async (id: string) => {
            const updated = await joinTrainingSession(id);
            mergeSession(updated);
            setParticipatingSessionIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
            setParticipatingSessionsLoaded(true);
            await syncSessionReminder(updated);
            return updated;
        },
        [mergeSession, syncSessionReminder]
    );

    const leaveSession = useCallback(
        async (id: string) => {
            const updated = await leaveTrainingSession(id);
            mergeSession(updated);
            setParticipatingSessionIds((prev) => prev.filter((sessionId) => sessionId !== id));
            await cancelSessionStartReminder(id);
            return updated;
        },
        [mergeSession]
    );

    const addParticipantToSession = useCallback(
        async (id: string, userId: string) => {
            const updated = await addParticipantToTrainingSession(id, userId);
            mergeSession(updated);
            return updated;
        },
        [mergeSession]
    );

    const removeParticipantFromSession = useCallback(
        async (sessionId: string, participantId: string) => {
            const updated = await removeParticipantFromTrainingSession(sessionId, participantId);
            mergeSession(updated);
            return updated;
        },
        [mergeSession]
    );

    const saveSessionChronos = useCallback(
        async (sessionId: string, entries: TrainingChronoInput[]) => {
            const updated = await saveTrainingSessionChronos(sessionId, entries);
            mergeSession(updated);
            return updated;
        },
        [mergeSession]
    );

    const value = useMemo(
        () => ({
            sessions,
            createSession,
            updateSession,
            fetchSession,
            getSessionFromCache: (id: string) => sessions[id],
            fetchAllSessions,
            fetchParticipantSessions,
            deleteSession,
            joinSession,
            leaveSession,
            addParticipantToSession,
            removeParticipantFromSession,
            saveSessionChronos,
            ownedSessionIds,
            participatingSessionIds,
            ownedSessionsLoaded,
            participatingSessionsLoaded,
        }),
        [
            sessions,
            createSession,
            updateSession,
            fetchSession,
            fetchAllSessions,
            fetchParticipantSessions,
            deleteSession,
            joinSession,
            leaveSession,
            addParticipantToSession,
            removeParticipantFromSession,
            saveSessionChronos,
            ownedSessionIds,
            participatingSessionIds,
            ownedSessionsLoaded,
            participatingSessionsLoaded,
        ]
    );

    return <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>;
};

export const useTraining = () => {
    const ctx = useContext(TrainingContext);
    if (!ctx) {
        throw new Error("useTraining doit être utilisé dans un TrainingProvider");
    }
    return ctx;
};
