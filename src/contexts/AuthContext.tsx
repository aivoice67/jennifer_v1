import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface AuthContextValue {
  isAuthenticated: boolean;
  login: (pin: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LOCAL_KEY = "auth_ok";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_KEY);
      if (stored === "1") setIsAuthenticated(true);
    } catch (_) {
      // ignore storage errors
    }
  }, []);

  const login = (pin: string) => {
    if (pin === __AUTH_PIN__) {
      setIsAuthenticated(true);
      try {
        localStorage.setItem(LOCAL_KEY, "1");
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