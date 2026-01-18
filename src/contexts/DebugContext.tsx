import { getCurrentUserId } from '@/lib/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const DEBUG_USER_IDS = [
  '6d6a7e11-3cf5-4c18-90be-e196f75990ac',
];

interface DebugContextType {
  isDebugMode: boolean;
}

const DebugContext = createContext<DebugContextType>({
  isDebugMode: false,
});

export function DebugProvider({ children }: { children: ReactNode }) {
  const [isDebugMode, setIsDebugMode] = useState(false);

  useEffect(() => {
    const checkDebugMode = async () => {
      const userId = await getCurrentUserId();
      if (userId && DEBUG_USER_IDS.includes(userId)) {
        setIsDebugMode(true);
      }
    };
    checkDebugMode();
  }, []);

  return (
    <DebugContext.Provider value={{ isDebugMode }}>
      {children}
    </DebugContext.Provider>
  );
}

export function useDebug() {
  return useContext(DebugContext);
}
