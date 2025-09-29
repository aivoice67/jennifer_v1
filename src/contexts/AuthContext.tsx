import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface AuthContextValue {
  isAuthenticated: boolean;
  login: (pin: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "auth_ok"; // per-tab session storage key

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored === "1") setIsAuthenticated(true);
    } catch (_) {
      // ignore storage errors
    }
  }, []);

  const login = (pin: string) => {
    // Constant-time like comparison to reduce trivial timing attacks
    const safeEqual = (a: string, b: string) => {
      if (a.length !== b.length) return false;
      let result = 0;
      for (let i = 0; i < a.length; i++) {
        // XOR char codes; still not perfect in JS but better than early return
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
      }
      return result === 0;
    };

    if (safeEqual(pin, __AUTH_PIN__)) {
      setIsAuthenticated(true);
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch (_) {
        // ignore
      }
      return true;
    }
    return false;
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export default AuthContext;