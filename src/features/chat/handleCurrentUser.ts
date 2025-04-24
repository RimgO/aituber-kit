import { useRef, useState, useEffect } from 'react';
import { fetchUserIdFromCamera } from './handlers';

export const useUserTracking = (monitoringInterval = 5000) => {
  const currentUserIdRef = useRef<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const monitoringIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    /*
    // Initial user ID fetch
    fetchUserIdFromCamera((userId) => {
      if (userId) {
        currentUserIdRef.current = userId;
        setCurrentUserId(userId);
        console.log(`Initial user ID set: ${userId}`);
      }
    });
    */
    
    // Set up periodic monitoring
    monitoringIntervalRef.current = setInterval(() => {
      fetchUserIdFromCamera((userId) => {
        if (userId && userId !== currentUserIdRef.current) {
          const prevUserId = currentUserIdRef.current;
          currentUserIdRef.current = userId;
          setCurrentUserId(userId);
          setIsNewUser(true); // Signal that this is a new user
          console.log(`User ID change detected: ${prevUserId || 'none'} → ${userId}`);
          
          // Reset new user flag after a delay
          setTimeout(() => {
            setIsNewUser(false);
          }, 10000); // Reset after 10 seconds
        }
      });
    }, monitoringInterval);
    
    // Cleanup function
    return () => {
      if (monitoringIntervalRef.current) {
        clearInterval(monitoringIntervalRef.current);
      }
    };
  }, [monitoringInterval]);

  return { currentUserId, isNewUser };
};