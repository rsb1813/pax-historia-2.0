// 앱 진입점 게이트 — 세션 조회 후 부트스트랩/로그인/인증완료 화면을 분기한다
import { useEffect, useState } from "react";
import { getSessionState } from "../runtime/auth.js";
import { loadAccountSettings, loadAiKeyStatus } from "../runtime/accountSettings.js";
import SetupScreen from "./SetupScreen.jsx";
import LoginScreen from "./LoginScreen.jsx";

const loadingShellStyle = {
    position: "fixed",
    inset: 0,
    backgroundColor: "#0b1020",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20000,
    fontFamily: "sans-serif",
    color: "rgba(255,255,255,0.6)",
    fontSize: "0.9rem",
};

const AuthGate = ({ children }) => {
    // null while the initial /api/auth/session fetch is pending.
    const [authState, setAuthState] = useState(null);
    const [error, setError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    // Account settings/AI key status are loaded once right after auth resolves
    // so every synchronous consumer (useMapSetting, getStoredProvider, ...)
    // sees a warm cache on children's first render instead of transient
    // defaults.
    const [settingsReady, setSettingsReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setError(null);

        getSessionState()
            .then((state) => {
                if (!cancelled) setAuthState(state);
            })
            .catch((err) => {
                console.error("Session check failed:", err);
                if (!cancelled) setError(err);
            });

        return () => {
            cancelled = true;
        };
    }, [attempt]);

    useEffect(() => {
        if (!authState?.authenticated) return;

        let cancelled = false;
        setSettingsReady(false);

        // Fail-open: a settings-load hiccup should never strand an already
        // logged-in player behind an infinite loading screen — the caches
        // just fall back to their built-in defaults.
        Promise.all([loadAccountSettings(), loadAiKeyStatus()])
            .catch((err) => {
                console.error("Failed to load account settings:", err);
            })
            .finally(() => {
                if (!cancelled) setSettingsReady(true);
            });

        return () => {
            cancelled = true;
        };
    }, [authState]);

    // Login/Setup call this after a successful login/register. Rather than
    // trusting their response, re-run the same /api/auth/session check this
    // gate started with, so the render decision is always server-verified.
    const handleAuthenticated = () => {
        setAttempt((n) => n + 1);
    };

    if (error) {
        // Could not verify the session (e.g. server unreachable). Don't strand
        // the user on a dead-end error screen — fall through to LoginScreen so
        // a working /api/auth/login can still get them in.
        return <LoginScreen onAuthenticated={handleAuthenticated} />;
    }

    if (!authState) {
        return <div style={loadingShellStyle}>Loading…</div>;
    }

    if (!authState.hasUsers) {
        return <SetupScreen onAuthenticated={handleAuthenticated} />;
    }

    if (!authState.authenticated) {
        return <LoginScreen onAuthenticated={handleAuthenticated} />;
    }

    if (!settingsReady) {
        return <div style={loadingShellStyle}>Loading…</div>;
    }

    return children;
};

export default AuthGate;
