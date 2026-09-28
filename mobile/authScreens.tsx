import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  apiChangePassword,
  apiDeleteAccount,
  apiForgotPassword,
  apiLogin,
  apiResetPassword,
  apiResendVerification,
  apiSignup,
  apiUpdateMe,
  apiVerifyEmail,
  clearSession,
  saveSession,
  updateStoredUser,
  type AuthUser,
} from "./authApi";

const COLORS = {
  bg: "#f8f9ff",
  card: "#ffffff",
  border: "#e5e7eb",
  inputBg: "#f9fafb",
  primary: "#4f46e5",
  text: "#111827",
  muted: "#6b7280",
  faint: "#9ca3af",
  danger: "#ef4444",
  success: "#166534",
  successBg: "#f0fdf4",
};

function AuthField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize,
  keyboardType,
  multiline,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  multiline?: boolean;
  editable?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize ?? "sentences"}
        autoCorrect={false}
        editable={editable}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.faint}
        secureTextEntry={secureTextEntry}
        style={[styles.fieldInput, !editable && styles.fieldInputDisabled]}
        value={value}
      />
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy = false,
  disabled = false,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btnPrimary,
        danger && styles.btnDanger,
        (disabled || busy) && styles.btnDisabled,
        pressed && !disabled && !busy && styles.btnPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text style={styles.btnPrimaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

function GhostButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.btnGhost}>
      <Text style={styles.btnGhostText}>{label}</Text>
    </Pressable>
  );
}

function AuthStatus({ message, tone = "error" }: { message: string; tone?: "error" | "info" }) {
  if (!message) return null;
  return (
    <Text style={[styles.statusText, tone === "info" ? styles.statusInfo : styles.statusError]}>
      {message}
    </Text>
  );
}

function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.headerBlock}>
      <Text style={styles.badge}>ARYABHATA</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

type AuthScreenKind = "login" | "signup" | "verify" | "forgot" | "reset";

// =====================================================
// AuthFlow — login/signup/verify/forgot/reset states
// =====================================================
export default function AuthFlow({
  backendUrl,
  onAuthenticated,
}: {
  backendUrl: string;
  onAuthenticated: (user: AuthUser) => void;
}) {
  const [screen, setScreen] = useState<AuthScreenKind>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");

  const showError = useCallback((message: string) => {
    setError(message);
    setInfo("");
  }, []);

  const showInfo = useCallback((message: string) => {
    setInfo(message);
    setError("");
  }, []);

  const run = useCallback(
    async (task: () => Promise<void>) => {
      setBusy(true);
      setError("");
      setInfo("");
      try {
        await task();
      } catch (err) {
        showError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [showError]
  );

  const handleLogin = useCallback(
    (password: string, name: string, phone: string) => {
      return run(async () => {
        const session = await apiLogin(backendUrl, email.trim().toLowerCase(), password);
        await saveSession(session);
        onAuthenticated(session.user);
      });
    },
    [backendUrl, email, run, onAuthenticated]
  );

  const handleSignup = useCallback(
    (name: string, phone: string, password: string) => {
      return run(async () => {
        const session = await apiSignup(backendUrl, {
          name,
          email: email.trim().toLowerCase(),
          phone,
          password,
        });
        await saveSession(session);
        setPendingEmail(email.trim().toLowerCase());
        setScreen("verify");
        showInfo("We sent a 6-digit code to your email. Enter it below to verify your account.");
      });
    },
    [backendUrl, email, run, showInfo]
  );

  const handleVerify = useCallback(
    (otp: string) => {
      return run(async () => {
        const result = await apiVerifyEmail(backendUrl, pendingEmail, otp);
        await updateStoredUser(result.user);
        onAuthenticated(result.user);
      });
    },
    [backendUrl, pendingEmail, run, onAuthenticated]
  );

  const handleResendVerify = useCallback(() => {
    return run(async () => {
      await apiResendVerification(backendUrl, pendingEmail);
      showInfo("Verification code sent. Check your inbox.");
    });
  }, [backendUrl, pendingEmail, run, showInfo]);

  const handleForgot = useCallback(
    (redirectToReset: (email: string) => void) => {
      return run(async () => {
        await apiForgotPassword(backendUrl, email.trim().toLowerCase());
        redirectToReset(email.trim().toLowerCase());
      });
    },
    [backendUrl, email, run]
  );

  const handleReset = useCallback(
    (otp: string, newPassword: string) => {
      return run(async () => {
        await apiResetPassword(backendUrl, pendingEmail, otp, newPassword);
        setEmail(pendingEmail);
        setError("");
        setInfo("Password reset successful. Sign in with your new password.");
        setScreen("login");
      });
    },
    [backendUrl, pendingEmail, run]
  );

  return (
    <SafeArea>
      {screen === "login" && (
        <LoginPane
          email={email}
          setEmail={setEmail}
          busy={busy}
          error={error}
          info={info}
          onLogin={handleLogin}
          onGoSignup={() => {
            setError("");
            setInfo("");
            setScreen("signup");
          }}
          onGoForgot={() => {
            setError("");
            setInfo("");
            setScreen("forgot");
          }}
        />
      )}

      {screen === "signup" && (
        <SignupPane
          email={email}
          setEmail={setEmail}
          busy={busy}
          error={error}
          onSignup={handleSignup}
          onGoLogin={() => {
            setError("");
            setInfo("");
            setScreen("login");
          }}
        />
      )}

      {screen === "verify" && (
        <VerifyPane
          email={pendingEmail}
          busy={busy}
          error={error}
          info={info}
          onVerify={handleVerify}
          onResend={handleResendVerify}
          onBack={() => {
            setError("");
            setInfo("");
            setScreen("login");
          }}
        />
      )}

      {screen === "forgot" && (
        <ForgotPane
          email={email}
          setEmail={setEmail}
          busy={busy}
          error={error}
          info={info}
          onForgot={() =>
            handleForgot((target) => {
              setPendingEmail(target);
              setError("");
              setInfo("");
              setScreen("reset");
            })
          }
          onGoLogin={() => {
            setError("");
            setInfo("");
            setScreen("login");
          }}
        />
      )}

      {screen === "reset" && (
        <ResetPane
          email={email}
          busy={busy}
          error={error}
          onReset={handleReset}
          onGoLogin={() => {
            setError("");
            setInfo("");
            setScreen("login");
          }}
        />
      )}
    </SafeArea>
  );
}

function SafeArea({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", android: undefined })}
      style={styles.safeArea}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LoginPane({
  email,
  setEmail,
  busy,
  error,
  info,
  onLogin,
  onGoSignup,
  onGoForgot,
}: {
  email: string;
  setEmail: (v: string) => void;
  busy: boolean;
  error: string;
  info: string;
  onLogin: (password: string, name: string, phone: string) => Promise<void>;
  onGoSignup: () => void;
  onGoForgot: () => void;
}) {
  const [password, setPassword] = useState("");

  return (
    <View>
      <AuthHeader title="Welcome back" subtitle="Sign in to continue your UPSC preparation." />
      <View style={styles.card}>
        <AuthField
          autoCapitalize="none"
          keyboardType="email-address"
          label="Email"
          onChangeText={setEmail}
          placeholder="you@example.com"
          value={email}
        />
        <AuthField
          label="Password"
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          value={password}
        />
        <AuthStatus message={error || info} tone={error ? "error" : "info"} />
        <PrimaryButton
          busy={busy}
          disabled={!email.trim() || !password}
          label={busy ? "Signing in..." : "Sign In"}
          onPress={() => onLogin(password, "", "")}
        />
        <View style={styles.linkRow}>
          <GhostButton label="Forgot password?" onPress={onGoForgot} />
          <GhostButton label="Create account" onPress={onGoSignup} />
        </View>
      </View>
    </View>
  );
}

function SignupPane({
  email,
  setEmail,
  busy,
  error,
  onSignup,
  onGoLogin,
}: {
  email: string;
  setEmail: (v: string) => void;
  busy: boolean;
  error: string;
  onSignup: (name: string, phone: string, password: string) => Promise<void>;
  onGoLogin: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState("");

  const submit = () => {
    setLocalError("");
    if (!name.trim()) return setLocalError("Please enter your name.");
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setLocalError("Please enter a valid email address.");
    }
    if (!phone.trim()) return setLocalError("Please enter your phone number.");
    if (password.length < 8) {
      return setLocalError("Password must be at least 8 characters.");
    }
    if (password !== confirm) return setLocalError("Passwords do not match.");
    void onSignup(name.trim(), phone.trim(), password);
  };

  return (
    <View>
      <AuthHeader title="Create account" subtitle="Join Aryabhata to prepare for UPSC Mains." />
      <View style={styles.card}>
        <AuthField label="Full name" onChangeText={setName} placeholder="Your name" value={name} />
        <AuthField
          autoCapitalize="none"
          keyboardType="email-address"
          label="Email"
          onChangeText={setEmail}
          placeholder="you@example.com"
          value={email}
        />
        <AuthField
          keyboardType="phone-pad"
          label="Phone"
          onChangeText={setPhone}
          placeholder="+91 ..."
          value={phone}
        />
        <AuthField
          label="Password"
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          value={password}
        />
        <AuthField
          label="Confirm password"
          onChangeText={setConfirm}
          placeholder="Repeat password"
          secureTextEntry
          value={confirm}
        />
        <AuthStatus message={localError || error} />
        <PrimaryButton
          busy={busy}
          disabled={!name.trim() || !email.trim() || !phone.trim() || !password || !confirm}
          label={busy ? "Creating account..." : "Sign Up"}
          onPress={submit}
        />
        <View style={styles.linkRow}>
          <GhostButton label="Already have an account? Sign in" onPress={onGoLogin} />
        </View>
      </View>
    </View>
  );
}

function VerifyPane({
  email,
  busy,
  error,
  info,
  onVerify,
  onResend,
  onBack,
}: {
  email: string;
  busy: boolean;
  error: string;
  info: string;
  onVerify: (otp: string) => Promise<void>;
  onResend: () => Promise<void>;
  onBack: () => void;
}) {
  const [otp, setOtp] = useState("");

  return (
    <View>
      <AuthHeader title="Verify your email" subtitle={`Enter the 6-digit code sent to ${email}`} />
      <View style={styles.card}>
        <AuthField
          autoCapitalize="none"
          keyboardType="number-pad"
          label="Verification code"
          onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, "").slice(0, 6))}
          placeholder="123456"
          value={otp}
        />
        <AuthStatus message={error || info} tone={error ? "error" : "info"} />
        <PrimaryButton
          busy={busy}
          disabled={otp.length !== 6}
          label={busy ? "Verifying..." : "Verify Email"}
          onPress={() => onVerify(otp)}
        />
        <View style={styles.linkRow}>
          <GhostButton label="Resend code" onPress={() => onResend()} />
          {busy ? null : <GhostButton label="Back to sign in" onPress={onBack} />}
        </View>
      </View>
    </View>
  );
}

function ForgotPane({
  email,
  setEmail,
  busy,
  error,
  info,
  onForgot,
  onGoLogin,
}: {
  email: string;
  setEmail: (v: string) => void;
  busy: boolean;
  error: string;
  info: string;
  onForgot: () => Promise<void>;
  onGoLogin: () => void;
}) {
  return (
    <View>
      <AuthHeader title="Reset your password" subtitle="We'll email you a 6-digit reset code." />
      <View style={styles.card}>
        <AuthField
          autoCapitalize="none"
          keyboardType="email-address"
          label="Email"
          onChangeText={setEmail}
          placeholder="you@example.com"
          value={email}
        />
        <AuthStatus message={error || info} tone={error ? "error" : "info"} />
        <PrimaryButton
          busy={busy}
          disabled={!email.trim()}
          label={busy ? "Sending..." : "Send Reset Code"}
          onPress={() => onForgot()}
        />
        <View style={styles.linkRow}>
          <GhostButton label="Back to sign in" onPress={onGoLogin} />
        </View>
      </View>
    </View>
  );
}

function ResetPane({
  email,
  busy,
  error,
  onReset,
  onGoLogin,
}: {
  email: string;
  busy: boolean;
  error: string;
  onReset: (otp: string, newPassword: string) => Promise<void>;
  onGoLogin: () => void;
}) {
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState("");

  const submit = () => {
    setLocalError("");
    if (otp.length !== 6) return setLocalError("Enter the 6-digit code from your email.");
    if (newPassword.length < 8) {
      return setLocalError("Password must be at least 8 characters.");
    }
    if (newPassword !== confirm) return setLocalError("Passwords do not match.");
    void onReset(otp, newPassword);
  };

  return (
    <View>
      <AuthHeader title="Set a new password" subtitle={`Reset code was sent to ${email}`} />
      <View style={styles.card}>
        <AuthField
          autoCapitalize="none"
          keyboardType="number-pad"
          label="Reset code"
          onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, "").slice(0, 6))}
          placeholder="123456"
          value={otp}
        />
        <AuthField
          label="New password"
          onChangeText={setNewPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          value={newPassword}
        />
        <AuthField
          label="Confirm new password"
          onChangeText={setConfirm}
          placeholder="Repeat new password"
          secureTextEntry
          value={confirm}
        />
        <AuthStatus message={localError || error} />
        <PrimaryButton
          busy={busy}
          disabled={!otp || !newPassword || !confirm}
          label={busy ? "Resetting..." : "Reset Password"}
          onPress={submit}
        />
        <View style={styles.linkRow}>
          <GhostButton label="Back to sign in" onPress={onGoLogin} />
        </View>
      </View>
    </View>
  );
}

// =====================================================
// ProfileScreen
// =====================================================
export function ProfileScreen({
  backendUrl,
  user,
  onUserUpdated,
  onLoggedOut,
}: {
  backendUrl: string;
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onLoggedOut: () => void;
}) {
  const [name, setName] = useState(user.name || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const run = useCallback(
    async (section: string, task: () => Promise<void>) => {
      setBusy(section);
      setError("");
      setInfo("");
      try {
        await task();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setBusy("");
      }
    },
    []
  );

  const handleSaveProfile = useCallback(() => {
    return run("profile", async () => {
      const accessToken = (await import("./authApi")).getAccessToken;
      const token = await accessToken();
      if (!token) throw new Error("Session expired. Please sign in again.");
      const updated = await apiUpdateMe(backendUrl, token, { name: name.trim(), phone: phone.trim() });
      await updateStoredUser(updated);
      onUserUpdated(updated);
      setInfo("Profile updated.");
    });
  }, [backendUrl, name, phone, run, onUserUpdated]);

  const handleChangePassword = useCallback(() => {
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    return run("password", async () => {
      const { getAccessToken, saveSession } = await import("./authApi");
      const token = await getAccessToken();
      if (!token) throw new Error("Session expired. Please sign in again.");
      const rotated = await apiChangePassword(backendUrl, token, currentPassword, newPassword);
      await saveSession({
        accessToken: rotated.accessToken,
        refreshToken: rotated.refreshToken,
        user,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setInfo("Password updated.");
    });
  }, [backendUrl, newPassword, confirmPassword, currentPassword, run, user]);

  const handleLogout = useCallback(() => {
    return run("logout", async () => {
      const { getRefreshToken, apiLogout } = await import("./authApi");
      const refreshToken = await getRefreshToken();
      if (refreshToken) await apiLogout(backendUrl, refreshToken);
      await clearSession();
      onLoggedOut();
    });
  }, [backendUrl, onLoggedOut, run]);

  const handleDeleteAccount = useCallback(() => {
    if (!currentPassword) {
      setError("Enter your current password to delete your account.");
      return;
    }
    return run("delete", async () => {
      const { getAccessToken, apiDeleteAccount } = await import("./authApi");
      const token = await getAccessToken();
      if (!token) throw new Error("Session expired. Please sign in again.");
      await apiDeleteAccount(backendUrl, token, currentPassword);
      await clearSession();
      onLoggedOut();
    });
  }, [backendUrl, currentPassword, onLoggedOut, run]);

  return (
    <SafeArea>
      <View>
        <AuthHeader title="Profile" subtitle="Manage your Aryabhata account." />
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user.name || user.email || "A").charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.avatarInfo}>
              <Text style={styles.avatarName}>{user.name || "User"}</Text>
              <Text style={styles.avatarEmail}>{user.email}</Text>
              <View style={styles.verifiedRow}>
                <Text style={[styles.verifiedDot, { backgroundColor: user.emailVerified ? "#22c55e" : COLORS.faint }]}>●</Text>
                <Text style={styles.verifiedText}>
                  {user.emailVerified ? "Email verified" : "Email not verified"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionLabelWrap}>
          <Text style={styles.sectionLabel}>Account Information</Text>
        </View>
        <View style={styles.card}>
          <AuthField label="Full name" onChangeText={setName} placeholder="Your name" value={name} />
          <AuthField label="Phone" onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91 ..." value={phone} />
          <AuthStatus message={error && busy === "profile" ? error : busy === "profile" ? info : ""} tone={error && busy === "profile" ? "error" : "info"} />
          <PrimaryButton
            busy={busy === "profile"}
            disabled={!name.trim() && !phone.trim()}
            label={busy === "profile" ? "Saving..." : "Save Changes"}
            onPress={handleSaveProfile}
          />
        </View>

        <View style={styles.sectionLabelWrap}>
          <Text style={styles.sectionLabel}>Security</Text>
        </View>
        <View style={styles.card}>
          <AuthField
            label="Current password"
            onChangeText={setCurrentPassword}
            placeholder="Current password"
            secureTextEntry
            value={currentPassword}
          />
          <AuthField
            label="New password"
            onChangeText={setNewPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            value={newPassword}
          />
          <AuthField
            label="Confirm new password"
            onChangeText={setConfirmPassword}
            placeholder="Repeat new password"
            secureTextEntry
            value={confirmPassword}
          />
          <AuthStatus
            message={error && busy === "password" ? error : busy === "password" ? info : ""}
            tone={error && busy === "password" ? "error" : "info"}
          />
          <PrimaryButton
            busy={busy === "password"}
            disabled={!currentPassword || !newPassword || !confirmPassword}
            label={busy === "password" ? "Updating..." : "Change Password"}
            onPress={handleChangePassword}
          />
        </View>

        <View style={styles.sectionLabelWrap}>
          <Text style={styles.sectionLabel}>Session &amp; Data</Text>
        </View>
        <View style={styles.card}>
          <PrimaryButton
            busy={busy === "logout"}
            label={busy === "logout" ? "Signing out..." : "Sign Out"}
            onPress={handleLogout}
          />
          <PrimaryButton
            busy={busy === "delete"}
            danger
            disabled={!currentPassword}
            label={busy === "delete" ? "Deleting..." : "Delete Account"}
            onPress={handleDeleteAccount}
          />
        </View>

        <View style={styles.footerNote}>
          <Text style={styles.footerNoteText}>
            Deleting your account permanently removes your profile, saved keys and sign-in sessions.
          </Text>
        </View>
      </View>
    </SafeArea>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 48, paddingBottom: 48, flexGrow: 1 },
  headerBlock: { marginBottom: 20 },
  badge: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { color: COLORS.muted, fontSize: 15, lineHeight: 20 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    padding: 16,
    gap: 12,
    marginBottom: 18,
  },
  field: { gap: 6 },
  fieldLabel: { color: "#374151", fontSize: 13, fontWeight: "700" },
  fieldInput: {
    backgroundColor: COLORS.inputBg,
    borderColor: COLORS.border,
    borderRadius: 10,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  fieldInputDisabled: { opacity: 0.6 },
  btnPrimary: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  btnDanger: { backgroundColor: COLORS.danger },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { opacity: 0.85 },
  btnPrimaryText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  btnGhost: { paddingVertical: 10, paddingHorizontal: 4 },
  btnGhostText: { color: COLORS.primary, fontSize: 14, fontWeight: "600" },
  linkRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  statusText: { fontSize: 13, lineHeight: 18 },
  statusError: { color: COLORS.danger },
  statusInfo: { color: COLORS.success },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: COLORS.primary, fontSize: 24, fontWeight: "800" },
  avatarInfo: { flex: 1, gap: 3 },
  avatarName: { color: COLORS.text, fontSize: 17, fontWeight: "800" },
  avatarEmail: { color: COLORS.muted, fontSize: 13 },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  verifiedDot: { fontSize: 8, marginTop: 1 },
  verifiedText: { color: COLORS.muted, fontSize: 12, fontWeight: "600" },
  sectionLabelWrap: { marginBottom: 8 },
  sectionLabel: {
    color: COLORS.faint,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  footerNote: { paddingHorizontal: 6 },
  footerNoteText: { color: COLORS.faint, fontSize: 12, lineHeight: 18, textAlign: "center" },
});