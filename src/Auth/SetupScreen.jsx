// 최초 부트스트랩 계정(관리자) 생성 화면 — 이메일/비밀번호/표시이름 입력 폼
import { useState } from "react";
import { register } from "../runtime/auth.js";

const MIN_PASSWORD_LENGTH = 10;

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
    marginBottom: "0.35rem",
};

const subtitleStyle = {
    fontSize: "0.82rem",
    color: "rgba(255,255,255,0.6)",
    marginBottom: "1.4rem",
    lineHeight: 1.45,
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

const helperStyle = {
    marginTop: "0.35rem",
    fontSize: "0.74rem",
    color: "rgba(255,255,255,0.58)",
    lineHeight: 1.45,
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

const SetupScreen = ({ onAuthenticated }) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (submitting) return;

        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const { user } = await register({ email, password, displayName });
            onAuthenticated(user);
        } catch (err) {
            setError(err.message || "Could not create the account.");
            setSubmitting(false);
        }
    };

    return (
        <div style={shellStyle}>
        <div style={cardStyle}>
        <div style={titleStyle}>Create the owner account</div>
        <div style={subtitleStyle}>
        No account exists on this server yet. Create one to get started — after
        this, new accounts are invite-only (added from Settings once signed in).
        </div>

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
        <label style={labelStyle}>Display name (optional)</label>
        <input
        style={inputStyle}
        type="text"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        autoComplete="name"
        />
        </div>

        <div style={fieldGroupStyle}>
        <label style={labelStyle}>Password</label>
        <input
        style={inputStyle}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        required
        />
        <div style={helperStyle}>At least {MIN_PASSWORD_LENGTH} characters.</div>
        </div>

        <button type="submit" style={buttonStyle(submitting)} disabled={submitting}>
        {submitting ? "Creating account…" : "Create account"}
        </button>
        </form>
        </div>
        </div>
    );
};

export default SetupScreen;
