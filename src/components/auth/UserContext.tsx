import React, { createContext, useContext, useState, ReactNode } from "react";

interface User {
  userId: string;
  username: string;
  role: string;
  displayName: string;
}

interface UserContextType {
  user: User | null;
  login: (userId: string, username: string, role: string, displayName: string) => void;
  logout: () => void;
  isLoggedIn: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

function readStoredUser(): User | null {
  try {
    const savedUser = window.localStorage.getItem("user");
    if (!savedUser) return null;

    const parsed = JSON.parse(savedUser) as Partial<User>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.username !== "string" ||
      typeof parsed.role !== "string" ||
      typeof parsed.displayName !== "string"
    ) {
      window.localStorage.removeItem("user");
      return null;
    }

    return parsed as User;
  } catch {
    // A stale or partially written session must not prevent the app from booting.
    try {
      window.localStorage.removeItem("user");
    } catch {
      // Ignore blocked storage and continue with a signed-out session.
    }
    return null;
  }
}

function getDevDemoUser(): User | null {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "admin") {
    return null;
  }

  return {
    userId: "demo-admin",
    username: "operator7",
    role: "admin",
    displayName: "Operator 7",
  };
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const demoUser = getDevDemoUser();
    if (demoUser) {
      return demoUser;
    }

    return readStoredUser();
  });

  const login = (userId: string, username: string, role: string, displayName: string) => {
    const userData = { userId, username, role, displayName };
    setUser(userData);
    // 持久化用戶狀態
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    // 清除持久化狀態
    localStorage.removeItem('user');
  };

  const isLoggedIn = user !== null;

  return (
    <UserContext.Provider value={{ user, login, logout, isLoggedIn }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
