// 앱 진입점 게이트 — 세션 조회 후 부트스트랩/로그인/인증완료 화면을 분기한다
import { useEffect, useState } from "react";
import { getSessionState } from "../runtime/auth.js";
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

    return children;
};

export default AuthGate;
