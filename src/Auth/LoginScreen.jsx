// 로그인 화면 — 이메일/비밀번호 입력, 서버가 주는 일반화된 오류 메시지 표시
import { useState } from "react";
import { login } from "../runtime/auth.js";

const shellStyle = {
    position: "fixed",
    inset: 0,
    backgroundColor: "#0b1020",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20000,
    fontFamily: "sans-serif",
    color: "white",
    padding: "1rem",
};

const cardStyle = {
    width: "100%",
    maxWidth: "24rem",
    backgroundColor: "rgba(17, 24, 39, 0.9)",
    backdropFilter: "blur(4px)",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.2)",
    padding: "1.75rem",
    boxSizing: "border-box",
};

const titleStyle = {
    fontSize: "1.2rem",
    fontWeight: 700,
    marginBottom: "1.4rem",
};

const labelStyle = {
    display: "block",
    fontSize: "0.82rem",
    marginBottom: "0.45rem",
    color: "rgba(255,255,255,0.92)",
};

const inputStyle = {
    width: "100%",
    padding: "0.65rem 0.7rem",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.16)",
    backgroundColor: "rgba(0,0,0,0.22)",
    color: "white",
    fontSize: "0.85rem",
    outline: "none",
    boxSizing: "border-box",
};

const fieldGroupStyle = {
    marginBottom: "0.85rem",
};

const errorStyle = {
    fontSize: "0.8rem",
    color: "#fca5a5",
    backgroundColor: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.35)",
    borderRadius: "8px",
    padding: "0.6rem 0.75rem",
    marginBottom: "0.9rem",
};

const buttonStyle = (disabled) => ({
    width: "100%",
    padding: "0.75rem",
    borderRadius: "8px",
    border: "none",
    backgroundColor: disabled ? "#4b5563" : "#3b82f6",
    color: "white",
    fontSize: "0.9rem",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
});

const LoginScreen = ({ onAuthenticated }) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (submitting) return;

        setSubmitting(true);
        setError(null);
        try {
            const { user } = await login({ email, password });
            onAuthenticated(user);
        } catch (err) {
            // The server intentionally returns one generic message for both a
            // wrong email and a wrong password, so this just surfaces it as-is.
            setError(err.message || "Could not sign in.");
            setSubmitting(false);
        }
    };

    return (
        <div style={shellStyle}>
        <div style={cardStyle}>
        <div style={titleStyle}>Sign in</div>

        {error && <div style={errorStyle}>{error}</div>}

        <form onSubmit={handleSubmit}>
        <div style={fieldGroupStyle}>
        <label style={labelStyle}>Email</label>
        <input
        style={inputStyle}
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="email"
        required
        />
        </div>

        <div style={fieldGroupStyle}>
        <label style={labelStyle}>Password</label>
        <input
        style={inputStyle}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        required
        />
        </div>

        <button type="submit" style={buttonStyle(submitting)} disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
        </button>
        </form>
        </div>
        </div>
    );
};

export default LoginScreen;
