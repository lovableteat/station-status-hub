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

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    // 從 localStorage 恢復用戶狀態
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
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