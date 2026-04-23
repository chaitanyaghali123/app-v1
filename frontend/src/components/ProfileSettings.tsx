import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ProfileSettings.css";

const translations: Record<string, Record<string, string>> = {
  English: {
    account: "Account",
    email: "Email",
    subscription: "Subscription",
    subscribed: "✅ Subscribed",
    upgrade: "Upgrade to Plus",
    security: "Security",
    data: "Data Controls",
    bug: "Report Bug",
    about: "About",
    version: "Version",
    description: "This platform helps UPSC aspirants learn and practice with a ChatGPT-style interface.",
    logout: "Log out",
  },
  Hindi: {
    account: "खाता",
    email: "ईमेल",
    subscription: "सदस्यता",
    subscribed: "✅ सदस्यता सक्रिय",
    upgrade: "प्लस में अपग्रेड करें",
    security: "सुरक्षा",
    data: "डेटा नियंत्रण",
    bug: "बग रिपोर्ट करें",
    about: "के बारे में",
    version: "संस्करण",
    description: "यह प्लेटफ़ॉर्म UPSC अभ्यर्थियों को ChatGPT शैली इंटरफ़ेस के साथ सीखने और अभ्यास करने में मदद करता है।",
    logout: "लॉग आउट",
  },
};

const ProfileSettings: React.FC = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ email: string; is_subscribed: boolean } | null>(null);

  // Default language (English)
  const t = translations["English"];

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/profile", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
          },
        });
        const data = await res.json();
        setProfile(data);
      } catch (err) {
        console.error("❌ Failed to fetch profile:", err);
      }
    }
    fetchProfile();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userEmail");
    navigate("/login");
  };

  return (
    <div className="profile-container">
      {/* Header */}
      <div className="profile-header">
        <div className="profile-icon">CG</div>
        <h3>Chaitanya Ghali</h3>
      </div>

      {/* Account Section */}
      <div className="section">
        <h4>{t.account}</h4>
        <p>{t.email}: {profile?.email || "Unknown"}</p>
      </div>

      {/* Subscription Section */}
      <div className="section">
        <h4>{t.subscription}</h4>
        <p>
          {profile?.is_subscribed ? t.subscribed : t.upgrade}
        </p>
      </div>

      {/* Security Section */}
      <div className="section">
        <h4>{t.security}</h4>
        <button>{t.data}</button>
        <button>{t.bug}</button>
      </div>

      {/* About Section */}
      <div className="section">
        <h4>{t.about}</h4>
        <p>{t.version}: 1.0.0</p>
        <p>{t.description}</p>
      </div>

      {/* Only Logout Button */}
      <div className="profile-actions">
        <button className="logout-btn" onClick={handleLogout}>
          {t.logout}
        </button>
      </div>
    </div>
  );
};

export default ProfileSettings;
